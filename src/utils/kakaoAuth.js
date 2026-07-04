import { initializeKakaoSDK } from '@react-native-kakao/core';
import { login, me } from '@react-native-kakao/user';
import { getFriends } from '@react-native-kakao/social';
import { OAuthProvider, linkWithCredential, signInWithCredential } from 'firebase/auth';
import { auth, authReady } from './firebase';
import { storage, STORAGE_KEYS } from './storage';
import { ensureUserDoc } from './userDoc';
import { checkBannedByKakaoSub } from './account';

// 카카오 네이티브 SDK 초기화 — 모듈 로드 시 1회. nativeAppKey는 .env/EAS env에서 주입(app.config.js 플러그인과 동일 키).
initializeKakaoSDK(process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY);

// 카카오 네이티브 SDK 로그인.
// 카카오톡 앱이 있으면 앱으로, 없으면 카카오계정 웹으로 로그인.
// 성공 시 { ok: true, kakaoId, nickname, profileImageUrl, idToken }
//   idToken: Firebase OIDC 연동용 JWT — 카카오 OpenID Connect 미활성 시 null
// 실패 시 { ok: false, step, error } — 어느 단계에서 실패했는지 step에 기록.
export async function loginWithKakao() {
  let step = 'login';
  try {
    console.log('[kakao] 1. login() 호출');
    const token = await login();
    console.log('[kakao] 2. login() 성공', {
      hasAccessToken: !!token?.accessToken,
      hasIdToken: !!token?.idToken,
    });

    step = 'getProfile';
    console.log('[kakao] 3. getProfile() 호출');
    const profile = await me();
    // dev 콘솔에도 카카오 user id·닉네임·생년월일은 노출 X (PII). boolean으로만 디버그.
    // prod 빌드는 babel transform-remove-console로 어차피 제거됨.
    console.log('[kakao] 4. getProfile() 성공', {
      hasId: !!profile?.id,
      hasNickname: !!profile?.nickname,
      hasProfileImage: !!(profile?.profileImageUrl || profile?.thumbnailImageUrl),
      hasBirthyear: !!profile?.birthyear,
      hasBirthday: !!profile?.birthday,
    });

    return {
      ok: true,
      kakaoId: profile?.id != null ? String(profile.id) : null,
      nickname: profile?.nickname || '',
      profileImageUrl: profile?.profileImageUrl || profile?.thumbnailImageUrl || null,
      idToken: token?.idToken || null,   // Firebase OIDC 연동용
      // 만 19세 검증용 ([[age-policy]]) — 카카오 콘솔에서 birthyear/birthday 동의 항목 활성화 필요
      // 사용자가 동의 거부 시 null. 콘솔 비활성 상태에서도 null.
      birthyear: profile?.birthyear || null,  // 'YYYY' 문자열
      birthday: profile?.birthday || null,    // 'MMDD' 문자열
    };
  } catch (e) {
    // 전체 에러 객체 노출 X — 카카오 SDK가 토큰을 에러에 포함시킬 가능성 차단.
    console.warn(`[kakao] FAIL @ ${step}`, e?.code || e?.message);
    return {
      ok: false,
      step,
      error: e?.message || e?.code || 'unknown',
    };
  }
}

// 카카오 idToken으로 Firebase Auth 연동 (OIDC 공급자 'oidc.kakao').
//  ① 첫 로그인        → 익명 계정을 카카오 신원으로 승격 (linkWithCredential, uid 유지)
//  ② 재설치·기기변경  → 이미 그 카카오에 Firebase 계정 존재 → 기존 계정 로그인 (uid 변경)
//  ③ 이미 연동된 계정 → no-op
// 반환: { ok: true, mode: 'linked'|'existing'|'already', uid } | { ok: false, error }
// 콘솔 설정·주의할 난점(nonce·aud 등)은 docs/kakao-firebase-auth.md 참고.
export async function linkOrSignInWithKakao(kakaoIdToken) {
  if (!kakaoIdToken) {
    // 카카오 OpenID Connect 미활성 시 login()이 idToken을 주지 않음 — 콘솔 설정 확인
    return { ok: false, error: 'no-idtoken' };
  }

  // 익명 로그인 완료 보장 — linkWithCredential은 현재 User 객체가 필요
  await authReady;
  const current = auth.currentUser;
  if (!current) return { ok: false, error: 'no-current-user' };

  // Firebase 콘솔에 등록한 OIDC 공급자 ID('oidc.kakao')와 정확히 일치해야 함
  const credential = new OAuthProvider('oidc.kakao').credential({ idToken: kakaoIdToken });

  try {
    // ① 익명 계정을 카카오 신원으로 승격 — uid가 유지돼 rounds·friendships 데이터 보존
    const result = await linkWithCredential(current, credential);
    await storage.save(STORAGE_KEYS.kakaoTrace, true);  // 복귀 배너 판단용 흔적
    return { ok: true, mode: 'linked', uid: result.user.uid };
  } catch (e) {
    // ② 이 카카오에 이미 Firebase 계정이 있음 → 기존 계정으로 로그인 (uid 변경됨)
    if (e?.code === 'auth/credential-already-in-use') {
      try {
        const result = await signInWithCredential(auth, credential);
        await storage.save(STORAGE_KEYS.kakaoTrace, true);  // 복귀 배너 판단용 흔적
        return { ok: true, mode: 'existing', uid: result.user.uid };
      } catch (e2) {
        console.warn('[kakao-firebase] signIn 실패', e2?.code || e2?.message);
        return { ok: false, error: e2?.code || e2?.message || 'sign-in-failed' };
      }
    }
    // ③ 현재 계정에 이미 카카오가 연결돼 있음
    if (e?.code === 'auth/provider-already-linked') {
      await storage.save(STORAGE_KEYS.kakaoTrace, true);  // 복귀 배너 판단용 흔적
      return { ok: true, mode: 'already', uid: current.uid };
    }
    // 그 외 — auth/invalid-credential(aud 불일치), nonce 오류 등은
    // docs/kakao-firebase-auth.md '주의할 난점 4가지' 참고
    console.warn('[kakao-firebase] link 실패', e?.code || e?.message);
    return { ok: false, error: e?.code || e?.message || 'link-failed' };
  }
}

// 앱 내 카카오 연동 — 익명 사용자가 소셜 액션(친구·라운지) 진입 시 게이트에서 호출하는 공용 흐름.
//   login → 정지계정 차단 → Firebase 연동(link 또는 sign-in) → users 문서 보장.
//   KakaoReconnectBanner.handleReconnect의 4단계를 공용화 — 소셜 게이트 진입점들이 재사용([[anonymous-user-policy]]).
//   반환: { ok:true, uid, mode, nickname } | { ok:false, banned?:true } | { ok:false, error }
export async function connectKakaoAccount() {
  const result = await loginWithKakao();
  if (!result || result.ok === false) return { ok: false, error: result?.error || 'login-failed' };
  // 정지 계정 차단 ([[account-deletion]]) — 재설치로 우회 못 하도록 kakaoSub 기준
  if (result.kakaoId) {
    const ban = await checkBannedByKakaoSub(result.kakaoId);
    if (ban.banned) return { ok: false, banned: true };
  }
  const link = await linkOrSignInWithKakao(result.idToken);
  if (!link.ok) return { ok: false, error: link.error };
  await ensureUserDoc(link.uid, {
    kakaoId: result.kakaoId,
    nickname: result.nickname,
    profileImageUrl: result.profileImageUrl,
  });
  return { ok: true, uid: link.uid, mode: link.mode, nickname: result.nickname };
}

// 카카오 친구 목록 — '앱 사용 친구(=Dear Golf 가입자)'만 반환.
//   @react-native-kakao/social getFriends() 사용(네이티브가 토큰 처리 — getAccessToken은 토큰 문자열을 안 줘 REST 불가).
//   KakaoTalkFriend.id(회원번호)는 앱과 연결된 친구에게만 존재 → id 있는 친구 = 가입자.
//   friends scope 미동의면 getFriends가 throw → no-consent로 매핑해 '동의하고 친구 찾기' 유도.
//   반환: { ok:true, friends:[{kakaoId, nickname, profileImageUrl, favorite}], total } | { ok:false, error }
export async function getKakaoFriends() {
  try {
    const res = await getFriends({});
    const friends = (res?.friends || [])
      .filter(f => f.id != null)   // id 있는 친구 = 앱 연결(가입) 친구
      .map(f => ({
        kakaoId: String(f.id),
        nickname: f.profileNickname || '',
        profileImageUrl: f.profileThumbnailImage || null,
        favorite: !!f.favorite,
      }));
    return { ok: true, friends, total: res?.totalCount ?? friends.length };
  } catch (e) {
    // friends 미동의면 getFriends가 throw. 네이티브 에러 코드가 플랫폼마다 달라
    // 첫 사용 시 가장 흔한 '미동의'로 우선 처리 → '동의하고 친구 찾기'(loginWithNewScopes) 유도.
    if (__DEV__) console.warn('[kakao] getFriends 실패', e?.code, e?.message);
    return { ok: false, error: 'no-consent' };
  }
}

// 카카오 프로필 사진 URL만 다시 가져오기 — 이미 연동된 사용자가 사진을 카카오 것으로 되돌릴 때 사용.
// 토큰이 살아있으면 getProfile()만, 만료됐으면 login() 후 재시도. 실패 시 null.
//   silent:true → 앱 시작 시 자동 backfill 등 백그라운드 용도. 토큰 만료여도 login() 팝업을 띄우지 않고 건너뜀.
export async function fetchKakaoProfileImage({ silent = false } = {}) {
  const pick = (p) => p?.profileImageUrl || p?.thumbnailImageUrl || null;
  try {
    const uri = pick(await me());
    if (uri || silent) return uri;
    // me() 성공인데 사진이 없다 = 대부분 '프로필 사진(선택 동의)' 미동의(가입 때 거부 가능, 2026-07-04 확인).
    //   requestKakaoFriendsConsent와 같은 방식으로 그 자리에서 추가 동의 요청 후 1회 재시도.
    //   (동의했지만 카카오에 사진이 정말 없는 경우도 이 로그인을 한 번 거침 — 버튼을 직접 누른 경우만이라 허용)
    await login({ scopes: ['profile_image'], useKakaoAccountLogin: true });
    return pick(await me());
  } catch (e) {
    if (silent) {
      console.warn('[kakao] 프로필 이미지(silent) 건너뜀 — 토큰 만료', e?.message || e);
      return null;
    }
    try {
      await login();
      return pick(await me());
    } catch (e2) {
      console.warn('[kakao] 프로필 이미지 가져오기 실패', e2?.message || e2);
      return null;
    }
  }
}

// 카카오 친구목록 추가 동의 요청 ([[kakao-friend-api-design]]) — FriendFinder '동의하고 친구 찾기'에서 호출.
// loginWithNewScopes는 JS로 노출 안 됨(네이티브에만 존재) → login({scopes})로 추가동의 받음.
// login에 scopes를 주면 카카오계정 로그인이 실행돼 미동의 scope(friends)만 추가 동의받음.
export async function requestKakaoFriendsConsent() {
  console.log('[kakao] friends 동의 요청 시작 (login scopes)');
  try {
    // scopes를 주려면 useKakaoAccountLogin:true 필수(login 내부 assert) — 추가 동의는 카카오계정 로그인으로 받음.
    const r = await login({ scopes: ['friends'], useKakaoAccountLogin: true });
    console.log('[kakao] friends 동의 성공', { hasAccessToken: !!r?.accessToken });
    return { ok: true };
  } catch (e) {
    console.log('[kakao] friends 동의 실패', e?.code, e?.message);
    return { ok: false, error: e?.code || e?.message || 'consent-failed' };
  }
}
