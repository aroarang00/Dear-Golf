// =============================================================
// Firestore 보안 규칙 테스트 — 일정전파(scheduleGroups) · 내일정(schedules) · 라운지모집(roundups)
//
//  목적: 규칙의 "명확함"이 정상 동작을 막는 false-denial을 자동으로 잡는다.
//        (수동 대조 대신 — 규칙을 바꿀 때마다 CI가 여기 케이스를 돌려 회귀를 차단)
//
//  실행: Firestore 에뮬레이터가 필요(Java 11+). 로컬/CI 공통으로
//          firebase emulators:exec --only firestore --project demo-deargolf "npm run test:rules"
//        (= package.json 의 test:rules:emu). 에뮬레이터가 이미 떠 있으면 `npm run test:rules`.
//
//  컨벤션: alice=생성자/주최자/소유자, bob=초대·수락 멤버/참여자, carol=외부인.
//          seed()는 규칙을 우회해 초기 상태를 심고, 그 위에서 각 액터의 쓰기를 assert.
// =============================================================
import { readFileSync } from 'node:fs';
import { test, before, after, beforeEach } from 'node:test';
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, arrayUnion, arrayRemove,
} from 'firebase/firestore';

const PROJECT_ID = 'demo-deargolf';
let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
after(async () => { await testEnv.cleanup(); });
beforeEach(async () => { await testEnv.clearFirestore(); });

// 인증된 컨텍스트의 Firestore 핸들
const as = (uid) => testEnv.authenticatedContext(uid).firestore();
// 규칙 우회 시드(초기 상태 심기)
const seed = (fn) => testEnv.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));

// =============================================================
// schedules — 본인만 read/write (owner-only). false-denial 위험 거의 0인지 확인.
// =============================================================
test('schedules: 소유자는 생성·수정·삭제 가능, ownerUid 변조는 거부', async () => {
  const alice = as('alice');
  const ref = doc(alice, 'schedules', 's1');

  // 생성 — ownerUid==me
  await assertSucceeds(setDoc(ref, {
    ownerUid: 'alice', course: '레이크사이드', date: '2026-07-01', time: '07:00', members: 4,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));
  // 정상 수정 — ownerUid 유지
  await assertSucceeds(updateDoc(ref, { time: '08:00', updatedAt: serverTimestamp() }));
  // ownerUid 변조 — 거부
  await assertFails(updateDoc(ref, { ownerUid: 'bob' }));
  // 소유자 삭제 — 허용
  await assertSucceeds(deleteDoc(ref));
});

test('schedules: 남의 일정은 read·update·delete 모두 거부', async () => {
  await seed((db) => setDoc(doc(db, 'schedules', 's1'), {
    ownerUid: 'alice', course: 'X', date: '2026-07-01',
  }));
  const bob = as('bob');
  await assertFails(getDoc(doc(bob, 'schedules', 's1')));
  await assertFails(updateDoc(doc(bob, 'schedules', 's1'), { time: '09:00' }));
  await assertFails(deleteDoc(doc(bob, 'schedules', 's1')));
});

// =============================================================
// scheduleGroups — 일정전파. 호스트 없는 동등 모델 + 구장·날짜 잠금.
// =============================================================
const groupBase = (over = {}) => ({
  initiatorUid: 'alice', initiatorName: 'Alice', sourceScheduleId: 'src1',
  course: '남촌CC', courseId: null, courseLoc: null, courseX: null, courseY: null,
  date: '2026-07-10', day: '금', time: '06:30', members: 2, booker: '', subCourse: '',
  names: { alice: 'Alice' },
  audienceUids: ['bob'], memberUids: ['alice'], declinedUids: [],
  createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  ...over,
});

test('scheduleGroups: 생성은 initiator==me + memberUids=[me] + declinedUids=[] 일 때만', async () => {
  const alice = as('alice');
  await assertSucceeds(setDoc(doc(alice, 'scheduleGroups', 'g1'), groupBase()));
  // memberUids 가 [me] 아님 — 거부
  await assertFails(setDoc(doc(alice, 'scheduleGroups', 'g2'), groupBase({ memberUids: ['alice', 'bob'] })));
  // initiator 가 내가 아님 — 거부
  await assertFails(setDoc(doc(as('bob'), 'scheduleGroups', 'g3'), groupBase()));
});

test('scheduleGroups: 내용수정(R2) — 멤버/생성자는 허용, 외부인 거부, 구장·날짜는 잠김', async () => {
  await seed((db) => setDoc(doc(db, 'scheduleGroups', 'g1'), groupBase({ memberUids: ['alice', 'bob'] })));
  // 수락 멤버 bob — time/members/booker/subCourse 수정 허용
  await assertSucceeds(updateDoc(doc(as('bob'), 'scheduleGroups', 'g1'),
    { time: '07:30', members: 4, booker: '홍길동', subCourse: '동코스', updatedAt: serverTimestamp() }));
  // 생성자 alice — 허용
  await assertSucceeds(updateDoc(doc(as('alice'), 'scheduleGroups', 'g1'),
    { members: 3, updatedAt: serverTimestamp() }));
  // 외부인 carol — 거부
  await assertFails(updateDoc(doc(as('carol'), 'scheduleGroups', 'g1'),
    { time: '09:00', updatedAt: serverTimestamp() }));
  // 구장 변경 — 잠김(삭제 후 재생성 전용). 거부
  await assertFails(updateDoc(doc(as('bob'), 'scheduleGroups', 'g1'),
    { course: '딴구장', updatedAt: serverTimestamp() }));
  // 날짜 변경 — 잠김. 거부
  await assertFails(updateDoc(doc(as('bob'), 'scheduleGroups', 'g1'),
    { date: '2026-08-01', updatedAt: serverTimestamp() }));
});

test('scheduleGroups: 수락(R3) — 수신자는 자기 uid만 memberUids 토글', async () => {
  await seed((db) => setDoc(doc(db, 'scheduleGroups', 'g1'), groupBase({ audienceUids: ['bob', 'carol'] })));
  // bob 본인 수락 — 허용
  await assertSucceeds(updateDoc(doc(as('bob'), 'scheduleGroups', 'g1'),
    { memberUids: arrayUnion('bob'), updatedAt: serverTimestamp() }));
  // bob 이 carol 을 멤버로 — 자기 토글 아님, 거부
  await assertFails(updateDoc(doc(as('bob'), 'scheduleGroups', 'g1'),
    { memberUids: arrayUnion('carol'), updatedAt: serverTimestamp() }));
});

test('scheduleGroups: 거절(R4)·탈퇴(R5) — 자기 uid만', async () => {
  await seed((db) => setDoc(doc(db, 'scheduleGroups', 'g1'), groupBase({ memberUids: ['alice', 'bob'] })));
  // 거절: 수신자가 declinedUids 에 자기 추가 (carol 은 audience)
  await seed((db) => updateDoc(doc(db, 'scheduleGroups', 'g1'), { audienceUids: ['bob', 'carol'] }));
  await assertSucceeds(updateDoc(doc(as('carol'), 'scheduleGroups', 'g1'),
    { declinedUids: arrayUnion('carol'), updatedAt: serverTimestamp() }));
  // 탈퇴: 멤버 bob 이 자기를 member 에서 빼고 declined 에 추가
  await assertSucceeds(updateDoc(doc(as('bob'), 'scheduleGroups', 'g1'),
    { memberUids: arrayRemove('bob'), declinedUids: arrayUnion('bob'), updatedAt: serverTimestamp() }));
});

test('scheduleGroups: 초대추가(R1) — initiator 가 audience 추가 + declined 제거', async () => {
  await seed((db) => setDoc(doc(db, 'scheduleGroups', 'g1'),
    groupBase({ audienceUids: ['bob'], declinedUids: ['carol'] })));
  // alice 가 carol 재초대: audience += carol, declined -= carol, 이름맵 보강
  await assertSucceeds(updateDoc(doc(as('alice'), 'scheduleGroups', 'g1'), {
    audienceUids: arrayUnion('carol'), declinedUids: arrayRemove('carol'),
    'names.carol': 'Carol', updatedAt: serverTimestamp(),
  }));
});

test('scheduleGroups: 초대추가(R1) — 수락 멤버(비-생성자)도 audience 추가 가능 (전원 동등·별도그룹 분기 방지)', async () => {
  // alice=생성자, bob=수락 멤버. bob 이 carol 을 같은 그룹에 초대 → 성공해야(예전엔 거부돼 별도 그룹으로 쪼개짐).
  await seed((db) => setDoc(doc(db, 'scheduleGroups', 'g1'),
    groupBase({ memberUids: ['alice', 'bob'], audienceUids: ['bob'] })));
  await assertSucceeds(updateDoc(doc(as('bob'), 'scheduleGroups', 'g1'), {
    audienceUids: arrayUnion('carol'), 'names.carol': 'Carol', updatedAt: serverTimestamp(),
  }));
});

test('scheduleGroups: 초대추가(R1) — 멤버·생성자 아닌 사람은 audience 추가 거부(미수락 invitee 포함)', async () => {
  // bob 은 아직 audience(초대만 받음)·미수락 → 멤버 아님. dave 는 무관한 외부인. 둘 다 초대 못 함.
  await seed((db) => setDoc(doc(db, 'scheduleGroups', 'g1'),
    groupBase({ memberUids: ['alice'], audienceUids: ['bob'] })));
  await assertFails(updateDoc(doc(as('bob'), 'scheduleGroups', 'g1'),
    { audienceUids: arrayUnion('carol'), updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(as('dave'), 'scheduleGroups', 'g1'),
    { audienceUids: arrayUnion('carol'), updatedAt: serverTimestamp() }));
});

// ── 회귀 가드: 우리가 분석한 "초대+인원증가" false-denial 방지 ──────────────
test('REGRESSION scheduleGroups: 초대(audience)+인원(members)을 한 write 로 묶으면 거부 → 반드시 분리', async () => {
  await seed((db) => setDoc(doc(db, 'scheduleGroups', 'g1'), groupBase()));
  // 한 번에 묶으면 어떤 규칙(R1 초대 / R2 내용)에도 안 맞아 거부 — 이게 통과하면 규칙이 느슨해진 것
  await assertFails(updateDoc(doc(as('alice'), 'scheduleGroups', 'g1'),
    { audienceUids: arrayUnion('carol'), members: 4, updatedAt: serverTimestamp() }));
});

test('REGRESSION scheduleGroups: 초대 → 인원증가를 두 write 로 나누면 둘 다 성공(실제 클라 동선)', async () => {
  await seed((db) => setDoc(doc(db, 'scheduleGroups', 'g1'), groupBase()));
  const alice = as('alice');
  // ① 초대 추가(R1)
  await assertSucceeds(updateDoc(doc(alice, 'scheduleGroups', 'g1'),
    { audienceUids: arrayUnion('carol'), updatedAt: serverTimestamp() }));
  // ② 인원 자동증가(R2, members 만) — bumpMembersAfterInvite 경로
  await assertSucceeds(updateDoc(doc(alice, 'scheduleGroups', 'g1'),
    { members: 3, updatedAt: serverTimestamp() }));
});

// =============================================================
// roundups — 라운지모집. 주최자 전체수정 / 참여자 자기토글 / 좋아요.
// =============================================================
const roundupBase = (over = {}) => ({
  authorUid: 'alice', authorName: 'Alice', type: 'fixed',
  course: '스카이72', date: '2026-07-20', day: '월', time: '05:40',
  teams: 1, capacity: 4, joined: 1, teamJoined: [1],
  participantUids: ['alice'], waitlistUids: [], anonymousUids: [],
  scope: 'friends', selectMode: null, selectedUids: [], audienceUids: [],
  closed: false, likedBy: [],
  createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  ...over,
});

test('roundups: 생성은 author==me + scope in [friends,select] (all 은 거부)', async () => {
  await assertSucceeds(setDoc(doc(as('alice'), 'roundups', 'r1'), roundupBase()));
  // scope='all' — 생성 차단(전체공개 비활성화 정책)
  await assertFails(setDoc(doc(as('alice'), 'roundups', 'r2'), roundupBase({ scope: 'all' })));
});

test('roundups: 참여자는 participantUids 자기 토글만, 남 토글·금지필드는 거부', async () => {
  await seed((db) => setDoc(doc(db, 'roundups', 'r1'), roundupBase()));
  // bob 참여 — 본인 추가 + joined
  await assertSucceeds(updateDoc(doc(as('bob'), 'roundups', 'r1'),
    { participantUids: arrayUnion('bob'), joined: 2, updatedAt: serverTimestamp() }));
  // bob 이 carol 을 명단에 — 자기 토글 아님, 거부
  await assertFails(updateDoc(doc(as('bob'), 'roundups', 'r1'),
    { participantUids: arrayUnion('carol'), updatedAt: serverTimestamp() }));
  // bob 이 정원(capacity) 변경 시도 — 허용필드 밖, 거부
  await assertFails(updateDoc(doc(as('bob'), 'roundups', 'r1'),
    { participantUids: arrayUnion('bob'), capacity: 8, updatedAt: serverTimestamp() }));
});

test('roundups: 좋아요는 likedBy 자기 토글만(updatedAt 없이)', async () => {
  await seed((db) => setDoc(doc(db, 'roundups', 'r1'), roundupBase()));
  // carol 응원 — likedBy 에 자기만
  await assertSucceeds(updateDoc(doc(as('carol'), 'roundups', 'r1'),
    { likedBy: arrayUnion('carol') }));
  // 남(bob) 을 likedBy 에 — 거부
  await assertFails(updateDoc(doc(as('carol'), 'roundups', 'r1'),
    { likedBy: arrayUnion('bob') }));
});

test('roundups: 주최자는 전체 수정 가능, 비주최자 삭제는 거부', async () => {
  await seed((db) => setDoc(doc(db, 'roundups', 'r1'), roundupBase()));
  // 주최자 alice — 제목·정원 등 자유 수정
  await assertSucceeds(updateDoc(doc(as('alice'), 'roundups', 'r1'),
    { course: '레인보우힐스', capacity: 8, closed: true, updatedAt: serverTimestamp() }));
  // 비주최자 bob 삭제 — 거부
  await assertFails(deleteDoc(doc(as('bob'), 'roundups', 'r1')));
  // 주최자 삭제 — 허용
  await assertSucceeds(deleteDoc(doc(as('alice'), 'roundups', 'r1')));
});
