import {
  collection, query, where, onSnapshot,
  setDoc, updateDoc, getDoc, doc, serverTimestamp, arrayUnion, arrayRemove, Timestamp,
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
const TTL_DAYS = 2; // 라운딩 후 결정용 — 2일 뒤 정리(후속 CF). 영구 저장 X.

export function mealSuggestionId(scheduleId) {
  return `meal_${scheduleId}`;
}

// 제안(생성) / 장소 교체 — 총대가 식당 골라 제안. 결정적 ID setDoc(전체 덮어쓰기) = 멱등 +
//   '다른 곳'으로 바꾸면 agreedUids 리셋(이전 동의는 다른 장소에 대한 것이라 초기화). place={name,x,y,kakaoId,loc}.
//   audienceUids = 그 라운딩 친구 동반자(friendUid) — 호출부서 schedule.companions에서 추출해 전달.
export async function proposeMeal({ authorUid, authorName, schedule, place, note, audienceUids }) {
  if (!authorUid || !schedule?.id || !place?.name) return null;
  const aud = [...new Set((audienceUids || []).filter(u => u && u !== authorUid))];
  const id = mealSuggestionId(schedule.id);
  await setDoc(doc(db, COLLECTION, id), {
    authorUid,
    authorName: authorName || '',
    scheduleId: schedule.id,
    course: schedule.course || '',
    courseId: schedule.courseId || null,
    courseLoc: schedule.courseLoc || null,
    date: schedule.date || '',
    place: {
      name: place.name || '',
      x: Number.isFinite(place.x) ? place.x : null,
      y: Number.isFinite(place.y) ? place.y : null,
      kakaoId: place.kakaoId || null,
      loc: place.loc || '',
    },
    note: note || '',
    audienceUids: aud,
    agreedUids: [],
    decided: false,
    decidedBy: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000),
  });
  return id;
}

// 동의(👍) — 동의자가 agreedUids에 자기 uid만 토글(취소도 동일 호출로 on=false).
export async function toggleAgreeMeal(id, uid, on) {
  if (!id || !uid) return;
  await updateDoc(doc(db, COLLECTION, id), {
    agreedUids: on ? arrayUnion(uid) : arrayRemove(uid),
    updatedAt: serverTimestamp(),
  });
}

// 결정 — 총대(author)가 '여기로 결정'. decided=true + decidedBy 기록(규칙상 author만).
export async function decideMeal(id, uid) {
  if (!id || !uid) return;
  await updateDoc(doc(db, COLLECTION, id), { decided: true, decidedBy: uid, updatedAt: serverTimestamp() });
}

// 특정 라운딩(작성자 본인)의 제안 1건 구독 — 총대 화면용(meal_{scheduleId}).
export function subscribeMealForSchedule(scheduleId, cb) {
  if (!scheduleId) { cb(null); return () => {}; }
  return onSnapshot(doc(db, COLLECTION, mealSuggestionId(scheduleId)), (snap) => {
    cb(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }, (e) => { if (__DEV__) console.warn('[meal] sched subscribe fail', e?.message); cb(null); });
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
export async function getMealForSchedule(scheduleId) {
  if (!scheduleId) return null;
  const snap = await getDoc(doc(db, COLLECTION, mealSuggestionId(scheduleId)));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
