import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { OAuthProvider, linkWithCredential, signInWithCredential } from 'firebase/auth';
import { doc, deleteDoc } from 'firebase/firestore';
import { auth, authReady, db } from './firebase';
import { STORAGE_KEYS, storage } from './storage';
import { ensureUserDoc } from './userDoc';

// Sign in with Apple — App Store 4.8 대응(카카오만 있으면 리젝, [[appstore-reject-build69]]).
// 구조는 kakaoAuth.js와 동일 패턴: 네이티브 로그인 → Firebase 연동(익명 승격 link / 기존 계정 signIn).
// 카카오와 다른 점:
//  - nonce 필수: rawNonce를 SHA256 해시해 Apple에 보내고, Firebase credential엔 rawNonce를 준다(재전송 공격 방지).
//  - 이름·이메일은 '최초 로그인 1회'만 내려옴(재로그인 시 null) — 닉네임 prefill 용도로만 사용.
//  - kakaoId 없음 → 카카오 친구찾기·정지매칭(kakaoSub)·추천인 원장은 비대상(자연스럽게 비노출).

// 애플 네이티브 로그인. iOS 전용(안드로이드에선 호출하지 말 것 — 버튼 자체를 iOS에서만 노출).
// 성공 시 { ok:true, idToken, rawNonce, authorizationCode, nickname, email }
// 취소 시 { ok:false, canceled:true } / 실패 시 { ok:false, step, error }
export async function loginWithApple() {
  let step = 'nonce';
  try {
    // rawNonce(원문)는 Firebase credential에, 해시본은 Apple 요청에 — 쌍이 맞아야 auth/invalid-credential이 안 남.
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256, rawNonce,
    );

    step = 'signIn';
    const res = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    // 한국 이름은 성+이름 순(황+지현). 최초 1회만 옴 — 없으면 빈값(온보딩에서 직접 입력).
    const name = [res.fullName?.familyName, res.fullName?.givenName].filter(Boolean).join('');
    return {
      ok: true,
      idToken: res.identityToken || null,
      rawNonce,
      authorizationCode: res.authorizationCode || null, // 탈퇴 시 토큰 해지(revoke)용
      nickname: name,
      email: res.email || null,
    };
  } catch (e) {
    // 사용자가 시트를 닫은 취소는 에러 알림 없이 조용히 복귀
    if (e?.code === 'ERR_REQUEST_CANCELED') return { ok: false, canceled: true };
    console.warn(`[apple] FAIL @ ${step}`, e?.code || e?.message);
    return { ok: false, step, error: e?.message || e?.code || 'unknown' };
  }
}

// 애플 idToken으로 Firebase Auth 연동 — linkOrSignInWithKakao와 동일 3분기.
//  ① 첫 로그인        → 익명 계정을 애플 신원으로 승격 (linkWithCredential, uid 유지)
//  ② 재설치·기기변경  → 이미 그 애플에 Firebase 계정 존재 → 기존 계정 로그인 (uid 변경)
//  ③ 이미 연동된 계정 → no-op
// 반환: { ok:true, mode:'linked'|'existing'|'already', uid } | { ok:false, error }
export async function linkOrSignInWithApple(idToken, rawNonce) {
  if (!idToken) return { ok: false, error: 'no-idtoken' };

  await authReady;
  const current = auth.currentUser;
  const credential = new OAuthProvider('apple.com').credential({ idToken, rawNonce });

  // 현재 유저 없음(직전 시도에서 익명 정리 후 signIn만 실패한 재시도 등) — link 없이 바로 로그인.
  if (!current) {
    try {
      const result = await signInWithCredential(auth, credential);
      await storage.save(STORAGE_KEYS.appleTrace, true);
      return { ok: true, mode: 'existing', uid: result.user.uid };
    } catch (e2) {
      console.warn('[apple-firebase] 무세션 signIn 실패', e2?.code || e2?.message);
      return { ok: false, error: e2?.code || e2?.message || 'no-current-user' };
    }
  }

  try {
    // ① 익명 계정을 애플 신원으로 승격 — uid가 유지돼 rounds·friendships 데이터 보존
    const result = await linkWithCredential(current, credential);
    await storage.save(STORAGE_KEYS.appleTrace, true);  // 연동 흔적(kakaoTrace와 동일) — 세션 유실 시 유령 문서 방지·복귀 안내 판단
    return { ok: true, mode: 'linked', uid: result.user.uid };
  } catch (e) {
    // ② 이 애플 계정에 이미 Firebase 계정이 있음 → 기존 계정으로 로그인 (uid 변경됨)
    if (e?.code === 'auth/credential-already-in-use') {
      // 유령 계정 방지 — 카카오와 동일([[kakao-anon-orphan-accounts]]): 버려질 익명 uid의
      //   users 문서·Auth 계정을 '아직 소유자인 지금' 정리(전환 후엔 규칙상 못 지움).
      if (current.isAnonymous) {
        try { await deleteDoc(doc(db, 'users', current.uid)); } catch { /* 문서 없음/권한 — 무해 */ }
        try { await current.delete(); } catch { /* requires-recent-login 등 — 무해 */ }
      }
      try {
        const result = await signInWithCredential(auth, credential);
        await storage.save(STORAGE_KEYS.appleTrace, true);
        return { ok: true, mode: 'existing', uid: result.user.uid };
      } catch (e2) {
        console.warn('[apple-firebase] signIn 실패', e2?.code || e2?.message);
        return { ok: false, error: e2?.code || e2?.message || 'sign-in-failed' };
      }
    }
    // ③ 현재 계정에 이미 애플이 연결돼 있음
    if (e?.code === 'auth/provider-already-linked') {
      await storage.save(STORAGE_KEYS.appleTrace, true);
      return { ok: true, mode: 'already', uid: current.uid };
    }
    console.warn('[apple-firebase] link 실패', e?.code || e?.message);
    return { ok: false, error: e?.code || e?.message || 'link-failed' };
  }
}

// Apple 사용자가 세션 유실로 '새 익명 uid'에 떨어진 상태인지 — 소셜 게이트·유령 문서 가드 판단용.
//   이 상태에서 게이트가 카카오 연동을 권하면 익명 uid에 카카오가 link돼 원래 Apple 계정과 영구 분리됨
//   ([[kakao-anon-orphan-accounts]]의 Apple판). 이때는 'Apple로 다시 로그인' 안내가 정답.
export async function anonHasAppleTrace() {
  if (!auth.currentUser?.isAnonymous) return false;
  return !!(await storage.load(STORAGE_KEYS.appleTrace, false));
}

// 앱 내 Apple 재로그인 — connectKakaoAccount와 동일 역할의 공용 흐름(소셜 게이트 'Apple로 계속하기'에서 호출).
//   login → Firebase 연동(link 또는 sign-in) → users 문서 보장. 정지매칭(kakaoSub)은 Apple 비대상이라 없음.
//   반환: { ok:true, uid, mode } | { ok:false, canceled?:true } | { ok:false, error }
export async function connectAppleAccount() {
  const r = await loginWithApple();
  if (!r.ok) return { ok: false, canceled: r.canceled, error: r.error };
  const link = await linkOrSignInWithApple(r.idToken, r.rawNonce);
  if (!link.ok) return { ok: false, error: link.error };
  await ensureUserDoc(link.uid, { nickname: r.nickname, profileImageUrl: null });
  return { ok: true, uid: link.uid, mode: link.mode };
}

// 탈퇴용 재인증 자료 — 새 애플 로그인 시트를 띄워 fresh credential + authorizationCode(토큰 해지용)를 받는다.
//   deleteAccount의 requires-recent-login 재시도 + 5.1.1(v) 토큰 revoke에 사용. ([[account-deletion]])
export async function getAppleReauthMaterial() {
  const r = await loginWithApple();
  if (!r.ok || !r.idToken) return null;
  return {
    credential: new OAuthProvider('apple.com').credential({ idToken: r.idToken, rawNonce: r.rawNonce }),
    authorizationCode: r.authorizationCode,
  };
}
