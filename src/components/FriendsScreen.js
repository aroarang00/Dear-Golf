import React, { useRef, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg'; // 메시지 말풍선 — 벡터라 iOS·안드 픽셀 동일(꼬리까지 깔끔)
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { FriendsTab } from './FriendsTab';
import { DMListScreen } from './DMListScreen';
import { DMChatScreen } from './DMChatScreen';
import { loadUnreadTotal } from '../utils/dm';
import { shareInvite } from '../utils/invite';

// 친구 화면 — 내 프로필·설정은 MY 탭으로 이관, 친구 목록 전용.
export function FriendsScreen({ navigation }) {
  // 친구 첫 진입 1회 안내는 FriendsTab 상단 인라인 카드로 이관(접이식, friendCoachDone 재사용) ([[friend_groups]])
  const openFinderRef = useRef(null); // FriendsTab의 친구 찾기(finder)를 헤더 버튼에서 열기 위한 핸들

  // 친구 초대 — 공용 헬퍼(모임 단톡방용 문구). 라운지 빈 상태와 동일 문구 공유 ([[lounge-positioning]])
  const handleInvite = shareInvite;

  // DM(메시지) — 친구 탭으로 진입점 이관(테스터 "MY 프로필 💬는 찾기 불편" 피드백, 2026-06-13. 옛 MY 프로필 💬 제거·일원화).
  //   친구 전용이라 의미상 친구 탭이 자연스럽고 발견성도 높음. 단일 Modal서 목록↔대화방 전환(Modal 중첩 회피, [[dm-design]]).
  const [dmOpen, setDmOpen] = useState(false);
  const [dmChat, setDmChat] = useState(null);   // { uid, name, avatar } 선택 시 대화방
  const [dmUnread, setDmUnread] = useState(0);   // 총 안읽음 N 뱃지 — 진입/닫기 시 1회 로드(상시구독 X, 비용 절약)
  useEffect(() => { if (!dmOpen) loadUnreadTotal().then(setDmUnread).catch(() => {}); }, [dmOpen]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'left', 'right']}>
      {/* 헤더 — Friends 타이틀(+우상단 💬 메시지) + 친구 찾기·초대 */}
      <View style={{ backgroundColor: C.paleSky, paddingHorizontal: 20, paddingVertical: 13,
        flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View>
          <Text style={{ fontFamily: F.sysM, fontSize: fs(10), color: 'rgba(26,61,82,0.72)', letterSpacing: 2, marginBottom: 4 }}>나의 골프 파트너</Text>
          {/* 'Friends' 글자 우상단에 메시지 말풍선. 이모지 💬는 글리프라 숫자를 안에 못 넣어 — 말풍선(둥근 박스+좌하단 꼬리)을
              직접 그려 안읽음 수를 '안에' 표시(카톡 채팅 아이콘식, 사용자 2026-06-13). 헤더 정체성 네이비(타이틀·친구찾기와 통일) */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <Text style={{ fontFamily: F.en, fontSize: fs(28), color: C.navy }}>Friends</Text>
            <TouchableOpacity onPress={() => setDmOpen(true)} activeOpacity={0.8}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ marginTop: 4, width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}>
              {/* 말풍선 — SVG 벡터(좌하단 꼬리 포함). 글리프 이모지 대신이라 안에 텍스트 얹기 가능, 양 플랫폼 동일 렌더 */}
              <Svg width={34} height={34} viewBox="0 0 24 24" style={{ position: 'absolute' }}>
                <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill={C.navy} />
              </Svg>
              {/* 안읽음 없으면 'DM' 라벨, 있으면 숫자 — 꼬리(하단) 피해 살짝 위로(marginBottom) 중앙 */}
              <Text style={{ fontFamily: F.sysB, fontSize: fs(dmUnread > 0 ? 12 : 11), letterSpacing: dmUnread > 0 ? 0 : 0.3, color: '#fff', marginBottom: 5 }}>
                {dmUnread > 0 ? (dmUnread > 99 ? '99+' : dmUnread) : 'DM'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 3 }}>
          <TouchableOpacity onPress={() => openFinderRef.current?.('kakao')} activeOpacity={0.8}
            hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.navy,
              borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: C.bgPrimary }}>🔍 친구 찾기</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleInvite} activeOpacity={0.8}
            hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.butter,
              borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: C.charcoal }}>📩 초대</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FriendsTab navigation={navigation} onInvite={handleInvite} openFinderRef={openFinderRef} />

      {/* 메시지(DM) — 친구 탭 우상단 💬 진입 = 대화 목록(인스타식). 단일 Modal서 목록↔대화방 전환([[dm-design]]).
          transparent + statusBarTranslucent(안드) = 앱의 검증된 키보드 모달(맛집저장·일정·기록)과 동일 조합. */}
      <Modal visible={dmOpen} transparent animationType="slide"
        statusBarTranslucent={Platform.OS === 'android'}
        onRequestClose={() => (dmChat ? setDmChat(null) : setDmOpen(false))}>
        {dmChat ? (
          <DMChatScreen friendUid={dmChat.uid} friendName={dmChat.name} friendAvatarUri={dmChat.avatar || null} onClose={() => setDmChat(null)} />
        ) : (
          <DMListScreen onClose={() => { setDmOpen(false); setDmChat(null); }} onOpenChat={(uid, name, avatar) => setDmChat({ uid, name, avatar })} />
        )}
      </Modal>
    </SafeAreaView>
  );
}
