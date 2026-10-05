import React, { useRef, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
  ['people', '그룹·별명', '카드 오른쪽 ⋯(또는 길게 누르기)에서 별명·그룹·즐겨찾기를 정해요. 나만 보여요.'],
  ['personAdd', '친구 신청', '받은 친구 신청을 수락하거나 거절할 수 있어요.'],
  ['search', '친구 찾기', '카카오 동의 후 디어골프 쓰는 카카오 친구가 보여요.'],
  ['book', '글 보기', '친구 카드를 탭하면 라운딩·일상 글을 볼 수 있어요.'],
  ['sparkle', '새 글 NEW', '친구 카드에 새 글이 올라오면 NEW가 떠요.'],
  ['pen', '그룹 편집', "그룹 만들기·이름 바꾸기는 그룹 칩 끝 '편집'(⚙ 친구 관리)에서 해요."],
  ['ban', '숨기기·끊기', '숨기기는 카드 ⋯ 시트에서, 끊기·차단은 친구 프로필 ⋯에서 해요.'],
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
// embedded — 모임 탭(MeetScreen) 안에 얹힐 때 true: 스트립+헤더 두 줄이 두꺼워 한 줄로 합침(2026-08-26).
//   ‹ 모임(onBack)·친구·안내·친구찾기·초대가 한 줄 — 상단 인셋도 여기서 처리(MeetScreen은 스트립 생략)
export function FriendsScreen({ navigation, route, embedded = false, onBack }) {
  const _and = Platform.OS === 'android'; // 헤더 안드 컴팩트 보정 — 다른 탭 헤더(코스·라운지)와 동일 규격
  const insets = useSafeAreaInsets(); // 헤더 띠를 상태바(상단 끝)까지 채우려 top 인셋을 헤더 패딩으로 흡수(2026-08-26)
  // 친구 첫 진입 1회 안내는 FriendsTab 상단 인라인 카드로 이관(접이식, friendCoachDone 재사용) ([[friend_groups]])
  const openFinderRef = useRef(null); // FriendsTab의 친구 찾기(finder)를 헤더 버튼에서 열기 위한 핸들

  // 홈 빈 상태 '골프 친구 추가하기' → 친구 탭으로 오면서 친구찾기(카카오) 자동 오픈 — 클릭 한 단계 단축 ([[first-entry-friend-path]]).
  //   자식(FriendsTab) effect가 먼저 돌아 openFinderRef는 이미 세팅됨. 트리거 후 즉시 param 소비(재진입 중복 오픈 방지).
  const wantFinder = route?.params?.openFinder;
  useEffect(() => {
    if (!wantFinder) return;
    // 소비(setParams)는 반드시 타이머 콜백 안에서 — 즉시 호출하면 wantFinder가 undefined로 바뀌며
    //   cleanup이 자기 타이머를 clearTimeout으로 죽여 finder가 안 열림. open 직후 1회 소비.
    // ★0 → 450ms(2026-10-05): 온보딩 완료 직후 모임 탭으로 넘어오며 이 화면이 뜨는 '그 프레임'에 친구찾기 Modal을
    //   열면, iOS 새 아키텍처에서 화면 전환 중 Modal이 열리고 닫힐 때 보이지 않는 레이어가 남는 알려진 버그
    //   (facebook/react-native#50152)와 같은 모양이 됐다 — 친구찾기를 닫은 뒤 친구 화면의 버튼(🔍·안내 카드·친구 찾기·초대)이
    //   전부 안 눌리고 ‹ 모임·탭바만 눌리다가, 다른 화면 갔다 오면 살아남(아이폰 TestFlight 1.2.3, 사용자 제보).
    //   화면 전환이 끝난 뒤 열도록 한 박자 늦춘다. 홈 '친구 찾기' 진입도 같은 경로라 함께 늦춰지지만 체감 미미.
    const t = setTimeout(() => {
      openFinderRef.current?.(wantFinder === true ? 'kakao' : wantFinder);
      navigation.setParams({ openFinder: undefined });
    }, 450);
    return () => clearTimeout(t);
  }, [wantFinder]);

  // 친구 초대 — 비사용자에게 나가는 cold-acquisition 카드(랜딩 톤·올인원 차별화). 평문 링크는 카드 모달의 '링크 공유'로 유지 ([[invite-deeplink-system]])
  const [inviteOpen, setInviteOpen] = useState(false);
  const handleInvite = () => setInviteOpen(true);

  // DM(메시지) 진입점은 홈 우상단 💬로 이관·일원화(테스터 '친구 탭은 불편' 피드백, 2026-06-17). HomeScreen 참조.

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['left', 'right']}>
      {/* 헤더 — embedded(모임 탭)면 ‹ 모임·친구·안내·친구찾기·초대를 한 줄로(두 줄 헤더가 두꺼워 합침, 2026-08-26).
          단독일 땐 기존 Friends 타이틀 그대로. 파란 띠는 top 인셋까지 채워 상태바 뒤로 이어짐. */}
      <View style={{ backgroundColor: C.paleSky, paddingHorizontal: embedded ? 12 : 16,
        paddingTop: insets.top + (embedded ? 6 : 7), paddingBottom: embedded ? 6 : 7,
        flexDirection: 'row', alignItems: embedded ? 'center' : 'flex-end', justifyContent: 'space-between' }}>
        {/* flex:1 + minWidth:0 — 확대(디스플레이 줌) 시 좌측 타이틀이 공간을 양보해 우측 버튼(친구찾기·초대)이
            안 잘리게. Friends는 adjustsFontSizeToFit으로 축소(iOS 잘림 방지, 2026-06-24). */}
        <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
          {!embedded && <Text style={{ fontFamily: F.sysM, fontSize: fs(10), color: 'rgba(26,61,82,0.72)', letterSpacing: 2, marginBottom: _and ? 2 : 4 }}>나의 골프 파트너</Text>}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: embedded ? 0 : 8 }}>
            {embedded && (
              <TouchableOpacity onPress={onBack} activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 2, padding: 4 }}>
                <Text style={{ fontSize: fs(21), color: C.navy, fontWeight: '600', marginTop: -2 }}>‹</Text>
                <Text style={{ fontFamily: F.sysM, fontSize: fs(13.5), color: C.navy, opacity: 0.85 }}>모임</Text>
              </TouchableOpacity>
            )}
            {embedded
              ? <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.navy, marginLeft: 6, marginRight: 4 }}>친구</Text>
              : <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontFamily: F.en, fontSize: fs(_and ? 24 : 28), color: C.navy, flexShrink: 1 }}>Friends</Text>}
            {/* 안내(!) — 코스 헤더와 동일 패턴. 그룹·별명·친구찾기(카카오)·NEW·스와이프·끊기/차단 안내(사용자 2026-06-20) */}
            <TouchableOpacity activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
              onPress={() => showAppAlert('', <FriendGuideContent />, [{ text: '확인' }])}
              style={{ padding: 4 }}>
              <Icon name="book" size={fs(21)} color={C.navy} strokeWidth={1.8} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: embedded ? 0 : 3 }}>
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

      <FriendsTab navigation={navigation} onInvite={handleInvite} openFinderRef={openFinderRef}
        openFriendUid={route?.params?.openFriendUid}
        onConsumeOpenFriend={() => navigation.setParams({ openFriendUid: undefined })} />

      {/* 친구 초대 카드 — 이미지(바로공유/저장) + 평문 링크(설치 동선) */}
      <ShareMomentModal
        moment={inviteOpen ? { shareKind: 'invite' } : null}
        visible={inviteOpen}
        onClose={() => setInviteOpen(false)}
        // 링크 공유=평문(문구+링크 한 메시지, OS 공유시트) — 카카오 피드 카드는 받는 쪽에서 링크가 안 열려 폐기(2026-07-03)
        onShareLink={() => { setInviteOpen(false); setTimeout(() => shareInvite(), 350); }}
      />
    </SafeAreaView>
  );
}
