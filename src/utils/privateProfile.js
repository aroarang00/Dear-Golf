import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// =============================================================
// users/{uid}/private/profile — 본인만 read/write 하는 비공개 프로필.
//   ★users 문서는 누구나 read(친구 검색용)라, 집 주소·출발지 같은 민감 정보는 거기 두면 안 됨.
//     owner-only private 서브컬렉션(규칙: allow read,write: if isOwner(uid))에 둬서
//     멀티기기·재설치 간 유지하면서도 남에게는 노출 안 되게 한다. ([[private-profile]])
//   현재: 자주 가는 출발지(departure 라벨 + departureCoord 좌표). 홈 D-0 카드 교통 소요시간 계산용.
// =============================================================

const privRef = (uid) => doc(db, 'users', uid, 'private', 'profile');

// 출발지(주소 라벨 + 좌표) 비공개 저장 — 기기 간 유지. 좌표 없으면 null로.
export async function savePrivateDeparture(uid, departure, departureCoord) {
  if (!uid) return;
  const coord = (departureCoord && typeof departureCoord.x === 'number' && typeof departureCoord.y === 'number')
    ? { x: departureCoord.x, y: departureCoord.y } : null;
  try {
    await setDoc(privRef(uid), { departure: departure || '', departureCoord: coord, updatedAt: serverTimestamp() }, { merge: true });
  } catch (e) { if (__DEV__) console.warn('[privateProfile] save departure', e?.message); }
}

// 회사(또는 자주 가는 또 하나의 출발지) 비공개 저장 — 오후·야간 티 출발지 계산용([[smart-preround-timing-plan]]).
export async function savePrivateWork(uid, work, workCoord) {
  if (!uid) return;
  const coord = (workCoord && typeof workCoord.x === 'number' && typeof workCoord.y === 'number')
    ? { x: workCoord.x, y: workCoord.y } : null;
  try {
    await setDoc(privRef(uid), { work: work || '', workCoord: coord, updatedAt: serverTimestamp() }, { merge: true });
  } catch (e) { if (__DEV__) console.warn('[privateProfile] save work', e?.message); }
}

// 비공개 프로필 로드 — { departure, departureCoord } | null. 앱 시작 시 1회(App.js 동기화).
export async function loadPrivateProfile(uid) {
  if (!uid) return null;
  try {
    const snap = await getDoc(privRef(uid));
    return snap.exists() ? snap.data() : null;
  } catch (e) { if (__DEV__) console.warn('[privateProfile] load', e?.message); return null; }
}
