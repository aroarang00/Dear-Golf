import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';
import { resolvePhotoUri } from './photoStorage';
import { compressImage } from './imageCompress';

// 아바타(프로필 사진)를 Firebase Storage에 올려 친구 공개용 https URL을 만든다.
//  - 이미 우리 Storage(firebasestorage) URL이면 업로드 없이 그대로 반환(재업로드 불필요)
//  - 외부 원격 URL(카카오 프로필 등)이면 https로 정규화 후 우리 Storage에 재호스팅 → 안정적 공개 https URL.
//      카카오 URL을 그대로 쓰면 (a) http라 친구 iOS가 ATS로 차단, (b) 만료/접근불가 위험 → 친구가 사진을 못 봄.
//  - 로컬(dgphoto:/file://)이면 경로 복원 → 압축(1200px·80% JPEG [[image-compression]]) → 업로드 → https URL
//  - 경로: avatars/{uid}/profile.jpg (storage.rules: 읽기 공개·쓰기 본인)
// 반환: https URL(성공) 또는 null(실패). 친구 공개는 이 URL을 users.avatarUrl에 동기화해 사용.
export async function uploadAvatar(uid, photoUri) {
  if (!uid || !photoUri || typeof photoUri !== 'string') return null;
  if (/firebasestorage\.(googleapis\.com|app)/.test(photoUri)) return photoUri; // 이미 우리 Storage URL — 재업로드 불필요
  try {
    const isRemote = /^https?:\/\//.test(photoUri);
    const srcUri = isRemote
      ? photoUri.replace(/^http:\/\//, 'https://')       // 카카오 등 외부 http → https 강제(ATS·친구 표시)
      : resolvePhotoUri(photoUri);                        // dgphoto: → 기기 절대경로
    const compressedUri = await compressImage(srcUri);    // 로컬은 압축, 원격은 통과(아래 fetch가 다운로드)
    const res = await fetch(compressedUri);
    const blob = await res.blob();
    const storageRef = ref(storage, `avatars/${uid}/profile.jpg`);
    await uploadBytes(storageRef, blob);
    return await getDownloadURL(storageRef);
  } catch (e) {
    if (__DEV__) console.warn('[avatarStorage] uploadAvatar fail', e?.message);
    return null;
  }
}

// 크루 프로필 이미지를 Storage에 올려 공개 https URL을 만든다(avatar와 동일 압축·패턴).
//  경로: crewImages/{uid}/{crewId}.jpg — 업로더(크루장) uid 경로(storage.rules: 읽기 공개·쓰기 본인).
//  반환: https URL(성공) 또는 null(실패). crews.imageUrl에 동기화해 사용(변경은 firestore.rules상 크루장만).
export async function uploadCrewImage(uid, crewId, photoUri) {
  if (!uid || !crewId || !photoUri || typeof photoUri !== 'string') return null;
  if (/^https?:\/\//.test(photoUri)) return photoUri;   // 이미 원격 URL — 업로드 불필요
  try {
    const localUri = resolvePhotoUri(photoUri);
    const compressedUri = await compressImage(localUri);
    const res = await fetch(compressedUri);
    const blob = await res.blob();
    const storageRef = ref(storage, `crewImages/${uid}/${crewId}.jpg`);
    await uploadBytes(storageRef, blob);
    return await getDownloadURL(storageRef);
  } catch (e) {
    if (__DEV__) console.warn('[avatarStorage] uploadCrewImage fail', e?.message);
    return null;
  }
}
