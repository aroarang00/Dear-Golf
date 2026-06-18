import React, { useState, useEffect } from 'react';
import { Modal, View, Text, ScrollView, FlatList, TouchableOpacity, TextInput, Platform } from 'react-native';
import { Image } from 'expo-image'; // 아바타 디스크캐시 — 재방문 시 카카오 CDN 재다운로드 방지 ([[image-load-speed]])
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { dS } from '../styles/dS';
import { getTrustGrade } from '../constants/trustGrade';
import { getMannerGrade } from '../constants/mannerGrade';
import { TrustGradeModal } from './common/TrustBadge';
import { MannerGradeModal } from './common/MannerBadge';
import { HandicapInfoModal } from './common/HandicapInfoModal';
import { topMilestone, milestoneBadge } from './MilestoneCard';
import { DiaryCard } from './DiaryCard';
import { LoadingState } from './common/LoadingState';
import { PhotoViewer } from './common/PhotoViewer';
import { getUid } from '../utils/firebase';
import { createContentReport } from '../utils/contentReports';
import { useAndroidBack } from '../hooks/useAndroidBack';
import { DMChatScreen } from './DMChatScreen';
import { FriendGroupManageModal } from './FriendGroupManageModal';
import { loadFriendData } from '../utils/friendGroups';

// 친구 풀 프로필 — 프로필 / 라운딩 피드. 헤더 옵션에서 알림/숨기기/삭제 처리.
// 옵션 액션시트는 자체 오버레이로 표시 (Modal 위 Modal 충돌 회피)
// 피드 카드는 MY와 동일한 DiaryCard(variant='friend') 재사용 — 정보만 선별 ([[friend-feed-design]])
export function FriendProfile({ friend, visible, feedLoading, friendGroups = [], onSaveMeta, onClose, muted, onToggleMute, onHide, onDelete, onBlock }) {
  const [gradeOpen, setGradeOpen] = useState(false);
  const [mannerOpen, setMannerOpen] = useState(false);
  const [handicapInfoOpen, setHandicapInfoOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);   // 헤더 ⋯ 옵션
  const [dmOpen, setDmOpen] = useState(false); // 메시지(DM) 대화방 — Modal 위 Modal freeze 회피 위해 자체 오버레이([[dm-design]])
  const [myUid, setMyUid] = useState(null);                // 좋아요 내 상태 판정용
  const [viewer, setViewer] = useState(null);              // { photos, index } — 사진/영상 전체화면
  const [reportItem, setReportItem] = useState(null);      // 피드 게시물 신고 — 사유 선택 시트 ([[content-report-policy]])
  const [reportMsg, setReportMsg] = useState(null);        // 신고 결과 안내 텍스트
  const [metaOpen, setMetaOpen] = useState(false);         // 그룹·별명 설정 시트 ([[friend_groups]])
  const [editName, setEditName] = useState('');            // 편집 중 별명
  const [editGroups, setEditGroups] = useState([]);        // 편집 중 소속 그룹 id 배열
  const [groupManageOpen, setGroupManageOpen] = useState(false); // 그룹 관리 모달 — 시트에서 진입(B안) ([[friend_groups]])
  const [localGroups, setLocalGroups] = useState(null);    // 그룹 관리 후 갱신본 — prop보다 우선(부모 재로드 없이 칩 반영)
  useAndroidBack(optionsOpen, () => setOptionsOpen(false)); // 옵션 시트 떠 있을 때 뒤로가기 → 닫기
  useAndroidBack(dmOpen, () => setDmOpen(false)); // 메시지 대화방 뒤로가기 → 닫기
  useAndroidBack(!!viewer, () => setViewer(null));         // 뷰어 떠 있을 때 뒤로가기 → 닫기
  useAndroidBack(!!reportItem, () => setReportItem(null)); // 신고 시트 뒤로가기 → 닫기
  useAndroidBack(!!reportMsg, () => setReportMsg(null));   // 신고 결과 뒤로가기 → 닫기
  useAndroidBack(metaOpen, () => setMetaOpen(false));      // 그룹·별명 시트 뒤로가기 → 닫기
  useAndroidBack(groupManageOpen, () => setGroupManageOpen(false)); // 그룹 관리 모달 뒤로가기 → 닫기
  useEffect(() => { getUid().then(setMyUid).catch(() => {}); }, []);
  // 프로필이 닫히면 내부 오버레이 상태를 리셋 — FriendProfile은 언마운트되지 않고 visible만 토글되므로
  //   dmOpen 등이 남아 같은 친구를 다시 열 때 닫았던 DM이 그대로 뜨던 버그 방지([[modal-navigation-pattern]]).
  useEffect(() => {
    if (!visible) {
      setDmOpen(false); setOptionsOpen(false); setViewer(null);
      setReportItem(null); setReportMsg(null); setMetaOpen(false); setGroupManageOpen(false);
    }
  }, [visible]);
  if (!friend) return null;

  // 모달 하드웨어 뒤로가기 — 안드 RN Modal의 onRequestClose는 네이티브 다이얼로그가 가로채
  //   useAndroidBack JS 핸들러보다 우선하므로, 내부 오버레이가 떠 있으면 여기서 그것부터 닫는다
  //   (안 그러면 DM 위에서 뒤로가기 시 프로필이 통째로 닫혀 목록으로 가버림). 위→아래 z 순서대로.
  const handleRequestClose = () => {
    if (viewer) { setViewer(null); return; }
    if (reportMsg) { setReportMsg(null); return; }
    if (reportItem) { setReportItem(null); return; }
    if (groupManageOpen) { setGroupManageOpen(false); return; }
    if (metaOpen) { setMetaOpen(false); return; }
    if (optionsOpen) { setOptionsOpen(false); return; }
    if (dmOpen) { setDmOpen(false); return; }
    onClose && onClose();
  };

  const handleOption = (fn) => () => { setOptionsOpen(false); fn && fn(); };
  // 그룹·별명 설정 ([[friend_groups]]) — 내 private 메타. 친구에겐 안 보임.
  const openMetaEditor = () => {
    setEditName(friend.customName || '');
    const gids = Array.isArray(friend.groupIds) ? friend.groupIds : [];
    setEditGroups(gids.length ? [gids[0]] : []);   // 단일 소속 — 첫 그룹만(옛 다중 데이터 정규화)
    setMetaOpen(true);
  };
  // 단일 소속 — 한 친구는 한 그룹만(또는 없음). 같은 칩 다시 누르면 해제 ([[friend_groups]]).
  const toggleEditGroup = (gid) =>
    setEditGroups(prev => (prev.includes(gid) ? [] : [gid]));
  const saveMeta = () => {
    onSaveMeta && onSaveMeta(friend.id, { customName: editName, groupIds: editGroups });
    setMetaOpen(false);
  };
  const options = [
    { text: '✏️  그룹·별명 설정', subtitle: '나만 보는 별명·그룹 (친구에겐 안 보여요)', onPress: handleOption(openMetaEditor) },
    {
      text: muted ? '🔔  알림 켜기' : '🔕  알림 끄기',
      subtitle: muted
        ? '친구의 🏆 특별한 순간 알림을 다시 받아요'
        : '친구의 🏆 특별한 순간 알림이 안 와요',
      onPress: handleOption(onToggleMute),
    },
    { text: '🙈  친구 숨기기', onPress: handleOption(onHide) },
    { text: '✂️  친구 끊기', danger: true, onPress: handleOption(onDelete) },
    { text: '🚫  차단하기', subtitle: '친구가 끊기고 글·모집이 안 보여요', danger: true, onPress: handleOption(onBlock) },
  ];

  // 피드 게시물 신고 — 사유 선택 후 createContentReport(멱등). 1인 1회는 deterministic Doc ID가 차단.
  //   targetAuthorUid = 이 피드의 주인(friend.id). 검토 후 처리, 즉시 가림 X ([[content-report-policy]]).
  const doReport = async (reason) => {
    const it = reportItem;
    setReportItem(null);
    if (!it) return;
    try {
      const r = await createContentReport({
        targetType: 'friendDiary', targetId: it.id, targetAuthorUid: friend.id || null, reason,
      });
      setReportMsg(r.alreadyReported
        ? '이미 신고한 게시물이에요.\n검토 결과는 자동으로 반영돼요.'
        : '신고가 접수됐어요.\n디어골프 팀이 3일 이내에 확인할게요.');
    } catch (e) {
      if (__DEV__) console.warn('[FriendProfile] content report fail', e?.message);
      setReportMsg('신고 접수에 실패했어요.\n잠시 후 다시 시도해주세요.');
    }
  };
  const palette = friend.palette || { bg: '#C8D9E6', fg: '#1A3D52' };
  const stats = friend.stats || {};
  const grade = getTrustGrade(friend.hostedCount, friend.mannerScore);
  const manner = getMannerGrade(friend.mannerScore || 70);
  // 명함 재구성(MY와 동일) — 마일스톤 배지·라이프베스트·멘트 ([[roundup-friend-redesign]])
  const fMs = milestoneBadge(topMilestone({ rounds: stats.rounds ?? 0, courses: stats.courses ?? 0 }));
  const fStatus = (friend.statusMessage || '').trim();

  // transparent + statusBarTranslucent(안드) — 앱의 검증된 키보드 모달(맛집저장·일정·기록)과 동일 조합.
  //   내부 DM 대화방의 키보드는 DMChatScreen의 KeyboardAvoidingView(behavior="padding")가 담당([[dm-design]]).
  return (
    <Modal visible={visible} transparent animationType="slide"
      statusBarTranslucent={Platform.OS === 'android'}
      onRequestClose={handleRequestClose}>
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'bottom', 'left', 'right']}>
          {/* 헤더 — 버터. 우측 ⋯ 옵션(알림·숨기기·삭제) */}
          <View style={{ backgroundColor: C.butter, paddingHorizontal: 20, paddingVertical: 13,
            flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: fs(22), color: C.charcoal }}>←</Text>
            </TouchableOpacity>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }}>친구 프로필</Text>
            <View style={{ flex: 1 }} />
            {/* 메시지(DM) — 헤더 우측. 대화방을 자체 오버레이로 연다([[dm-design]]) */}
            <TouchableOpacity onPress={() => setDmOpen(true)} hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 10 }}>
              <Text style={{ fontSize: fs(28) }}>💬</Text>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal }}>메시지</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setOptionsOpen(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(22), color: C.charcoal, lineHeight: 22 }}>⋯</Text>
            </TouchableOpacity>
          </View>

          {/* 전체 스크롤 — FlatList 가상화(보이는 카드만 렌더). 명함=ListHeaderComponent, 피드=data. 더보기 제거·자연 무한스크롤(perf 2단계, [[project_fullscroll_profile]]) */}
          <FlatList
            style={{ flex: 1 }}
            data={friend.feed || []}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 32 }}
            initialNumToRender={6}
            maxToRenderPerBatch={5}
            windowSize={9}
            ListHeaderComponent={(
              <>
                {/* 명함 — 피드와 함께 스크롤 */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18,
                  paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, backgroundColor: C.bgPrimary,
                  borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
                  <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: palette.bg,
                    alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {friend.avatarUri && /^https?:\/\//.test(friend.avatarUri) ? (
                      <Image source={{ uri: friend.avatarUri }} style={{ width: 80, height: 80 }} contentFit="cover" cachePolicy="memory-disk" transition={100} />
                    ) : (
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(32), color: palette.fg }}>{(friend.name || '?').charAt(0)}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 12, marginRight: 4 }}>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(20), color: C.charcoal, flexShrink: 1 }} numberOfLines={1}>{friend.name}</Text>
                      {fMs && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3,
                          backgroundColor: '#2A2D3A', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4 }}>
                          <Text style={{ fontSize: fs(11) }}>{fMs.icon}</Text>
                          <Text style={{ fontFamily: F.sysB, fontSize: fs(10), color: '#E6C677' }}>{fMs.label}</Text>
                        </View>
                      )}
                      {typeof friend.togetherCount === 'number' && friend.togetherCount > 0 && (
                        <View style={{ marginLeft: 'auto', backgroundColor: '#F0E0E2', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
                          <Text style={{ fontFamily: F.sysB, fontSize: fs(11), color: C.burgundy }}>나와 함께 {friend.togetherCount}회</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7 }}>
                      <View style={{ backgroundColor: C.butter, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}>
                        <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: C.charcoal }}>라베 {stats.best ?? '—'}</Text>
                      </View>
                      {stats.handicap != null && (
                        <View style={{ backgroundColor: C.paleSky, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}>
                          <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: C.charcoal }}>핸디 {stats.handicap}</Text>
                        </View>
                      )}
                    </View>
                    {fStatus ? (
                      <Text numberOfLines={2} style={{ fontFamily: F.sysM, fontSize: fs(13), color: C.charcoal, marginTop: 7, marginLeft: 12, lineHeight: 22 }}>
                        {fStatus}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.warmGray, letterSpacing: 1.5, marginHorizontal: 16, marginTop: 14, marginBottom: 10 }}>
                  라운딩 · 일상 피드
                </Text>
              </>
            )}
            renderItem={({ item, index: idx }) => (
              <View style={{ paddingHorizontal: 16 }}>
                {/* MY와 동일한 타임라인 — 줄 + 점. 점은 평소 버터, 특별 카드만 골드, 일상은 paleSky(카드 오른쪽 띠와 통일) ([[friend-feed-design]]·[[moment-feed-extension]]) */}
                <View style={dS.tlNode}>
                  {idx < ((friend.feed || []).length - 1) && <View style={dS.tlLine} />}
                  <View style={[dS.tlDot, item.special ? dS.tlDotSpecial : { backgroundColor: item.kind === 'moment' ? C.paleSky : C.butter, borderWidth: 0 }]} />
                  <DiaryCard
                    item={item} variant="friend" myUid={myUid}
                    onReport={setReportItem}
                    onOpenPhoto={(photos, index, caption) => setViewer({ photos, index, caption })} />
                </View>
              </View>
            )}
            ListEmptyComponent={(
              <View style={{ paddingHorizontal: 16 }}>
                {feedLoading ? (
                  <LoadingState label="라운딩 기록 불러오는 중" />
                ) : (
                  <View style={{ alignItems: 'center', paddingVertical: 28 }}>
                    <Text style={{ fontSize: fs(30), marginBottom: 10 }}>🌱</Text>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal, marginBottom: 5 }}>
                      아직 공개된 기록이 없어요
                    </Text>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, textAlign: 'center', lineHeight: 18 }}>
                      이 친구가 라운딩이나 일상을 공개하면{'\n'}여기에 차곡차곡 모여요
                    </Text>
                  </View>
                )}
              </View>
            )}
          />

          {/* 신뢰 등급 설명 팝업 */}
          <TrustGradeModal visible={gradeOpen} highlightKey={grade.key}
            onClose={() => setGradeOpen(false)} />

          {/* 매너 등급 설명 팝업 */}
          <MannerGradeModal visible={mannerOpen} highlightKey={manner.key}
            onClose={() => setMannerOpen(false)} />

          {/* 핸디 계산 방식 설명 */}
          <HandicapInfoModal visible={handicapInfoOpen} onClose={() => setHandicapInfoOpen(false)} />

          {/* 헤더 ⋯ 옵션 — 자체 오버레이 (Modal 위 Modal 충돌 회피) */}
          {optionsOpen && (
            <TouchableOpacity activeOpacity={1} onPress={() => setOptionsOpen(false)}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 32 }}>
              <View style={{ backgroundColor: C.bgPrimary, borderRadius: 16, overflow: 'hidden' }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.charcoal, textAlign: 'center', paddingTop: 16, paddingBottom: 10 }}>
                  {friend.name}
                </Text>
                {options.map((opt, i) => (
                  <TouchableOpacity key={i} activeOpacity={0.6} onPress={opt.onPress}
                    style={{ paddingVertical: 14, paddingHorizontal: 18, borderTopWidth: 0.5, borderTopColor: C.hairline }}>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: opt.danger ? '#D32F2F' : C.charcoal, textAlign: 'center' }}>
                      {opt.text}
                    </Text>
                    {opt.subtitle ? (
                      <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary, textAlign: 'center', marginTop: 4 }}>
                        {opt.subtitle}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                ))}
                <TouchableOpacity activeOpacity={0.6} onPress={() => setOptionsOpen(false)}
                  style={{ paddingVertical: 14, paddingHorizontal: 18, borderTopWidth: 0.5, borderTopColor: C.hairline, backgroundColor: C.bgSecondary }}>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: C.warmGray, textAlign: 'center' }}>취소</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}

          {/* 메시지(DM) 대화방 — 자체 absolute 오버레이(Modal 위 Modal freeze 회피, [[modal-navigation-pattern]]). 풀스크린·실시간([[dm-design]]) */}
          {dmOpen && friend?.id && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.bgPrimary, zIndex: 20 }}>
              <DMChatScreen
                friendUid={friend.id}
                friendName={(friend.customName || '').trim() || friend.name || '친구'}
                friendAvatarUri={friend.avatarUri || null}
                onClose={() => setDmOpen(false)}
              />
            </View>
          )}

          {/* 게시물 신고 — 사유 선택 시트(카드 길게 누르기 → onReport). Modal 위 Modal 충돌 회피 위해 자체 오버레이. */}
          {reportItem && (
            <TouchableOpacity activeOpacity={1} onPress={() => setReportItem(null)}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 32 }}>
              <View style={{ backgroundColor: C.bgPrimary, borderRadius: 16, overflow: 'hidden' }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.charcoal, textAlign: 'center', paddingTop: 16, paddingBottom: 4 }}>
                  게시물 신고
                </Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary, textAlign: 'center', paddingBottom: 10 }}>
                  어떤 이유로 신고할까요?
                </Text>
                {[{ k: 'ad_spam', t: '광고 · 스팸' }, { k: 'inappropriate', t: '부적절한 내용' }].map(r => (
                  <TouchableOpacity key={r.k} activeOpacity={0.6} onPress={() => doReport(r.k)}
                    style={{ paddingVertical: 14, paddingHorizontal: 18, borderTopWidth: 0.5, borderTopColor: C.hairline }}>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: C.charcoal, textAlign: 'center' }}>{r.t}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity activeOpacity={0.6} onPress={() => setReportItem(null)}
                  style={{ paddingVertical: 14, paddingHorizontal: 18, borderTopWidth: 0.5, borderTopColor: C.hairline, backgroundColor: C.bgSecondary }}>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: C.warmGray, textAlign: 'center' }}>취소</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}

          {/* 신고 결과 안내 */}
          {reportMsg && (
            <TouchableOpacity activeOpacity={1} onPress={() => setReportMsg(null)}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
              <View style={{ backgroundColor: C.bgPrimary, borderRadius: 16, paddingVertical: 24, paddingHorizontal: 26, alignItems: 'center', maxWidth: 320 }}>
                <Text style={{ fontFamily: F.sysM, fontSize: fs(13), color: C.charcoal, textAlign: 'center', lineHeight: 20 }}>{reportMsg}</Text>
                <TouchableOpacity activeOpacity={0.7} onPress={() => setReportMsg(null)}
                  style={{ marginTop: 16, backgroundColor: C.burgundy, borderRadius: 10, paddingHorizontal: 22, paddingVertical: 10 }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.butter }}>확인</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}

          {/* 그룹·별명 설정 — 내 private 메타. 친구에겐 안 보임 ([[friend_groups]]) */}
          {metaOpen && (
            <TouchableOpacity activeOpacity={1} onPress={() => setMetaOpen(false)}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 28 }}>
              <TouchableOpacity activeOpacity={1} onPress={() => {}}
                style={{ backgroundColor: C.bgPrimary, borderRadius: 16, padding: 20 }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal, textAlign: 'center', marginBottom: 4 }}>그룹 · 별명 설정</Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, textAlign: 'center', marginBottom: 16 }}>나만 보는 설정이에요 · 친구에겐 안 보여요</Text>

                <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.charcoal, marginBottom: 6 }}>별명 <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>(최대 6자)</Text></Text>
                {/* ⚠️ maxLength 금지 — 한글 조합(IME) 충돌로 마지막 글자가 자모서 막힘(iOS서 발현). onChangeText에서 6자 컷 ([[friend_groups]]) */}
                <TextInput value={editName} onChangeText={(t) => setEditName(t.slice(0, 6))}
                  placeholder={friend.nickname || friend.name || '별명'} placeholderTextColor={C.warmGrayLight}
                  style={{ fontFamily: F.sys, fontSize: fs(14), color: C.charcoal, backgroundColor: C.bgSecondary,
                    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 0.5, borderColor: C.hairline }} />
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 5, lineHeight: 16 }}>
                  💡 별명을 적으면 친구 목록·피드에서 그 이름으로 보여요
                </Text>

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 8 }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.charcoal }}>그룹</Text>
                  {/* 그룹 추가·이름변경은 여기서 (B안 — 마이페이지 안 거치고 친구화면서 바로) ([[friend_groups]]) */}
                  <TouchableOpacity onPress={() => setGroupManageOpen(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.burgundy }}>그룹 관리 ›</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {(localGroups || friendGroups).map(g => {
                    const on = editGroups.includes(g.id);
                    return (
                      <TouchableOpacity key={g.id} activeOpacity={0.8} onPress={() => toggleEditGroup(g.id)}
                        style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18,
                          backgroundColor: on ? C.charcoal : C.bgSecondary, borderWidth: 0.5, borderColor: on ? C.charcoal : C.hairline }}>
                        <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: on ? C.butter : C.charcoal }}>{g.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 6 }}>
                  한 친구는 한 그룹만 — 다시 누르면 해제돼요
                </Text>

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 22 }}>
                  <TouchableOpacity activeOpacity={0.7} onPress={() => setMetaOpen(false)}
                    style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: C.bgSecondary, alignItems: 'center' }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal }}>취소</Text>
                  </TouchableOpacity>
                  <TouchableOpacity activeOpacity={0.85} onPress={saveMeta}
                    style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: C.burgundy, alignItems: 'center' }}>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.butter }}>저장</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </TouchableOpacity>
          )}

          {/* 친구 그룹 관리 — 그룹·별명 시트에서 진입(B안). 닫을 때 그룹 목록만 다시 읽어 칩 반영 ([[friend_groups]]) */}
          {groupManageOpen && (
            <FriendGroupManageModal visible onClose={() => {
              loadFriendData().then(fd => setLocalGroups(fd.friendGroups)).catch(() => {});
              setGroupManageOpen(false);
            }} />
          )}

          {/* 사진·영상 전체화면 뷰어 — 카드 캐러셀에서 탭 시 */}
          {viewer && (
            <PhotoViewer photos={viewer.photos} startIndex={viewer.index} caption={viewer.caption} onClose={() => setViewer(null)} />
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
