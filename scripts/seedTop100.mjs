// =============================================================
// 한국골프관광협회 2024-2025 제2회 한국 100대 골프코스 — Firestore 시딩
// 출처: 파골프 http://www.pargolf.co.kr/news/articleView.html?idxno=3432
//
// 실행:  node scripts/seedTop100.mjs
// 컬렉션: top100Courses
// 문서ID: 순위 3자리 제로패딩 ('001' ~ '100')  → 사전순 정렬 = 순위순
// 필드:   rank(번호) · name(골프장명) · region(지역) · source · updatedAt
// =============================================================
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, writeBatch } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';

// src/constants/api.js 의 FIREBASE_CONFIG 와 동일 (apiKey는 공개되어도 무방)
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCLIFX7lHlhpAVBpycNRLJBoLfdF_xArZE',
  authDomain: 'dear-golf.firebaseapp.com',
  projectId: 'dear-golf',
  storageBucket: 'dear-golf.firebasestorage.app',
  messagingSenderId: '16566595645',
  appId: '1:16566595645:web:064cc5d3c707a62b123a54',
};

const SOURCE = '한국골프관광협회 2024-2025 제2회 한국 100대 골프코스';

const COURSES = [
  { rank: 1,   name: '클럽나인브릿지',            region: '제주' },
  { rank: 2,   name: '사우스케이프오너스',        region: '경남 남해' },
  { rank: 3,   name: '잭니클라우스 골프클럽 코리아', region: '인천' },
  { rank: 4,   name: '안양 컨트리클럽',           region: '경기 군포' },
  { rank: 5,   name: '휘슬링락 컨트리클럽',        region: '강원 춘천' },
  { rank: 6,   name: '트리니티 클럽',             region: '경기 여주' },
  { rank: 7,   name: '제이드팰리스 골프클럽',      region: '강원 춘천' },
  { rank: 8,   name: '핀크스 골프클럽',           region: '제주' },
  { rank: 9,   name: '더헤븐 컨트리클럽',         region: '경기 안산' },
  { rank: 10,  name: '우정힐스 컨트리클럽',        region: '충남 천안' },
  { rank: 11,  name: '웰링턴 컨트리클럽',         region: '경기 이천' },
  { rank: 12,  name: '파인비치 골프링크스',        region: '전남 해남' },
  { rank: 13,  name: '블랙스톤 제주',             region: '제주' },
  { rank: 14,  name: '해슬리 나인브릿지',          region: '경기 여주' },
  { rank: 15,  name: '아난티코드',                region: '경기 가평' },
  { rank: 16,  name: '라비에벨 골프 & 리조트',     region: '강원 춘천' },
  { rank: 17,  name: '사우스스프링스 컨트리클럽',  region: '경기 이천' },
  { rank: 18,  name: '이스트밸리 컨트리클럽',      region: '경기 광주' },
  { rank: 19,  name: '페럼클럽',                  region: '경기 여주' },
  { rank: 20,  name: '세이지우드 홍천',           region: '강원 홍천' },
  { rank: 21,  name: '클럽72',                    region: '인천' },
  { rank: 22,  name: '소노펠리체 컨트리클럽',      region: '강원 홍천' },
  { rank: 23,  name: '가평베네스트 골프클럽',      region: '경기 가평' },
  { rank: 24,  name: '설해원골프',                region: '강원 양양' },
  { rank: 25,  name: '블루원 상주 골프리조트',     region: '경북 상주' },
  { rank: 26,  name: '블랙스톤 이천 골프클럽',     region: '경기 이천' },
  { rank: 27,  name: '롯데스카이힐 컨트리클럽 제주', region: '제주' },
  { rank: 28,  name: '동래베네스트 골프클럽',      region: '부산' },
  { rank: 29,  name: '한성컨트리클럽',            region: '경기 용인' },
  { rank: 30,  name: '렉스필드 컨트리클럽',        region: '경기 여주' },
  { rank: 31,  name: '성문안',                    region: '강원 원주' },
  { rank: 32,  name: '카스카디아',                region: '강원 홍천' },
  { rank: 33,  name: '서원밸리 컨트리클럽',        region: '경기 파주' },
  { rank: 34,  name: '베어크리크 춘천',           region: '강원 춘천' },
  { rank: 35,  name: '베어즈 베스트청라 골프클럽', region: '인천' },
  { rank: 36,  name: '드비치 골프클럽',           region: '경남 거제' },
  { rank: 37,  name: '테디밸리 골프&리조트',       region: '제주' },
  { rank: 38,  name: '몽베르 컨트리클럽',         region: '경기 포천' },
  { rank: 39,  name: '남촌골프클럽',              region: '경기 광주' },
  { rank: 40,  name: '세이지우드 여수경도',        region: '전남 여수' },
  { rank: 41,  name: '남서울 컨트리클럽',         region: '경기 성남' },
  { rank: 42,  name: '더스타휴 골프&리조트',       region: '경기 양평' },
  { rank: 43,  name: '킹즈락 컨트리클럽',         region: '충북 제천' },
  { rank: 44,  name: '마에스트로 컨트리클럽',      region: '경기 안성' },
  { rank: 45,  name: '휘닉스 평창 컨트리클럽',     region: '강원 평창' },
  { rank: 46,  name: '송추 컨트리클럽',           region: '경기 양주' },
  { rank: 47,  name: '골든베이 골프 & 리조트',     region: '충남 태안' },
  { rank: 48,  name: '크리스탈밸리 컨트리클럽',    region: '경기 가평' },
  { rank: 49,  name: '일동레이크 골프클럽',        region: '경기 포천' },
  { rank: 50,  name: '웰리힐리 컨트리클럽',        region: '강원 횡성' },
  { rank: 51,  name: '화산 컨트리클럽',           region: '경기 용인' },
  { rank: 52,  name: '베이사이드 골프클럽',        region: '부산' },
  { rank: 53,  name: '한양 컨트리클럽',           region: '경기 고양' },
  { rank: 54,  name: '골프존카운티 감포',         region: '경북 경주' },
  { rank: 55,  name: '샌드파인 골프클럽',         region: '강원 강릉' },
  { rank: 56,  name: '오크밸리 컨트리클럽',        region: '강원 원주' },
  { rank: 57,  name: '천룡 컨트리 클럽',          region: '충북 진천' },
  { rank: 58,  name: '힐드로사이 컨트리클럽',      region: '강원 홍천' },
  { rank: 59,  name: '가야 컨트리클럽',           region: '경남 김해' },
  { rank: 60,  name: '레인보우힐스 컨트리클럽',    region: '충북 음성' },
  { rank: 61,  name: '해내다컨트리클럽',          region: '경북 경산' },
  { rank: 62,  name: '블루헤런 골프클럽',         region: '경기 여주' },
  { rank: 63,  name: '아난티 클럽 제주',          region: '제주' },
  { rank: 64,  name: '엘리시안 강촌 컨트리클럽',   region: '강원 춘천' },
  { rank: 65,  name: '곤지암 골프클럽',           region: '경기 광주' },
  { rank: 66,  name: '파인리지 리조트',           region: '강원 고성' },
  { rank: 67,  name: '마이다스밸리 청평골프클럽',  region: '경기 가평' },
  { rank: 68,  name: '버치힐 골프클럽',           region: '강원 평창' },
  { rank: 69,  name: '베어크리크 포천 골프클럽',   region: '경기 포천' },
  { rank: 70,  name: '포라이즌',                  region: '전남 순천' },
  { rank: 71,  name: '에이원 컨트리클럽',         region: '경남 양산' },
  { rank: 72,  name: '라데나 골프클럽',           region: '강원 춘천' },
  { rank: 73,  name: '골드레이크 컨트리클럽',      region: '전남 나주' },
  { rank: 74,  name: '대구 컨트리클럽',           region: '경북 경산' },
  { rank: 75,  name: '골프존카운티 무주',         region: '전북 무주' },
  { rank: 76,  name: '동부산 컨트리클럽',         region: '경남 양산' },
  { rank: 77,  name: '아시아나 컨트리클럽',        region: '경기 용인' },
  { rank: 78,  name: '덕유산 컨트리클럽',         region: '전북 무주' },
  { rank: 79,  name: '뉴서울 컨트리클럽',         region: '경기 광주' },
  { rank: 80,  name: '정산 컨트리클럽',           region: '경남 김해' },
  { rank: 81,  name: '전주 샹그릴라 컨트리클럽',   region: '전북 임실' },
  { rank: 82,  name: '캐슬렉스 제주 골프클럽',     region: '제주' },
  { rank: 83,  name: '스톤비치 컨트리클럽',        region: '충남 태안' },
  { rank: 84,  name: '센테리움 컨트리클럽',        region: '충북 충주' },
  { rank: 85,  name: '서라벌 골프클럽',           region: '경북 경주' },
  { rank: 86,  name: '알펜시아 컨트리클럽',        region: '강원 평창' },
  { rank: 87,  name: '유성컨트리클럽',            region: '대전' },
  { rank: 88,  name: '안성베네스트 골프클럽',      region: '경기 안성' },
  { rank: 89,  name: '보라 컨트리클럽',           region: '울산' },
  { rank: 90,  name: '양평TPC 골프클럽',          region: '경기 양평' },
  { rank: 91,  name: '천안상록컨트리클럽',         region: '충남 천안' },
  { rank: 92,  name: '마이다스레이크 이천 골프앤리조트', region: '경기 이천' },
  { rank: 93,  name: '아도니스 컨트리클럽',        region: '경기 포천' },
  { rank: 94,  name: '내장산 골프&리조트',         region: '전북 정읍' },
  { rank: 95,  name: '아난티 남해 골프클럽',       region: '경남 남해' },
  { rank: 96,  name: '군산 골프 & 리조트',         region: '전북 군산' },
  { rank: 97,  name: '센추리21 컨트리클럽',        region: '강원 원주' },
  { rank: 98,  name: '고창 컨트리클럽',           region: '전북 고창' },
  { rank: 99,  name: '백제 컨트리클럽',           region: '충남 부여' },
  { rank: 100, name: '장수골프리조트',            region: '전북 장수' },
];

async function main() {
  if (COURSES.length !== 100) {
    throw new Error(`골프장 수가 100개가 아닙니다: ${COURSES.length}개`);
  }

  const app = initializeApp(FIREBASE_CONFIG);
  const db = getFirestore(app);
  const auth = getAuth(app);

  await signInAnonymously(auth);
  console.log('익명 로그인 완료 — uid:', auth.currentUser?.uid);

  // Firestore 배치 쓰기 한도는 500 — 100개라 한 번에 커밋
  const batch = writeBatch(db);
  const now = new Date().toISOString();
  for (const c of COURSES) {
    const id = String(c.rank).padStart(3, '0');
    batch.set(doc(db, 'top100Courses', id), {
      rank: c.rank,
      name: c.name,
      region: c.region,
      source: SOURCE,
      updatedAt: now,
    });
  }
  await batch.commit();

  console.log(`✅ top100Courses 컬렉션에 ${COURSES.length}개 문서 시딩 완료`);
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ 시딩 실패:', e?.code || '', e?.message || e);
  if (e?.code === 'permission-denied') {
    console.error('\n→ Firestore 보안 규칙이 쓰기를 막고 있습니다.');
    console.error('  Firebase 콘솔 → Firestore → 규칙에 아래를 임시 추가 후 다시 실행하세요:');
    console.error('  match /top100Courses/{doc} { allow read: if true; allow write: if true; }');
    console.error('  (시딩 완료 후 write 를 false 로 되돌리세요)');
  }
  process.exit(1);
});
