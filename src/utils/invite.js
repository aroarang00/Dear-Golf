import { Share } from 'react-native';
import { shareFeedTemplate } from '@react-native-kakao/share';
import { buildRoundupUrl } from './links';

// 친구/모임 초대 — 골프 모임 단톡방에 통째로 붙여넣기 좋은 공용 초대.
// 친구 화면 헤더와 라운지 빈 상태가 같은 문구를 쓰도록 한 곳에 둔다 ([[lounge-positioning]] 공존·흡수).
export const INVITE_LINK = 'https://deargolf.app'; // TODO: 출시 시 실제 스토어/랜딩 링크로 교체

export const INVITE_MESSAGE =
  '골프 약속·준비, 이제 디어골프 하나로 ⛳\n\n' +
  '⏰ 라운드 날 기상·출발 시각 자동 알람\n' +
  '🚗 도착 시각 기준 예측 교통 소요시간\n' +
  '🍽️ 동반자·식사·일정 버튼 하나로 공유 (검색·네비 불필요)\n' +
  '📒 라운딩 기록·코스 후기까지 자동으로\n\n' +
  '혼자 써도, 같이 쓰면 더 좋은 골프 앱\n' +
  '다들 설치하고 친구 추가해요\n' +
  INVITE_LINK;

export async function shareInvite() {
  try {
    await Share.share({ message: INVITE_MESSAGE });
  } catch (e) { /* 사용자 취소 — 무시 */ }
}

// 카카오톡 친구 초대 — 이미지+문구+버튼+링크를 '한 카드'로(설치 유도). 링크=랜딩(deargolf.app, 딥링크 불필요).
//   OS 평문 공유는 이미지/링크가 따로 나가지만, 카카오 피드는 한 카드에 다 담긴다(사용자 2026-07-01).
//   카카오톡 불가(미설치·비카카오 대상)면 OS 공유시트 평문(shareInvite)으로 폴백.
export async function shareFriendInviteKakao() {
  const link = { webUrl: INVITE_LINK, mobileWebUrl: INVITE_LINK };
  try {
    await shareFeedTemplate({
      template: {
        content: {
          title: '골프 약속·준비, 디어골프 하나로 ⛳',
          description: '기상·출발 알람 · 도착시각 예측 교통\n동반자·식사·일정 버튼 하나로 공유',
          imageUrl: 'https://deargolf.app/og-card-v3.jpg',
          link,
        },
        buttons: [{ title: '디어골프 시작하기', link }],
      },
      useWebBrowserIfKakaoTalkNotAvailable: true,
    });
    return true;
  } catch (e) {
    if (__DEV__) console.warn('[shareFriendInviteKakao] 실패, 평문 폴백', e?.message);
    await shareInvite();
    return false;
  }
}

// 라운지 모집 공유 — 모임 단톡방에 모집을 알리고 앱 설치를 유도 ([[lounge-positioning]] 모임 통째 유입).
//   친구공개 모집이라 글 자체는 디어골프 친구만 보므로, 문구에 핵심 정보(구장·날짜·인원)를 담아 전달.
//   받은 사람 동선 = 랜딩 → (출시 후) 설치 → 가입 → 주최자와 친구 → 참여. 카카오 공유 템플릿(이미지 카드)은
//   출시 시 딥링크 묶음에서([[invite-deeplink-system]], @react-native-kakao/share 모듈은 빌드에 동봉됨).
export async function shareRoundup(post) {
  if (!post) return;
  const isTeam = (post.teams || 1) > 1;
  const cap = post.capacity || (isTeam ? post.teams * 4 : 4);
  const joined = Array.isArray(post.participantUids) ? post.participantUids.length : 1;
  const left = Math.max(0, cap - joined);
  const head = post.type === 'fixed'
    ? `⛳ ${post.course}\n🗓️ ${post.date}${post.day ? ` (${post.day})` : ''} · ${post.time}`
    : '⛳ 장소·날짜는 동반자와 함께 정해요';
  const message =
    '[디어골프] 라운딩 동반자 모집\n\n' +
    `${head}\n` +
    `👥 ${isTeam ? `단체 ${post.teams}팀 · 총 ${cap}명` : `${cap}명`}${left > 0 ? ` · 남은 자리 ${left}` : ''}\n\n` +
    '디어골프에서 친구 맺고 함께해요\n' +
    buildRoundupUrl(post.id, post.authorUid); // 모집글별 딥링크(/r/{id}?h=주최자) — 앱 있으면 상세, 비친구면 친구맺기 안내 ([[invite-deeplink-system]])
  try {
    await Share.share({ message });
  } catch (e) { /* 사용자 취소 — 무시 */ }
}

// 카카오톡 공유 — 이미지+버튼 피드 카드(콘솔 템플릿 없이 코드로 구성). 버튼/카드 링크 = 모집 딥링크.
//   친구지정(select)은 '개인 초대' 톤. 카카오 불가(미설치·구버전 빌드)면 OS 공유시트 평문으로 폴백.
//   ※ 딥링크 활성화엔 deargolf.app well-known 배포 + 딥링크 포함 빌드 필요(Phase 2/재빌드). ([[invite-deeplink-system]])
// imageUrl: 캡처·업로드한 실제 초대장 카드 이미지(있으면 그걸, 없으면 고정 hero.jpg 폴백).
export async function shareRoundupKakao(post, imageUrl) {
  if (!post) return false;
  const url = buildRoundupUrl(post.id, post.authorUid);
  const isInvite = post.scope === 'select'; // 친구지정 = 개인 초대
  // 카카오 피드 카드의 이미지 아래 텍스트(설명). 구장명 · 날짜 · 시간을 한 줄에 붙이면 카카오가 말줄임(…)하므로
  //   구장명 / 날짜·시간을 줄로 나눠 짧게 둔다 — 잘리지 않고 또렷하게 ([[invite-deeplink-system]], 사용자 2026-06-15).
  const dateTime = `${post.date || ''}${post.day ? ` (${post.day})` : ''}${post.time ? ` · ${post.time}` : ''}`.trim();
  const desc = post.type === 'fixed'
    ? `${post.course || ''}\n${dateTime}`
    : '장소·날짜는 동반자와 함께 정해요';
  // 앱 실행 파라미터 — 안드만 사용. 카카오톡이 앱을 `kakao{앱키}://kakaolink?postId=&h=`로 직접 실행
  //   → MainActivity 인텐트필터(app.config forwardKakaoLinkIntentFilterToMainActivity) 수신
  //   → RN Linking → App.js parseDeepLink(postId 추출) → 라운지 상세. 인텐트필터 없으면 무반응이었음(2026-06-16 수정).
  //   ※ iOS는 execParams 제외 — 카톡 iOS execParams 핸드오프가 불안정('여러번 터치·멈춤')이라
  //     associatedDomains(Universal Link)로 webUrl이 앱을 열게 둔다(카드는 r.html 폴백). ([[invite-deeplink-system]])
  const execParams = { postId: String(post.id) };
  if (post.authorUid) execParams.h = String(post.authorUid);
  const link = { webUrl: url, mobileWebUrl: url, androidExecutionParams: execParams };
  const content = {
    title: isInvite ? '💌 라운딩에 초대합니다' : '🏌️ 라운딩 동반자 모집',
    description: desc,
    imageUrl: imageUrl || 'https://deargolf.app/hero-invite.jpg', // 폴백도 워터마크 버전(브랜딩 유지)
    link,
  };
  try {
    await shareFeedTemplate({
      template: {
        content,
        buttons: [
          { title: isInvite ? '초대 확인하기' : '모집 보기', link },
        ],
      },
      useWebBrowserIfKakaoTalkNotAvailable: true,
    });
    return true;
  } catch (e) {
    if (__DEV__) console.warn('[shareRoundupKakao] 실패, 평문 폴백', e?.message);
    await shareRoundup(post); // 카카오 불가 → OS 공유시트 평문(딥링크 포함)
    return false;
  }
}
