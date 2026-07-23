// 콜드 탭 백그라운드 프리페치 — 앱 시작 직후 '처음 탭하면 느리게 채워지는' 탭(친구·라운지)의
//   데이터를 미리 당겨 Firestore 연결·인증·메모리 캐시를 데우고, 결과를 앱 캐시에 적재한다.
//
// 배경: RN + firebase JS SDK는 영구 persistence가 없어(메모리 캐시만) 화면의 getDocs는 매번 서버를 친다.
//   HOME·MY는 앱 루트 컨텍스트(Schedules/Diaries)로 이미 로드되지만, FRIENDS·LOUNGE는 마운트 시
//   네트워크로 처음 받으므로 첫 탭이 비었다가 채워진다. 여기서 미리 받아두면:
//     ① Firestore WebChannel 연결·인증 토큰·JIT 워밍 → 화면의 첫 쿼리 지연이 줄고
//     ② 받은 결과를 cache에 적재 → 화면이 getPrefetch로 즉시 시드(stale-while-revalidate) 가능.
//   (golfCourses 마스터 캐시 워밍과 동일 취지)
import { loadMyFriends, loadReceivedRequests, loadSentRequests, loadFriendProfiles } from './friends';
import { loadFriendData } from './friendGroups';
import { loadVisibleGroupPostTimes } from './round';   // 그룹공개글 최신시각 — 활동순 정렬 완성(시드 후 널뛰기 방지)
import { loadAllRoundups } from './roundup';
import { buildFriendCard, buildReceivedCard } from './friendCards';
import { db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';

const cache = new Map();   // key → { data, ts }

// 화면에서 즉시 시드용으로 읽기 — maxAgeMs 안의 값만 반환(없거나 오래되면 null → 평소대로 fetch).
//   시드 후 화면이 항상 정식 재조회로 덮어쓰므로(stale-while-revalidate) TTL은 넉넉히(첫 탭이 launch 후 몇 분 뒤일 수 있음).
export function getPrefetch(key, maxAgeMs = 600000) {
  const e = cache.get(key);
  if (!e) return null;
  if (maxAgeMs && Date.now() - e.ts > maxAgeMs) return null;
  return e.data;
}
function put(key, data) { cache.set(key, { data, ts: Date.now() }); }
export function clearPrefetch() { cache.clear(); }

let inFlight = null;
let lastUid = null;

// 앱 시작 후 1회(uid별) 백그라운드 실행. 실패는 삼킨다(프리페치는 best-effort — 실패해도 화면이 평소대로 받음).
export function prefetchTabData(uid) {
  if (!uid) return Promise.resolve();
  if (uid !== lastUid) { lastUid = uid; clearPrefetch(); inFlight = null; }  // uid 변경(익명↔카카오) 시 캐시 초기화·재실행
  if (inFlight) return inFlight;
  inFlight = (async () => {
    // 친구 탭 — 친구·받은신청·보낸신청·그룹메타 + 상대 프로필까지 받아 '명함 카드'를 미리 빌드해 캐시.
    //   FriendsTab이 이걸 그대로 setFriends/setReceivedRequests로 즉시 시드 → 첫 진입 즉시 채움.
    try {
      const [friendsList, received, sent, fdata] = await Promise.all([
        loadMyFriends(), loadReceivedRequests(), loadSentRequests(), loadFriendData(),
      ]);
      const profileByUid = await loadFriendProfiles([
        ...friendsList.map(f => f.otherUid),
        ...received.map(r => r.requesterUid),
        ...sent.map(s => s.recipientUid),
      ]);
      const friendMeta = fdata.friendMeta || {};
      // 활동순 정렬을 화면과 일치시키려면 친구공개글(lastFriendPostAt)에 '내가 볼 수 있는 그룹공개글' 시각을 합쳐야 함.
      //   안 하면 시드(그룹글 미포함) → 전체 로드(포함) 때 순서가 튄다(널뛰기, 사용자 2026-07-23).
      const groupTimes = await loadVisibleGroupPostTimes(friendsList.map(f => f.otherUid)).catch(() => ({}));
      // 내 즐겨찾기·숨김 — 시드 첫 그림부터 상단 고정/숨김 적용(안 하면 setFavorites/setHidden이 늦게 들어와 점프·깜빡임).
      const favorites = {}, hidden = {};
      try {
        const meSnap = await getDoc(doc(db, 'users', uid));
        if (meSnap.exists()) {
          (meSnap.data().favoriteUids || []).forEach(u => { favorites[u] = true; });
          (meSnap.data().hiddenFriendUids || []).forEach(u => { hidden[u] = true; });
        }
      } catch (e) { if (__DEV__) console.warn('[prefetch] favorites/hidden', e?.message); }
      put('friends:base', {
        friends: friendsList.map(f => buildFriendCard(f.otherUid, profileByUid, friendMeta, groupTimes)),
        received: received.map(r => buildReceivedCard(r.requesterUid, profileByUid)), // 차단 필터는 화면에서(사용자별)
        sent: sent.map(s => s.recipientUid),
        fdata,
        favorites,
        hidden,
      });
    } catch (e) { if (__DEV__) console.warn('[prefetch] friends', e?.message); }
    // 라운지 탭 — 전체 모집 목록.
    try {
      put('roundups:all', await loadAllRoundups());
    } catch (e) { if (__DEV__) console.warn('[prefetch] roundups', e?.message); }
  })();
  return inFlight;
}
