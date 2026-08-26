import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { ROUTES } from '../constants/routes';
import { useCurrentUid } from '../contexts/CurrentUidContext';
import { RoundupTab } from './RoundupTab';
import { FriendsScreen } from './FriendsScreen';
import { SettlementModal } from './SettlementModal'; // 정산 — 라운지 헤더 버튼에서 정식 메뉴로 승격(2026-08-26)
import { CrewListScreen } from './CrewListScreen';   // 크루 — 홈 모달에서 모임 탭으로 이사(2026-08-26)
import { DMChatScreen } from './DMChatScreen';       // 크루에서 멤버 DM 열기

// 세그먼트 스트립 테마 — 아래 화면의 헤더/바탕색과 이어 보이게 세그먼트별로.
const STRIP = {
  friends: { bg: C.paleSky, on: C.navy, off: 'rgba(26,61,82,0.45)', line: C.navy },
  crew: { bg: '#C8D9E6', on: '#5E7E42', off: 'rgba(26,61,82,0.45)', line: '#5E7E42' }, // 크루 페일스카이+세이지(CrewListScreen 팔레트)
  roundup: { bg: C.navy, on: C.bgPrimary, off: 'rgba(250,246,236,0.55)', line: C.butter },
  settle: { bg: C.bgPrimary, on: C.charcoal, off: 'rgba(61,57,53,0.4)', line: C.charcoal },
};

// ★모임 탭 — 탭 5→4 재편(2026-08-26). 라운지(라운딩 모집)와 친구를 한 지붕으로.
//   v1 = 상단 세그먼트 [라운딩 모집|친구]로 기존 두 화면을 통째 전환(내부 로직 0 변경).
//   - 두 화면은 첫 활성화 때 마운트, 이후 display 토글로 유지 — 전환해도 스크롤·상태 안 잃음
//     (5탭 시절에도 탭 네비게이터가 두 화면을 계속 마운트해 두던 것과 같은 동작.
//      ★언마운트 전환으로 바꾸면 안 됨: 남아 있는 route.params(openPostId 등)를 재마운트 effect가
//      다시 읽어 옛 모집글이 또 열린다).
//   - 진입 파라미터로 세그먼트 자동 선택: 친구={view:'friends'|openFinder} / 모집=옛 라운지 파라미터.
//     view는 소비(setParams)해서 같은 값으로 또 navigate해도 다시 반응하게.
//   - 상단 스트립 배경은 활성 화면 헤더 색(모집=네이비/친구=paleSky)과 이어 보이게.
export function MeetScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const p = route?.params || {};
  // 기본 진입 = 친구 — 친구 리스트는 언제나 내용이 있고(자주 보는 화면), 모집판은 글이 없으면
  //   탭 첫인상이 비어 보인다(사용자 결정 2026-08-26). 모집/정산 파라미터로 들어올 때만 그쪽 먼저.
  const initialSeg = (p.openPostId || p.openNoti || p.openView || p.view === 'roundup') ? 'roundup'
    : p.view === 'settle' ? 'settle' : (p.view === 'crew' || p.openCrew || p.reopenCrew) ? 'crew' : 'friends';
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

  // 크루서 연 모집을 닫고 돌아옴(RoundupTab이 reopenCrew 실어 navigate) — 크루 세그먼트로 복귀 + 그 앨범 재오픈
  useEffect(() => {
    if (!p.reopenCrew) return;
    setCrewReturnId(p.reopenCrewId || null);
    go('crew');
    navigation.setParams({ reopenCrew: undefined, reopenCrewId: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.reopenCrew]);

  const th = STRIP[seg];
  return (
    <View style={{ flex: 1, backgroundColor: C.bgPrimary }}>
      {/* 세그먼트 스트립 — 텍스트+밑줄만(박스 없이, [[feedback-minimal-borders]]) */}
      <View style={{ paddingTop: insets.top, backgroundColor: th.bg }}>
        <View style={{ flexDirection: 'row', paddingHorizontal: 20, gap: 24, paddingTop: 8 }}>
          {[['friends', '친구'], ['crew', '크루'], ['roundup', '라운딩 모집'], ['settle', '정산']].map(([k, l]) => {
            const on = seg === k;
            return (
              <TouchableOpacity key={k} onPress={() => go(k)} activeOpacity={0.8}
                hitSlop={{ top: 8, bottom: 4, left: 6, right: 6 }}
                style={{ paddingBottom: 8, borderBottomWidth: 2.5, borderBottomColor: on ? th.line : 'transparent' }}>
                <Text style={{ fontFamily: on ? F.sysB : F.sysM, fontSize: fs(15.5), color: on ? th.on : th.off }}>
                  {l}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      {mounted.roundup && (
        <View style={{ flex: 1, display: seg === 'roundup' ? 'flex' : 'none' }}>
          <RoundupTab asScreen embedded visible navigation={navigation} route={route} />
        </View>
      )}
      {mounted.friends && (
        <View style={{ flex: 1, display: seg === 'friends' ? 'flex' : 'none' }}>
          <FriendsScreen embedded navigation={navigation} route={route} />
        </View>
      )}
      {mounted.settle && (
        <View style={{ flex: 1, display: seg === 'settle' ? 'flex' : 'none' }}>
          <SettlementModal embedded visible />
        </View>
      )}
      {/* ★크루는 display 토글이 아니라 활성일 때만 마운트 — CrewListScreen(useScreenBack)이 마운트 내내
          하드웨어 뒤로가기를 가로채서, 숨겨둔 채 두면 다른 세그먼트의 뒤로가기까지 먹는다. */}
      {/* ★판 자체에 paddingBottom 금지 — 스크롤 영역이 위로 잘려 '하단 벽'이 생긴다(사용자 2026-08-26,
          친구 글목록 SafeAreaView-bottom 벽과 같은 패턴). 탭바 회피는 목록 콘텐츠 패딩(CrewListScreen 안)으로. */}
      {seg === 'crew' && (
        <View style={{ flex: 1 }}>
          <CrewListScreen embedded onClose={() => go('friends')}
            reopenCrewId={crewReturnId} onReopenConsumed={() => setCrewReturnId(null)}
            onOpenDM={(uid, name, avatar) => { if (uid && uid !== currentUid) setCrewDm({ uid, name, avatar }); }}
            onOpenRoundup={(id, hostUid, crewId) => {
              // 크루서 모집글 열기 — 이제 같은 탭이라 세그먼트만 전환(옛 홈 모달 시절의 iOS/안드 분기 불필요).
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
