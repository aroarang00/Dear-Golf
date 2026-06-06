import { login, getProfile, getAccessToken } from '@react-native-seoul/kakao-login';
import { OAuthProvider, linkWithCredential, signInWithCredential } from 'firebase/auth';
import { auth, authReady } from './firebase';
import { storage, STORAGE_KEYS } from './storage';

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
    const profile = await getProfile();
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

// 카카오 친구 목록 — '앱 사용 친구(=Dear Golf 가입자)'만 반환(카카오 친구 제공 4조건).
//   SDK엔 친구 API가 없어 accessToken으로 REST(/v1/api/talk/friends) 직접 호출. friends scope 동의 필요.
//   반환: { ok:true, friends:[{kakaoId, nickname, profileImageUrl, favorite}], total } | { ok:false, error }
//   error: 'no-consent'(403, friends 미동의) | 'no-token'(401·토큰없음, 재로그인) | 'http-NNN' | 'fetch-failed'
export async function getKakaoFriends() {
  let accessToken;
  try {
    const info = await getAccessToken();
    accessToken = info?.accessToken;
  } catch (e) {
    return { ok: false, error: 'no-token' };
  }
  if (!accessToken) return { ok: false, error: 'no-token' };
  try {
    const res = await fetch('https://kapi.kakao.com/v1/api/talk/friends', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 403) return { ok: false, error: 'no-consent' };
    if (res.status === 401) return { ok: false, error: 'no-token' };
    if (!res.ok) return { ok: false, error: `http-${res.status}` };
    const data = await res.json();
    const friends = (data.elements || [])
      .map(f => ({
        kakaoId: f.id != null ? String(f.id) : null,
        nickname: f.profile_nickname || '',
        profileImageUrl: f.profile_thumbnail_image || null,
        favorite: !!f.favorite,
      }))
      .filter(f => f.kakaoId);
    return { ok: true, friends, total: data.total_count ?? friends.length };
  } catch (e) {
    if (__DEV__) console.warn('[kakao] getKakaoFriends 실패', e?.message);
    return { ok: false, error: 'fetch-failed' };
  }
}

// 카카오 프로필 사진 URL만 다시 가져오기 — 이미 연동된 사용자가 사진을 카카오 것으로 되돌릴 때 사용.
// 토큰이 살아있으면 getProfile()만, 만료됐으면 login() 후 재시도. 실패 시 null.
export async function fetchKakaoProfileImage() {
  const pick = (p) => p?.profileImageUrl || p?.thumbnailImageUrl || null;
  try {
    return pick(await getProfile());
  } catch (e) {
    try {
      await login();
      return pick(await getProfile());
    } catch (e2) {
      console.warn('[kakao] 프로필 이미지 가져오기 실패', e2?.message || e2);
      return null;
    }
  }
}
