import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { storage } from './firebase';
import { resolvePhotoUri } from './photoStorage';
import { compressImage } from './imageCompress';

// 친구공개 다이어리의 사진/영상을 Firebase Storage에 올려 친구가 볼 수 있는 https URL로 바꾼다 ([[friend-feed-design]]).
//  - 현재 다이어리 사진은 'dgphoto:' 로컬 식별자 → 친구 폰에선 못 읽음. 그래서 친구공개 시에만 업로드.
//  - 나만보기(private)는 업로드 X — 로컬 유지(프라이버시). 본인만 자기 기기에서 봄.
//  - 사진은 압축(1200px·80% JPEG [[image-compression]]) 후 업로드, 영상은 원본 그대로(용량·비용 주의).
//  - 이미 https인 항목은 건너뜀(재업로드 방지 = 멱등). 실패 시 원본 유지(데이터 손실 방지, 친구는 그 항목만 못 봄).
// 경로: rounds/{uid}/{파일명}  (storage.rules: 읽기=로그인 사용자, 쓰기=본인)
// 입력/출력 구조 동일 — 문자열은 문자열(https)로, { uri, type:'video' } 객체는 uri만 교체.
// compressOpts — compressImage 옵션(예: { maxWidth: 800 }). 크루 피드는 작게 올려 로딩↑(다이어리는 기본 1200 유지).
export async function uploadRoundMedia(uid, photos, compressOpts = {}) {
  if (!uid || !Array.isArray(photos) || photos.length === 0) return photos;
  return Promise.all(photos.map((p, i) => uploadOne(uid, p, i, compressOpts)));
}

async function uploadOne(uid, item, i, compressOpts = {}) {
  const isObj = item && typeof item === 'object';
  const rawUri = isObj ? item.uri : item;
  const isVideo = isObj && item.type === 'video';
  if (!rawUri || typeof rawUri !== 'string') return item;
  if (/^https?:\/\//.test(rawUri)) return item; // 이미 원격(업로드 완료) — 멱등
  try {
    const localUri = resolvePhotoUri(rawUri);              // dgphoto: → 기기 절대경로
    const uploadUri = isVideo ? localUri : await compressImage(localUri, compressOpts);
    const res = await fetch(uploadUri);
    const blob = await res.blob();
    const srcExt = (rawUri.split('?')[0].split('.').pop() || '').toLowerCase().slice(0, 4);
    const ext = isVideo ? (srcExt || 'mp4') : 'jpg';
    const contentType = isVideo
      ? (srcExt === 'mov' ? 'video/quicktime' : 'video/mp4')
      : 'image/jpeg';
    const name = `m_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const storageRef = ref(storage, `rounds/${uid}/${name}`);
    await uploadBytes(storageRef, blob, { contentType }); // contentType 명시 — Storage 규칙 image/*·video/* 매칭 보장
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
    const { poster: localPoster, ...rest } = item;
    let posterUrl = null;
    if (localPoster && !/^https?:\/\//.test(localPoster)) posterUrl = await uploadPosterFromImage(uid, localPoster, i);
    if (!posterUrl) posterUrl = await uploadVideoPoster(uid, localUri, i);
    return posterUrl ? { ...rest, uri: url, poster: posterUrl } : { ...rest, uri: url };  // 실패 시 로컬 poster는 버림(친구가 못 읽음)
  } catch (e) {
    if (__DEV__) console.warn('[roundMedia] 업로드 실패, 원본 유지', e?.message);
    return item;
  }
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

// 공유 카드(초대장 등) 캡처 이미지를 Storage에 올려 공개 URL 반환 — 카카오 피드 템플릿 imageUrl용
//   (카카오 서버가 가져갈 수 있게 원격 URL 필요). getDownloadURL 토큰 URL은 공개. 실패 시 null → 호출부에서 hero.jpg 폴백.
//   key = 모집 postId·라운딩 id 등 결정적 식별자. 같은 대상 재공유 시 같은 경로에 덮어써 누적(orphan)을 막는다
//   — 대상당 1장으로 제한(무한 누적 차단). key 없으면 uid 단위 단일 파일로 폴백. [[invite-deeplink-system]]
export async function uploadShareCardImage(uid, localUri, key) {
  if (!uid || !localUri) return null;
  try {
    const res = await fetch(localUri);
    const blob = await res.blob();
    const safeKey = String(key || 'card').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'card';
    const name = `sharecard_${safeKey}.png`;   // 결정적 파일명 — 재공유 시 덮어쓰기
    const storageRef = ref(storage, `rounds/${uid}/${name}`);
    await uploadBytes(storageRef, blob, { contentType: 'image/png' });
    return await getDownloadURL(storageRef);
  } catch (e) {
    if (__DEV__) console.warn('[roundMedia] 공유카드 업로드 실패, hero 폴백', e?.message);
    return null;
  }
}
