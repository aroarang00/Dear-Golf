import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// users/{uid} 문서를 보장한다 (docs/firestore-schema.md의 users 스키마 기준).
//  - 문서 없음(신규)        → 명함 기본값으로 생성
//  - 문서 있음(재설치 등)   → 카카오 ID만 머지, 프로필 본문은 그대로 유지
// 반환: { created: boolean, data: <users 문서 데이터> }
export async function ensureUserDoc(uid, seed = {}) {
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
    if (existing.mannerScore == null) patch.mannerScore = 70;
    if (existing.hostedCount == null) patch.hostedCount = 0;
    if (existing.attendedCount == null) patch.attendedCount = 0;
    if (existing.isRestricted == null) patch.isRestricted = false;
    if (Object.keys(patch).length > 0) {
      patch.updatedAt = serverTimestamp();
      await setDoc(ref, patch, { merge: true });
      return { created: false, data: { ...existing, ...patch } };
    }
    return { created: false, data: existing };
  }

  // 신규 사용자 — 명함 기본값으로 생성. 나머지 프로필은 온보딩·설정에서 채워진다.
  const data = {
    uid,                                    // 보안 규칙: request.resource.data.uid == uid 필수
    displayName: seed.nickname || '',
    avatarUrl: seed.profileImageUrl || null,
    kakaoId: seed.kakaoId || null,
    kakaoLinked: true,
    mannerScore: 70,
    hostedCount: 0,
    attendedCount: 0,
    isRestricted: false,
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
