import { STORAGE_KEYS, storage } from './storage';
import { db, getUid } from './firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

// 주최자 강퇴 월 2회 한도 — [[roundup-kick-policy]] §4.
// 12개월 롤링 10회 → 2개월 정지는 Phase 2 Cloud Functions에서 처리.
//
// 저장 위치:
//  - AsyncStorage(@dg_kick_count): 빠른 로컬 캐시
//  - users/{uid}.limits.kick: Firestore (멀티기기 우회 차단)
//  - increment 시 양쪽 동시 업데이트. 마운트 시 sync.

const MONTH_LIMIT = 2;

function currentYearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function getKickCountThisMonth() {
  const raw = await storage.load(STORAGE_KEYS.kickCount, null);
  const ym = currentYearMonth();
  if (!raw || raw.yearMonth !== ym) return 0;
  return raw.count || 0;
}

export async function getKickRemainingThisMonth() {
  const used = await getKickCountThisMonth();
  return Math.max(0, MONTH_LIMIT - used);
}

export async function isKickLimitReached() {
  const used = await getKickCountThisMonth();
  return used >= MONTH_LIMIT;
}

export async function incrementKickCount() {
  const ym = currentYearMonth();
  const raw = await storage.load(STORAGE_KEYS.kickCount, null);
  const baseCount = (!raw || raw.yearMonth !== ym) ? 0 : (raw.count || 0);
  const next = { yearMonth: ym, count: baseCount + 1 };
  await storage.save(STORAGE_KEYS.kickCount, next);
  try {
    const uid = await getUid();
    if (uid) {
      await setDoc(doc(db, 'users', uid),
        { limits: { kick: next }, updatedAt: serverTimestamp() },
        { merge: true });
    }
  } catch (e) {
    if (__DEV__) console.warn('[kickLimit] firestore sync failed', e?.message);
  }
}

export async function syncKickLimitFromFirestore() {
  try {
    const uid = await getUid();
    if (!uid) return;
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return;
    const remote = snap.data().limits?.kick;
    if (!remote) return;
    const ym = currentYearMonth();
    const localRaw = await storage.load(STORAGE_KEYS.kickCount, null);
    const localCount = (localRaw && localRaw.yearMonth === ym) ? (localRaw.count || 0) : 0;
    const remoteCount = (remote.yearMonth === ym) ? (remote.count || 0) : 0;
    const maxCount = Math.max(localCount, remoteCount);
    await storage.save(STORAGE_KEYS.kickCount, { yearMonth: ym, count: maxCount });
  } catch (e) {
    if (__DEV__) console.warn('[kickLimit] sync from firestore failed', e?.message);
  }
}

export const KICK_MONTH_LIMIT = MONTH_LIMIT;

// 강퇴 사유 — 2개만, 기타 없음 ([[roundup-kick-policy]] §2)
export const KICK_REASONS = [
  { key: 'misbehavior', label: '비매너 행동' },
  { key: 'fake_profile', label: '허위 프로필' },
];
