import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { KAKAO_REST_API_KEY } from '../constants/api';

// 브라우저에서 돌아온 인증 세션을 마무리 (앱 복귀 처리)
WebBrowser.maybeCompleteAuthSession();

// 카카오 디벨로퍼스 콘솔 > 카카오 로그인 > Redirect URI 에 등록해야 하는 값.
// dev 빌드/스탠드얼론에서는 deargolf://kakao 형태.
export const KAKAO_REDIRECT_URI = makeRedirectUri({ scheme: 'deargolf', path: 'kakao' });

const AUTHORIZE = 'https://kauth.kakao.com/oauth/authorize';
const TOKEN     = 'https://kauth.kakao.com/oauth/token';
const USER_ME   = 'https://kapi.kakao.com/v2/user/me';

// 리다이렉트 URL에서 인가 코드 추출
function extractCode(url) {
  const m = /[?&#]code=([^&#]+)/.exec(url || '');
  return m ? decodeURIComponent(m[1]) : null;
}

// 카카오 OAuth 웹 로그인 (REST API).
// 성공 시 { kakaoId, nickname, profileImageUrl }, 취소·실패 시 null.
export async function loginWithKakao() {
  try {
    const authUrl =
      `${AUTHORIZE}?response_type=code` +
      `&client_id=${KAKAO_REST_API_KEY}` +
      `&redirect_uri=${encodeURIComponent(KAKAO_REDIRECT_URI)}`;

    // 카카오 로그인 페이지를 인앱 브라우저로 열고, redirect_uri 복귀를 기다린다
    const result = await WebBrowser.openAuthSessionAsync(authUrl, KAKAO_REDIRECT_URI);
    if (result.type !== 'success') return null;       // 사용자가 닫음/취소
    const code = extractCode(result.url);
    if (!code) return null;

    // 인가 코드 → 액세스 토큰
    const tokenRes = await fetch(TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body:
        'grant_type=authorization_code' +
        `&client_id=${KAKAO_REST_API_KEY}` +
        `&redirect_uri=${encodeURIComponent(KAKAO_REDIRECT_URI)}` +
        `&code=${code}`,
    });
    const token = await tokenRes.json();
    if (!token.access_token) {
      console.warn('[kakao] 토큰 발급 실패', token);
      return null;
    }

    // 카카오 사용자 정보 (닉네임 · 프로필 사진)
    const meRes = await fetch(USER_ME, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const me = await meRes.json();
    const profile = me?.kakao_account?.profile || {};
    return {
      kakaoId: me?.id != null ? String(me.id) : null,
      nickname: profile.nickname || '',
      profileImageUrl: profile.profile_image_url || profile.thumbnail_image_url || null,
    };
  } catch (e) {
    console.warn('[kakao] 로그인 오류', e?.message);
    return null;
  }
}
