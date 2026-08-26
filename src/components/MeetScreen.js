import React, { useState, useEffect, useContext } from 'react';
import { View, Text, TouchableOpacity, Modal, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { ROUTES } from '../constants/routes';
import { useCurrentUid } from '../contexts/CurrentUidContext';
import { FriendBadgeContext } from '../contexts/FriendBadgeContext';
import { useAndroidBack } from '../hooks/useAndroidBack';
import { loadMyFriends } from '../utils/friends';
import { subscribeMyCrews, subscribeCrewInvites } from '../utils/crews';
import { Icon } from './common/Icon';
import { RoundupTab } from './RoundupTab';
import { FriendsScreen } from './FriendsScreen';
import { SettlementModal } from './SettlementModal'; // 정산 — 라운지 헤더 버튼에서 정식 메뉴로 승격(2026-08-26)
import { CrewListScreen } from './CrewListScreen';   // 크루 — 홈 모달에서 모임 탭으로 이사(2026-08-26)
import { DMChatScreen } from './DMChatScreen';       // 크루에서 멤버 DM 열기

// ★모임 탭 — 탭 5→4 재편(2026-08-26). 라운지(모집)·친구·크루·정산을 한 지붕으로.
//   v2 = '대문(허브)' 방식(사용자 선택 2026-08-26, 상단 세그먼트는 "탭 안 탭이라 어수선" 폐기):
//   첫 화면 = 큼직한 카드 4장(친구·크루·라운딩 모집·정산, 살아있는 숫자·배지) → 탭하면 그 화면으로,
//   ‹ 모임 으로 대문 복귀. "모임 = 들어가는 방" 컨셉 그대로 — 대문에서 방을 고른다. 중장년 명확성 우선.
//   - 각 화면은 기존 그대로 통째 재사용(embedded 모드), 첫 진입 때 마운트 후 display 토글로 상태 유지
//     (★언마운트 전환 금지: 남은 route.params(openPostId 등)를 재마운트 effect가 다시 읽어 옛 글이 또 열린다).
//   - ★크루만 예외 = 활성일 때만 마운트(CrewListScreen의 useScreenBack이 숨김 상태서도 하드웨어 백을 가로챔).
//   - 진입 파라미터로 화면 직행: 친구={view:'friends'|openFinder} / 크루={view:'crew'|openCrew|reopenCrew}
//     / 정산={view:'settle'} / 모집=옛 라운지 파라미터(openPostId·openNoti·openView). 파라미터 없으면 대문.

// 섹션 상단 바 테마 — 아래 화면의 헤더/바탕색과 이어 보이게.
//   ★친구·라운딩 모집은 스트립 없음 — 각 화면 헤더가 ‹ 모임·섹션명까지 한 줄로 품음(두 줄 헤더 두꺼움 정리, 2026-08-26)
const STRIP = {
  crew: { bg: '#C8D9E6', on: '#5E7E42' },   // 크루 페일스카이+세이지(CrewListScreen 팔레트)
  settle: { bg: C.bgPrimary, on: C.charcoal },
};
const SECTION_LABEL = { friends: '친구', crew: '크루', roundup: '라운딩 모집', settle: '정산' };

// 대문 카드 — 채움+여백(테두리 없음, [[feedback-minimal-borders]]), 커스텀 SVG 아이콘([[feedback-custom-svg-emoji]]).
const HUB = {
  friends: { bg: C.paleSky, fg: C.navy, icon: 'people', label: '친구' },
  crew: { bg: '#E6EDDC', fg: '#5E7E42', icon: 'crew', label: '크루' },
  roundup: { bg: C.navy, fg: C.bgPrimary, icon: 'clubhouse', label: '라운딩 모집' },
  settle: { bg: '#F3E7BE', fg: C.charcoal, icon: 'wallet', label: '정산' },
};

export function MeetScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const p = route?.params || {};
  const initialSeg = (p.openPostId || p.openNoti || p.openView || p.view === 'roundup') ? 'roundup'
    : p.view === 'settle' ? 'settle'
    : (p.view === 'crew' || p.openCrew || p.reopenCrew) ? 'crew'
    : (p.view === 'friends' || p.openFinder) ? 'friends' : 'hub';
  const [seg, setSeg] = useState(initialSeg);
  const [mounted, setMounted] = useState(() => ({ [initialSeg]: true }));
  const go = (k) => { setSeg(k); setMounted(m => (m[k] ? m : { ...m, [k]: true })); };

  const currentUid = useCurrentUid();
  const [crewReturnId, setCrewReturnId] = useState(() => (p.reopenCrew ? (p.reopenCrewId || null) : null)); // 모집 닫고 크루로 복귀할 앨범 id
  const [crewDm, setCrewDm] = useState(null); // 크루 멤버 DM {uid,name,avatar} — 화면 위 Modal

  useEffect(() => {
    if (p.view === 'friends' || p.openFinder) go('friends');
    else if (p.view === 'settle') go('settle');
    else if (p.view === 'crew' || p.openCrew) go('crew');
    else if (p.view === 'roundup' || p.openPostId || p.openNoti || p.openView) go('roundup');
    // view만 소비 — 모집/친구 화면이 각자 읽는 파라미터(openPostId·openFinder 등)는 그대로 둔다
    if (p.view || p.openCrew) navigation.setParams({ view: undefined, openCrew: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.view, p.openFinder, p.openPostId, p.openNoti, p.openView, p.openCrew]);

  // 크루서 연 모집을 닫고 돌아옴(RoundupTab이 reopenCrew 실어 navigate) — 크루 화면으로 복귀 + 그 앨범 재오픈
  useEffect(() => {
    if (!p.reopenCrew) return;
    setCrewReturnId(p.reopenCrewId || null);
    go('crew');
    navigation.setParams({ reopenCrew: undefined, reopenCrewId: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.reopenCrew]);

  // 섹션에서 하드웨어 뒤로가기 → 대문. 섹션 안의 깊은 화면(모집 상세·친구 프로필·크루 앨범·정산 작성)은
  //   각자 나중에 등록한 핸들러가 먼저 받으므로(LIFO) 여기까지 안 내려온다 — 한 단계씩 자연스럽게 벗겨진다.
  useAndroidBack(seg !== 'hub', () => go('hub'));

  // 하단 탭 '모임' 재탭 → 대문 복귀(사용자 2026-08-26). 다른 탭에서 눌러 들어올 땐(미포커스) 그대로 —
  //   섹션 상태 유지(위 파라미터 직행 로직과 충돌 안 함). GuideScreen tabPress 패턴과 동일.
  useEffect(() => {
    if (!navigation?.addListener) return undefined;
    const un = navigation.addListener('tabPress', () => {
      if (navigation.isFocused?.()) setSeg('hub');
    });
    return un;
  }, [navigation]);

  // 대문 숫자 — 친구 수(대문에 돌아올 때마다 재조회)·크루 수/초대(실시간)·친구 신청(공용 컨텍스트)
  const { friendReqCount } = useContext(FriendBadgeContext);
  const [friendCount, setFriendCount] = useState(null);
  const [crewCount, setCrewCount] = useState(null);
  const [crewInviteCount, setCrewInviteCount] = useState(0);
  useEffect(() => {
    if (seg !== 'hub') return undefined;
    let alive = true;
    loadMyFriends().then(fs => { if (alive) setFriendCount((fs || []).length); }).catch(() => {});
    return () => { alive = false; };
  }, [seg]);
  useEffect(() => {
    if (!currentUid) return undefined;
    const un1 = subscribeMyCrews(currentUid, (list) => setCrewCount((list || []).length));
    const un2 = subscribeCrewInvites(currentUid, (list) => setCrewInviteCount((list || []).length));
    return () => { un1 && un1(); un2 && un2(); };
  }, [currentUid]);

  const hubSub = {
    friends: friendCount == null ? '' : `${friendCount}명`,
    crew: crewCount == null ? '' : `${crewCount}개`,
    roundup: '파트너 찾기',
    settle: '걷기 · 회비 장부',
  };
  const hubBadge = {
    friends: friendReqCount > 0 ? `신청 ${friendReqCount}` : null,
    crew: crewInviteCount > 0 ? `초대 ${crewInviteCount}` : null,
  };
  const hubCard = (k) => {
    const c = HUB[k];
    return (
      <TouchableOpacity key={k} onPress={() => go(k)} activeOpacity={0.85}
        style={{ flex: 1, height: 122, borderRadius: 18, backgroundColor: c.bg, padding: 16, justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Icon name={c.icon} size={fs(28)} color={c.fg} strokeWidth={1.9} />
          {hubBadge[k] ? (
            <View style={{ backgroundColor: C.burgundy, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(11), color: '#fff' }}>{hubBadge[k]}</Text>
            </View>
          ) : null}
        </View>
        <View>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(17), color: c.fg }}>{c.label}</Text>
          {hubSub[k] ? (
            <Text style={{ fontFamily: F.sysM, fontSize: fs(12.5), color: c.fg, opacity: 0.72, marginTop: 3 }}>{hubSub[k]}</Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  const th = seg === 'hub' ? null : STRIP[seg];
  return (
    <View style={{ flex: 1, backgroundColor: C.bgPrimary }}>
      {seg === 'hub' ? (
        /* ── 대문 — 방 고르기. 카드에 살아있는 숫자(명수·개수·신청·초대)로 들어올 이유를 보여준다 ── */
        <View style={{ flex: 1, paddingTop: insets.top }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(24), color: C.charcoal, paddingHorizontal: 20, marginTop: 16 }}>모임</Text>
          <View style={{ paddingHorizontal: 16, marginTop: 18, gap: 12 }}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {hubCard('friends')}
              {hubCard('crew')}
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {hubCard('roundup')}
              {hubCard('settle')}
            </View>
          </View>
        </View>
      ) : !th ? null : (
        /* ── 섹션 상단 바 — ‹ 모임(대문 복귀) + 섹션 이름. 배경은 아래 화면 헤더 색과 이어지게 ── */
        <View style={{ paddingTop: insets.top, backgroundColor: th.bg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 9 }}>
            <TouchableOpacity onPress={() => go('hub')} activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 2, padding: 4 }}>
              <Text style={{ fontSize: fs(21), color: th.on, fontWeight: '600', marginTop: -2 }}>‹</Text>
              <Text style={{ fontFamily: F.sysM, fontSize: fs(13.5), color: th.on, opacity: 0.85 }}>모임</Text>
            </TouchableOpacity>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: th.on, marginLeft: 8 }}>{SECTION_LABEL[seg]}</Text>
          </View>
        </View>
      )}
      {mounted.roundup && (
        <View style={{ flex: 1, display: seg === 'roundup' ? 'flex' : 'none' }}>
          <RoundupTab asScreen embedded visible navigation={navigation} route={route} onBack={() => go('hub')} />
        </View>
      )}
      {mounted.friends && (
        <View style={{ flex: 1, display: seg === 'friends' ? 'flex' : 'none' }}>
          <FriendsScreen embedded navigation={navigation} route={route} onBack={() => go('hub')} />
        </View>
      )}
      {mounted.settle && (
        <View style={{ flex: 1, display: seg === 'settle' ? 'flex' : 'none' }}>
          <SettlementModal embedded visible />
        </View>
      )}
      {/* ★크루는 display 토글이 아니라 활성일 때만 마운트 — CrewListScreen(useScreenBack)이 마운트 내내
          하드웨어 뒤로가기를 가로채서, 숨겨둔 채 두면 다른 화면의 뒤로가기까지 먹는다.
          ★판 자체에 paddingBottom 금지 — 스크롤 영역이 잘려 '하단 벽'(사용자 2026-08-26). 탭바 회피는 콘텐츠 패딩. */}
      {seg === 'crew' && (
        <View style={{ flex: 1 }}>
          <CrewListScreen embedded onClose={() => go('hub')}
            reopenCrewId={crewReturnId} onReopenConsumed={() => setCrewReturnId(null)}
            onOpenDM={(uid, name, avatar) => { if (uid && uid !== currentUid) setCrewDm({ uid, name, avatar }); }}
            onOpenRoundup={(id, hostUid, crewId) => {
              // 크루서 모집글 열기 — 같은 탭이라 화면 전환만(옛 홈 모달 시절의 iOS/안드 분기 불필요).
              //   openPostReturn:'crew' → 상세 닫으면 RoundupTab이 reopenCrew를 실어 되돌려보낸다(위 effect가 수신).
              if (!id) return;
              navigation.navigate(ROUTES.MEET, { openPostId: id, openPostHost: hostUid || undefined, openPostReturn: 'crew', openPostCrewId: crewId || undefined });
            }} />
        </View>
      )}
      {/* 크루에서 연 멤버 DM — 화면 위 Modal(홈 모달 시절의 '모달 안 중첩'과 달리 여긴 일반 화면이라 안전) */}
      <Modal visible={!!crewDm} transparent animationType="slide"
        statusBarTranslucent={Platform.OS === 'android'}
        onRequestClose={() => setCrewDm(null)}>
        <View style={{ flex: 1, backgroundColor: '#211E1B' }}>
          {crewDm && (
            <DMChatScreen friendUid={crewDm.uid} friendName={crewDm.name} friendAvatarUri={crewDm.avatar || null}
              onClose={() => setCrewDm(null)}
              onOpenRoundup={(postId, hostUid, scope) => {
                setCrewDm(null);
                if (scope === 'select') navigation.navigate(ROUTES.MEET, { openView: 'mine' });
                else navigation.navigate(ROUTES.MEET, { openPostId: postId, openPostHost: hostUid });
              }} />
          )}
        </View>
      </Modal>
    </View>
  );
}
