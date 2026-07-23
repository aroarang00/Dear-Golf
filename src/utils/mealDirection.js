// 함께 식사 — 목적지(집/직장) 방향 뱃지.
//   라운딩 후 목적지로 '가는 길목'인지 좌표로 판별(무료·직선 근사). 집/직장이 서울이면 '서울 방향'.
//   ★정밀 주행거리·시간은 TMap(Phase 4 예정). 지금은 haversine corridor 근사 — 방향감만 주면 충분.
//   좌표 규약: x=경도(lng), y=위도(lat) (카카오와 동일).

const R_KM = 6371;
const toRad = (d) => (d * Math.PI) / 180;

export function haversineKm(a, b) {
  if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) return null;
  const dLat = toRad(b.y - a.y), dLon = toRad(b.x - a.x);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.y)) * Math.cos(toRad(b.y)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

// 주소 문자열 → 짧은 지역명(서울/경기/강원…). 저장된 출발지(집·회사) 주소에서 방향 라벨 추출.
const REGION_RULES = [
  [/서울/, '서울'], [/경기/, '경기'], [/인천/, '인천'], [/강원/, '강원'],
  [/충청북|충북/, '충북'], [/충청남|충남/, '충남'], [/대전/, '대전'], [/세종/, '세종'],
  [/전라북|전북/, '전북'], [/전라남|전남/, '전남'], [/광주/, '광주'],
  [/경상북|경북/, '경북'], [/경상남|경남/, '경남'], [/대구/, '대구'], [/울산/, '울산'], [/부산/, '부산'], [/제주/, '제주'],
];
export function regionLabel(addr) {
  if (!addr) return '';
  for (const [re, name] of REGION_RULES) if (re.test(addr)) return name;
  return '';
}

// 식당이 구장→목적지 동선의 '길목'인지 분류.
//   detour = (구장→식당) + (식당→목적지) − (구장→목적지). 작을수록 길목.
//   away = 식당이 목적지에서 구장보다 더 멀다 → 반대(역)방향.
//   반환: { detourKm, onWay, away } | null
// 구장에서 이 거리 이내면 방향과 무관하게 '근처'로 취급 — 구장 밑에 붙은 식당은 집 기준 살짝 반대편이어도
//   실제론 코앞이라 '반대 방향'이 오해를 준다(사용자 2026-07-23, 힐마루 구장 밑 식당 클러스터). 작은 백트랙은 반대방향 아님.
const NEAR_COURSE_KM = 3;

export function classifyToDestination(courseCenter, dest, place) {
  const c2d = haversineKm(courseCenter, dest);
  const c2p = haversineKm(courseCenter, place);
  const p2d = haversineKm(place, dest);
  if (c2d == null || c2p == null || p2d == null) return null;
  const detour = Math.max(0, (c2p + p2d) - c2d);
  const away = p2d > c2d + 1.5;              // 목적지에서 더 멀어지면 역방향
  const nearCourse = c2p <= NEAR_COURSE_KM;  // 구장 코앞 — 방향보다 거리 우선
  const onWay = detour <= 3 && !away;         // 우회 3km 이내면 '길목'
  return { detourKm: detour, courseKm: c2p, onWay, away, nearCourse };
}

// 뱃지 — { text, tone('good'|'mild'|'bad') } | null.
//   destLabel = 방향 기준('집'/'그외 장소') — 앱이 목적지를 '추정'(집 우선)하는 것이므로 '경기 방향'처럼 단정하지 않고
//   '집 방향 · 길목'으로 기준을 드러낸다(사용자 2026-07-23: 집·회사가 반대인데 지역명만 뜨면 어느 기준인지 모름).
export function destinationBadge(courseCenter, dest, destLabel, place) {
  if (!courseCenter || !Number.isFinite(place?.x) || !Number.isFinite(place?.y)) return null;
  const fmt = (v) => (v < 10 ? v.toFixed(1) : String(Math.round(v)));
  // 목적지(집/회사) 미설정 — 방향 판정은 불가하나 '구장에서 직선거리'는 줄 수 있다(어디가 더 가까운지 정렬 감각).
  //   대부분 유저가 집주소를 안 넣어 뱃지가 통째로 사라지던 것 보완(사용자 2026-07-23).
  if (!dest || !Number.isFinite(dest?.x) || !Number.isFinite(dest?.y)) {
    const c2p = haversineKm(courseCenter, place);
    return c2p == null ? null : { text: `구장 ${fmt(c2p)}km`, tone: 'mild' };
  }
  const r = classifyToDestination(courseCenter, dest, place);
  if (!r) return null;
  const dir = destLabel ? `${destLabel} 방향` : '목적지 방향';
  if (r.onWay) return { text: `${dir} · 길목`, tone: 'good' };
  // 구장 코앞(±3km)은 방향과 무관하게 '근처 · 실거리'로 — 반대 방향 오인 방지(힐마루, 사용자 2026-07-23)
  if (r.nearCourse) return { text: `구장 근처 · ${fmt(r.courseKm)}km`, tone: 'mild' };
  if (r.away) return { text: `반대 방향 · +${fmt(r.detourKm)}km`, tone: 'bad' };
  return { text: `${dir} · 우회 +${fmt(r.detourKm)}km`, tone: 'mild' };
}
