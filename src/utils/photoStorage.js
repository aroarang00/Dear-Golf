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
// 원격 URL(http)·이미 저장된 식별자는 그대로 둔다.
// ★복사 후 파일 크기를 검증(>0)하고 1회 재시도 — iCloud '아이폰 저장공간 최적화'로 원본이 기기에 없으면
//   복사가 0바이트/깨진 파일로 끝나 나중에 검정/회색이 됨. 검증 실패 시 '조용한 휘발성 폴백' 대신 throw해
//   호출부가 인지(사용자 안내·드롭)하게 한다. 예전엔 실패 시 원본 uri를 그대로 저장→캐시 비워지면 깨졌음.
export async function persistPhoto(uri) {
  if (!uri || typeof uri !== 'string') return uri;
  if (uri.startsWith('http') || uri.startsWith(SCHEME)) return uri;
  await ensureDir();
  const ext = ((uri.split('?')[0].split('.').pop()) || 'jpg').slice(0, 5);
  for (let attempt = 0; attempt < 2; attempt++) {
    const name = `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const dest = PHOTO_DIR + name;
    try {
      await FileSystem.copyAsync({ from: uri, to: dest });
      const info = await FileSystem.getInfoAsync(dest, { size: true });
      if (info.exists && info.size > 100) return SCHEME + name;   // 정상(0바이트/깨짐 아님)
      // 깨진 복사 — 흔적 지우고 재시도
      try { await FileSystem.deleteAsync(dest, { idempotent: true }); } catch { /* noop */ }
      if (__DEV__) console.warn('[photoStorage] 복사본 손상(size=', info?.size, ') 재시도', attempt);
    } catch (e) {
      if (__DEV__) console.warn('[photoStorage] 복사 실패 재시도', attempt, e?.message);
    }
  }
  // 휘발성 원본을 그대로 저장하면 나중에 깨지므로, 차라리 실패를 알린다(호출부에서 안내/드롭).
  throw new Error('persist-failed');
}

// 사진 배열(문자열 또는 { uri, type:'video' } 객체 혼합) 전체를 영구 저장.
// ★실패한 항목은 '드롭'(깨진 참조를 저장하지 않음) — 정상 사진은 보존. 호출부는 입력↔출력 길이 차로 누락 안내.
export async function persistPhotos(photos) {
  if (!Array.isArray(photos)) return photos;
  const out = [];
  for (const p of photos) {
    try {
      if (typeof p === 'string') out.push(await persistPhoto(p));
      else if (p && typeof p === 'object' && p.uri) out.push({ ...p, uri: await persistPhoto(p.uri) });
      else out.push(p);
    } catch (e) {
      if (__DEV__) console.warn('[photoStorage] persist 드롭(깨진 사진 저장 방지)', e?.message);
    }
  }
  return out;
}

// 저장된 식별자 → 표시용 절대 URI.
// 'dgphoto:'면 현재 documentDirectory 기준으로 재구성, 그 외(원격 URL·
// 레거시 절대경로·더미 데이터)는 그대로 반환.
export function resolvePhotoUri(stored) {
  if (!stored || typeof stored !== 'string') return stored;
  if (stored.startsWith(SCHEME)) return PHOTO_DIR + stored.slice(SCHEME.length);
  return stored;
}
