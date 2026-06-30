import { getDrivingDirectionsTmap, getDrivingDirectionsTmapPrediction } from './tmap';
import { getDrivingDirectionsKakao, getDrivingDirectionsKakaoFuture } from './kakao';

// =============================================================
// 자동차 길찾기 소요시간 — 단일 진입점.
//   TMap 우선(소요시간 정확도) → 실패 시 카카오 폴백(안정성). 둘 다 실패면 null
//   (호출처는 null이면 기본 가정치 80분으로 폴백 — WeatherTransportPopup)
//   origin/destination: { x: 경도, y: 위도 }
//   반환: { durationMin, distanceM, provider: 'tmap' | 'kakao' } | null
// =============================================================
//   opts.arrivalAt(Date) = 도착 목표 시각(티오프/만남). 주면 '그 시각 도착' 기준 미래 교통으로 예측
//     (새벽 라운드를 낮에 조회해도 새벽 교통 반영) → 실패 시 현재 기준으로 폴백. 없으면 기존처럼 지금 출발 기준.
export async function getDrivingDirections(origin, destination, { arrivalAt } = {}) {
  if (arrivalAt instanceof Date) {
    // TMap 타임머신(도착 기준) 우선 — 도착 시각 직접 지정이라 가장 정확
    const tp = await getDrivingDirectionsTmapPrediction(origin, destination, arrivalAt);
    if (tp) return { ...tp, provider: 'tmap-arrival' };
    // 카카오 미래(출발 기준) — 현재 소요로 출발시각 1차 역산 후 그 시간대로 조회
    const rough = await getDrivingDirectionsKakao(origin, destination);
    const departureAt = new Date(arrivalAt.getTime() - (rough?.durationMin || 80) * 60000);
    const kf = await getDrivingDirectionsKakaoFuture(origin, destination, departureAt);
    if (kf) return { ...kf, provider: 'kakao-future' };
    if (rough) return { ...rough, provider: 'kakao-now' }; // 미래 둘 다 실패 → 현재 카카오로
  }
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
