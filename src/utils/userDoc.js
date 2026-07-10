import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from './firebase';

// users/{uid} 문서를 보장한다 (docs/firestore-schema.md의 users 스키마 기준).
//  - 문서 없음(신규)        → 명함 기본값으로 생성
//  - 문서 있음(재설치 등)   → 카카오 ID만 머지, 프로필 본문은 그대로 유지
// 반환: { created: boolean, data: <users 문서 데이터> }
export async function ensureUserDoc(uid, seed = {}) {
  // ★익명 uid에 카카오 신원(kakaoId)을 박제하지 않는다 — 카카오 link/sign-in settle '후'에만 허용.
  //   익명+kakaoId 문서 = 친구 검색·신청의 유령 계정(설레인·bang 2026-07-10). 정상 호출 경로
  //   (OnboardingKakao·kakaoConnectFlow)는 전부 settle 후라 이 가드에 걸리지 않는다.
  if (seed.kakaoId && auth.currentUser?.uid === uid && auth.currentUser?.isAnonymous) {
    console.warn('[userDoc] 익명 uid에 kakaoId 시드 차단 — settle 전 호출');
    return { created: false, data: null };
  }
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    // 기존 문서 — 프로필 본문은 보존하되, '비어 있는 필드만' backfill.
    //  탈퇴→재가입 시 푸시토큰만 먼저 생성된 빈 문서가 남아 avatarUrl·명함 기본값이 안 채워지던 버그
    //  ([[avatar-resignup-bug]]) 보완. 값이 이미 있으면 절대 덮어쓰지 않음.
    const existing = snap.data();
    const patch = {};
    if (seed.kakaoId && existing.kakaoId !== seed.kakaoId) patch.kakaoId = seed.kakaoId;
    if (!existing.avatarUrl && seed.profileImageUrl) patch.avatarUrl = seed.profileImageUrl;
    if (!existing.displayName && seed.nickname) patch.displayName = seed.nickname;
    if (!existing.uid) patch.uid = uid;
    if (existing.kakaoLinked !== true) patch.kakaoLinked = true;
    // ★mannerScore·isRestricted는 백필하지 않는다 — 서버 권위 필드(규칙 sanctionFieldsUnchanged가
    //   변경 자체를 거부, CF만 부여). 없으면 읽는 쪽이 기본값 처리(클라 ||70·CF typeof 체크).
    if (existing.hostedCount == null) patch.hostedCount = 0;
    if (existing.attendedCount == null) patch.attendedCount = 0;
    if (Object.keys(patch).length > 0) {
      patch.updatedAt = serverTimestamp();
      await setDoc(ref, patch, { merge: true });
      return { created: false, data: { ...existing, ...patch } };
    }
    return { created: false, data: existing };
  }

  // 신규 사용자 — 명함 기본값으로 생성. 나머지 프로필은 온보딩·설정에서 채워진다.
  // ★mannerScore·isRestricted 미포함 — 규칙이 create에 이 키들을 금지(신규 계정 매너 뻥튀기 차단,
  //   CF만 부여). 넣으면 permission-denied로 '카카오 시작' 전체가 실패한다(2026-07-04 탈퇴 재가입서 발견).
  const data = {
    uid,                                    // 보안 규칙: request.resource.data.uid == uid 필수
    displayName: seed.nickname || '',
    avatarUrl: seed.profileImageUrl || null,
    kakaoId: seed.kakaoId || null,
    kakaoLinked: true,
    hostedCount: 0,
    attendedCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, data);
  return { created: true, data };
}

// 프로필 '한마디'(statusMessage) 즉시 저장 — 편집 시점에 직접 write해 친구에게도 바로 반영.
//   ★빈 문자열(지우기)도 명시적으로 쓴다. App.js write-through는 `if(statusMessage)` truthy 가드라
//     빈값이면 skip → 한마디를 지워도 서버엔 옛 멘트가 남아 친구가 계속 옛 멘트를 보던 문제 회피.
export async function saveStatusMessage(uid, statusMessage) {
  if (!uid) return;
  await setDoc(doc(db, 'users', uid), {
    uid, statusMessage: statusMessage || '', updatedAt: serverTimestamp(),
  }, { merge: true });
}
