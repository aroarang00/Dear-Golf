import AsyncStorage from '@react-native-async-storage/async-storage';
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

// ★디스크 영속(2026-08-26) — 캐시가 메모리뿐이라 앱을 켤 때마다 비율을 잊고, 카드가 기본 4:3으로
//   그려졌다가 사진 로드 후 틀이 바뀌며 '작았다가 확 커지는' 점프가 매번 재발(사용자 지적).
//   시작 시 1회 하이드레이션 + 새 비율은 디바운스 저장 → 한 번 본 사진은 다음부터 처음부터 맞는 크기.
const STORE_KEY = '@dg_photo_ratio_v1';
const MAX_ENTRIES = 600; // 오래된 것부터 버림 — 저장 파일 무한 성장 방지
let saveTimer = null;
// 하이드레이션 완료 신호 — ①카드가 캐시 로드보다 먼저 마운트되는 경쟁(끝나면 재조회용)
//   ②로드 완료 전 persist가 '이 세션 몇 장'만으로 디스크를 덮어써 기존 비율을 지우던 사고, 둘 다 차단.
let _resolveReady;
export const ratiosReady = new Promise(res => { _resolveReady = res; });
(async () => {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      // 이번 세션에서 이미 배운 값이 우선(덮어쓰지 않음)
      Object.entries(obj).forEach(([k, v]) => { if (!_cache.has(k) && Number.isFinite(v)) _cache.set(k, v); });
    }
  } catch {} finally { _resolveReady(); }
})();
function persistSoon() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    await ratiosReady; // ★하이드레이션 전 저장 금지 — 디스크의 기존 항목을 세션 캐시가 삼킨 뒤에만 쓴다
    let entries = [..._cache.entries()];
    if (entries.length > MAX_ENTRIES) entries = entries.slice(entries.length - MAX_ENTRIES);
    AsyncStorage.setItem(STORE_KEY, JSON.stringify(Object.fromEntries(entries))).catch(() => {});
  }, 800);
}

export function setPhotoRatio(uri, ratio) {
  if (!uri || !ratio || !Number.isFinite(ratio)) return;
  const u = resolvePhotoUri(uri);
  if (u && _cache.get(u) !== ratio) { _cache.set(u, ratio); persistSoon(); }
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

// 저장 데이터에 실린 비율 힌트(2026-10-05) — 사진 객체의 ar(가로/세로). 있으면 로드 전에 틀을 확정할 수 있다.
//   첫 장 기준(틀 규칙과 동일). 영상은 포스터 비율을 저장하지 않아 null.
export function firstPhotoRatioHint(photos) {
  const p = Array.isArray(photos) ? photos[0] : null;
  if (!p || typeof p !== 'object' || p.type === 'video') return null;
  return Number.isFinite(p.ar) && p.ar > 0 ? p.ar : null;
}

// 카드 틀 결정용 비율 — ①이 기기에서 잰 캐시 ②저장 데이터의 ar 힌트(캐시에 심어둠) ③없음(null→기본 4:3)
export function cardPhotoRatio(photos) {
  const uri = firstPhotoUri(photos);
  const cached = getPhotoRatio(uri);
  if (cached) return cached;
  const hint = firstPhotoRatioHint(photos);
  if (hint) { setPhotoRatio(uri, hint); return hint; }
  return null;
}

// 카드의 첫 사진(영상이면 포스터) URI — 여러 장이면 첫 장 기준으로 틀을 정한다(인스타와 같은 규칙).
export function firstPhotoUri(photos) {
  const p = Array.isArray(photos) ? photos[0] : null;
  if (!p) return null;
  if (typeof p === 'string') return p;
  if (p.type === 'video') return p.poster || null;   // 영상은 포스터 비율로(없으면 기본 틀)
  return p.uri || null;
}
