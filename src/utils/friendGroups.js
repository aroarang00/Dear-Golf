import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, getUid } from './firebase';

// =============================================================
// users/{uid}/private/friendData — 내 친구 그룹·별명 (owner-only)
//   { friendGroups: [{id,name,order}], friendMeta: { [friendUid]: {customName, groupIds[]} } }
//
// ★프라이버시: users 문서 read가 전면 개방(공개 명함)이라, 친구 메타(별명·소속)는
//   반드시 owner-only 서브컬렉션에 둔다. 친구·제3자 read 불가. (docs/friend-groups-design.md)
// =============================================================

const privRef = (uid) => doc(db, 'users', uid, 'private', 'friendData');

// 기본 그룹 2개 — id는 안정 키(이름 바뀌어도 유지). 추후 N개 확장.
export const DEFAULT_FRIEND_GROUPS = [
  { id: 'close',    name: '가까운 친구', order: 0 },
  { id: 'rounding', name: '라운딩 멤버', order: 1 },
];

const CUSTOM_NAME_MAX = 20;

const normGroups = (g) =>
  (Array.isArray(g) && g.length) ? g : DEFAULT_FRIEND_GROUPS;
const normMeta = (m) =>
  (m && typeof m === 'object') ? m : {};

// 내 친구데이터 로드 — 문서 없으면 기본 그룹으로 채워(메모리상) 반환. 쓰기는 안 함(lazy).
//   반환: { friendGroups, friendMeta }
export async function loadFriendData() {
  const uid = await getUid();
  if (!uid) return { friendGroups: DEFAULT_FRIEND_GROUPS, friendMeta: {} };
  try {
    const snap = await getDoc(privRef(uid));
    if (snap.exists()) {
      const d = snap.data();
      return { friendGroups: normGroups(d.friendGroups), friendMeta: normMeta(d.friendMeta) };
    }
  } catch (e) {
    if (__DEV__) console.warn('[friendGroups] loadFriendData', e?.message);
  }
  return { friendGroups: DEFAULT_FRIEND_GROUPS, friendMeta: {} };
}

// 한 친구의 메타(별명·소속 그룹) 저장 — merge. 별명·그룹 모두 비면 항목 제거.
//   반환: 갱신된 { friendGroups, friendMeta }
export async function setFriendMeta(friendUid, { customName = '', groupIds = [] } = {}) {
  const uid = await getUid();
  if (!uid || !friendUid) return null;
  const ref = privRef(uid);
  let cur = {};
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) cur = snap.data();
  } catch (e) {
    if (__DEV__) console.warn('[friendGroups] setFriendMeta read', e?.message);
  }
  const friendGroups = normGroups(cur.friendGroups);
  const friendMeta = { ...normMeta(cur.friendMeta) };

  const name = (customName || '').trim().slice(0, CUSTOM_NAME_MAX);
  const gids = Array.isArray(groupIds) ? groupIds.filter(Boolean) : [];
  if (!name && gids.length === 0) {
    delete friendMeta[friendUid];               // 비면 정리
  } else {
    const meta = { groupIds: gids };
    if (name) meta.customName = name;
    friendMeta[friendUid] = meta;
  }
  await setDoc(ref, { friendGroups, friendMeta, updatedAt: serverTimestamp() }, { merge: true });
  return { friendGroups, friendMeta };
}

// 표시 이름 — 별명 우선, 없으면 닉네임. friendMeta는 loadFriendData().friendMeta.
export function friendDisplayName(friendMeta, friendUid, fallbackNickname) {
  const cn = friendMeta && friendMeta[friendUid] && friendMeta[friendUid].customName;
  return (cn && String(cn).trim()) || fallbackNickname || '친구';
}
