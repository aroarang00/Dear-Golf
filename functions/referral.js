// =============================================================
// §H 초대 보상 지급 — [[referral-reward-implementation-plan]] 3단계 (지급 CF + 야간 스위퍼)
//
// 정책([[monetization-plan]] 2026-07-04 확정):
//   초대 1건 = 초대자·신규 가입자 '양방향' 저장공간 +20장/+1개.
//   개인 기본 사진200·영상10 → 최대 500/30 클램프(넘치면 클램프만, 지급 자체는 기록됨).
//   지급 단위 = 신규 가입자의 카카오 계정(kakaoSub) 1회 — 익명 uid는 무한 생성 가능하므로 uid 기준 지급 금지.
//
// 구조 3원칙(계획 문서 그대로):
//   ① 클라=기록만(users.referredBy), 지급=여기 서버 단일 경로 — 클라 영속 버그가 지급에 못 닿음
//   ② 원장 referralClaims/{newKakaoSub} + 멱등 트랜잭션 — 트리거 재전송·스위퍼 중복 실행에도 정확히 1회
//   ③ 트리거(1차, users 문서) + 야간 스위퍼(2차) 이중화 — 트리거가 죽어도 하루 안에 결과가 맞아짐
//
// 판정 결과는 users/{uid}.referralAward = { status:'awarded'|'denied', reason?, at }로 도장 —
//   트리거·스위퍼의 무한 재시도 차단. 이 필드는 rules가 클라 변조 차단(sanctionFieldsUnchanged).
//   클라가 지워도(불가하지만) 원장이 남아 재지급은 구조적으로 불가.
//
// 푸시·인앱 알림 없음(의도) — 잠복 배포 중이라 발표 전 보상 노출 금지. 첫 업데이트에서
//   쿼터 UI·"초대하면 늘어나는 저장공간" 발표와 함께 알림 추가.
//
// 테스트 리셋(다계정 검증): 콘솔에서 referralClaims/{kakaoSub} 삭제 + 양쪽 users.entitlements·
//   referralAward 원복 → 스위퍼(또는 users 아무 write)가 재지급.
// =============================================================

const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');

const db = getFirestore();

// 저장공간 정책 숫자 — src/utils/entitlements.js DEFAULT_ENTITLEMENTS와 이름·기본값 동기 유지.
const BASE_PHOTOS = 200;
const BASE_VIDEOS = 10;
const BONUS_PHOTOS = 20;
const BONUS_VIDEOS = 1;
const CAP_PHOTOS = 500;
const CAP_VIDEOS = 30;

// entitlements에 초대 보너스 1건 반영 — 다른 키(maxCrews 등)는 보존, 없으면 기본값에서 출발.
function bumpQuota(ent) {
  const e = ent && typeof ent === 'object' ? ent : {};
  const photos = Number.isFinite(e.maxPhotos) ? e.maxPhotos : BASE_PHOTOS;
  const videos = Number.isFinite(e.maxVideos) ? e.maxVideos : BASE_VIDEOS;
  return {
    ...e,
    maxPhotos: Math.min(photos + BONUS_PHOTOS, CAP_PHOTOS),
    maxVideos: Math.min(videos + BONUS_VIDEOS, CAP_VIDEOS),
  };
}

// 지급 판정+실행 — 단일 트랜잭션(원자). 반환 { status: 'awarded'|'denied'|'skip', reason }.
//   'skip' = 아직 조건 미성립(카카오 미연동 등) → 도장 안 찍음(나중에 다시 시도됨).
//   'denied' = 영구 불가(자기초대·이미 지급된 카카오 계정 등) → denied 도장(재시도 종결).
//   모든 read를 write보다 먼저 — Firestore 트랜잭션 규칙. 동시 지급(같은 초대자에게 신규 2명 동시)은
//   트랜잭션 충돌 재시도로 직렬화돼 증분 유실 없음.
async function awardReferral(newUid) {
  return db.runTransaction(async (tx) => {
    const newRef = db.doc(`users/${newUid}`);
    const newSnap = await tx.get(newRef);
    if (!newSnap.exists) return { status: 'skip', reason: 'user-gone' };
    const u = newSnap.data();

    if (u.referralAward) return { status: 'skip', reason: 'already-resolved' };
    if (!u.referredBy) return { status: 'skip', reason: 'no-referral' };
    // 카카오 미연동 — 지급 보류(도장 X). 연동되면 users write 트리거가, 놓치면 스위퍼가 재시도.
    if (!u.kakaoId) return { status: 'skip', reason: 'no-kakao' };
    const kakaoSub = String(u.kakaoId);

    const deny = (reason) => {
      tx.set(newRef, {
        referralAward: { status: 'denied', reason, at: FieldValue.serverTimestamp() },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return { status: 'denied', reason };
    };

    // 코드 → 초대자 해석 (refCodes = 진실원, create-only 규칙이라 재매핑 불가)
    const codeSnap = await tx.get(db.doc(`refCodes/${u.referredBy}`));
    if (!codeSnap.exists) return deny('code-not-found');
    const inviterUid = codeSnap.data().uid;
    if (!inviterUid || inviterUid === newUid) return deny('self-uid');

    const inviterSnap = await tx.get(db.doc(`users/${inviterUid}`));
    if (!inviterSnap.exists) return deny('inviter-gone');
    const inviter = inviterSnap.data();
    // 자기초대 — 탈퇴 후 재가입(새 uid, 같은 카카오)으로 본인 코드 입력하는 케이스까지 차단.
    if (inviter.kakaoId && String(inviter.kakaoId) === kakaoSub) return deny('self-kakao');

    // 원장 — 이 카카오 계정으로 이미 지급됐으면 영구 거부(탈퇴→재가입 반복 무한 지급 차단).
    const claimRef = db.doc(`referralClaims/${kakaoSub}`);
    const claimSnap = await tx.get(claimRef);
    if (claimSnap.exists) return deny('already-claimed');

    // ---- 여기부터 write: 원장 도장 + 양방향 지급 + awarded 도장 (전부 원자) ----
    tx.create(claimRef, {
      kakaoSub,
      newUid,
      inviterUid,
      inviterKakaoSub: inviter.kakaoId ? String(inviter.kakaoId) : null,
      code: u.referredBy,
      awardedAt: FieldValue.serverTimestamp(),
    });
    tx.set(newRef, {
      entitlements: bumpQuota(u.entitlements),
      referralAward: { status: 'awarded', inviterUid, at: FieldValue.serverTimestamp() },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.set(inviterSnap.ref, {
      entitlements: bumpQuota(inviter.entitlements),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { status: 'awarded', reason: '' };
  });
}

// 1차 — users 문서 트리거. 신규 가입 시 referredBy(온보딩 입력)와 kakaoId(카카오 연동)가 어느 순서로
//   오든, 둘 다 갖춰지는 write에서 발화. 판정 완료(referralAward)면 즉시 종료라 평시 users write 비용 미미.
exports.onUserWrittenForReferral = onDocumentWritten('users/{uid}', async (event) => {
  const after = event.data?.after?.exists ? event.data.after.data() : null;
  if (!after) return;                                 // 삭제 이벤트
  if (!after.referredBy || !after.kakaoId) return;    // 지급 조건 미성립(대기)
  if (after.referralAward) return;                    // 이미 판정됨(지급/거부)
  try {
    const r = await awardReferral(event.params.uid);
    if (r.status !== 'skip') logger.info('[referral] trigger', event.params.uid, r.status, r.reason || '');
  } catch (e) {
    logger.warn('[referral] trigger fail', event.params.uid, e?.message);   // 스위퍼가 다음 날 수습
  }
});

// 2차 — 야간 스위퍼(매일 04:40 KST, 다른 tick들과 시간 분산). '기록 있고 미판정' 계정을 일괄 청소:
//   트리거 유실·일시 오류 소급 + 이 CF 배포 시점 이전(잠복 기간)에 쌓인 기록 소급 지급도 이 경로.
//   referredBy는 6자 코드 문자열이라 '>' '' 범위쿼리로 필드 보유 문서만 조회(단일 필드 자동 인덱스).
exports.referralSweepTick = onSchedule({ schedule: '40 4 * * *', timeZone: 'Asia/Seoul' }, async () => {
  try {
    const snap = await db.collection('users').where('referredBy', '>', '').limit(500).get();
    let awarded = 0, denied = 0, waiting = 0;
    for (const d of snap.docs) {
      const u = d.data();
      if (u.referralAward) continue;                  // 판정 완료 — 볼 것 없음
      if (!u.kakaoId) { waiting++; continue; }        // 카카오 연동 대기 — 내일 다시
      try {
        const r = await awardReferral(d.id);
        if (r.status === 'awarded') awarded++;
        else if (r.status === 'denied') denied++;
      } catch (e) {
        logger.warn('[referral] sweep award fail', d.id, e?.message);
      }
    }
    if (awarded || denied || waiting) {
      logger.info(`[referral] sweep: awarded=${awarded} denied=${denied} waitingKakao=${waiting} scanned=${snap.size}`);
    }
  } catch (e) {
    logger.warn('[referral] sweep fail', e?.message);
  }
});
