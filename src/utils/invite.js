import { Share } from 'react-native';

// 친구/모임 초대 — 골프 모임 단톡방에 통째로 붙여넣기 좋은 공용 초대.
// 친구 화면 헤더와 라운지 빈 상태가 같은 문구를 쓰도록 한 곳에 둔다 ([[lounge-positioning]] 공존·흡수).
export const INVITE_LINK = 'https://deargolf.app'; // TODO: 출시 시 실제 스토어/랜딩 링크로 교체

export const INVITE_MESSAGE =
  '우리 골프 모임, 약속 잡기 이제 디어골프로 ⛳\n\n' +
  '날씨·교통·맛집 따로 안 찾고,\n' +
  '약속·일정·동반자 한 곳에서,\n' +
  '라운딩 기록까지 자동으로.\n\n' +
  '다들 설치하고 친구 추가해요 👇\n' +
  '👉 ' + INVITE_LINK;

export async function shareInvite() {
  try {
    await Share.share({ message: INVITE_MESSAGE });
  } catch (e) { /* 사용자 취소 — 무시 */ }
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
    '디어골프에서 친구 맺고 함께해요 👇\n' +
    '👉 ' + INVITE_LINK;
  try {
    await Share.share({ message });
  } catch (e) { /* 사용자 취소 — 무시 */ }
}
