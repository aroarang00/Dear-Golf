import * as ImagePicker from 'expo-image-picker';
import TextRecognition from '@react-native-ml-kit/text-recognition';

// =============================================================
// 스코어카드 OCR — 본인 스코어(숫자 18홀)만 추출. ([[project_scorecard_ocr]])
//
// ⚠️ recognizeScorecard는 현재 STUB(mock 데이터). 실제 인식은 출시 시점에 연결:
//    @react-native-ml-kit/text-recognition (온디바이스·무료) → parseScorecardText로 표 파싱.
//    ML Kit는 네이티브 모듈 → 설치 시 EAS 재빌드 필요(JS-only 아님).
//
// 정책:
//  - 본인 스코어만, 숫자만. 본명·동반자 매핑/저장 X (PIPA).
//  - 동반자가 같이 나온 표는 OCR이 행(플레이어)별로 파싱 → 사용자가 본인 행 직접 선택.
//    (닉네임 변경하는 사용자가 있어 자동 이름매칭은 부정확)
//  - 추출 결과는 자동 확정 X → 사용자 확인·수정 필수 (다이어리 오염 방지).
// =============================================================

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
//    (압축은 업로드·저장용이고, 스코어카드는 숫자만 추출하고 이미지는 저장 안 하므로 불필요)
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

// 스코어카드 인식 → 행(플레이어)별 18홀 숫자. ML Kit 온디바이스 OCR(숫자/LATIN).
// 반환: { rows: [{ label, holes:number[18], total }], pars: number[18]|null, error?, rawText?(dev) }
//   - label: 화면 행 구분용으로만 표시(저장 X). 1행이면 자동 사용, 여러 행이면 사용자가 본인 행 선택.
//   - 인식 실패/숫자 부족이면 rows:[] → 검토 모달이 빈 표(직접 입력)로 폴백.
export async function recognizeScorecard(uri) {
  try {
    const result = await TextRecognition.recognize(uri);  // 기본 LATIN — 숫자 인식엔 충분
    const { rows, pars } = parseScorecardText(result.blocks);
    return { rows, pars, rawText: __DEV__ ? result.text : undefined };
  } catch (e) {
    if (__DEV__) console.warn('[scorecardOcr] recognize fail:', e?.message);
    return { rows: [], pars: null, error: e?.message || '사진을 인식하지 못했어요' };
  }
}

const median = (arr) => {
  const a = arr.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return 0;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

// ML Kit blocks → 숫자 토큰(중심좌표 포함). element(단어) 단위 우선,
// 한 element에 숫자 여러 개면 폭을 균등 분할해 각 숫자에 x좌표 근사 부여.
function numberTokens(blocks) {
  const toks = [];
  for (const b of blocks || []) {
    for (const ln of b.lines || []) {
      const els = (ln.elements && ln.elements.length) ? ln.elements : [ln];  // elements 없으면 line 자체
      for (const el of els) {
        const f = el.frame;
        const digits = (el.text || '').match(/\d{1,2}/g);
        if (!f || !digits) continue;
        const cy = f.top + f.height / 2;
        if (digits.length === 1) {
          toks.push({ n: +digits[0], cx: f.left + f.width / 2, cy, h: f.height });
        } else {
          const per = f.width / digits.length;
          digits.forEach((d, k) => toks.push({ n: +d, cx: f.left + per * (k + 0.5), cy, h: f.height }));
        }
      }
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

// OCR 텍스트 블록 → 행별 18홀 파싱 (좌표 기반 — 스마트스코어 등 표 포맷).
//  1) 숫자 토큰 추출(중심좌표) → 2) Y로 행 클러스터 → 3) 점수범위(1~19) 정수만 x정렬
//  4) 긴 행(≥14개)을 플레이어/파 행 후보로, par 행(전부 3~6)은 분리해 버디 자동집계에 사용.
// ⚠️ 첫 파서(기하 기반). OUT/IN/TOTAL 합계열이 끼는 포맷은 실제 스코어카드로 임계값·열제거 튜닝 필요.
//    검토 모달에서 사용자가 최종 수정하므로 시작점으로 충분.
export function parseScorecardText(blocks) {
  const toks = numberTokens(blocks);
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
