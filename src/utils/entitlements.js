// 사용자 등급별 한도(entitlement) — "결제로 풀 수 있는 값"의 단일 소스.
//   users/{uid}.entitlements 는 결제 검증한 Cloud Function(admin)만 상향한다. 클라 변경은 firestore.rules가 차단
//   (sanctionFieldsUnchanged에 entitlements 포함). 필드가 없으면 아래 기본값 적용 → 유료화 = 이 값만 올리면 풀림.
//   ★멤버 정원(20)은 크루 문서의 memberCap 필드로 관리(생성 시 20 고정, CF만 상향) — 여기 maxCrews는 '생성 개수' 한도.
export const DEFAULT_ENTITLEMENTS = {
  maxCrews: 5,          // 내가 만들 수 있는 크루 수(참여·초대받은 크루는 무제한)
  crewMemberCap: 20,    // 새로 만드는 크루의 기본 멤버 정원(참고값 — 실제 강제는 크루 memberCap)
  // 개인 다이어리 미디어 총량([[monetization-plan]] 2026-07-04 확정) — 초대 보상 CF(functions/referral.js)가
  //   초대 1건당 +20/+1 양방향 상향, 최대 500/30 클램프. 필드명·기본값을 CF와 동기 유지할 것.
  //   ★총량 강제·쿼터 UI는 첫 업데이트(업로드 누적 카운터와 함께) — 지금은 지급만 쌓임.
  maxPhotos: 200,       // 다이어리 사진 총량
  maxVideos: 10,        // 다이어리 영상 총량
};

// 내가 만들 수 있는 크루 수 한도 — profile.entitlements.maxCrews > 없으면 기본 5.
export function maxCrewsOf(profile) {
  const v = profile?.entitlements?.maxCrews;
  return Number.isFinite(v) ? v : DEFAULT_ENTITLEMENTS.maxCrews;
}
