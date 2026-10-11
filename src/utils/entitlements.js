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

// 초대 보상 숫자(UI 문구용) — functions/referral.js BONUS_*/CAP_*와 동기 유지. 문구 세 곳(설정 저장공간·초대 메시지)이 여기만 본다.
export const REFERRAL_BONUS = { photos: 20, videos: 1 };
export const REFERRAL_CAP = { photos: 500, videos: 30 };

// 다이어리 미디어 한도 — profile.entitlements.maxPhotos/maxVideos > 없으면 기본 200/10. 초대 보상(CF)이 올린 값이 그대로 보인다.
export function mediaQuotaOf(profile) {
  const e = profile?.entitlements || {};
  return {
    maxPhotos: Number.isFinite(e.maxPhotos) ? e.maxPhotos : DEFAULT_ENTITLEMENTS.maxPhotos,
    maxVideos: Number.isFinite(e.maxVideos) ? e.maxVideos : DEFAULT_ENTITLEMENTS.maxVideos,
  };
}

// 내 다이어리 미디어 사용량 — photos 배열 안에 사진(문자열 또는 {uri}), 영상({type:'video'})이 섞여 있다.
//   라운딩·일상(moment) 모두 센다(한도는 '다이어리 총량'). 서버 카운터 없이 클라 합산 — 앱이 내 기록을 전부 들고 있어 충분.
//   ★지금은 표시만([[monetization-plan]] 1단계). 차단은 크레딧 팩과 함께 다음 빌드에서.
export function countDiaryMedia(diaries) {
  let photos = 0, videos = 0;
  (diaries || []).forEach((d) => {
    (Array.isArray(d?.photos) ? d.photos : []).forEach((it) => {
      if (!it) return;
      if (typeof it === 'object' && it.type === 'video') videos++; else photos++;
    });
  });
  return { photos, videos };
}

