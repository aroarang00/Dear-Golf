import {
  collection, query, where, orderBy, getDocs,
  addDoc, setDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db, getUid } from './firebase';

// =============================================================
// schedules/{scheduleId} — 라운딩 예정 일정 (본인만 read/write)
//
// 보안 규칙 (firestore.rules):
//  - read   : ownerUid == me
//  - create : ownerUid == me
//  - update : ownerUid == me  AND  ownerUid 변조 금지
//  - delete : ownerUid == me
//
// 데이터 마이그레이션 정책 ([[data-migration]]):
//  옛 AsyncStorage(@dg_schedules) 데이터는 이관 X. Firestore부터 새로 시작.
//
// dDay·weather·wind·duration 등 파생/외부 값은 클라이언트 계산이라 저장 X.
// =============================================================

const COLLECTION = 'schedules';

// 내 일정 목록 — date 오름차순. 인덱스 (ownerUid, date asc) 사용.
export async function loadMySchedules() {
  const uid = await getUid();
  if (!uid) return [];
  const q = query(
    collection(db, COLLECTION),
    where('ownerUid', '==', uid),
    orderBy('date', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// 신규 일정 생성. dDay/weather 등 파생값은 호출 측에서 normalizeSchedules로 채움.
export async function createSchedule(data) {
  const uid = await getUid();
  if (!uid) throw new Error('Not authenticated');
  const sched = {
    ownerUid: uid,
    course: data.course || '',
    courseId: data.courseId || null,        // 등록코스(userCourses) id — 이게 빠져 지역탭이 '기타'로 떨어지던 버그 ([[region-classification]])
    courseLoc: data.courseLoc || null,      // 코스 주소 — 지역탭 분류가 userCourses 동기화에 의존하지 않게 기록에 직접 저장
    courseLogId: data.courseLogId || null,
    courseKakaoId: data.courseKakaoId || null,
    date: data.date || '',
    day: data.day || '',
    time: data.time || '',
    members: typeof data.members === 'number' ? data.members : 4,
    companions: Array.isArray(data.companions) ? data.companions : [], // 동반자 [{name, friendUid?}]
    roundupId: data.roundupId || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, COLLECTION), sched);
  return { id: ref.id, ...sched };
}

// 기존 일정 수정. ownerUid는 변경 금지(보안 규칙 강제).
export async function updateSchedule(scheduleId, data) {
  if (!scheduleId) throw new Error('scheduleId required');
  const ref = doc(db, COLLECTION, scheduleId);
  const { ownerUid, id, createdAt, ...updatable } = data;
  await updateDoc(ref, {
    ...updatable,
    updatedAt: serverTimestamp(),
  });
}

// 일정 삭제 — 본인만 가능 (보안 규칙).
export async function deleteSchedule(scheduleId) {
  if (!scheduleId) throw new Error('scheduleId required');
  await deleteDoc(doc(db, COLLECTION, scheduleId));
}

// 결정적 ID로 일정 setDoc(멱등) — 일정 전파 수락 시 자기파생({groupId}_{uid})에 사용 ([[schedule-propagation-spec]]).
//   ownerUid는 data에 포함(==본인). 이미 있으면 덮어써 멱등(중복 방지). createdAt 보존 위해 merge.
export async function setScheduleDoc(scheduleId, data) {
  if (!scheduleId) throw new Error('scheduleId required');
  await setDoc(doc(db, COLLECTION, scheduleId), { ...data, updatedAt: serverTimestamp() }, { merge: true });
}
