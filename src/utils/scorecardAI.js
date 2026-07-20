import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

// 스코어카드 사진 선택 — 갤러리는 다중(전반/후반 최대 2장), 카메라는 1장.
//   반환: { uris:[...] } | { denied:true } | null(취소).
export async function pickScorecardImages(source = 'gallery', max = 2) {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return { denied: true };
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
    if (r.canceled || !r.assets?.length) return null;
    return { uris: [r.assets[0].uri] };
  }
  let perm = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (!perm.granted && perm.canAskAgain) perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { denied: true };
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: max, quality: 1 });
  if (r.canceled || !r.assets?.length) return null;
  return { uris: r.assets.slice(0, max).map(a => a.uri) };
}

// 스코어카드 AI 추출 — 카드/스마트스코어 태블릿 사진 1~2장(전반/후반) → Gemini 비전(extractScorecard CF).
//   CLOVA OCR(PAR 표 필수·태블릿 전후반 분리 못 읽음) 대체. 정책: 프리필만, 검토 모달에서 사용자 확인·수정.

// 이미지 URI → 리사이즈·JPEG base64. 스코어카드는 작은 숫자라 해상도 좀 높게(1600px) 유지.
async function toBase64(uri) {
  const img = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1600 } }], {
    compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true,
  });
  return img.base64;
}

// 사진 1~2장(uri) → { rows:[{ label, holes:number[18], total }], holePars:number[18]|null } | { error }
//   rows = 플레이어(행)별. 여러 명이면 검토 모달이 '본인 행 선택' UI를 띄움.
export async function extractScorecardAI(uris) {
  try {
    const list = (Array.isArray(uris) ? uris : [uris]).filter(Boolean).slice(0, 2);
    if (!list.length) return { error: '스코어카드 사진이 필요해요' };
    const images = [];
    for (const u of list) images.push({ data: await toBase64(u), format: 'jpg' });

    const callable = httpsCallable(functions, 'extractScorecard');
    const res = await callable({ images });
    const d = res?.data;
    if (!d?.found || !Array.isArray(d.players) || !d.players.length) {
      return { error: '스코어를 인식하지 못했어요 — 더 선명한 사진(전반/후반 각 1장)으로 다시 시도해주세요' };
    }

    const rows = d.players.map((p, i) => {
      const holes = (Array.isArray(p.scores) ? p.scores.slice(0, 18) : []).map(n => n || 0);
      while (holes.length < 18) holes.push(0);
      const total = p.total > 0 ? p.total : holes.reduce((s, n) => s + n, 0);
      return { label: (p.name || '').trim() || `${i + 1}번`, holes, total };
    });
    const hasPar = Array.isArray(d.pars) && d.pars.some(v => v >= 3 && v <= 5);
    const holePars = hasPar ? d.pars.slice(0, 18).map(v => (v >= 3 && v <= 5) ? v : null) : null;
    return { rows, holePars };
  } catch (e) {
    if (__DEV__) console.warn('[scorecardAI]', e?.code || '', e?.message);
    return { error: e?.message || '인식에 실패했어요. 다시 시도해주세요.', code: e?.code };
  }
}
