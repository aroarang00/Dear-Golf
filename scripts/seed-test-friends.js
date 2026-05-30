// 테스트 친구·모집글 시딩 — 단일 기기에서 라운지 친구모집 검증용 (출시 전 테스트 전용).
//
// 보안규칙을 그대로 준수한다:
//   · 테스트 친구(익명 계정)가 TARGET(사장님 계정)에게 친구신청(pending) 전송
//   · 테스트 친구 명의로 friends/all scope 모집글 작성
//   → 사장님이 앱에서 친구신청을 "수락"하면 friends 모집글이 라운지 친구탭에 보임.
//     all scope 모집글은 수락 전에도 전체탭에 바로 보임(시딩 확인용).
//
// 사용: node scripts/seed-test-friends.js <TARGET_UID>
//   TARGET_UID = 사장님이 카카오로 로그인한 Firebase uid (dev 로그 [MY UID] 값)
//
// 정리: 생성된 doc id는 .seed-output.json에 기록. 출시 전 Firebase 콘솔에서 삭제하거나
//       firebase-admin 확보 후 일괄 삭제.

const fs = require('fs');
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously, signOut } = require('firebase/auth');
const {
  getFirestore, doc, setDoc, collection, addDoc, serverTimestamp,
} = require('firebase/firestore');

// ── .env 로드 (간단 파서) ─────────────────────────────
const env = {};
const envText = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}

const config = {
  apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const TARGET = process.argv[2];
if (!TARGET) {
  console.error('Usage: node scripts/seed-test-friends.js <TARGET_UID>');
  process.exit(1);
}

const pairId = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
const WD = ['일', '월', '화', '수', '목', '금', '토'];
function futureDate(daysAhead) {
  const dt = new Date(Date.now() + daysAhead * 86400000);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return { date: `${y}.${m}.${d}`, day: WD[dt.getDay()] };
}

function roundupDoc({ uid, name, course, region, daysAhead, time, scope, word }) {
  const fd = futureDate(daysAhead);
  return {
    authorUid: uid, authorName: name, type: 'fixed',
    course, courseKakaoId: null,
    date: fd.date, day: fd.day, time,
    teams: 1, capacity: 4, joined: 1, teamJoined: [1],
    participantUids: [uid], waitlistUids: [],
    scope, closed: false, word,
    kakaoOpenChatUrl: null, ageGroup: null, companion: null, skill: null,
    region, tags: [], openTime: null,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  };
}

const FRIENDS = [
  { nickname: '김테스트', course: '레이크사이드CC', region: '경기', daysAhead: 5, time: '06:40', word: '주말 즐겁게 한 라운드 해요 :)' },
  { nickname: '박골프',   course: '남서울CC',     region: '서울', daysAhead: 9, time: '12:20', word: '편하게 치실 분 환영합니다' },
];

(async () => {
  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const out = { target: TARGET, friends: [], friendships: [], roundups: [] };

  for (const f of FRIENDS) {
    await signOut(auth).catch(() => {});
    const cred = await signInAnonymously(auth);
    const T = cred.user.uid;
    out.friends.push({ nickname: f.nickname, uid: T });

    // 1) 테스트 친구 users 문서
    await setDoc(doc(db, 'users', T), {
      uid: T, nickname: f.nickname, blockedUids: [],
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });

    // 2) 친구신청 (pending) — TARGET이 앱에서 수락하면 accepted
    const fid = pairId(T, TARGET);
    await setDoc(doc(db, 'friendships', fid), {
      users: [T, TARGET], requesterUid: T, recipientUid: TARGET,
      status: 'pending', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    out.friendships.push({ id: fid, from: f.nickname });

    // 3) 친구공개 모집글
    const r1 = await addDoc(collection(db, 'roundups'), roundupDoc({
      uid: T, name: f.nickname, course: f.course, region: f.region,
      daysAhead: f.daysAhead, time: f.time, scope: 'friends', word: f.word,
    }));
    out.roundups.push({ id: r1.id, scope: 'friends', author: f.nickname });
    console.log(`[seed] ${f.nickname} (uid ${T.slice(0, 6)}…) → 친구신청 + 친구공개 모집글 ${r1.id}`);
  }

  // 4) 전체공개 모집글 1개 — 라운지 '전체' 탭 확인용 (마지막 친구 명의, 수락 전에도 보임)
  const lastFriend = out.friends[out.friends.length - 1];
  const r2 = await addDoc(collection(db, 'roundups'), roundupDoc({
    uid: lastFriend.uid, name: lastFriend.nickname, course: '제이드팰리스GC',
    region: '강원', daysAhead: 7, time: '07:10', scope: 'all',
    word: '전체공개 테스트 모집입니다',
  }));
  out.roundups.push({ id: r2.id, scope: 'all', author: lastFriend.nickname });
  console.log(`[seed] 전체공개 모집글 ${r2.id} (${lastFriend.nickname})`);

  fs.writeFileSync(path.join(__dirname, '.seed-output.json'), JSON.stringify(out, null, 2));
  console.log('\n=== 시딩 완료 ===');
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
})().catch((e) => {
  console.error('SEED FAIL', e?.code || '', e?.message || e);
  process.exit(1);
});
