import React, { useEffect, useContext } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { C, F, fs } from '../constants/colors';
import { FriendBadgeContext } from '../contexts/FriendBadgeContext';
import { Icon } from './common/Icon';   // 커스텀 SVG(유니코드 이모지 금지)

// 받은 친구 신청 수신 — 홈 상단 배너(2026-08-05). 친구 탭에 들어가야만 보이던 배너를 홈에도 띄운다.
//   ★홈 배너 큐의 맨 뒤(5순위) — 앞의 넷(일정변경·일정초대·라운지초대·스코어공유)은 전부 날짜·시간이
//   걸려 있어 놓치면 손해지만, 친구 신청은 10분 뒤에 수락해도 아무 일이 안 난다. 급한 순서를 지킨다.
//
// ★팝업(모달)이 아니라 배너인 이유: 친구 신청은 하던 일을 끊어세울 만큼 급하지 않고,
//   일정 알림 팝업(ScheduleReminderPopup)이 이미 전역으로 떠서 '모달 위 모달'이 될 수 있다
//   ([[project_deargolf_modal_unmount_freeze]] — 겹치면 iOS 터치가 전멸한다).
//
// 데이터는 App이 단일 소스(FriendBadgeContext.friendReqCount, friendships onSnapshot 실시간).
//   수락/무시는 여기서 하지 않는다 — 누구인지 보고 정해야 하는 일이라 친구 화면으로 보낸다.
//   (이름을 배너에 띄우려면 users 문서를 추가로 읽어야 하는데, 어차피 넘어갈 화면에 다 있다.)
export function FriendRequestInbox({ onOpen, onActiveChange }) {
  const { friendReqCount } = useContext(FriendBadgeContext);
  const count = friendReqCount || 0;

  // 배너 표시 여부를 부모(홈)에 통지 — 큐 순서 판단용(다른 배너들과 동일 규약).
  useEffect(() => { onActiveChange && onActiveChange(count > 0); }, [count]);

  if (!count) return null;

  return (
    // ★맥동 글로우를 일부러 안 넣었다 — 위 배너들과 달리 급하지 않고, 홈에 도는 애니 루프를 하나 더
    //   늘리지 않기 위해서다. 대신 같은 계열(반투명 흰 카드 + 버터 테두리)로 한 식구처럼 보이게 한다.
    <View style={{
      marginHorizontal: 20, marginTop: Platform.OS === 'ios' ? 22 : 12, borderRadius: 16,
      backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1.5, borderColor: 'rgba(245,230,168,0.75)',
      paddingHorizontal: 14, paddingVertical: 10,
    }}>
      {/* 한 줄 — 아이콘 + 문구 + 오른쪽 끝 작은 버튼. 전폭 버튼은 안 급한 알림에 비해 너무 커 보인다(사용자 2026-08-05). */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="mailbox" size={fs(18)} color={C.butter} strokeWidth={1.7} />
        <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(13.5), color: '#fff' }} numberOfLines={1}>
          받은 친구 신청 <Text style={{ color: C.butter }}>{count}</Text>건
        </Text>
        <TouchableOpacity onPress={() => onOpen && onOpen()} activeOpacity={0.85}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ paddingHorizontal: 13, paddingVertical: 6, borderRadius: 8, backgroundColor: C.butter }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: C.charcoal }}>보기</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
