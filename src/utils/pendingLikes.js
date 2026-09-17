// 친구 라운드 좋아요 유실 방지 — '대기 큐'.
//   문제: 좋아요는 낙관적으로 하트만 켜고 updateDoc은 백그라운드로 나가는데, 약전파면 이 쓰기가
//   성공도 실패도 아닌 '대기'로 걸린다(.catch도 안 탐). 화면을 벗어나거나 앱을 닫으면 통째로 유실 →
//   나중에 친구 피드엔 안 눌린 상태("분명히 눌렀는데 없다", 사용자 2026-09-12).
//   처방: 누를 때 의도(roundId→원하는 like 상태)를 기기에 저장하고, 성공하면 지운다.
//   앱 재실행·포그라운드 복귀 때 미완료분을 자동 재전송한다. arrayUnion/Remove라 재적용은 멱등.
import { storage, STORAGE_KEYS } from './storage';
import { toggleRoundLike, getRoundLikeState } from './round';

const KEY = STORAGE_KEYS.pendingLikes;

// ★앱 안 '내 좋아요' 공유 메모장(2026-09-17) — 홈 친구소식·친구 피드·친구 탭이 같은 글을 각자 불러와 카드마다
//   하트 상태를 따로 기억해서, 한 화면에서 누르면 다른 화면은 옛 상태 그대로였다(사용자: "다시 눌러야 하고 반대도 마찬가지").
//   어느 화면에서 누르든 여기에 먼저 적고, 모든 카드가 구독해 동시에 바뀐다. 세션 메모리만(서버 진실은 rounds.likes).
const _myLikes = new Map();       // roundId → bool (이 세션에서 내가 정한 상태)
const _subs = new Set();          // 변경 알림 콜백
export function getMyLike(roundId) { return _myLikes.has(roundId) ? _myLikes.get(roundId) : null; }
export function setMyLike(roundId, like) {
  if (!roundId) return;
  _myLikes.set(roundId, !!like);
  _subs.forEach((fn) => { try { fn(roundId); } catch {} });
}
export function subscribeMyLikes(fn) { _subs.add(fn); return () => _subs.delete(fn); }

// 동시 토글의 read-modify-write 경쟁 완화 — 큐 갱신을 순차 체인으로 직렬화.
let _chain = Promise.resolve();
function serialize(fn) {
  const run = _chain.then(fn, fn);
  _chain = run.catch(() => {});
  return run;
}

async function loadMap() { return (await storage.load(KEY, {})) || {}; }

async function setIntent(roundId, like) {
  return serialize(async () => {
    const m = await loadMap();
    m[roundId] = { like, ts: Date.now() };
    await storage.save(KEY, m);
  });
}

// 큐에서 제거 — 단, 그 사이 사용자가 다시 토글해 의도가 바뀌었으면(like 불일치) 남겨둔다.
async function clearIntentIf(roundId, like) {
  return serialize(async () => {
    const m = await loadMap();
    if (m[roundId] && m[roundId].like === like) { delete m[roundId]; await storage.save(KEY, m); }
  });
}

// 서버에 원하는 상태로 반영 시도. 반환:
//   'ok'        — 서버가 원하는 상태가 됨(방금 썼거나 이미 그 상태). 규칙의 '변화 없는 토글' 거부도 흡수.
//   'permanent' — 권한 없음/글 삭제 등 재시도해도 안 됨(롤백 대상).
//   'pending'   — 네트워크 등 일시 실패. 큐에 남겨 나중에 재전송.
async function commit(roundId, like) {
  try {
    await toggleRoundLike(roundId, like);
    return 'ok';
  } catch (e) {
    const code = e?.code || '';
    // 서버 진실 확인 — 이미 원하는 상태면 성공으로 간주(스냅샷 낡음→no-op 거부 흡수, 기존 자가치유와 동일)
    const fresh = await getRoundLikeState(roundId); // null = 읽기 실패 또는 문서 없음
    if (fresh) {
      const serverLiked = fresh.likes.includes(fresh.myUid);
      if (serverLiked === like) return 'ok';
      // 원하는 상태가 아닌데 거부 → 권한·규칙상 영구 실패
      if (code.includes('permission') || code.includes('not-found')) return 'permanent';
      return 'pending';
    }
    if (code.includes('not-found')) return 'permanent'; // 원본 글 삭제됨
    return 'pending'; // 그 외(네트워크·읽기 실패) — 재시도 대상
  }
}

// 좋아요 토글 — 의도를 큐에 남기고 즉시 반영 시도. UI는 반환값으로 롤백 여부만 판단.
//   반환: 'ok' | 'permanent' | 'pending'
export async function queueLike(roundId, like) {
  if (!roundId) return 'permanent';
  await setIntent(roundId, like);
  const res = await commit(roundId, like);
  if (res === 'ok' || res === 'permanent') await clearIntentIf(roundId, like);
  return res; // 'pending'이면 큐에 남아 flushPendingLikes가 나중에 처리
}

// 미완료 좋아요 재전송 — 앱 재실행·포그라운드 복귀 때 호출.
export async function flushPendingLikes() {
  const m = await loadMap();
  const ids = Object.keys(m);
  if (!ids.length) return;
  for (const roundId of ids) {
    const like = m[roundId]?.like;
    if (typeof like !== 'boolean') { await clearIntentIf(roundId, like); continue; }
    const res = await commit(roundId, like);
    if (res === 'ok' || res === 'permanent') await clearIntentIf(roundId, like);
    // 'pending'이면 다음 기회에 다시 시도
  }
}
