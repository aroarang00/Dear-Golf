import { login, getProfile } from '@react-native-seoul/kakao-login';

// 카카오 네이티브 SDK 로그인.
// 카카오톡 앱이 있으면 앱으로, 없으면 카카오계정 웹으로 로그인.
// 성공 시 { kakaoId, nickname, profileImageUrl }, 취소·실패 시 null.
export async function loginWithKakao() {
  try {
    await login();                       // 카카오 로그인 (토큰 발급)
    const profile = await getProfile();  // 카카오 프로필 조회
    return {
      kakaoId: profile?.id != null ? String(profile.id) : null,
      nickname: profile?.nickname || '',
      profileImageUrl: profile?.profileImageUrl || profile?.thumbnailImageUrl || null,
    };
  } catch (e) {
    // 사용자가 로그인 취소하거나 실패한 경우
    console.warn('[kakao] 로그인 오류', e?.message);
    return null;
  }
}
