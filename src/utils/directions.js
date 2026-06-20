import { getDrivingDirectionsTmap } from './tmap';
import { getDrivingDirectionsKakao } from './kakao';

// =============================================================
// 자동차 길찾기 소요시간 — 단일 진입점.
//   TMap 우선(소요시간 정확도) → 실패 시 카카오 폴백(안정성). 둘 다 실패면 null
//   (호출처는 null이면 기본 가정치 80분으로 폴백 — WeatherTransportPopup)
//   origin/destination: { x: 경도, y: 위도 }
//   반환: { durationMin, distanceM, provider: 'tmap' | 'kakao' } | null
// =============================================================
export async function getDrivingDirections(origin, destination) {
  const t = await getDrivingDirectionsTmap(origin, destination);
  if (t) return { ...t, provider: 'tmap' };
  const k = await getDrivingDirectionsKakao(origin, destination);
  if (k) return { ...k, provider: 'kakao' };
  return null;
}

// 소요(분)를 '시간 분'으로 — 60분 이상이면 'H시간 M분'(정각이면 'H시간'), 미만이면 'M분'.
//   홈 D-0 카드·교통 팝업 공용(표시 통일).
export function formatDriveMin(m) {
  if (!(m > 0)) return '';
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60), mm = m % 60;
  return mm ? `${h}시간 ${mm}분` : `${h}시간`;
}
