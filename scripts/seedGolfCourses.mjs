// =============================================================
// 전국 골프장 마스터 — Firestore 시딩
// 출처: 공공데이터 전국 골프장(이름·주소·홀·구분) → 카카오 로컬 매칭(scripts/match_golf.js)
// 입력: scripts/golf_master.json (477개, 중복0·좌표누락0 검증 완료)
//
// 실행:  node scripts/seedGolfCourses.mjs
// 컬렉션: golfCourses
// 문서ID: kakaoId (고유키) → 재실행 멱등(덮어쓰기만, 중복 생성 없음)
// 필드:   kakaoId · name(카카오 정식명) · input(공공데이터 원본명, 별칭검색용)
//         region · addr(공공데이터 주소) · road(카카오 도로명) · x · y · source · updatedAt
// =============================================================
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, writeBatch, getCountFromServer, collection } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';

const __dirname = dirname(fileURLToPath(import.meta.url));

// src/constants/api.js 의 FIREBASE_CONFIG 와 동일 (apiKey는 공개되어도 무방)
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCLIFX7lHlhpAVBpycNRLJBoLfdF_xArZE',
  authDomain: 'dear-golf.firebaseapp.com',
  projectId: 'dear-golf',
  storageBucket: 'dear-golf.firebasestorage.app',
  messagingSenderId: '16566595645',
  appId: '1:16566595645:web:064cc5d3c707a62b123a54',
};

const SOURCE = '공공데이터 전국 골프장 + 카카오 로컬 매칭';
const CHUNK = 400; // 배치 한도 500 — 여유 두고 분할

const COURSES = JSON.parse(readFileSync(join(__dirname, 'golf_master.json'), 'utf-8'));

// ─ 시딩 전 무결성 재검증 (안전장치) ─
function validate() {
  const ids = new Set();
  for (const c of COURSES) {
    if (!c.kakaoId || !c.name || !c.region) throw new Error(`필수 필드 누락: ${JSON.stringify(c)}`);
    if (!(parseFloat(c.x) > 0) || !(parseFloat(c.y) > 0)) throw new Error(`좌표 이상: ${c.name}`);
    if (ids.has(c.kakaoId)) throw new Error(`kakaoId 중복: ${c.kakaoId} (${c.name})`);
    ids.add(c.kakaoId);
  }
  console.log(`✔ 무결성 검증 통과 — ${COURSES.length}개, kakaoId 고유 ${ids.size}개`);
}

async function main() {
  validate();

  const app = initializeApp(FIREBASE_CONFIG);
  const db = getFirestore(app);
  const auth = getAuth(app);

  await signInAnonymously(auth);
  console.log('익명 로그인 완료 — uid:', auth.currentUser?.uid);

  const now = new Date().toISOString();
  let written = 0;
  for (let i = 0; i < COURSES.length; i += CHUNK) {
    const slice = COURSES.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    for (const c of slice) {
      batch.set(doc(db, 'golfCourses', String(c.kakaoId)), {
        kakaoId: String(c.kakaoId),
        name: c.name,
        input: c.input || c.name,
        region: c.region,
        addr: c.addr || '',
        road: c.road || '',
        x: parseFloat(c.x),
        y: parseFloat(c.y),
        source: SOURCE,
        updatedAt: now,
      });
    }
    await batch.commit();
    written += slice.length;
    console.log(`  배치 커밋: ${written}/${COURSES.length}`);
  }

  // ─ 시딩 후 서버 카운트 검증 (안전장치) ─
  const snap = await getCountFromServer(collection(db, 'golfCourses'));
  const serverCount = snap.data().count;
  console.log(`\n✅ golfCourses 시딩 완료 — 쓰기 ${written}개 / 서버 문서 ${serverCount}개`);
  if (serverCount !== COURSES.length) {
    console.warn(`⚠️ 서버 문서 수(${serverCount})가 마스터(${COURSES.length})와 다릅니다. 잔존 문서 확인 필요.`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ 시딩 실패:', e?.code || '', e?.message || e);
  if (e?.code === 'permission-denied') {
    console.error('\n→ Firestore 보안 규칙이 쓰기를 막고 있습니다.');
    console.error('  시딩 동안만 golfCourses write 를 임시 허용 후 다시 실행하세요:');
    console.error('  match /golfCourses/{doc} { allow read: if isSignedIn(); allow write: if true; }');
    console.error('  (시딩 완료 후 write 를 false 로 되돌려 배포)');
  }
  process.exit(1);
});
