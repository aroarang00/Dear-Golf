import React, { useRef, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { FriendsTab } from './FriendsTab';
import { DMListScreen } from './DMListScreen';
import { DMChatScreen } from './DMChatScreen';
import { loadUnreadTotal } from '../utils/dm';
import { shareInvite } from '../utils/invite';
import { ShareMomentModal } from './ShareMomentModal';

// 친구 화면 — 내 프로필·설정은 MY 탭으로 이관, 친구 목록 전용.
export function FriendsScreen({ navigation }) {
  // 친구 첫 진입 1회 안내는 FriendsTab 상단 인라인 카드로 이관(접이식, friendCoachDone 재사용) ([[friend_groups]])
  const openFinderRef = useRef(null); // FriendsTab의 친구 찾기(finder)를 헤더 버튼에서 열기 위한 핸들

  // 친구 초대 — 비사용자에게 나가는 cold-acquisition 카드(랜딩 톤·올인원 차별화). 평문 링크는 카드 모달의 '링크와 함께 공유'로 유지 ([[invite-deeplink-system]])
  const [inviteOpen, setInviteOpen] = useState(false);
  const handleInvite = () => setInviteOpen(true);

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
          {/* 'Friends' 글자 우상단에 💬 + 안읽음 N(말풍선에 바짝 붙인 빨간 뱃지). SVG 커스텀 말풍선은 어색해 폐기, 기존 이모지 복귀(사용자 2026-06-13) */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 7 }}>
            <Text style={{ fontFamily: F.en, fontSize: fs(28), color: C.navy }}>Friends</Text>
            <TouchableOpacity onPress={() => setDmOpen(true)} activeOpacity={0.8}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ marginTop: -8 }}>
              <Text style={{ fontSize: fs(36), textShadowColor: 'rgba(0,0,0,0.18)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }}>💬</Text>
              {/* N 뱃지 — 말풍선 우상단 모서리에 바짝(top·right 0~양수로 글리프 위로 올려 붙임) */}
              {dmUnread > 0 && (
                <View pointerEvents="none" style={{ position: 'absolute', top: 2, right: 1, minWidth: 17, height: 17, borderRadius: 8.5,
                  paddingHorizontal: 4, backgroundColor: '#E5484D', borderWidth: 1.5, borderColor: C.paleSky, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(9), color: '#fff' }}>{dmUnread > 99 ? '99+' : dmUnread}</Text>
                </View>
              )}
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

      {/* 친구 초대 카드 — 이미지(바로공유/저장) + 평문 링크(설치 동선) */}
      <ShareMomentModal
        moment={inviteOpen ? { shareKind: 'invite' } : null}
        visible={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onShareLink={() => { setInviteOpen(false); setTimeout(() => shareInvite(), 350); }}
      />
    </SafeAreaView>
  );
}
