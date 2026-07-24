import * as FileSystem from 'expo-file-system/legacy';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { withUploadTimeout } from './storageUpload';   // 업로드가 '멈추기만' 할 때 저장이 영영 안 끝나는 걸 막는다
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
    let localUri;
    if (/^https?:\/\//.test(photoUri)) {
      // 외부 원격(카카오 등): https 강제 후 기기에 먼저 내려받는다. RN에서 원격 blob 업로드가 불안정해
      //   다운로드→로컬 파일 업로드(검증된 갤러리 경로)로 통일 — 조용한 실패로 친구 화면이 안 바뀌던 문제 방지.
      const httpsUri = photoUri.replace(/^http:\/\//, 'https://');
      const dest = `${FileSystem.cacheDirectory}avatar_src_${Date.now()}.jpg`;
      const dl = await FileSystem.downloadAsync(httpsUri, dest);
      localUri = dl?.uri || null;
      if (!localUri) return null;
    } else {
      localUri = resolvePhotoUri(photoUri);               // dgphoto: → 기기 절대경로
    }
    const compressedUri = await compressImage(localUri);   // 1200px·80% JPEG
    const res = await fetch(compressedUri);
    const blob = await res.blob();
    const storageRef = ref(storage, `avatars/${uid}/profile.jpg`);
    await withUploadTimeout(uploadBytes(storageRef, blob));
    const url = await getDownloadURL(storageRef);
    // 같은 경로(profile.jpg)를 덮어쓰면 다운로드 URL(토큰)이 그대로일 수 있어 avatarUrl 값이 안 바뀌고,
    //   다른 기기 expo-image도 같은 URL=캐시의 옛 사진을 계속 내준다(바꿔도 친구 화면 안 바뀜).
    //   캐시버스트 파라미터로 매 변경마다 새 URL을 만들어 write-through·친구 기기 갱신을 강제한다.
    return `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`;
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
  if (/firebasestorage\.(googleapis\.com|app)/.test(photoUri)) return photoUri; // 이미 우리 Storage URL — 재업로드 불필요
  try {
    let localUri;
    if (/^https?:\/\//.test(photoUri)) {
      // 외부 원격: https 강제 후 기기에 먼저 내려받아 검증된 로컬 업로드 경로로 (uploadAvatar와 동일 — 원격 blob 직접 업로드 회피).
      const httpsUri = photoUri.replace(/^http:\/\//, 'https://');
      const dest = `${FileSystem.cacheDirectory}crew_src_${Date.now()}.jpg`;
      const dl = await FileSystem.downloadAsync(httpsUri, dest);
      localUri = dl?.uri || null;
      if (!localUri) return null;
    } else {
      localUri = resolvePhotoUri(photoUri);
    }
    const compressedUri = await compressImage(localUri);
    const res = await fetch(compressedUri);
    const blob = await res.blob();
    const storageRef = ref(storage, `crewImages/${uid}/${crewId}.jpg`);
    await withUploadTimeout(uploadBytes(storageRef, blob));
    const url = await getDownloadURL(storageRef);
    // 같은 경로 덮어쓰기 → 다운로드 URL이 그대로일 수 있어 멤버 기기 expo-image가 캐시 옛 이미지 표시.
    //   캐시버스트로 변경마다 새 URL → crews.imageUrl 갱신·멤버 기기 갱신 강제 (uploadAvatar와 동일).
    return `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`;
  } catch (e) {
    if (__DEV__) console.warn('[avatarStorage] uploadCrewImage fail', e?.message);
    return null;
  }
}
