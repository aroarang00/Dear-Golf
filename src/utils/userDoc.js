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
    // 기존 사용자 — 카카오 ID가 비었거나 바뀐 경우만 최신화. 프로필 본문은 건드리지 않음.
    const existing = snap.data();
    if (seed.kakaoId && existing.kakaoId !== seed.kakaoId) {
      await setDoc(ref, { kakaoId: seed.kakaoId, updatedAt: serverTimestamp() }, { merge: true });
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
