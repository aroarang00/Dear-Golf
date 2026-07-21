import { normalizeCourseName } from './top100';

// 구장 이름 매칭 — 같은 구장인데 부르는 이름이 제각각인 문제를 한 곳에서 처리한다.
// =============================================================
// ★기준은 하나여야 한다 — 골프장 유형어(CC·컨트리클럽·골프앤리조트…) 제거는 top100의
//   normalizeCourseName을 그대로 재사용한다. 100대 코스 매칭·방문 구장 카운팅이 이미 그 함수를 쓰므로,
//   여기서 따로 만들면 '어떤 화면에선 같은 구장, 어떤 화면에선 다른 구장'이 되어 카운팅까지 어긋난다.

export function courseKey(name) {
  return normalizeCourseName(name);
}

// 엄격 비교 — 유형어·공백·기호를 뺀 이름이 완전히 같을 때만 같은 구장.
//   길이 기반 '앞부분이 같으면 같은 구장' 규칙은 쓰지 않는다 —
//   '세인트포'/'세인트포레스트'처럼 다른 구장이 합쳐지는 사고가 난다(2026-07-22 검증에서 확인).
export function sameCourseName(a, b) {
  const x = normalizeCourseName(a);
  const y = normalizeCourseName(b);
  return !!x && x === y;
}

// 구장 DB에서 이 이름에 해당하는 구장을 찾는다.
//   ①정규화 이름이 같으면 그 구장.
//   ②이름 뒤에 지역명이 덧붙은 경우('힐마루골프앤리조트포천' vs DB '힐마루골프앤리조트') —
//     남는 꼬리가 그 구장 '주소'에 실제로 들어 있을 때만 같은 구장으로 인정한다.
//     문자열 길이로 추측하지 않고 데이터(주소)로 확인하므로, 이름만 비슷한 다른 구장이 합쳐지지 않는다.
//   못 찾으면 null — 호출부는 사용자가 본 이름을 그대로 둔다.
export function findCourseByName(list, name) {
  const want = normalizeCourseName(name);
  if (!want || !Array.isArray(list)) return null;
  const exact = list.find(c => normalizeCourseName(c?.name) === want);
  if (exact) return exact;
  return list.find(c => {
    const got = normalizeCourseName(c?.name);
    if (!got || got.length < 2 || !want.startsWith(got)) return false;
    const tail = want.slice(got.length);            // 예: '포천'
    if (!tail || tail.length > 5) return false;
    const loc = String(c?.loc || '').replace(/\s+/g, '');
    return !!loc && loc.includes(tail);             // 주소에 그 지역명이 있어야 인정
  }) || null;
}
