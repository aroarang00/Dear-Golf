import { login, getProfile } from '@react-native-seoul/kakao-login';

// 카카오 네이티브 SDK 로그인.
// 카카오톡 앱이 있으면 앱으로, 없으면 카카오계정 웹으로 로그인.
// 성공 시 { ok: true, kakaoId, nickname, profileImageUrl }
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
    console.log('[kakao] 4. getProfile() 성공', {
      id: profile?.id,
      nickname: profile?.nickname,
      hasProfileImage: !!(profile?.profileImageUrl || profile?.thumbnailImageUrl),
    });

    return {
      ok: true,
      kakaoId: profile?.id != null ? String(profile.id) : null,
      nickname: profile?.nickname || '',
      profileImageUrl: profile?.profileImageUrl || profile?.thumbnailImageUrl || null,
    };
  } catch (e) {
    console.warn(`[kakao] FAIL @ ${step}`, e);
    return {
      ok: false,
      step,
      error: e?.message || e?.code || String(e),
    };
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
