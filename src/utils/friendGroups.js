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

// 그룹 최대 개수 — 필터칩·라벨이 넘치지 않게. ([[friend_groups]] 2026-06-09)
export const MAX_FRIEND_GROUPS = 6;
export const GROUP_NAME_MAX = 12;

// 자동 색 팔레트 — 그룹 생성 시 순서대로 배정(네이비=라운지 전용이라 제외). owner-only 라벨·필터칩용.
export const GROUP_COLORS = [
  '#6E8B6E', // 세이지 그린
  '#C9A84C', // 골드 (일상 띠와 통일)
  '#B5654A', // 테라코타
  '#7C8A99', // 블루그레이
  '#9C6FA6', // 뮤트 퍼플
  '#C9883C', // 앰버
];

// 기본 그룹 2개 — id는 안정 키(이름 바뀌어도 유지). N개 확장(그룹 관리 화면).
export const DEFAULT_FRIEND_GROUPS = [
  { id: 'close',    name: '가까운 친구', order: 0, color: GROUP_COLORS[0] },
  { id: 'rounding', name: '라운딩 멤버', order: 1, color: GROUP_COLORS[1] },
];

const CUSTOM_NAME_MAX = 6;   // 별명은 짧게 — 카드·상세에서 이름이 길어지지 않게(2026-06-09)

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

// 선택한 그룹들 → 그 그룹에 속한 친구 uid 합집합. 글 작성 시점 audienceUids 스냅샷 산출.
//   friendMeta = loadFriendData().friendMeta, groupIds = 선택한 그룹 id 배열.
export function resolveGroupAudience(friendMeta, groupIds) {
  if (!friendMeta || !Array.isArray(groupIds) || groupIds.length === 0) return [];
  const sel = new Set(groupIds);
  return Object.keys(friendMeta).filter(uid => {
    const g = friendMeta[uid] && friendMeta[uid].groupIds;
    return Array.isArray(g) && g.some(x => sel.has(x));
  });
}

// 그룹 색 — 그룹에 저장된 color 우선, 없으면(옛 문서) 순서 기준 팔레트. 못 찾으면 중립 회색.
export function groupColor(friendGroups, groupId) {
  const arr = normGroups(friendGroups);
  const g = arr.find(x => x.id === groupId);
  if (g && g.color) return g.color;
  const i = arr.findIndex(x => x.id === groupId);
  return i >= 0 ? GROUP_COLORS[i % GROUP_COLORS.length] : '#9A938B';
}

// 그룹 이름 — 못 찾으면 fallback(삭제된 그룹 참조 등).
export function groupName(friendGroups, groupId, fallback = '그룹') {
  const g = normGroups(friendGroups).find(x => x.id === groupId);
  return (g && g.name) || fallback;
}

// 한 그룹에 속한 친구 수 — 단일소속이라 groupIds[0] 비교(배열엔 0~1개). 삭제 가능 판단용.
export function groupMemberCount(friendMeta, groupId) {
  if (!friendMeta || !groupId) return 0;
  return Object.keys(friendMeta).filter(uid => {
    const g = friendMeta[uid] && friendMeta[uid].groupIds;
    return Array.isArray(g) && g.includes(groupId);
  }).length;
}

// 새 그룹 id — app 코드라 Date.now/random 사용 가능. 안정 유니크.
export function newGroupId() {
  return 'g_' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
}

// 비어있는 팔레트 색 1개 — 그룹 추가 시 자동 배정(이미 쓰는 색 회피, 다 차면 순환).
export function nextGroupColor(friendGroups) {
  const used = new Set(normGroups(friendGroups).map(g => g.color).filter(Boolean));
  return GROUP_COLORS.find(c => !used.has(c)) || GROUP_COLORS[normGroups(friendGroups).length % GROUP_COLORS.length];
}

// 내 글/모집의 공개범위 → owner-only 표시 라벨. 친구 전체는 null(라벨 없음=깔끔).
//   group → { text: 그룹명, color: 그룹색 } / private → { text:'나만 보기', icon:'🔒' }. ([[friend_groups]])
//   ★남에겐 절대 노출 금지 — 호출부에서 authorUid==나(또는 variant==='mine')일 때만 렌더할 것.
export function ownerVisibilityLabel(friendGroups, visibility, audienceGroupIds) {
  if (visibility === 'private') return { text: '나만 보기', icon: '🔒', color: null };
  if (visibility === 'group') {
    const gid = Array.isArray(audienceGroupIds) ? audienceGroupIds[0] : null;
    if (gid) return { text: groupName(friendGroups, gid), color: groupColor(friendGroups, gid), icon: null };
  }
  return null; // friends(친구 전체) 등 — 라벨 없음
}

// 그룹 목록 통째 저장 (관리 화면 CRUD 공용) — friendMeta는 안 건드림. 반환 성공여부.
export async function saveFriendGroups(friendGroups) {
  const uid = await getUid();
  if (!uid || !Array.isArray(friendGroups)) return false;
  try {
    await setDoc(privRef(uid), { friendGroups, updatedAt: serverTimestamp() }, { merge: true });
    return true;
  } catch (e) {
    if (__DEV__) console.warn('[friendGroups] saveFriendGroups', e?.message);
    return false;
  }
}
