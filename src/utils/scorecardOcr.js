import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

// =============================================================
// 스코어카드 OCR — 본인 스코어(숫자 18홀)만 추출. ([[project_scorecard_ocr]])
//
// 2026-06-01: ML Kit(온디바이스) → Naver CLOVA OCR(클라우드) 전환. ML Kit가 작은 홀 숫자 못 읽어 폐기.
// 2026-06-02: CLOVA 직접호출(키 클라 노출) → Cloud Functions 프록시(recognizeScorecard)로 전환.
//   키는 CF Secret에만 보관 → 앱 노출 0 ([[api-key-security]]). JS만이라 재빌드 불필요.
//   ⚠️ 이미지가 NAVER로 업로드 → 개인정보처리방침에 처리위탁(네이버클라우드) 고지 필요 ([[project_scorecard_ocr]]).
//
// 정책:
//  - 본인 스코어만, 숫자만. 본명·동반자 매핑/저장 X (PIPA).
//  - 동반자가 같이 나온 표는 행(플레이어)별로 파싱 → 사용자가 본인 행 직접 선택.
//  - 추출 결과는 자동 확정 X → 사용자 확인·수정 필수 (다이어리 오염 방지).
// =============================================================

export const HOLE_COUNT = 18;
export const sumHoles = (holes) =>
  (holes || []).reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0);

// 파대비(스마트스코어) 표기 홀 배열 → 실제 타수 배열. 인쇄 총계와의 산술 교차검증(추측 아님).
//   홀별합≠인쇄총계이고 (홀별합+par합)이 인쇄총계에 더 가깝고 오차≤8이면 파대비로 판정 → 홀마다 par 더함.
//   실제 타수 카드는 par합(~72)까지 더해야 맞는 실수가 산술적으로 불가 → 오판 안 됨.
//   ScorecardReviewModal.loadRow와 동일 로직(단일 소스). 변환 불가/불필요면 원본 그대로 반환.
export function toActualStrokeHoles(holes, printedTotal, holePars) {
  const raw = (holes || []).map(n => (Number.isFinite(n) ? n : null));
  const parReady = Array.isArray(holePars) && holePars.filter(p => p >= 3 && p <= 5).length >= 9;
  if (!parReady) return raw;
  const holesSum = raw.reduce((s, n) => s + (n || 0), 0);
  // 인쇄총계가 홀별합과 '다를' 때만 신뢰 — 같으면 CF가 합으로 폴백한 값일 수 있어 판별 불가(→ 변환 안 함).
  if (!Number.isFinite(printedTotal) || printedTotal <= 0 || printedTotal === holesSum) return raw;
  const parSum = raw.reduce((s, n, idx) => {
    const p = holePars[idx];
    return s + ((n != null && p >= 3 && p <= 5) ? p : 0);
  }, 0);
  const dStroke = Math.abs(holesSum - printedTotal);
  const dRel = Math.abs(holesSum + parSum - printedTotal);
  if (!(dRel < dStroke && dRel <= 8)) return raw; // tol 8 = 총계 오독+버디(음수 잘림) 여유. 실제타수 카드의 dRel은 ~70이라 안 걸림
  return raw.map((n, idx) => {
    if (n == null) return n;
    const p = holePars[idx];
    return (p >= 3 && p <= 5) ? n + p : n;
  });
}

// 파대비 임계(파 합 근사) — 홀 합이 인쇄 총계보다 이만큼 작으면 '파대비인데 par를 못 읽어 환산 실패'로 본다.
//   18홀 par 합은 보통 ~72. 실타수 카드의 오독 오차는 한 자릿수라, 30 이상 벌어지면 파대비 미환산이 거의 확실.
const PAR_REL_GAP = 30;

// 한 행을 '신뢰 가능한 {holes, total}'로 재조정 — 리뷰·공유·수신이 모두 이 하나를 쓴다(단일 소스).
//   ① par 있음 → 파대비를 실타수로 환산, 총타=홀 합.
//   ② par 없음(회전 재인식 등에서 PAR 행 놓침)인데 홀 합(파대비)이 인쇄 총계보다 크게 작음 → 환산 불가.
//      파대비 숫자를 실타수인 척 쓰면 총타가 27 같은 오버값으로 박힌다(99→27). → 홀별은 버리고 인쇄 총계를 총타로.
//   ③ AI가 오버파를 total로 오독(예:19) → 홀 합(실타수 91)로 총타 재계산(①과 같은 경로).
export function reconcileScoreRow(holes, printedTotal, holePars) {
  const printed = Number.isFinite(printedTotal) ? printedTotal : (parseInt(printedTotal) || 0);
  const conv = toActualStrokeHoles(holes, printedTotal, holePars);
  const hasHoles = Array.isArray(conv) && conv.some(n => Number.isFinite(n));
  if (!hasHoles) return { holes: null, total: printed };            // 총타만 있는 행
  const convSum = sumHoles(conv);
  if (printed > 0 && convSum > 0 && printed - convSum >= PAR_REL_GAP) {
    return { holes: null, total: printed };                         // par대비 환산 실패 → 인쇄 총계 신뢰, 홀별 버림
  }
  return { holes: conv, total: convSum };
}

// 공유·파생용 행 정규화 — reconcileScoreRow로 홀·총타를 신뢰값으로 맞춘다.
//   ★AI가 오버파(19)를 total로 오독해도 홀 합으로 총타를 다시 계산(91), par를 못 읽은 파대비 카드는 인쇄 총계(99)를
//     총타로 신뢰 — 리뷰 화면·동반자 전달·수신 파생이 모두 같은 총타가 되게.
export function normalizeScoreRow(row, holePars) {
  if (!row) return row;
  const { holes, total } = reconcileScoreRow(row.holes, row.total, holePars);
  return { ...row, holes, total };
}

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
    if (!perm.granted) return { denied: true };   // 취소(null)와 구분 — 호출처가 권한 안내
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
// 이미지를 rotate(0/90/270)로 돌려 jpg base64 만든 뒤 CLOVA → 파싱. 원본 해상도 유지(리사이즈 X).
async function runScorecardOcr(uri, rotate) {
  const actions = rotate ? [{ rotate }] : [];   // rotate=0이면 빈 작업
  const img = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: 1, format: ImageManipulator.SaveFormat.JPEG, base64: true,
  });
  const callable = httpsCallable(functions, 'recognizeScorecard');
  const res = await callable({ imageBase64: img.base64, format: 'jpg' });
  const fields = res?.data?.fields || [];   // [{ text, confidence, vertices }]
  return parseTokens(tokenize(fields));      // { rows, pars }
}

// 인식 결과 신뢰도 채점 — 각 플레이어의 홀 합계가 카드에 인쇄된 total과 맞을수록 높음.
//   회전이 틀린 방향/잘못 읽은 결과는 숫자가 무작위라 total과 안 맞음 → 올바른 방향만 높게 채점.
//   matched = 홀합계가 인쇄 total과 '완전 일치'한 플레이어 수(1명 이상이면 확신).
function scoreRows(rows) {
  if (!rows || !rows.length) return { score: -1, matched: 0 };
  let score = 0, matched = 0;
  for (const r of rows) {
    const filled = (r.holes || []).filter(Number.isFinite);
    const sum = filled.reduce((a, b) => a + b, 0);
    score += filled.length * 0.1;   // 많이 채워질수록 약간 가점
    if (Number.isFinite(r.total) && r.total > 0) {
      if (filled.length === 18 && sum === r.total) { score += 5; matched++; }       // 완전 일치(강한 신호)
      else if (filled.length >= 16 && Math.abs(sum - r.total) <= 3) score += 2;     // 버디 아이콘 누락 등 근사
    }
  }
  return { score, matched };
}

export async function recognizeScorecard(uri) {
  try {
    // ★자동 회전 + 신뢰도 선택 — EXIF·촬영으로 표가 90/270° 누운 사진(갤러리는 똑바로 보여도 픽셀은 회전)을 위해
    //   0°→90°→270°로 이미지를 돌려가며 재OCR하고, '인쇄된 합계(total)와 맞는' 결과를 채택(엉뚱하게 읽은 방향 배제).
    //   한 명이라도 홀합계=total 완전일치면 그 방향이 정답 → 조기 종료(똑바른 사진/스크린샷은 0°에서 1회).
    let best = null;
    for (const deg of [0, 90, 270]) {
      const r = await runScorecardOcr(uri, deg);
      const { score, matched } = scoreRows(r.rows);
      if (!best || score > best.score) best = { rows: r.rows, pars: r.pars, score, matched };
      if (matched >= 1) break;   // 합계 일치 = 확신 → 더 돌릴 필요 없음
    }
    if (!best || !best.rows.length) {
      return {
        rows: [], pars: null,
        error: 'PAR(파)가 보이는 표 형태 스코어카드를 올려주세요.\n풍경 배경의 요약 카드는 PAR가 없어 홀별 인식이 어려워요.',
      };
    }
    // 어느 방향도 인쇄 합계와 정확히 안 맞으면 저신뢰 → 리뷰 화면에서 확인 강조(틀린 홀이 그냥 들어가는 것 방지).
    // 소계 불일치 행(복원 못 한 오독 잔존)도 저신뢰로 — 버디가 +1로 읽힌 채 확정되는 것 방지.
    return { rows: best.rows, pars: best.pars, lowConfidence: best.matched === 0 || best.rows.some(r => r.subMismatch) };
  } catch (e) {
    if (__DEV__) console.warn('[scorecardOcr] OCR fail:', e?.code || '', e?.message);
    return { rows: [], pars: null, error: e?.message || '사진을 인식하지 못했어요 — 직접 입력해 주세요' };
  }
}

const median = (arr) => {
  const a = arr.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return 0;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

// CF 반환 fields → 토큰(좌표 포함). 숫자(음수=언더 포함)와 텍스트 라벨(이름·PAR·HOLE) 모두 보존.
// vertices(4점)로 좌표·높이 산출. 한 field에 숫자 여러 개면 폭을 균등 분할해 x좌표 근사 부여.
//   { kind:'num', n } | { kind:'text', text } + { cx, cy, h }
function tokenize(fields) {
  const toks = [];
  for (const f of fields || []) {
    const verts = f.vertices || [];
    if (verts.length < 2) continue;
    const xs = verts.map(v => v.x ?? 0);
    const ys = verts.map(v => v.y ?? 0);
    const left = Math.min(...xs), right = Math.max(...xs);
    const top = Math.min(...ys), bottom = Math.max(...ys);
    const h = bottom - top, cy = top + h / 2;
    const text = (f.text || '').trim();
    if (!text) continue;
    // par/hdcp 합쳐진 셀 "4/10" → par(앞 숫자)만 (스마트스코어 태블릿)
    const slashPar = text.match(/^(\d{1,2})\s*\/\s*\d{1,2}$/);
    if (slashPar) {
      toks.push({ kind: 'num', n: parseInt(slashPar[1], 10), cx: (left + right) / 2, cy, h });
      continue;
    }
    const nums = text.match(/-?\d{1,2}/g);
    const nonNumeric = text.replace(/[\d\s.\-+]/g, '');   // 숫자·공백·부호 제외 남는 글자
    if (nums && !nonNumeric) {
      // 숫자(들)로만 구성 — 개별 숫자 토큰으로 분할 (음수 = 언더)
      if (nums.length === 1) {
        toks.push({ kind: 'num', n: parseInt(nums[0], 10), cx: (left + right) / 2, cy, h });
      } else {
        const per = (right - left) / nums.length;
        nums.forEach((d, k) => toks.push({ kind: 'num', n: parseInt(d, 10), cx: left + per * (k + 0.5), cy, h }));
      }
    } else {
      // 텍스트 라벨 (이름·PAR·HOLE·T·코스명 등)
      toks.push({ kind: 'text', text, cx: (left + right) / 2, cy, h });
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

// 토큰 → 스마트스코어 카드 파싱.
//  스마트스코어는 홀별 칸이 "파 대비(+/-)" 표시 → 실제 타수 = PAR + 파대비.
//  표는 전반/후반 9홀씩 2블록, 각 블록에 HOLE·PAR·플레이어(여럿) 행.
//  1) Y로 행 클러스터 → 2) 라벨로 행 종류 분류(hole/par/player)
//  3) PAR 행에서 홀별 par, 플레이어 행에서 홀별 파대비
//  4) 실제타수 = par + 파대비, 전·후반 같은 순서끼리 18홀로 병합
//  5) 플레이어별 행 반환(동반자 카드는 여러 명) → 사용자가 본인 행 선택. 이름은 표시용(저장 X).
// 반환: { rows:[{ label, holes:number[18], total }], pars:number[18]|null }
function parseTokens(toks) {
  if (!toks.length) return { rows: [], pars: null };

  const classified = clusterRows(toks).map(r => {
    const items = r.items.slice().sort((a, b) => a.cx - b.cx);
    const labelText = items.filter(t => t.kind === 'text').map(t => t.text).join(' ');
    const numItems = items.filter(t => t.kind === 'num').map(t => ({ n: t.n, cx: t.cx })); // x좌표 유지 — 컬럼 정렬용
    const nums = numItems.map(it => it.n);
    // 1..9 순차면 헤더(HOLE) 행
    const isSeq = nums.length >= 8 && nums.slice(0, 8).every((n, k) => n === k + 1);
    let type = 'other';
    if (/HOLE/i.test(labelText) || isSeq) type = 'hole';
    else if (/PAR/i.test(labelText)) type = 'par';
    else if (/[가-힣]/.test(labelText) && nums.length >= 7) type = 'player';
    // 'SCORE'/'스코어' 라벨 점수행 — 요약형·타앱 카드(이름 없이 SCORE만). 한글/빈라벨 조건에 안 걸려
    //   'other'로 빠지며 플레이어 행 0개 → 인식 실패하던 버그 수정(2026-06-17, Hole/PAR/SCORE 형식).
    else if (/SCORE|스코어/i.test(labelText) && nums.length >= 7) type = 'player';
    else if (!labelText && nums.length >= 9 && !isSeq) type = 'player';   // 이름 인식 실패 폴백
    const name = labelText.replace(/SMART|SCORE/gi, '').trim();
    return { cy: r.cy, name, nums, numItems, type };
  });

  const parRows = classified.filter(r => r.type === 'par').sort((a, b) => a.cy - b.cy);
  if (!parRows.length) return { rows: [], pars: null };

  // PAR 홀값(3~6)만 추출 — 소계(36/72)·HDCP 제외. 원본 인덱스도(플레이어 같은 컬럼 매칭용).
  const parHoleVals = (pr) => pr.nums.filter(n => n >= 3 && n <= 6);
  const parHoleIdx = (pr) => { const idx = []; pr.nums.forEach((v, i) => { if (v >= 3 && v <= 6) idx.push(i); }); return idx; };

  const players = classified.filter(r => r.type === 'player');
  const ph0 = parHoleVals(parRows[0]);

  // PAR 행 홀 컬럼(값 3~6 + x좌표). 소계(36/72 등)는 값>6라 자동 제외.
  const parCols = (pr) => pr.numItems.filter(it => it.n >= 3 && it.n <= 6).slice(0, 9);
  // 플레이어 숫자를 PAR 컬럼 x에 정렬 — 누락 셀(나비 가린 버디 등)=null, 마지막 홀 우측 숫자=소계로 분리.
  //   ★스마트스코어 버디(-1)가 노란 나비 아이콘에 가려 CLOVA가 그 칸을 못 읽음 → 한 칸씩 밀려 소계(44)가 홀로 끼던 버그 수정 ([[project_scorecard_ocr]]).
  //   offs=칸별 x치우침(컬럼 중심 대비) — '-1'의 마이너스가 소실되면 남은 '1'이 오른쪽으로 밀림(아래 fixLostMinus 단서).
  const alignRow = (numItems, cols) => {
    if (!cols.length) return { holes: [], sub: undefined, offs: [], span: 40 };
    const span = cols.length >= 2 ? (cols[cols.length - 1].cx - cols[0].cx) / (cols.length - 1) : 40;
    const tol = span * 0.55, lastX = cols[cols.length - 1].cx;
    const holes = new Array(cols.length).fill(null);
    const offs = new Array(cols.length).fill(0);
    const subs = [];
    for (const it of numItems) {
      if (it.cx > lastX + span * 0.7) { subs.push(it.n); continue; }  // 마지막 홀 우측 = 소계/총계
      let best = -1, bd = Infinity;
      cols.forEach((c, ci) => { const d = Math.abs(it.cx - c.cx); if (d < bd) { bd = d; best = ci; } });
      if (best >= 0 && bd <= tol && holes[best] == null) { holes[best] = it.n; offs[best] = it.cx - cols[best].cx; }
      else subs.push(it.n);
    }
    return { holes, sub: subs.find(Number.isFinite), offs, span };  // 첫 소계(좌측) = 블록 소계
  };

  let parFront = [], parBack = [];
  const normalized = [];   // { name, relF[9], relB[9], subF, subB } (relF/relB에 null 가능=누락)

  if (parRows.length >= 2) {
    // 2블록 — PAR 행 2개(전·후반). 플레이어 숫자는 x좌표로 컬럼 정렬(누락 버디 칸=null).
    const colF = parCols(parRows[0]), colB = parCols(parRows[1]);
    parFront = colF.map(c => c.n);
    parBack = colB.map(c => c.n);
    const frontCy = parRows[0].cy, backCy = parRows[1].cy;
    const fps = players.filter(p => p.cy > frontCy && p.cy < backCy).sort((a, b) => a.cy - b.cy);
    const bps = players.filter(p => p.cy > backCy).sort((a, b) => a.cy - b.cy);
    const cnt = Math.max(fps.length, bps.length);
    for (let i = 0; i < cnt; i++) {
      const af = fps[i] ? alignRow(fps[i].numItems, colF) : { holes: [], sub: undefined, offs: [], span: 40 };
      const ab = bps[i] ? alignRow(bps[i].numItems, colB) : { holes: [], sub: undefined, offs: [], span: 40 };
      normalized.push({
        name: (fps[i] && fps[i].name) || (bps[i] && bps[i].name) || `${i + 1}번째 줄`,
        relF: af.holes, relB: ab.holes, subF: af.sub, subB: ab.sub,
        offF: af.offs, offB: ab.offs, spanF: af.span, spanB: ab.span,
      });
    }
  } else if (ph0.length >= 16) {
    // 1줄 18홀 — PAR 행 1개에 18홀(+OUT/IN/TOTAL), 플레이어도 한 행. par 컬럼 인덱스로 홀만 추출 (Bear Creek)
    const idx = parHoleIdx(parRows[0]);
    parFront = idx.slice(0, 9).map(i => parRows[0].nums[i]);
    parBack = idx.slice(9, 18).map(i => parRows[0].nums[i]);
    const outIdx = idx[8] + 1;     // 전반 마지막 홀 다음 = OUT 소계
    const inIdx = idx[17] + 1;     // 후반 마지막 홀 다음 = IN 소계
    players.forEach((p, k) => {
      normalized.push({
        name: p.name || `${k + 1}번째 줄`,
        relF: idx.slice(0, 9).map(i => p.nums[i]),
        relB: idx.slice(9, 18).map(i => p.nums[i]),
        subF: p.nums[outIdx], subB: p.nums[inIdx],
      });
    });
  } else {
    // 전반만(후반 PAR 없음) — 9홀만 (태블릿 전반 화면 등)
    parFront = ph0.slice(0, 9);
    const frontCy = parRows[0].cy;
    players.filter(p => p.cy > frontCy).sort((a, b) => a.cy - b.cy).forEach((p, k) => {
      normalized.push({ name: p.name || `${k + 1}번째 줄`, relF: p.nums.slice(0, 9), relB: [], subF: p.nums[9], subB: undefined });
    });
  }

  const pars18 = [...parFront, ...parBack];

  // 카드마다 홀 칸이 '파대비'(스마트스코어) 또는 '실제 타수'(서원힐스 등)로 다름.
  // 소계로 자동 판별: 홀합==소계 → 실제 타수 / 홀합+par합==소계 → 파대비.
  const decideMode = (vals, parArr, sub) => {
    const holeSum = vals.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
    const parSum = parArr.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
    if (Number.isFinite(sub) && parSum) {
      if (Math.abs(holeSum - sub) <= 2) return 'actual';
      if (Math.abs(holeSum + parSum - sub) <= 2) return 'relative';
    }
    return (parSum && holeSum >= parSum * 0.7) ? 'actual' : 'relative';  // 폴백: 값 크기
  };

  // 누락 셀 복원 — 블록 소계(sub)로 되살림. 나비 아이콘에 가린 버디가 주 원인.
  //  ① 누락 1칸: 정확값 복원(상대·실타수 모두).
  //  ② 상대모드 누락 여러 칸: 누락합이 정확히 -1×칸수면 전부 버디(-1)로 복원 — 한 라운드 버디 2개+면
  //     기존 '1칸만' 조건에 걸려 통째로 빈칸이 되던 문제 수정(2026-07-10 사용자 제보). 합이 안 맞으면 안 채움(오입력 방지).
  //  ⚠️홀아웃(안 친 홀) 보호: 미플레이 홀도 빈칸인데 소계는 친 홀만 합산돼 있음 → 복원값이 홀 점수로
  //    타당한 범위일 때만 채움(상대 -3~+9, 실타수 1~15). 벗어나면 빈칸 유지 → 사용자가 직접 입력.
  const recoverBlock = (rel, parArr, sub, mode) => {
    const r = rel.slice();
    if (!Number.isFinite(sub)) return r;
    const miss = r.map((v, i) => (Number.isFinite(v) ? -1 : i)).filter(i => i >= 0);
    if (!miss.length) return r;
    const known = r.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
    if (mode === 'relative') {
      const parSum = parArr.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
      const missSum = (sub - parSum) - known;
      if (miss.length === 1) {
        if (missSum >= -3 && missSum <= 9) r[miss[0]] = missSum;
        return r;
      }
      if (missSum === -miss.length) miss.forEach(i => { r[i] = -1; });
    } else if (mode === 'actual' && miss.length === 1) {
      const v = sub - known;
      if (v >= 1 && v <= 15) r[miss[0]] = v;
    }
    return r;
  };

  // ★마이너스 소실 복원 — 스마트스코어 버디(-1)의 '-'가 나비 아이콘에 가려 '1'로 읽히는 문제(2026-07-10 실카드 규명).
  //   상대모드 블록에서 읽은합이 인쇄 소계보다 정확히 2 크면 버디 하나가 +1로 뒤집힌 것.
  //   '-'는 숫자 왼쪽이라 소실되면 남은 '1'의 중심이 컬럼 중심보다 오른쪽으로 밀림(실측 +12px vs 정상 0~2px)
  //   → 가장 오른쪽으로 치우친 '1'을 -1로 복원. 치우침이 불분명하면 안 고침(오입력 방지, 소계 불일치 배너로 확인 유도).
  const fixLostMinus = (rel, offs, parArr, sub, mode, span) => {
    if (mode !== 'relative' || !Number.isFinite(sub) || !Array.isArray(offs)) return rel;
    if (rel.some(v => !Number.isFinite(v))) return rel;          // 누락 칸은 recoverBlock 몫
    const parSum = parArr.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
    const known = rel.reduce((s, v) => s + v, 0);
    if (!parSum || (parSum + known) - sub !== 2) return rel;
    const cands = rel.map((v, i) => (v === 1 ? { i, off: offs[i] || 0 } : null)).filter(Boolean)
      .sort((a, b) => b.off - a.off);
    const best = cands[0], second = cands[1];
    if (!best || best.off < (span || 40) * 0.08) return rel;                    // 치우침이 미미 → 확신 없음
    if (second && second.off > 0 && best.off < second.off * 2) return rel;      // 2위와 차이 불분명 → 확신 없음
    const r = rel.slice();
    r[best.i] = -1;
    return r;
  };

  const out = normalized.map(pl => {
    const modeF = decideMode(pl.relF, parFront, pl.subF);
    const modeB = pl.relB.length ? decideMode(pl.relB, parBack, pl.subB) : modeF;
    let relF = recoverBlock(pl.relF, parFront, pl.subF, modeF);
    let relB = recoverBlock(pl.relB, parBack, pl.subB, modeB);
    relF = fixLostMinus(relF, pl.offF, parFront, pl.subF, modeF, pl.spanF);
    relB = fixLostMinus(relB, pl.offB, parBack, pl.subB, modeB, pl.spanB);
    const holes = [];
    for (let h = 0; h < 18; h++) {
      const par = pars18[h];
      const front = h < 9;
      const val = front ? relF[h] : relB[h - 9];
      const mode = front ? modeF : modeB;
      if (!Number.isFinite(val)) { holes.push(null); continue; }
      holes.push(mode === 'actual' ? val : (Number.isFinite(par) ? par + val : null));
    }
    // 소계 불일치 — 복원 후에도 블록 합이 인쇄 소계와 다르면 오독 잔존(버디 위치 미확정 등) → 저신뢰 신호
    const blockSum = (rel, parArr, mode) => rel.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0)
      + (mode === 'relative' ? parArr.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0) : 0);
    const subMismatch =
      (Number.isFinite(pl.subF) && relF.length && relF.every(Number.isFinite) && blockSum(relF, parFront, modeF) !== pl.subF) ||
      (Number.isFinite(pl.subB) && relB.length && relB.every(Number.isFinite) && blockSum(relB, parBack, modeB) !== pl.subB);
    return { label: pl.name, holes, total: sumHoles(holes), subMismatch };
  });

  return { rows: out, pars: pars18.length === 18 ? pars18 : null };
}
