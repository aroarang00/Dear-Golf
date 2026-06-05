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
