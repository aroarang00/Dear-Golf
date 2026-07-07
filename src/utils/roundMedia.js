import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { storage } from './firebase';
import { resolvePhotoUri } from './photoStorage';
import { compressImage } from './imageCompress';
import { uploadLocalFileStreaming } from './storageUpload';

// 친구공개 다이어리의 사진/영상을 Firebase Storage에 올려 친구가 볼 수 있는 https URL로 바꾼다 ([[friend-feed-design]]).
//  - 현재 다이어리 사진은 'dgphoto:' 로컬 식별자 → 친구 폰에선 못 읽음. 그래서 친구공개 시에만 업로드.
//  - 나만보기(private)는 업로드 X — 로컬 유지(프라이버시). 본인만 자기 기기에서 봄.
//  - 사진은 압축(1200px·80% JPEG [[image-compression]]) 후 업로드, 영상은 원본 그대로(용량·비용 주의).
//  - 이미 https인 항목은 건너뜀(재업로드 방지 = 멱등). 업로드 실패는 throw — 원본(dgphoto: 로컬 식별자)을
//    그대로 저장하면 친구 기기에서 영영 못 읽는 깨진 항목이 되므로, 저장 실패로 올려 호출부의
//    "입력 보존 + 재시도" UX로 처리(2026-07-02 감사). 포스터·썸네일은 종전대로 best-effort(null 폴백).
// 경로: rounds/{uid}/{파일명}  (storage.rules: 읽기=로그인 사용자, 쓰기=본인)
// 입력/출력 구조 동일 — 문자열은 문자열(https)로, { uri, type:'video' } 객체는 uri만 교체.
// compressOpts — compressImage 옵션(예: { maxWidth: 800 }). 크루 피드는 작게 올려 로딩↑(다이어리는 기본 1200 유지).
export async function uploadRoundMedia(uid, photos, compressOpts = {}) {
  if (!uid || !Array.isArray(photos) || photos.length === 0) return photos;
  return Promise.all(photos.map((p, i) => uploadOne(uid, p, i, compressOpts)));
}

// 로컬 참조(dgphoto: 등 비-https) 항목이 하나라도 있는지 — 백업 스위퍼·로그아웃 가드 판정용.
export function hasLocalMediaRefs(photos) {
  if (!Array.isArray(photos)) return false;
  return photos.some((p) => {
    const uri = p && typeof p === 'object' ? p.uri : p;
    return typeof uri === 'string' && uri.length > 0 && !/^https?:\/\//.test(uri);
  });
}

// 전량 계정 백업용 관용 업로드([[diary-media-backup-plan]]) — 항목별 실패는 원본(dgphoto:) 유지하고 계속.
//   uploadRoundMedia(친구공개, 실패=throw로 저장 중단)와 달리 나만보기 저장·백업 스위퍼에서 사용:
//   오프라인이어도 저장은 성공해야 하고(로컬 참조 유지), 업로드는 스위퍼가 나중에 이어받는다.
//   반환: { photos, uploaded(이번에 성공한 수), failed(로컬로 남은 수) }
export async function uploadRoundMediaBestEffort(uid, photos, compressOpts = {}) {
  if (!uid || !Array.isArray(photos) || photos.length === 0) return { photos, uploaded: 0, failed: 0 };
  let uploaded = 0;
  let failed = 0;
  const out = await Promise.all(photos.map(async (p, i) => {
    const before = p && typeof p === 'object' ? p.uri : p;
    if (typeof before === 'string' && /^https?:\/\//.test(before)) return p; // 이미 백업됨
    try {
      const r = await uploadOne(uid, p, i, compressOpts);
      uploaded++;
      return r;
    } catch (e) {
      failed++;
      return p; // 로컬 참조 유지 — 표시는 되고, 백업은 스위퍼가 재시도
    }
  }));
  return { photos: out, uploaded, failed };
}

// 지정 시간 안에 안 끝나면 폴백값으로 진행 — 장식성 후처리(포스터)가 저장을 붙들지 못하게.
const POSTER_TIMEOUT_MS = 15000;
function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

async function uploadOne(uid, item, i, compressOpts = {}) {
  const isObj = item && typeof item === 'object';
  const rawUri = isObj ? item.uri : item;
  const isVideo = isObj && item.type === 'video';
  if (!rawUri || typeof rawUri !== 'string') return item;
  if (/^https?:\/\//.test(rawUri)) return item; // 이미 원격(업로드 완료) — 멱등
  try {
    const localUri = resolvePhotoUri(rawUri);              // dgphoto: → 기기 절대경로
    const srcExt = (rawUri.split('?')[0].split('.').pop() || '').toLowerCase().slice(0, 4);
    const ext = isVideo ? (srcExt || 'mp4') : 'jpg';
    const contentType = isVideo
      ? (srcExt === 'mov' ? 'video/quicktime' : 'video/mp4')
      : 'image/jpeg';
    const name = `m_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const storagePath = `rounds/${uid}/${name}`;
    const storageRef = ref(storage, storagePath);
    if (isVideo) {
      // 영상은 디스크→스트리밍 업로드 — 파일 전체를 힙 Blob으로 올리면 대용량에서 OOM 크래시([[video-upload-oom]]).
      await uploadLocalFileStreaming(storagePath, localUri, contentType);
    } else {
      // 사진은 압축(수백KB) 후 Blob 업로드 — 작아서 힙 부담 없음.
      const uploadUri = await compressImage(localUri, compressOpts);
      const res = await fetch(uploadUri);
      const blob = await res.blob();
      await uploadBytes(storageRef, blob, { contentType }); // contentType 명시 — Storage 규칙 image/* 매칭 보장
    }
    const url = await getDownloadURL(storageRef);
    // 사진 객체({uri, focus})는 메타 보존, 단순 문자열 사진은 그대로 https 문자열 ([[cover-focal-point]])
    //   단 orig(로컬 재편집용 원본 dgphoto:)는 친구가 못 읽는 로컬 식별자라 업로드 데이터에선 제거.
    if (!isVideo) {
      if (!isObj) return url;
      const { orig, ...rest } = item;
      // compressOpts.thumb(px)를 준 호출(크루 피드)만 작은 썸네일도 함께 업로드 → 리스트는 thumb, 뷰어는 uri(원본 800px).
      //   best-effort: 실패하면 thumb 없이 진행(렌더가 m.thumb||m.uri로 폴백). 다른 화면은 thumb 옵션을 안 줘서 영향 0.
      let thumb = null;
      if (compressOpts.thumb) thumb = await uploadThumb(uid, localUri, compressOpts.thumb, i);
      return thumb ? { ...rest, uri: url, thumb } : { ...rest, uri: url };
    }
    // 영상 포스터(jpg) 업로드 → 안드 원격 썸네일 안정화 (실패해도 영상은 유지) ([[friend-feed-design]]).
    //   사용자가 등록화면에서 커버를 편집했으면(로컬 poster) 그걸 올리고, 없으면 첫 프레임으로 자동 생성.
    // ★포스터는 장식(실패=기기 생성 폴백)인데 iOS 프로덕션에서 이 체인이 안 끝나 저장 전체가 영영 매달렸음
    //   (2026-07-05, 미디어 본체는 다 올라가고 문서만 안 써짐). 원인: localPoster가 dgphoto: 식별자인데
    //   경로 해석 없이 manipulate/fetch에 넘어감 → resolvePhotoUri 필수 + 체인 전체 타임아웃으로 저장을 절대 못 막게.
    const { poster: localPoster, ...rest } = item;
    let posterUrl = null;
    if (localPoster && /^https?:\/\//.test(localPoster)) {
      posterUrl = localPoster; // 이미 원격 포스터 — 재생성 불필요
    } else {
      posterUrl = await withTimeout((async () => {
        const p = localPoster ? await uploadPosterFromImage(uid, resolvePhotoUri(localPoster), i) : null;
        return p || await uploadVideoPoster(uid, localUri, i);
      })(), POSTER_TIMEOUT_MS, null);
    }
    return posterUrl ? { ...rest, uri: url, poster: posterUrl } : { ...rest, uri: url };  // 실패 시 로컬 poster는 버림(친구가 못 읽음)
  } catch (e) {
    if (__DEV__) console.warn('[roundMedia] 업로드 실패 — 저장 중단(재시도 유도)', e?.message);
    // 원본 반환(=dgphoto: 저장) 대신 throw — 친구가 못 읽는 로컬 식별자가 문서에 남는 것 방지.
    //   호출부(다이어리 저장·크루 게시)가 실패 안내 + 입력 보존으로 받는다.
    throw e;
  }
}

// 다이어리 미디어 파일 삭제 — 문서 삭제·미디어 교체 시 고아 파일 즉시 정리(Storage 비용 누수 방지, 2026-07-04).
//   항목의 uri/poster/thumb 중 우리 Storage https URL만 골라 best-effort 삭제(이미 없으면 무시).
export async function deleteRoundMediaFiles(photos) {
  if (!Array.isArray(photos) || photos.length === 0) return;
  const urls = [];
  for (const p of photos) {
    if (!p) continue;
    if (typeof p === 'string') { urls.push(p); continue; }
    urls.push(p.uri, p.poster, p.thumb);
  }
  await Promise.all(urls
    .filter((u) => typeof u === 'string' && /^https:\/\/firebasestorage\.googleapis\.com\//.test(u))
    .map(async (u) => {
      try {
        await deleteObject(ref(storage, u));
      } catch (e) {
        if (__DEV__ && e?.code !== 'storage/object-not-found') console.warn('[roundMedia] 파일 삭제 실패', e?.code);
      }
    }));
}

// 작은 썸네일(피드·갤러리 표시용)을 만들어 업로드 → 원격 https. compressOpts.thumb 준 호출(크루)만 사용.
//   실패 시 null → 렌더가 본 이미지(uri)로 폴백하므로 표시엔 지장 없음(가속만 없음).
async function uploadThumb(uid, localUri, width, i) {
  try {
    const compressed = await compressImage(localUri, { maxWidth: width });
    const res = await fetch(compressed);
    const blob = await res.blob();
    const name = `t_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}.jpg`;
    const storageRef = ref(storage, `rounds/${uid}/${name}`);
    await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
    return await getDownloadURL(storageRef);
  } catch (e) {
    if (__DEV__) console.warn('[roundMedia] 썸네일 업로드 실패, 원본 표시', e?.message);
    return null;
  }
}

// 로컬 이미지(영상 포스터)를 압축해 image/jpeg로 업로드 → 원격 https. 실패 시 null.
async function uploadPosterFromImage(uid, imageUri, i) {
  try {
    const compressed = await compressImage(imageUri);
    const res = await fetch(compressed);
    const blob = await res.blob();
    const name = `p_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}.jpg`;
    const storageRef = ref(storage, `rounds/${uid}/${name}`);
    await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
    return await getDownloadURL(storageRef);
  } catch (e) {
    if (__DEV__) console.warn('[roundMedia] 포스터 업로드 실패', e?.message);
    return null;
  }
}

// 영상 첫 프레임을 뽑아 업로드. 실패 시 null → 클라가 기기에서 직접 생성하는 폴백으로 동작.
//   로컬 영상 URI에서 생성하므로 안드에서도 안정적(원격 getThumbnailAsync 불안정 회피).
async function uploadVideoPoster(uid, localVideoUri, i) {
  try {
    const { uri: thumbUri } = await VideoThumbnails.getThumbnailAsync(localVideoUri, { time: 0, quality: 0.7 });
    return await uploadPosterFromImage(uid, thumbUri, i);
  } catch (e) {
    if (__DEV__) console.warn('[roundMedia] 포스터 생성 실패, 기기 생성 폴백', e?.message);
    return null;
  }
}
