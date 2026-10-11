// 결산 — 월·연 단위로 내 라운딩 기록을 요약한다(순수 함수, Firestore 비의존). ([[record-share-redesign]] 2026-10-10)
//   건별 카드 공유가 '아무도 안 쓰는' 이유 = 라운딩 직후 단톡방에 이미 올리고, 평범한 날은 자랑할 게 없다.
//   결산은 때(월초·연말)가 정해져 있고 숫자 자체가 서사라 공유 동기가 있다. 재료는 기록에 다 있다
//   (날짜·구장·스코어·18홀·버디·사진·동반자·해외). 화면 간 숫자 불일치를 막기 위해 집계는 여기 한 곳에서만.
import { roundsOnly } from './diaryKind';
import { courseKey } from './courseNameKey';

// 'YYYY.MM.DD' → {y, m} (파싱 실패 null). 날짜는 사전순 비교가 곧 시간순.
function ym(date) {
  const p = String(date || '').split('.').map(n => parseInt(n, 10));
  if (p.length < 2 || isNaN(p[0]) || isNaN(p[1])) return null;
  return { y: p[0], m: p[1] };
}
const inPeriod = (d, year, month) => {
  const k = ym(d.date);
  return !!k && k.y === year && (month == null || k.m === month);
};
const avgOf = (rounds) => {
  const s = rounds.filter(r => typeof r.score === 'number' && r.score > 0).map(r => r.score);
  return s.length ? Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 10) / 10 : null;
};
// 홀별 점수에서 버디(−1) 수 — birdieCount가 0인 옛 기록 폴백
function birdiesFromHoles(r) {
  if (!Array.isArray(r.holeScores) || !Array.isArray(r.holePars) || r.holeScores.length !== 18 || r.holePars.length !== 18) return 0;
  let n = 0;
  for (let i = 0; i < 18; i++) {
    const s = r.holeScores[i], p = r.holePars[i];
    if (typeof s === 'number' && typeof p === 'number' && s - p === -1) n++;
  }
  return n;
}
const photoUriOf = (p) => (typeof p === 'object' ? p?.uri : p) || null;

// 결산 한 건 — month(1~12) 없으면 연 결산.
export function buildRecap(diaries, { year, month = null }) {
  const all = roundsOnly(diaries).filter(d => ym(d.date));
  const rounds = all.filter(d => inPeriod(d, year, month))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const count = rounds.length;
  const avg = avgOf(rounds);
  const scored = rounds.filter(r => typeof r.score === 'number' && r.score > 0);
  const bestRound = scored.length ? scored.reduce((b, r) => (r.score < b.score ? r : b), scored[0]) : null;
  const best = bestRound ? { score: bestRound.score, course: bestRound.course || '', date: bestRound.date } : null;

  // 직전 기간 평균 — 월이면 지난달(기록 있는 달이 아니라 '달력상 지난달'), 연이면 지난해
  let prevAvg = null;
  if (month != null) {
    const py = month === 1 ? year - 1 : year, pm = month === 1 ? 12 : month - 1;
    prevAvg = avgOf(all.filter(d => inPeriod(d, py, pm)));
  } else {
    prevAvg = avgOf(all.filter(d => inPeriod(d, year - 1, null)));
  }

  // 구장 — 기간 내 distinct / 그중 '처음 밟은' 구장(전체 기록에서 첫 방문일이 기간 안)
  const firstVisit = new Map();   // courseKey → 첫 날짜
  all.forEach(d => {
    const k = courseKey(d.course); if (!k) return;
    const cur = firstVisit.get(k);
    if (!cur || d.date < cur) firstVisit.set(k, d.date);
  });
  const keys = new Set(rounds.map(d => courseKey(d.course)).filter(Boolean));
  const courseCount = keys.size;
  const newCourses = [...keys].filter(k => { const f = firstVisit.get(k); return f && rounds.some(r => courseKey(r.course) === k && r.date === f); }).length;

  // 동반자 — 이름 기준 집계(나 제외), 많이 함께한 순
  const compCount = new Map();
  rounds.forEach(r => (r.companions || []).forEach(c => {
    if (typeof c === 'object' && c?.isMe) return;
    const name = (typeof c === 'string' ? c : c?.name || '').trim();
    if (!name) return;
    compCount.set(name, (compCount.get(name) || 0) + 1);
  }));
  const topCompanions = [...compCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, n]) => ({ name, count: n }));

  const birdies = rounds.reduce((s, r) => s + ((typeof r.birdieCount === 'number' && r.birdieCount > 0) ? r.birdieCount : birdiesFromHoles(r)), 0);
  // 특별한 순간 — 횟수만으론 '1번'이 뭔지 모른다(사용자 2026-10-11) → 종류별 집계도 함께. 값은 'HOLE IN ONE'/'EAGLE'/'ALBATROSS'
  const specialRounds = rounds.filter(r => r.special && r.special !== '없음');
  const specials = specialRounds.length;
  const specialCounts = new Map();
  specialRounds.forEach(r => specialCounts.set(r.special, (specialCounts.get(r.special) || 0) + 1));
  const SPECIAL_KO = { 'HOLE IN ONE': '홀인원', 'EAGLE': '이글', 'ALBATROSS': '알바트로스' };
  const specialLabel = [...specialCounts.entries()].map(([k, n]) => `${SPECIAL_KO[k] || k}${n > 1 ? ` ${n}` : ''}`).join(' · ');
  const overseas = rounds.filter(r => r.overseas).length;
  // 사진 — 최신순 최대 3장(기록당 대표 1장)
  const photos = [...rounds].reverse().map(r => photoUriOf((r.photos || [])[0])).filter(Boolean).slice(0, 3);

  // 연 결산 — 월별 라운딩 수 12칸 + 가장 많이 친 달
  let monthly = null, peakMonth = null;
  if (month == null) {
    monthly = Array(12).fill(0);
    rounds.forEach(r => { const k = ym(r.date); if (k) monthly[k.m - 1]++; });
    const mx = Math.max(...monthly);
    peakMonth = mx > 0 ? monthly.indexOf(mx) + 1 : null;
  }

  return { year, month, count, avg, best, prevAvg, courseCount, newCourses, topCompanions, birdies, specials, specialLabel, overseas, photos, monthly, peakMonth, rounds };
}

// 기록이 있는 기간 목록 — 월(최신순)·연(최신순). 모달 ‹ › 이동과 '결산 보기' 입구가 같은 목록을 쓴다.
export function listRecapPeriods(diaries) {
  const months = new Set(), years = new Set();
  roundsOnly(diaries).forEach(d => { const k = ym(d.date); if (!k) return; months.add(k.y * 100 + k.m); years.add(k.y); });
  return {
    months: [...months].sort((a, b) => b - a).map(v => ({ year: Math.floor(v / 100), month: v % 100 })),
    years: [...years].sort((a, b) => b - a).map(year => ({ year })),
  };
}

// 지금 '때'에 맞는 결산 기간 — 10~12월 = 올해 시즌 결산, 1월 = 지난해 시즌 결산(국내 시즌이 3~11월이라 10월부터 '한 해' 숫자를 보여준다 — 사용자 2026-10-11).
//   그 외 달 = 바로 지난달 결산. 지난달 기록이 없으면 몇 달 전 결산을 끌어오지 않고 null(5월에 '2월 결산'은 때가 아니다).
function timelyRecap(diaries, now) {
  const { months, years } = listRecapPeriods(diaries);
  const y = now.getFullYear(), m = now.getMonth() + 1;
  if (m >= 10 && years.some(p => p.year === y)) return { year: y, month: null };
  if (m === 1 && years.some(p => p.year === y - 1)) return { year: y - 1, month: null };
  const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;   // 바로 지난달
  return months.some(p => p.year === py && p.month === pm) ? { year: py, month: pm } : null;
}

// 홈 결산 띠에 보여줄 기간 — 매월 1~10일에만(월초 알림 역할, 사용자 2026-10-11). 11일부터는 null.
//   기록 탭 띠는 상시(defaultRecap) — 아이콘 버튼만 두니 사용자도 못 찾아 글자 있는 띠로 되돌림(같은 날).
export function suggestRecap(diaries, now = new Date()) {
  return now.getDate() > 10 ? null : timelyRecap(diaries, now);
}

// 기록 탭 상시 띠가 보여줄 기간 — 홈 띠 규칙에서 날짜 창만 뺀 것. 때에 맞는 게 없으면 기록 있는 가장 최근 '지난' 달
//   (이번 달은 진행 중이라 뒤로), 지난 달이 하나도 없으면 이번 달, 그것도 없으면 최근 해. 기록이 하나도 없으면 null(버튼이 무시).
export function defaultRecap(diaries, now = new Date()) {
  const t = timelyRecap(diaries, now);
  if (t) return t;
  const { months, years } = listRecapPeriods(diaries);
  const cur = now.getFullYear() * 100 + now.getMonth() + 1;
  const past = months.find(p => p.year * 100 + p.month < cur) || months[0];
  if (past) return { year: past.year, month: past.month };
  return years[0] ? { year: years[0].year, month: null } : null;
}

export const recapTitle = ({ year, month }) => (month == null ? `${year}년 결산` : `${year}년 ${month}월 결산`);
