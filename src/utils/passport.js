// =============================================================
// 골프 여권 — 내가 밟은 구장을 '도장'으로 모은다 (2026-09-29, [[golf-passport]])
//
//  왜: 앱이 쓸모는 있는데 갖고 싶지 않다(사장님 2026-09-29). 골프는 자랑의 운동인데 꺼내 보여줄 화면이 없었다.
//  도장이 찍히는 기준(사장님 결정):
//   ① 라운딩 기록(diaries, kind!=='moment')  — 날짜·스코어까지
//   ② 지난 일정(schedules, date < 오늘)         — 기록 안 써도 "갔다"로 친다(귀찮음 우회)
//   ③ 직접 체크(visitedChecks)                  — 예전에 간 구장 소급. 100대 구장은 기존 top100Checks 재사용
//  구장 키 = 코스 탭 visitedStats와 같은 규칙(마스터 DB에서 찾으면 id:kakaoId, 못 찾으면 이름 정규화).
//  ★이 파일은 계산만 한다 — 화면은 GolfPassportScreen, 도장 그림은 PassportStamp.
// =============================================================
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, getUid } from './firebase';
import { STORAGE_KEYS, storage } from './storage';
import { courseKey, findCourseByName } from './courseNameKey';
import { isRoundDiary } from './diaryKind';
import { top100RankOf } from './top100';

// 지역 구분 — CourseExploreTab의 getRegion과 같은 표. 못 나누면 '기타'(여권에선 빈 칸 대신 묶어서 보여준다).
export const PASSPORT_REGIONS = ['수도권', '강원', '충청', '경상', '전라', '제주', '기타'];
export function regionOf(loc) {
  if (!loc) return '기타';
  const first = String(loc).split(' ')[0];
  if (['서울', '서울특별시', '인천', '인천광역시', '경기', '경기도'].includes(first)) return '수도권';
  if (['충북', '충청북도', '충남', '충청남도', '대전', '대전광역시', '세종', '세종특별자치시'].includes(first)) return '충청';
  if (['강원', '강원도', '강원특별자치도'].includes(first)) return '강원';
  if (['경북', '경상북도', '경남', '경상남도', '대구', '대구광역시', '부산', '부산광역시', '울산', '울산광역시'].includes(first)) return '경상';
  if (['전북', '전북특별자치도', '전라북도', '전남', '전라남도', '광주', '광주광역시'].includes(first)) return '전라';
  if (['제주', '제주특별자치도', '제주도'].includes(first)) return '제주';
  return '기타';
}

// 지역별 잉크색 — 도장마다 색이 달라야 '여권' 느낌이 난다. 브랜드 팔레트(남색·버건디·골드) + 지역색 3개.
export const REGION_INK = {
  수도권: '#1A3D52',   // 남색
  강원:   '#2F6B4F',   // 산 초록
  충청:   '#8B6914',   // 골드
  경상:   '#6B1E2A',   // 버건디
  전라:   '#5A4A8A',   // 보라
  제주:   '#B85C2E',   // 화산 주황
  기타:   '#5F5A54',   // 웜 차콜
};

const pad = (n) => String(n).padStart(2, '0');
export const ymdToday = () => { const d = new Date(); return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`; };

// 구장 이름 → 여권 키 + 마스터 항목. 이름 표기가 제각각이라 마스터에서 찾아 kakaoId로 묶는다(코스 탭과 동일).
export function stampKeyOf(master, name) {
  if (!name) return { key: '', course: null };
  const c = master && master.length ? findCourseByName(master, name) : null;
  return { key: c?.kakaoId ? `id:${c.kakaoId}` : courseKey(name), course: c };
}
export const masterKeyOf = (c) => (c?.kakaoId ? `id:${c.kakaoId}` : courseKey(c?.name || ''));

// ── 여권 조립 ──────────────────────────────────────────────────────────────
//  stamps: 다녀온 구장별 { key, name, region, loc, kakaoId, x, y, firstDate, lastDate, count, best, manual }
//  top100Rows: 100대 구장 순위 그대로 100줄 [{ rank, name, region, visited, stamp, manual }]
//  regionGroups: 지역별 [{ region, ink, stamps(최근 방문순), total(그 지역 마스터 구장 수) }]
export function buildPassport({ master = [], top100 = [], diaries = [], schedules = [], manualKeys = [], top100Checks = [], today = ymdToday() }) {
  const stamps = new Map();
  const seenVisit = new Set();   // key|date — 기록과 일정이 같은 날 같은 구장이면 한 번만 센다
  const keyCache = new Map();
  const resolve = (name) => {
    if (!name) return null;
    if (keyCache.has(name)) return keyCache.get(name);
    const r = stampKeyOf(master, name);
    keyCache.set(name, r);
    return r;
  };
  const touch = (name, date, score, manual) => {
    const r = resolve(name);
    if (!r || !r.key) return;
    const displayName = r.course?.name || String(name).trim();
    let s = stamps.get(r.key);
    if (!s) {
      s = { key: r.key, name: displayName, region: regionOf(r.course?.loc), loc: r.course?.loc || '', kakaoId: r.course?.kakaoId || null,
        x: r.course?.x ?? null, y: r.course?.y ?? null, firstDate: null, lastDate: null, count: 0, best: null, manual: false };
      stamps.set(r.key, s);
    }
    if (manual) { s.manual = true; return; }
    const visitKey = `${r.key}|${date || ''}`;
    if (!seenVisit.has(visitKey)) { seenVisit.add(visitKey); s.count += 1; }
    if (date) {
      if (!s.firstDate || date < s.firstDate) s.firstDate = date;
      if (!s.lastDate || date > s.lastDate) s.lastDate = date;
    }
    if (typeof score === 'number' && score > 0 && (s.best == null || score < s.best)) s.best = score;
  };

  // ① 라운딩 기록
  (diaries || []).filter(isRoundDiary).forEach(d => touch(d.course, d.date || null, d.score, false));
  // ② 지난 일정 — 취소된 건 제외. 오늘 일정은 아직 안 갔을 수 있어 '어제까지'만.
  (schedules || []).forEach(s => {
    if (!s || !s.course || !s.date) return;
    if (s.cancelled || s.status === 'cancelled') return;
    if (String(s.date) >= today) return;
    touch(s.course, String(s.date), null, false);
  });
  // ③ 직접 체크 — 키가 마스터 항목이면 이름을 복원해 도장을 만든다
  const masterByKey = new Map((master || []).map(c => [masterKeyOf(c), c]));
  (manualKeys || []).forEach(k => {
    if (!k) return;
    if (stamps.has(k)) { stamps.get(k).manual = true; return; }
    const c = masterByKey.get(k);
    if (c) touch(c.name, null, null, true);
  });

  // 100대 구장 — 도장 이름으로 순위 매칭(큐레이션 규칙 포함) + 수동 체크(rank) 합집합
  const stampList = [...stamps.values()];
  const rankToStamp = new Map();
  stampList.forEach(s => { const r = top100RankOf(top100, s.name); if (r != null && !rankToStamp.has(r)) rankToStamp.set(r, s); });
  const checks = new Set((top100Checks || []).map(Number));
  const top100Rows = (top100 || []).map(c => {
    const stamp = rankToStamp.get(c.rank) || null;
    const manual = checks.has(c.rank);
    return { rank: c.rank, name: c.name, region: c.region || '', visited: !!stamp || manual, stamp, manual };
  });
  const top100Count = top100Rows.filter(r => r.visited).length;

  // 지역별 묶음 — 최근 방문순(직접 체크만 있는 건 맨 뒤). 지역 총수는 마스터 기준.
  const totals = {};
  (master || []).forEach(c => { const r = regionOf(c.loc); totals[r] = (totals[r] || 0) + 1; });
  const byRegion = {};
  stampList.forEach(s => { (byRegion[s.region] = byRegion[s.region] || []).push(s); });
  const regionGroups = PASSPORT_REGIONS
    .filter(r => (byRegion[r] || []).length || (totals[r] || 0))
    .map(r => ({
      region: r, ink: REGION_INK[r],
      stamps: (byRegion[r] || []).slice().sort((a, b) => String(b.lastDate || '') .localeCompare(String(a.lastDate || ''))),
      total: totals[r] || 0,
    }));

  const recent = stampList.filter(s => s.lastDate).sort((a, b) => b.lastDate.localeCompare(a.lastDate)).slice(0, 3);
  return { stamps, stampList, stampCount: stampList.length, top100Rows, top100Count, regionGroups, recent };
}

// ── 직접 체크 저장 — top100Checks와 같은 패턴(로컬 + users/{uid}.visitedChecks 백업, 재설치 복원) ──
export async function getVisitedChecks() {
  const list = await storage.load(STORAGE_KEYS.visitedChecks, []);
  return Array.isArray(list) ? list : [];
}
export async function saveVisitedChecks(keys) {
  const next = [...new Set((Array.isArray(keys) ? keys : []).filter(Boolean))];
  await storage.save(STORAGE_KEYS.visitedChecks, next);
  pushVisitedChecks(next);
  return next;
}
async function pushVisitedChecks(keys) {
  try {
    const uid = await getUid();
    if (!uid) return;
    await setDoc(doc(db, 'users', uid), { uid, visitedChecks: keys, updatedAt: serverTimestamp() }, { merge: true });
  } catch (e) { if (__DEV__) console.warn('[passport] visitedChecks push 실패', e?.message); }
}
export async function syncVisitedChecksFromFirestore() {
  try {
    const uid = await getUid();
    if (!uid) return await getVisitedChecks();
    const snap = await getDoc(doc(db, 'users', uid));
    const remote = snap.exists() && Array.isArray(snap.data().visitedChecks) ? snap.data().visitedChecks : [];
    const local = await getVisitedChecks();
    const merged = [...new Set([...remote, ...local])];
    await storage.save(STORAGE_KEYS.visitedChecks, merged);
    if (merged.length !== remote.length) pushVisitedChecks(merged);
    return merged;
  } catch (e) {
    if (__DEV__) console.warn('[passport] visitedChecks sync 실패', e?.message);
    return await getVisitedChecks();
  }
}
