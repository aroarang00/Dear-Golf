// 딥링크 — 공유 링크 생성·파싱. 웹(https://deargolf.app/...) + 앱 스킴(deargolf://...) 양쪽 지원.
//   수신 라우팅은 App.js가 navigationRef로 처리(푸시 알림 handleResponse와 동일 동선). ([[invite-deeplink-system]])
//   ※ 활성화 조건: app.config 네이티브 설정(associatedDomains·intentFilters) + deargolf.app well-known 파일(Phase 2) + EAS 재빌드.
export const WEB_BASE = 'https://deargolf.app';
export const APP_SCHEME = 'deargolf';

// 모집글 공유 URL — 미설치자도 클릭되는 웹 링크. 앱 설치 시 Universal/App Links로 앱이 가로채 상세를 연다.
//   ?h={hostUid} = 주최자 uid. 친구공개 글은 비친구가 글을 못 읽어(규칙) 주최자를 알 수 없으므로, 링크에 실어
//   보내 "주최자와 친구 맺기" 안내를 띄운다(users 문서는 로그인 시 읽기 가능 → 이름 표시·친구신청 가능). ([[roundup-friend-redesign]])
export function buildRoundupUrl(postId, hostUid) {
  if (!postId) return WEB_BASE;
  const base = `${WEB_BASE}/r/${postId}`;
  return hostUid ? `${base}?h=${encodeURIComponent(hostUid)}` : base;
}

// 들어온 URL → 라우팅 의도 파싱. 지원 형태:
//   https://deargolf.app/r/{id}[?h={host}] · http://… · deargolf://r/{id} · deargolf:///r/{id}
//   반환: { type:'roundup', postId, hostUid|null } | null  (매칭 안 되면 null → 호출측에서 무시)
export function parseDeepLink(url) {
  if (!url || typeof url !== 'string') return null;
  const m = url.match(/(?:deargolf\.app\/|deargolf:\/+)r\/([^/?#]+)/i);
  if (!(m && m[1])) return null;
  const hm = url.match(/[?&]h=([^&#]+)/);
  return { type: 'roundup', postId: decodeURIComponent(m[1]), hostUid: hm ? decodeURIComponent(hm[1]) : null };
}
