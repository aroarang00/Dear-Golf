import { resolvePhotoUri } from './photoStorage';

// 사진 실제 비율(가로/세로) 세션 캐시 + 피드 카드 '틀' 결정.
// =============================================================
// 왜 필요한가 — 피드 사진칸이 4:3 하나로 고정돼 있어서 3:4 세로 사진은 세로의 56%만 보였다.
//   위·아래 중 어디를 버릴지 고르는 문제라 초점을 어떻게 잡아도 절반은 잃는다(사람이 아래 있으면 하늘만 남음).
//   인스타처럼 '정해진 몇 가지 틀 중 사진에 맞는 것'을 고르면 세로 사진이 94%까지 살아난다.
//   자유 비율이 아니라 3단계로만 스냅해 카드 높이가 제각각으로 흐트러지지 않게 한다(사용자 2026-07-22).
//
// 비율 표기는 RN aspectRatio와 같은 '가로/세로'. 4:3=1.333, 1:1=1, 4:5=0.8.

const _cache = new Map();   // 해석된 uri → 가로/세로

export function setPhotoRatio(uri, ratio) {
  if (!uri || !ratio || !Number.isFinite(ratio)) return;
  const u = resolvePhotoUri(uri);
  if (u) _cache.set(u, ratio);
}

export function getPhotoRatio(uri) {
  if (!uri) return null;
  const u = resolvePhotoUri(uri);
  return (u && _cache.get(u)) || null;
}

// 피드 카드 틀 — 가로 4:3 / 정사각 1:1 / 세로 4:5 3단계. 비율을 아직 모르면 기존과 같은 4:3.
//   4:5보다 더 긴 사진(9:16 등)은 4:5에 맞춰 잘리는데, 그때는 FocalImage의 세로 자동 상단 초점이 보조한다.
export const FEED_FRAME_DEFAULT = 4 / 3;
export function feedFrameAspect(ratio) {
  if (!ratio || !Number.isFinite(ratio)) return FEED_FRAME_DEFAULT;
  if (ratio >= 1.1) return 4 / 3;    // 가로
  if (ratio >= 0.9) return 1;        // 정사각 근처
  return 4 / 5;                      // 세로
}

// 카드의 첫 사진(영상이면 포스터) URI — 여러 장이면 첫 장 기준으로 틀을 정한다(인스타와 같은 규칙).
export function firstPhotoUri(photos) {
  const p = Array.isArray(photos) ? photos[0] : null;
  if (!p) return null;
  if (typeof p === 'string') return p;
  if (p.type === 'video') return p.poster || null;   // 영상은 포스터 비율로(없으면 기본 틀)
  return p.uri || null;
}
