import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
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
export async function uploadRoundMedia(uid, photos) {
  if (!uid || !Array.isArray(photos) || photos.length === 0) return photos;
  return Promise.all(photos.map((p, i) => uploadOne(uid, p, i)));
}

async function uploadOne(uid, item, i) {
  const isObj = item && typeof item === 'object';
  const rawUri = isObj ? item.uri : item;
  const isVideo = isObj && item.type === 'video';
  if (!rawUri || typeof rawUri !== 'string') return item;
  if (/^https?:\/\//.test(rawUri)) return item; // 이미 원격(업로드 완료) — 멱등
  try {
    const localUri = resolvePhotoUri(rawUri);              // dgphoto: → 기기 절대경로
    const uploadUri = isVideo ? localUri : await compressImage(localUri);
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
    return isVideo ? { ...item, uri: url } : url;
  } catch (e) {
    if (__DEV__) console.warn('[roundMedia] 업로드 실패, 원본 유지', e?.message);
    return item;
  }
}
