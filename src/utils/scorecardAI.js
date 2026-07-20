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

// 사진 1~2장(uri) → { holeScores:number[18], holePars:number[18]|null, total, players } | { error }
export async function extractScorecardAI(uris) {
  try {
    const list = (Array.isArray(uris) ? uris : [uris]).filter(Boolean).slice(0, 2);
    if (!list.length) return { error: '스코어카드 사진이 필요해요' };
    const images = [];
    for (const u of list) images.push({ data: await toBase64(u), format: 'jpg' });

    const callable = httpsCallable(functions, 'extractScorecard');
    const res = await callable({ images });
    const d = res?.data;
    if (!d?.found || !Array.isArray(d.holes) || !d.holes.length) {
      return { error: '스코어를 인식하지 못했어요 — 더 선명한 사진(전반/후반 각 1장)으로 다시 시도해주세요' };
    }

    // holes[{hole,par,score}] → 18칸 배열(없는 홀 null)
    const holeScores = Array(18).fill(null);
    const holePars = Array(18).fill(null);
    for (const h of d.holes) {
      const i = (h.hole | 0) - 1;
      if (i < 0 || i > 17) continue;
      if (h.score > 0) holeScores[i] = h.score;
      if (h.par > 0) holePars[i] = h.par;
    }
    const hasPar = holePars.some(Boolean);
    const sum = holeScores.reduce((s, n) => s + (n || 0), 0);
    const total = d.total > 0 ? d.total : sum;
    return { holeScores, holePars: hasPar ? holePars : null, total, players: d.players || 1 };
  } catch (e) {
    if (__DEV__) console.warn('[scorecardAI]', e?.code || '', e?.message);
    return { error: e?.message || '인식에 실패했어요. 다시 시도해주세요.', code: e?.code };
  }
}
