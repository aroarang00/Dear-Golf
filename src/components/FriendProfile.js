import React, { useState, useEffect } from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity, Image, TextInput } from 'react-native';
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
  const [msgNoticeOpen, setMsgNoticeOpen] = useState(false); // 메시지(DM) 준비중 안내 — 본체 출시 직후([[dm-design]])
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
  useAndroidBack(msgNoticeOpen, () => setMsgNoticeOpen(false)); // 메시지 준비중 안내 뒤로가기 → 닫기
  useAndroidBack(!!viewer, () => setViewer(null));         // 뷰어 떠 있을 때 뒤로가기 → 닫기
  useAndroidBack(!!reportItem, () => setReportItem(null)); // 신고 시트 뒤로가기 → 닫기
  useAndroidBack(!!reportMsg, () => setReportMsg(null));   // 신고 결과 뒤로가기 → 닫기
  useAndroidBack(metaOpen, () => setMetaOpen(false));      // 그룹·별명 시트 뒤로가기 → 닫기
  useAndroidBack(groupManageOpen, () => setGroupManageOpen(false)); // 그룹 관리 모달 뒤로가기 → 닫기
  useEffect(() => { getUid().then(setMyUid).catch(() => {}); }, []);
  if (!friend) return null;

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

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
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
            {/* 메시지(DM) — 헤더 우측. 본체는 출시 직후([[dm-design]]), 지금은 준비 중 안내(창 비활성) */}
            <TouchableOpacity onPress={() => setMsgNoticeOpen(true)} hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 10 }}>
              <Text style={{ fontSize: fs(28) }}>💬</Text>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal }}>메시지</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setOptionsOpen(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(22), color: C.charcoal, lineHeight: 22 }}>⋯</Text>
            </TouchableOpacity>
          </View>

          {/* 명함 — 상단 고정 (스크롤해도 유지, 피드만 스크롤) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18,
            paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, backgroundColor: C.bgPrimary,
            borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
              <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: palette.bg,
                alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {friend.avatarUri && /^https?:\/\//.test(friend.avatarUri) ? (
                  // 원격 URL(카카오 등)만 표시. dgphoto: 등 로컬 키는 친구가 못 읽으므로 이니셜 fallback (사진 친구공개는 Storage 업로드 후)
                  <Image source={{ uri: friend.avatarUri }} style={{ width: 80, height: 80 }} />
                ) : (
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(32), color: palette.fg }}>{(friend.name || '?').charAt(0)}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                {/* 이름 + 마일스톤 배지(좌) / "나와 함께 N회"(같은 줄 우측 끝) */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 12, marginRight: 4 }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(20), color: C.charcoal, flexShrink: 1 }} numberOfLines={1}>{friend.name}</Text>
                  {fMs && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3,
                      backgroundColor: '#2A2D3A', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4 }}>
                      <Text style={{ fontSize: fs(11) }}>{fMs.icon}</Text>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(10), color: '#E6C677' }}>{fMs.label}</Text>
                    </View>
                  )}
                  {/* 자리만 — 동반자 매칭(라운딩 등록 시 친구 선택 uid) 구현 후 togetherCount 채움.
                      구현 전 가짜 카운트 노출 차단 ([[diary-companion-matching]]) — togetherCount>0일 때만 표시. 같은 줄 우측 끝(marginLeft auto) */}
                  {typeof friend.togetherCount === 'number' && friend.togetherCount > 0 && (
                    <View style={{ marginLeft: 'auto', backgroundColor: '#F0E0E2', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(11), color: C.burgundy }}>나와 함께 {friend.togetherCount}회</Text>
                    </View>
                  )}
                </View>
                {/* 라베·핸디 알약 — 핸디는 users 문서에 동기화된 친구만 표시 ([[friend_groups]] 핸디표시) */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7 }}>
                  <View style={{ backgroundColor: C.butter, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: C.charcoal }}>라베 {stats.best ?? '—'}</Text>
                  </View>
                  {stats.handicap != null && (
                    /* 핸디 = paleSky(하늘빛) — 라베(butter 금색)와 색 구분(따뜻함↔차가움) ([[friend_groups]] 핸디표시) */
                    <View style={{ backgroundColor: C.paleSky, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: C.charcoal }}>핸디 {stats.handicap}</Text>
                    </View>
                  )}
                </View>
                {/* 멘트 — 친구가 작성한 경우만 표시 */}
                {fStatus ? (
                  <Text numberOfLines={2} style={{ fontFamily: F.sysM, fontSize: fs(13), color: C.charcoal, marginTop: 7, marginLeft: 12, lineHeight: 22 }}>
                    {fStatus}
                  </Text>
                ) : null}
              </View>
            </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
            {/* 라운딩 피드 — 평균타(핸디)는 명함의 핸디 뱃지로 노출 */}
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.warmGray, letterSpacing: 1.5, marginHorizontal: 16, marginTop: 14, marginBottom: 10 }}>
              라운딩 · 일상 피드
            </Text>
            <View style={{ paddingHorizontal: 16 }}>
              {(friend.feed || []).length === 0 ? (
                feedLoading ? (
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
                )
              ) : (
                // MY와 동일한 타임라인 — 줄 + 점. 점은 평소 버터(노랑), 특별 카드만 골드 ([[friend-feed-design]])
                friend.feed.map((item, idx) => (
                  <View key={item.id} style={dS.tlNode}>
                    {idx < friend.feed.length - 1 && <View style={dS.tlLine} />}
                    <View style={[dS.tlDot, item.special ? dS.tlDotSpecial : { backgroundColor: C.butter, borderWidth: 0 }]} />
                    <DiaryCard
                      item={item} variant="friend" myUid={myUid}
                      onReport={setReportItem}
                      onOpenPhoto={(photos, index, caption) => setViewer({ photos, index, caption })} />
                  </View>
                ))
              )}
            </View>
          </ScrollView>

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

          {/* 메시지(DM) 준비중 안내 — 자체 오버레이(Modal 위 Modal 충돌 회피). 본체는 출시 직후([[dm-design]]) */}
          {msgNoticeOpen && (
            <TouchableOpacity activeOpacity={1} onPress={() => setMsgNoticeOpen(false)}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
              <View style={{ backgroundColor: C.bgPrimary, borderRadius: 16, paddingVertical: 24, paddingHorizontal: 26, alignItems: 'center', maxWidth: 320 }}>
                <Text style={{ fontSize: fs(30) }}>💬</Text>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal, marginTop: 8 }}>준비 중이에요</Text>
                <Text style={{ fontFamily: F.sysM, fontSize: fs(13), color: C.warmGray, textAlign: 'center', marginTop: 6, lineHeight: 20 }}>메시지 기능은{'\n'}곧 찾아올게요</Text>
                <TouchableOpacity activeOpacity={0.7} onPress={() => setMsgNoticeOpen(false)}
                  style={{ marginTop: 16, backgroundColor: C.burgundy, borderRadius: 10, paddingHorizontal: 22, paddingVertical: 10 }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.butter }}>확인</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
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
