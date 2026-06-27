import React, { useRef, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { FriendsTab } from './FriendsTab';
import { Icon } from './common/Icon'; // 친구찾기 돋보기·초대 사람+ 커스텀 아이콘
import { shareInvite } from '../utils/invite';
import { ShareMomentModal } from './ShareMomentModal';
import { showAppAlert } from './AppAlert';   // 헤더 안내(!) 팝업

// 친구 화면 이용안내 — 각 줄을 [아이콘, 키워드, 설명]으로(이모지 대신 우리 아이콘 세트, 2026-06-24).
//   showAppAlert가 ReactNode 본문을 받게 확장돼 '둥근 칩 아이콘 + 키워드(굵게) + 설명' 2단 행을 그대로 넘김.
//   밋밋한 텍스트 나열 대신 키워드를 굵게 띄워 중장년이 스캔하기 쉽게(2026-06-24 피드백).
const FRIEND_GUIDE_ROWS = [
  ['people', '그룹·별명', '친구를 그룹으로 나누고 별명도 바꿀 수 있어요. (그룹 지정은 카드 길게 누르기)'],
  ['personAdd', '친구 신청', '받은 친구 신청을 수락하거나 거절할 수 있어요.'],
  ['search', '친구 찾기', '카카오 동의 후 디어골프 쓰는 카카오 친구가 보여요.'],
  ['book', '글 보기', '친구 카드를 탭하면 라운딩·일상 글을 볼 수 있어요.'],
  ['sparkle', '새 글 NEW', '친구 카드에 새 글이 올라오면 NEW가 떠요.'],
  ['swipe', '밀어서', '카드를 옆으로 밀면 숨기기·즐겨찾기를 할 수 있어요.'],
  ['ban', '끊기·차단', '친구 프로필 상세에서 친구를 끊거나 차단해요.'],
];
function FriendGuideContent() {
  return (
    <View>
      {/* 제목 헤더 — 칩 빼고 텍스트 위계로만(칩 헤더는 리스트 행·첫 항목 아이콘과 똑같아 중복·구분 안 됨, 2026-06-24).
          제목은 더 크게+charcoal, 리스트 키워드는 navy로 색까지 분리. title 문자열 대신 본문 상단에 둬 꾸밈 적용. */}
      <View style={{ marginBottom: 12 }}>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(17), color: C.charcoal, letterSpacing: 0.2 }}>친구 화면 안내</Text>
        <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: C.textSecondary, marginTop: 3 }}>친구와 더 즐기는 7가지</Text>
      </View>
      <View style={{ height: 0.5, backgroundColor: C.hairline, marginBottom: 14 }} />
      <View style={{ gap: 11 }}>
        {FRIEND_GUIDE_ROWS.map(([icon, title, text]) => (
          <View key={icon} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.paleSky, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={icon} size={fs(19)} color={C.navy} strokeWidth={1.9} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(13.5), color: C.navy, marginBottom: 1 }}>{title}</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: C.textSecondary, lineHeight: 16 }}>{text}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

// 친구 화면 — 내 프로필·설정은 MY 탭으로 이관, 친구 목록 전용.
export function FriendsScreen({ navigation, route }) {
  const _and = Platform.OS === 'android'; // 헤더 안드 컴팩트 보정 — 다른 탭 헤더(코스·라운지)와 동일 규격
  // 친구 첫 진입 1회 안내는 FriendsTab 상단 인라인 카드로 이관(접이식, friendCoachDone 재사용) ([[friend_groups]])
  const openFinderRef = useRef(null); // FriendsTab의 친구 찾기(finder)를 헤더 버튼에서 열기 위한 핸들

  // 홈 빈 상태 '골프 친구 추가하기' → 친구 탭으로 오면서 친구찾기(카카오) 자동 오픈 — 클릭 한 단계 단축 ([[first-entry-friend-path]]).
  //   자식(FriendsTab) effect가 먼저 돌아 openFinderRef는 이미 세팅됨. 트리거 후 즉시 param 소비(재진입 중복 오픈 방지).
  const wantFinder = route?.params?.openFinder;
  useEffect(() => {
    if (!wantFinder) return;
    // 소비(setParams)는 반드시 타이머 콜백 안에서 — 즉시 호출하면 wantFinder가 undefined로 바뀌며
    //   cleanup이 자기 타이머를 clearTimeout으로 죽여 finder가 안 열림. open 직후 1회 소비.
    const t = setTimeout(() => {
      openFinderRef.current?.(wantFinder === true ? 'kakao' : wantFinder);
      navigation.setParams({ openFinder: undefined });
    }, 0);
    return () => clearTimeout(t);
  }, [wantFinder]);

  // 친구 초대 — 비사용자에게 나가는 cold-acquisition 카드(랜딩 톤·올인원 차별화). 평문 링크는 카드 모달의 '링크 공유'로 유지 ([[invite-deeplink-system]])
  const [inviteOpen, setInviteOpen] = useState(false);
  const handleInvite = () => setInviteOpen(true);

  // DM(메시지) 진입점은 홈 우상단 💬로 이관·일원화(테스터 '친구 탭은 불편' 피드백, 2026-06-17). HomeScreen 참조.

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'left', 'right']}>
      {/* 헤더 — Friends 타이틀(+우상단 💬 메시지) + 친구 찾기·초대 */}
      <View style={{ backgroundColor: C.paleSky, paddingHorizontal: 16, paddingVertical: 7,
        flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        {/* flex:1 + minWidth:0 — 확대(디스플레이 줌) 시 좌측 타이틀이 공간을 양보해 우측 버튼(친구찾기·초대)이
            안 잘리게. Friends는 adjustsFontSizeToFit으로 축소(iOS 잘림 방지, 2026-06-24). */}
        <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
          <Text style={{ fontFamily: F.sysM, fontSize: fs(10), color: 'rgba(26,61,82,0.72)', letterSpacing: 2, marginBottom: _and ? 2 : 4 }}>나의 골프 파트너</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontFamily: F.en, fontSize: fs(_and ? 24 : 28), color: C.navy, flexShrink: 1 }}>Friends</Text>
            {/* 안내(!) — 코스 헤더와 동일 패턴. 그룹·별명·친구찾기(카카오)·NEW·스와이프·끊기/차단 안내(사용자 2026-06-20) */}
            <TouchableOpacity activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
              onPress={() => showAppAlert('', <FriendGuideContent />, [{ text: '확인' }])}
              style={{ padding: 4 }}>
              <Icon name="book" size={fs(21)} color={C.navy} strokeWidth={1.8} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 3 }}>
          <TouchableOpacity onPress={() => openFinderRef.current?.('kakao')} activeOpacity={0.8}
            hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.navy,
              borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Icon name="search" size={fs(15)} color={C.bgPrimary} strokeWidth={1.8} />
            <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: C.bgPrimary }}>친구 찾기</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleInvite} activeOpacity={0.8}
            hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.butter,
              borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Icon name="personAdd" size={fs(17)} color={C.charcoalDeep} strokeWidth={2.1} />
            <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: C.charcoal }}>초대</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FriendsTab navigation={navigation} onInvite={handleInvite} openFinderRef={openFinderRef} />

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
