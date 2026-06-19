import {
  collection, query, where, onSnapshot,
  setDoc, updateDoc, getDoc, doc, serverTimestamp, arrayUnion, arrayRemove, Timestamp, runTransaction,
} from 'firebase/firestore';
import { db } from './firebase';

// =============================================================
// mealSuggestions/{id} — 라운딩 후 뒤풀이(식사) 장소 결정 ([[afterround-meal-decision]], docs/companion-design.md)
//
// 총대 한 명이 주변 맛집을 골라 제안 → 동반자(친구)가 👍 동의 → 총대가 '여기로 결정' → 길찾기.
// ★자기파생/단일문서: 라운딩당 1개(결정적 ID meal_{scheduleId}, 작성자=총대). 동반자는 audienceUids로 발견.
//   cross-user 데이터 쓰기 0(동의=agreedUids 자기 토글, 알림만 cross-user=푸시 CF). 채팅 아님.
// 그날만 사는 ephemeral(TTL) — 라운딩 기록엔 저장 X(사용자 결정 2026-06-17).
//
// 보안 규칙 (firestore.rules):
//  - read   : authorUid==me OR me in audienceUids   (resource==null 가드)
//  - create : authorUid==me, agreedUids==[], decided==false
//  - update : author 전체(장소 교체·메모·결정) / 동의자는 agreedUids 자기 토글만
//  - delete : author (TTL 정리는 후속 CF)
//  - 쿼리   : where('audienceUids','array-contains', 내uid)
// =============================================================

const COLLECTION = 'mealSuggestions';
const TTL_DAYS = 2; // 날짜 파싱 실패 시 폴백 — 2일 뒤 정리(후속 CF). 영구 저장 X.

// 만료 시점 = 라운딩 날짜 기준(그 다음날 끝까지 유지). 미리(며칠 전) 정해도 라운딩 당일까지 동반자에게 계속 보이게.
//   기존엔 '생성+2일'이라 사전 결정 시 라운딩 전에 만료돼 동반자 화면에서 사라지던 버그. ([[afterround-meal-decision]])
function computeExpiresAt(dateStr) {
  const m = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec((dateStr || '').trim());
  if (m) {
    // 라운딩 다음날 23:59까지 — 뒤풀이는 라운딩 후라 당일 늦게까지, +1일 버퍼.
    const ms = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1, 23, 59, 59).getTime();
    if (Number.isFinite(ms) && ms > Date.now()) return Timestamp.fromMillis(ms);
  }
  return Timestamp.fromMillis(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);
}

// 슬롯 — 한 라운딩에 식사 최대 2곳(전/후 등). slot 1 = `meal_{key}`, slot 2 = `meal_{key}_2`.
//   규칙이 ID 형식을 강제하지 않아 2번째 문서도 그대로 통과(추가 규칙 X). CF도 문서당 발동(추가 X).
export function mealSuggestionId(scheduleId, slot = 1) {
  return slot === 2 ? `meal_${scheduleId}_2` : `meal_${scheduleId}`;
}

// 제안(생성) / 장소 교체 — 총대가 식당 골라 제안. 결정적 ID setDoc(전체 덮어쓰기) = 멱등 +
//   '다른 곳'으로 바꾸면 agreedUids 리셋(이전 동의는 다른 장소에 대한 것이라 초기화). place={name,x,y,kakaoId,loc}.
//   audienceUids = 그 라운딩 친구 동반자(friendUid) — 호출부서 schedule.companions에서 추출해 전달.
// 제안 = 결정(단순화 2026-06-18): 먼저 제안한 사람이 총대로 고정되고 그 식당으로 '즉시 결정'.
//   ★선착순 1명만 — 트랜잭션으로 first-write-wins: 이미 누가 정했으면 {taken:true,by} 반환(덮어쓰기 X).
//   총대 본인이 다시 제안하면 = 식당 변경(place만 교체). 동의 단계 없음.
//   ★공유 키 — 전파 일정은 groupId로 모든 참여자가 한 문서에 수렴(사용자별 schedule.id 발산 방지). 없으면 schedule.id 폴백.
// hostUid = 단체모집 주최자(roundup authorUid). 있으면 변경 권한을 작성자 + 주최자로 확장(호출부서 해석해 전달).
export async function proposeMeal({ authorUid, authorName, schedule, place, note, audienceUids, slot = 1, hostUid = null }) {
  if (!authorUid || !schedule?.id || !place?.name) return null;
  const aud = [...new Set((audienceUids || []).filter(u => u && u !== authorUid))];
  // ★공유 키 — 전파 일정=groupId / 라운지 모집=roundupId(참여자 전원 같은 키로 수렴) / 그 외=schedule.id.
  //   roundup은 사람마다 schedule.id가 달라 id로 키 잡으면 참여자끼리 문서가 갈라짐(호스트 오버라이드·단체 식사 불가).
  const key = schedule.groupId || schedule.roundupId || schedule.id;
  const id = mealSuggestionId(key, slot);
  const ref = doc(db, COLLECTION, id);
  const placeData = {
    name: place.name || '',
    x: Number.isFinite(place.x) ? place.x : null,
    y: Number.isFinite(place.y) ? place.y : null,
    kakaoId: place.kakaoId || null,
    loc: place.loc || '',
  };
  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists()) {
        const d = snap.data();
        // 변경 = 작성자(총대) 또는 단체 주최자(hostUid). 그 외엔 덮어쓰기 X.
        const canEdit = d.authorUid === authorUid || (d.hostUid && d.hostUid === authorUid);
        if (!canEdit) return { taken: true, by: d.authorName || '' };
        tx.update(ref, { place: placeData, note: note || '', updatedAt: serverTimestamp() });
        return { id, changed: true };
      }
      tx.set(ref, {
        authorUid,
        authorName: authorName || '',
        hostUid: hostUid || null,   // 단체모집 주최자 — 변경 권한 확장용(규칙도 동일 검증)
        scheduleId: key,
        slot,                   // 1 또는 2 — 동반자 화면에서 슬롯 구분
        course: schedule.course || '',
        courseId: schedule.courseId || null,
        courseLoc: schedule.courseLoc || null,
        date: schedule.date || '',
        place: placeData,
        note: note || '',
        audienceUids: aud,
        decided: true,          // 제안=결정
        decidedBy: authorUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        expiresAt: computeExpiresAt(schedule.date),
      });
      return { id, created: true };
    });
  } catch (e) {
    if (__DEV__) console.warn('[meal] propose tx fail', e?.message);
    return null;
  }
}

// 특정 라운딩(작성자 본인)의 제안 1건 구독 — 총대 화면용. slot으로 1·2 슬롯 각각 구독.
export function subscribeMealForSchedule(scheduleId, cb, slot = 1) {
  if (!scheduleId) { cb(null); return () => {}; }
  return onSnapshot(doc(db, COLLECTION, mealSuggestionId(scheduleId, slot)), (snap) => {
    cb(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }, (e) => { if (__DEV__) console.warn('[meal] sched subscribe fail', e?.message); cb(null); });
}

// 메모만 수정(장소 변경 없음) — 총대 전용. place 불변이라 변경 푸시(onMealSuggestionUpdated)는 안 감.
export async function updateMealNote(scheduleId, slot, note) {
  if (!scheduleId) return false;
  try {
    await updateDoc(doc(db, COLLECTION, mealSuggestionId(scheduleId, slot)), { note: note || '', updatedAt: serverTimestamp() });
    return true;
  } catch (e) { if (__DEV__) console.warn('[meal] note update fail', e?.message); return false; }
}

// 내게 온 뒤풀이 제안 구독 — audienceUids에 내 uid, 만료 전. 최신순(클라). 동반자 화면용.
export function subscribeIncomingMeals(uid, cb) {
  if (!uid) { cb([]); return () => {}; }
  const q = query(collection(db, COLLECTION), where('audienceUids', 'array-contains', uid));
  return onSnapshot(q, (snap) => {
    const now = Date.now();
    const list = [];
    snap.forEach(d => {
      const data = d.data();
      if (data.authorUid === uid) return;
      const exp = data.expiresAt?.toMillis ? data.expiresAt.toMillis() : 0;
      if (exp && exp < now) return; // 만료 숨김
      list.push({ id: d.id, ...data });
    });
    list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    cb(list);
  }, (e) => { if (__DEV__) console.warn('[meal] incoming subscribe fail', e?.message); cb([]); });
}

// 1회 조회(폴백).
export async function getMealForSchedule(scheduleId, slot = 1) {
  if (!scheduleId) return null;
  const snap = await getDoc(doc(db, COLLECTION, mealSuggestionId(scheduleId, slot)));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
