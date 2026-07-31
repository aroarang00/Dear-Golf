import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

// 스코어카드 사진 선택 — 갤러리는 최대 2장(태블릿 전/후반 또는 팀 카드 2장까지), 카메라는 1장.
//   ★2장 상한: 3장↑은 AI가 par·총계를 놓쳐 오합산(3장=99, 4장=55 등)이라 정확도 신뢰 불가.
//    1~2장은 par·총계 온전→정확 검증됨. 단체는 팀 카드를 2장씩 나눠 담을 것.
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

// 스코어카드 AI 추출 — 사진 1~2장 → Gemini 비전(extractScorecard CF).
//   ① 태블릿 전/후반 조각(9홀씩)이면 병합 ② 전체 카드(18홀·여러 명)면 카드의 전원 추출.
//   ★상한 2장(위 pickScorecardImages 참고). 단체는 팀 카드 2장씩 나눠 담기.
//   CLOVA OCR(PAR 표 필수·태블릿 전후반 분리 못 읽음) 대체. 정책: 프리필만, 검토 모달에서 사용자 확인·수정.

// 이미지 URI → 리사이즈·JPEG base64. 스코어카드는 작은 숫자라 해상도 좀 높게(1600px) 유지.
async function toBase64(uri) {
  const img = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1600 } }], {
    compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true,
  });
  return img.base64;
}

// 사진 1~2장(uri) → { rows:[{ label, holes:(number|null)[18], total }], holePars, lowConfidence, notes } | { error }
//   rows = 플레이어(행)별(여러 카드/여러 팀이면 전원). 여러 명이면 검토 모달이 '본인 행 선택' UI를 띄움.
//   ★holes는 '실제 타수'로 이미 조립돼 온다 — 전/후반 순서 결정과 파대비 환산은 CF가 산술로 끝냈다(2026-07-31 개편).
//     못 읽은 홀만 null. 아래 reconcile 계열은 이제 옛 공유 데이터용 안전망 역할만 한다.
export async function extractScorecardAI(uris) {
  try {
    const list = (Array.isArray(uris) ? uris : [uris]).filter(Boolean).slice(0, 2);
    if (!list.length) return { error: '스코어카드 사진이 필요해요' };
    const images = [];
    for (const u of list) images.push({ data: await toBase64(u), format: 'jpg' });

    // 타임아웃 120s — 2장 추출도 응답이 9~70s로 출렁임(과거 3~4장 잔재). 기본 70s면 CF(90s)가 성공해도
    //   클라가 먼저 포기해 '무한 로딩 후 실패'가 됨. CF 예산(90s)보다 넉넉히 잡아 성공 응답을 안 버림.
    const callable = httpsCallable(functions, 'extractScorecard', { timeout: 120000 });
    const res = await callable({ images });
    const d = res?.data;
    if (!d?.found || !Array.isArray(d.players) || !d.players.length) {
      return { error: '스코어를 인식하지 못했어요 — 더 선명한 사진(전반/후반 각 1장)으로 다시 시도해주세요' };
    }

    const rows = d.players.map((p, i) => {
      // CF는 못 읽은 홀을 0으로 준다 → null로 바꿔 검토표에서 '빈 칸'으로 보이게(0타로 오해·합산 오염 방지).
      const holes = (Array.isArray(p.scores) ? p.scores.slice(0, 18) : []).map(n => (n > 0 ? n : null));
      while (holes.length < 18) holes.push(null);
      const sum = holes.reduce((s, n) => s + (n || 0), 0);
      const total = p.total > 0 ? p.total : sum;
      return { label: (p.name || '').trim() || `${i + 1}번`, holes, total };
    });
    const hasPar = Array.isArray(d.pars) && d.pars.some(v => v >= 3 && v <= 5);
    const holePars = hasPar ? d.pars.slice(0, 18).map(v => (v >= 3 && v <= 5) ? v : null) : null;
    // lowConfidence — CF가 산술 검산에 실패한 경우(전/후반 순서 미확정·홀 누락·합계 불일치). 검토 모달이 확인을 강조.
    return { rows, holePars, lowConfidence: !!d.lowConfidence, notes: Array.isArray(d.notes) ? d.notes : [] };
  } catch (e) {
    if (__DEV__) console.warn('[scorecardAI]', e?.code || '', e?.message);
    return { error: e?.message || '인식에 실패했어요. 다시 시도해주세요.', code: e?.code };
  }
}
