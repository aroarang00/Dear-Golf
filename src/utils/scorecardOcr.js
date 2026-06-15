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
  try {
    // HEIC 대응 + 원본 해상도 유지 jpg base64 (리사이즈 X — 작은 홀 숫자 보존)
    const img = await ImageManipulator.manipulateAsync(uri, [], {
      compress: 1, format: ImageManipulator.SaveFormat.JPEG, base64: true,
    });
    // Cloud Functions 프록시 호출 — CLOVA Secret/URL은 CF Secret에만(앱 노출 0). 서울 리전.
    const callable = httpsCallable(functions, 'recognizeScorecard');
    const res = await callable({ imageBase64: img.base64, format: 'jpg' });
    const fields = res?.data?.fields || [];   // [{ text, confidence, vertices }]
    const toks = tokenize(fields);
    const { rows, pars } = parseTokens(toks);
    // PAR 행을 못 찾으면(요약 카드 등) 홀별 타수를 만들 수 없음 → 부드러운 안내
    if (!rows.length) {
      return {
        rows: [], pars: null,
        error: 'PAR(파)가 보이는 표 형태 스코어카드를 올려주세요.\n풍경 배경의 요약 카드는 PAR가 없어 홀별 인식이 어려워요.',
      };
    }
    return { rows, pars };
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
  const alignRow = (numItems, cols) => {
    if (!cols.length) return { holes: [], sub: undefined };
    const span = cols.length >= 2 ? (cols[cols.length - 1].cx - cols[0].cx) / (cols.length - 1) : 40;
    const tol = span * 0.55, lastX = cols[cols.length - 1].cx;
    const holes = new Array(cols.length).fill(null);
    const subs = [];
    for (const it of numItems) {
      if (it.cx > lastX + span * 0.7) { subs.push(it.n); continue; }  // 마지막 홀 우측 = 소계/총계
      let best = -1, bd = Infinity;
      cols.forEach((c, ci) => { const d = Math.abs(it.cx - c.cx); if (d < bd) { bd = d; best = ci; } });
      if (best >= 0 && bd <= tol && holes[best] == null) holes[best] = it.n; else subs.push(it.n);
    }
    return { holes, sub: subs.find(Number.isFinite) };  // 첫 소계(좌측) = 블록 소계
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
      const af = fps[i] ? alignRow(fps[i].numItems, colF) : { holes: [], sub: undefined };
      const ab = bps[i] ? alignRow(bps[i].numItems, colB) : { holes: [], sub: undefined };
      normalized.push({
        name: (fps[i] && fps[i].name) || (bps[i] && bps[i].name) || `${i + 1}번째 줄`,
        relF: af.holes, relB: ab.holes, subF: af.sub, subB: ab.sub,
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

  // 상대모드 블록에 누락 셀이 정확히 1개면 (소계−par합−읽은합)으로 복원 — 나비에 가린 버디 등 되살림.
  const recoverBlock = (rel, parArr, sub, mode) => {
    const r = rel.slice();
    if (mode !== 'relative' || !Number.isFinite(sub)) return r;
    const miss = r.map((v, i) => (Number.isFinite(v) ? -1 : i)).filter(i => i >= 0);
    if (miss.length !== 1) return r;
    const parSum = parArr.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
    const known = r.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
    r[miss[0]] = (sub - parSum) - known;
    return r;
  };
  const out = normalized.map(pl => {
    const modeF = decideMode(pl.relF, parFront, pl.subF);
    const modeB = pl.relB.length ? decideMode(pl.relB, parBack, pl.subB) : modeF;
    const relF = recoverBlock(pl.relF, parFront, pl.subF, modeF);
    const relB = recoverBlock(pl.relB, parBack, pl.subB, modeB);
    const holes = [];
    for (let h = 0; h < 18; h++) {
      const par = pars18[h];
      const front = h < 9;
      const val = front ? relF[h] : relB[h - 9];
      const mode = front ? modeF : modeB;
      if (!Number.isFinite(val)) { holes.push(null); continue; }
      holes.push(mode === 'actual' ? val : (Number.isFinite(par) ? par + val : null));
    }
    return { label: pl.name, holes, total: sumHoles(holes) };
  });

  return { rows: out, pars: pars18.length === 18 ? pars18 : null };
}
