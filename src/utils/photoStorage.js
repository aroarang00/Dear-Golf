import * as FileSystem from 'expo-file-system/legacy';

// 사진 영구 저장 — iOS는 앱을 업데이트할 때 앱 컨테이너 경로의 UUID가 바뀐다.
// ImagePicker가 준 절대 경로 URI를 그대로 저장하면 업데이트 후 경로가 무효가 되어
// 사진이 백지로 보인다. 그래서 사진을 documentDirectory 아래 영구 폴더로 복사하고,
// 저장은 'dgphoto:파일명' 식별자로만 한다. 표시할 때 현재 documentDirectory와
// 합쳐 경로를 다시 만든다 (UUID가 바뀌어도 안전).

const PHOTO_DIR = FileSystem.documentDirectory + 'dg_photos/';
const SCHEME = 'dgphoto:';

let dirReady = false;
async function ensureDir() {
  if (dirReady) return;
  const info = await FileSystem.getInfoAsync(PHOTO_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(PHOTO_DIR, { intermediates: true });
  dirReady = true;
}

// ImagePicker URI → 영구 폴더에 복사하고 'dgphoto:파일명' 식별자 반환.
// 원격 URL(http)·이미 저장된 식별자는 그대로 둔다. 복사 실패 시 원본 uri 폴백.
export async function persistPhoto(uri) {
  if (!uri || typeof uri !== 'string') return uri;
  if (uri.startsWith('http') || uri.startsWith(SCHEME)) return uri;
  try {
    await ensureDir();
    const ext = ((uri.split('?')[0].split('.').pop()) || 'jpg').slice(0, 5);
    const name = `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await FileSystem.copyAsync({ from: uri, to: PHOTO_DIR + name });
    return SCHEME + name;
  } catch (e) {
    console.warn('[photoStorage] 사진 저장 실패', e?.message);
    return uri;
  }
}

// 사진 배열(문자열 또는 { uri, type:'video' } 객체 혼합) 전체를 영구 저장.
export async function persistPhotos(photos) {
  if (!Array.isArray(photos)) return photos;
  return Promise.all(photos.map(async (p) => {
    if (typeof p === 'string') return persistPhoto(p);
    if (p && typeof p === 'object' && p.uri) return { ...p, uri: await persistPhoto(p.uri) };
    return p;
  }));
}

// 저장된 식별자 → 표시용 절대 URI.
// 'dgphoto:'면 현재 documentDirectory 기준으로 재구성, 그 외(원격 URL·
// 레거시 절대경로·더미 데이터)는 그대로 반환.
export function resolvePhotoUri(stored) {
  if (!stored || typeof stored !== 'string') return stored;
  if (stored.startsWith(SCHEME)) return PHOTO_DIR + stored.slice(SCHEME.length);
  return stored;
}
