// 익명(Anonymous) Firebase Auth 계정 일괄 정리 — 개발/테스트 중 쌓인 노이즈 청소용.
//
// 왜 필요한가: 앱이 실행/설치/dev 리셋/탈퇴 후 재시작마다 signInAnonymously로 익명 계정을
//   새로 만들기 때문에, 테스터가 몇 명이어도 Auth 목록이 수백 개로 불어난다.
//   카카오 연동(providerData 있음)된 진짜 계정은 절대 건드리지 않고, 'provider 없는 익명'만 정리.
//
// ── 안전장치 ──────────────────────────────────────────────
//   1) 기본은 DRY RUN — 무엇을 지울지 출력만. 실제 삭제는 `--delete` 플래그를 줘야 함.
//   2) providerData가 하나라도 있으면(카카오 등) 건너뜀 — 익명만 대상.
//   3) 최근 활동(lastRefresh) MIN_AGE_DAYS일 이내면 건너뜀 — 지금 쓰는 테스터 익명 보호.
//   4) PROTECT_UIDS에 든 uid는 무조건 건너뜀.
//
// ── 준비 ──────────────────────────────────────────────────
//   1) Admin SDK 설치:  npm i -D firebase-admin
//   2) 서비스 계정 키 발급:
//        Firebase 콘솔 → 프로젝트 설정(⚙) → 서비스 계정 → "새 비공개 키 생성"
//        → 받은 JSON을 scripts/serviceAccountKey.json 으로 저장 (★.gitignore 확인, 절대 커밋 금지)
//      또는 환경변수로:  export GOOGLE_APPLICATION_CREDENTIALS=/경로/key.json
//
// ── 사용 ──────────────────────────────────────────────────
//   미리보기(삭제 안 함):  node scripts/delete-anon-users.js
//   최근 14일 보호로:       node scripts/delete-anon-users.js --min-age-days=14
//   실제 삭제:             node scripts/delete-anon-users.js --delete
//
// 안전하게: 먼저 옵션 없이 돌려 목록·개수를 확인하고, 납득되면 --delete 를 붙여 다시 실행.

const path = require('path');
const admin = require('firebase-admin');

// ── 설정 ──────────────────────────────────────────────────
// 최근 이 일수 이내에 활동(lastRefresh)한 익명은 보호(지우지 않음). 활성 테스터 익명 보호용.
const DEFAULT_MIN_AGE_DAYS = 7;
// 절대 지우면 안 되는 uid (카카오 계정은 providerData로도 걸러지지만 이중 안전).
const PROTECT_UIDS = new Set([
  'm3SXUQw1ISRkcYDcjbDY3vZqStG2', // #2 진짜 카카오 dev 계정
]);

// ── 인자 파싱 ──────────────────────────────────────────────
const argv = process.argv.slice(2);
const DO_DELETE = argv.includes('--delete');
const ageArg = argv.find(a => a.startsWith('--min-age-days='));
const MIN_AGE_DAYS = ageArg ? Number(ageArg.split('=')[1]) : DEFAULT_MIN_AGE_DAYS;
if (Number.isNaN(MIN_AGE_DAYS) || MIN_AGE_DAYS < 0) {
  console.error('잘못된 --min-age-days 값:', ageArg);
  process.exit(1);
}

// ── Admin 초기화 ──────────────────────────────────────────
// 우선순위: scripts/serviceAccountKey.json → GOOGLE_APPLICATION_CREDENTIALS(applicationDefault)
function initAdmin() {
  const keyPath = path.join(__dirname, 'serviceAccountKey.json');
  try {
    const serviceAccount = require(keyPath);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log('인증: serviceAccountKey.json');
    return;
  } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') throw e;
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
    console.log('인증: GOOGLE_APPLICATION_CREDENTIALS');
    return;
  }
  console.error('\n❌ 서비스 계정 키를 찾을 수 없습니다.');
  console.error('   scripts/serviceAccountKey.json 을 두거나 GOOGLE_APPLICATION_CREDENTIALS 환경변수를 설정하세요.');
  console.error('   (콘솔 → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성)\n');
  process.exit(1);
}

// 활동 기준 시각(ms) — lastRefresh > lastSignIn > creation 순으로 가장 최근 값.
function lastActiveMs(user) {
  const m = user.metadata || {};
  const t = m.lastRefreshTime || m.lastSignInTime || m.creationTime;
  return t ? new Date(t).getTime() : 0;
}

async function main() {
  initAdmin();
  const auth = admin.auth();
  const nowMs = Date.now();
  const ageCutoffMs = nowMs - MIN_AGE_DAYS * 24 * 3600 * 1000;

  const toDelete = [];
  let total = 0, linked = 0, recent = 0, protectedCnt = 0;

  // 전체 사용자 페이지네이션(1000개씩).
  let pageToken;
  do {
    const res = await auth.listUsers(1000, pageToken);
    for (const u of res.users) {
      total++;
      const isAnon = !u.providerData || u.providerData.length === 0;
      if (!isAnon) { linked++; continue; }              // 카카오 등 연동 계정 → 보존
      if (PROTECT_UIDS.has(u.uid)) { protectedCnt++; continue; }
      if (lastActiveMs(u) > ageCutoffMs) { recent++; continue; } // 최근 활동 익명 → 보호
      toDelete.push(u.uid);
    }
    pageToken = res.pageToken;
  } while (pageToken);

  console.log('\n── 스캔 결과 ───────────────────────────────');
  console.log(`전체 계정        : ${total}`);
  console.log(`연동(보존)       : ${linked}  (카카오 등 providerData 있음)`);
  console.log(`보호목록(보존)   : ${protectedCnt}`);
  console.log(`최근활동 익명(보존): ${recent}  (최근 ${MIN_AGE_DAYS}일 이내)`);
  console.log(`삭제 대상 익명   : ${toDelete.length}`);
  console.log('────────────────────────────────────────────');

  if (toDelete.length === 0) {
    console.log('지울 대상이 없습니다.');
    return;
  }

  if (!DO_DELETE) {
    console.log('\n[DRY RUN] 실제로는 아무것도 지우지 않았습니다.');
    console.log('삭제하려면 다시 실행:  node scripts/delete-anon-users.js --delete');
    console.log('대상 uid 미리보기(최대 20개):');
    toDelete.slice(0, 20).forEach(uid => console.log('  -', uid));
    if (toDelete.length > 20) console.log(`  ... 외 ${toDelete.length - 20}개`);
    return;
  }

  // 실제 삭제 — deleteUsers는 1회 최대 1000개.
  console.log(`\n🗑  삭제 시작: ${toDelete.length}개 ...`);
  let success = 0, failure = 0;
  for (let i = 0; i < toDelete.length; i += 1000) {
    const batch = toDelete.slice(i, i + 1000);
    const r = await auth.deleteUsers(batch);
    success += r.successCount;
    failure += r.failureCount;
    if (r.failureCount > 0) {
      r.errors.forEach(e => console.warn(`  실패 [idx ${i + e.index}]:`, e.error.message));
    }
    console.log(`  진행: ${Math.min(i + 1000, toDelete.length)}/${toDelete.length}`);
  }
  console.log(`\n✅ 완료 — 성공 ${success} · 실패 ${failure}`);
  console.log('※ 이 스크립트는 Auth 계정만 지웁니다. Firestore/Storage 데이터는 건드리지 않아요.');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
