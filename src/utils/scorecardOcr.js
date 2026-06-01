import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

// =============================================================
// 스코어카드 OCR — 본인 스코어(숫자 18홀)만 추출. ([[project_scorecard_ocr]])
//
// 2026-06-01: ML Kit(온디바이스) → Naver CLOVA OCR(클라우드 REST) 전환.
//   ML Kit가 스마트스코어 작은 홀별 숫자를 못 읽어 폐기. CLOVA는 REST라 재빌드 불필요.
//   ⚠️ 시크릿 키 클라 노출 → 출시 전 Cloud Functions 프록시 필수 ([[api-key-security]]).
//   ⚠️ 이미지가 NAVER로 업로드 → 개인정보처리방침에 처리위탁 고지 필요 ([[project_scorecard_ocr]]).
//
// 정책:
//  - 본인 스코어만, 숫자만. 본명·동반자 매핑/저장 X (PIPA).
//  - 동반자가 같이 나온 표는 행(플레이어)별로 파싱 → 사용자가 본인 행 직접 선택.
//  - 추출 결과는 자동 확정 X → 사용자 확인·수정 필수 (다이어리 오염 방지).
// =============================================================

// CLOVA OCR 인증 (NCP → CLOVA OCR → General Domain → APIGW). 미설정이면 recognize가 안내 에러 반환.
const CLOVA_INVOKE_URL = process.env.EXPO_PUBLIC_CLOVA_OCR_INVOKE_URL;
const CLOVA_SECRET = process.env.EXPO_PUBLIC_CLOVA_OCR_SECRET;

export const HOLE_COUNT = 18;
export const emptyHoles = () => Array(HOLE_COUNT).fill(null);
export const sumHoles = (holes) =>
  (holes || []).reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0);

// 홀별 스코어 vs 홀별 par → 타입별 개수 (이글·버디·파·보기·더블+). par 없으면 null.
// 버디 자동 입력에 사용 (birdie = score-par == -1). [[project_scorecard_ocr]]
export function scoreBreakdown(holeScores, holePars) {
  if (!Array.isArray(holeScores) || !Array.isArray(holePars)) return null;
  const b = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0 };
  for (let i = 0; i < HOLE_COUNT; i++) {
    const s = holeScores[i], p = holePars[i];
    if (!Number.isFinite(s) || !Number.isFinite(p)) continue;
    const d = s - p;
    if (d <= -2) b.eagle++;
    else if (d === -1) b.birdie++;
    else if (d === 0) b.par++;
    else if (d === 1) b.bogey++;
    else b.double++; // +2 이상 (더블보기 이상 통합)
  }
  return b;
}

// 사진 선택 — source: 'gallery' | 'camera'.
// 갤러리(카톡 공유 사진) 권장 — 디지털 스크린샷이라 인식률 높음. 촬영도 허용.
// ⚠️ OCR은 원본 해상도가 정확도에 결정적 — 리사이즈/압축 안 함(작은 홀 숫자 뭉갬 방지).
// 반환: { uri } 또는 null(취소·권한거부).
export async function pickScorecardImage(source = 'gallery') {
  let result;
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
    result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  } else {
    result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsMultipleSelection: false, quality: 1,
    });
  }
  if (result.canceled || !result.assets?.length) return null;
  return { uri: result.assets[0].uri };  // 원본 그대로 — 리사이즈 X
}

// 스코어카드 인식 → 행(플레이어)별 18홀 숫자. Naver CLOVA OCR(General, REST).
// 반환: { rows: [{ label, holes:number[18], total }], pars: number[18]|null, error?, rawText?(dev) }
//   - label: 화면 행 구분용으로만 표시(저장 X). 1행이면 자동 사용, 여러 행이면 사용자가 본인 행 선택.
//   - 인식 실패/숫자 부족/키 미설정이면 rows:[] → 검토 모달이 빈 표(직접 입력)로 폴백.
export async function recognizeScorecard(uri) {
  if (!CLOVA_INVOKE_URL || !CLOVA_SECRET) {
    if (__DEV__) console.warn('[scorecardOcr] CLOVA 키 미설정 (.env EXPO_PUBLIC_CLOVA_OCR_*)');
    return { rows: [], pars: null, error: 'OCR 설정이 아직 준비 중이에요 — 직접 입력해 주세요' };
  }
  try {
    // HEIC 대응 + 원본 해상도 유지 jpg base64 (리사이즈 X — 작은 홀 숫자 보존)
    const img = await ImageManipulator.manipulateAsync(uri, [], {
      compress: 1, format: ImageManipulator.SaveFormat.JPEG, base64: true,
    });
    const body = {
      version: 'V2',
      requestId: `dg_${Date.now()}`,
      timestamp: Date.now(),
      lang: 'ko',
      images: [{ format: 'jpg', name: 'scorecard', data: img.base64 }],
    };
    const res = await fetch(CLOVA_INVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-OCR-SECRET': CLOVA_SECRET },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`CLOVA ${res.status}`);
    const json = await res.json();
    const fields = json?.images?.[0]?.fields || [];
    const toks = clovaFieldsToTokens(fields);
    const { rows, pars } = parseTokens(toks);
    return { rows, pars, rawText: __DEV__ ? fields.map(f => f.inferText).join(' ') : undefined };
  } catch (e) {
    if (__DEV__) console.warn('[scorecardOcr] CLOVA fail:', e?.message);
    return { rows: [], pars: null, error: e?.message || '사진을 인식하지 못했어요' };
  }
}

const median = (arr) => {
  const a = arr.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return 0;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

// CLOVA fields → 숫자 토큰(중심좌표 포함). boundingPoly.vertices(4점)로 좌표·높이 산출.
// 한 field에 숫자 여러 개면 폭을 균등 분할해 각 숫자에 x좌표 근사 부여(ML Kit 파서와 동일 로직).
function clovaFieldsToTokens(fields) {
  const toks = [];
  for (const f of fields || []) {
    const verts = f.boundingPoly?.vertices || [];
    if (verts.length < 2) continue;
    const xs = verts.map(v => v.x ?? 0);
    const ys = verts.map(v => v.y ?? 0);
    const left = Math.min(...xs), right = Math.max(...xs);
    const top = Math.min(...ys), bottom = Math.max(...ys);
    const h = bottom - top;
    const digits = (f.inferText || '').match(/\d{1,2}/g);
    if (!digits) continue;
    const cy = top + h / 2;
    if (digits.length === 1) {
      toks.push({ n: +digits[0], cx: (left + right) / 2, cy, h });
    } else {
      const per = (right - left) / digits.length;
      digits.forEach((d, k) => toks.push({ n: +d, cx: left + per * (k + 0.5), cy, h }));
    }
  }
  return toks;
}

// Y 근접으로 행(가로줄) 묶기 — 표의 한 줄 = 같은 높이대의 토큰들.
function clusterRows(toks) {
  const tol = (median(toks.map(t => t.h)) || 16) * 0.6;
  const rows = [];
  for (const t of [...toks].sort((a, b) => a.cy - b.cy)) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(t.cy - last.cy) <= tol) {
      const before = last.items.length;
      last.items.push(t);
      last.cy = (last.cy * before + t.cy) / (before + 1);
    } else {
      rows.push({ cy: t.cy, items: [t] });
    }
  }
  return rows;
}

// 숫자 토큰 → 행별 18홀 파싱 (좌표 기반 — 스마트스코어 등 표 포맷).
//  1) Y로 행 클러스터 → 2) 점수범위(1~19) 정수만 x정렬 → 3) 긴 행(≥14개)을 플레이어/파 행 후보로
//  4) par 행(전부 3~6)은 분리해 버디 자동집계에 사용.
// ⚠️ OUT/IN/TOTAL 합계열이 끼는 포맷은 실제 CLOVA 응답으로 임계값·열제거 튜닝 필요.
//    검토 모달에서 사용자가 최종 수정하므로 시작점으로 충분.
function parseTokens(toks) {
  if (!toks.length) return { rows: [], pars: null };

  const longRows = clusterRows(toks)
    .map(r => ({
      cy: r.cy,
      vals: r.items.filter(t => t.n >= 1 && t.n <= 19).sort((a, b) => a.cx - b.cx).map(t => t.n),
    }))
    .filter(r => r.vals.length >= 14);
  if (!longRows.length) return { rows: [], pars: null };

  const to18 = (vals) => {
    const v = vals.slice(0, 18);
    while (v.length < 18) v.push(null);
    return v;
  };

  // par 행 = 값이 거의 전부 3~6인 긴 행(보통 표 상단). 있으면 분리.
  const parIdx = longRows.findIndex(r => r.vals.length >= 16 && r.vals.every(n => n >= 3 && n <= 6));
  let pars = null;
  const players = [];
  longRows.forEach((r, i) => {
    if (i === parIdx) pars = to18(r.vals);
    else players.push(r);
  });

  const rows = (players.length ? players : longRows).map((r, i) => {
    const holes = to18(r.vals);
    return { label: `${i + 1}번째 줄`, holes, total: sumHoles(holes) };
  });
  return { rows, pars };
}
