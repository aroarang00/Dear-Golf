import React, { useState, useEffect, useMemo } from 'react';
import { Modal, View, Text, FlatList, TouchableOpacity, Platform, ScrollView, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image'; // 아바타 디스크캐시 — 재방문 시 카카오 CDN 재다운로드 방지 ([[image-load-speed]])
import { SafeAreaView, SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { dS } from '../styles/dS';
import { getTrustGrade } from '../constants/trustGrade';
import { getMannerGrade } from '../constants/mannerGrade';
import { TrustGradeModal } from './common/TrustBadge';
import { MannerGradeModal } from './common/MannerBadge';
import { HandicapInfoModal } from './common/HandicapInfoModal';
import { topMilestone, milestoneBadge } from './MilestoneCard';
import { DiaryCard } from './DiaryCard';
import { DiaryRowCompact } from './DiaryRowCompact';      // 요약보기 — 내 기록과 같은 한 줄 목록
import { STORAGE_KEYS, storage } from '../utils/storage';
import { Icon } from './common/Icon'; // 메시지 = 날아가는 편지 아이콘(홈 DM과 통일)
import { LoadingState } from './common/LoadingState';
import { PhotoViewer } from './common/PhotoViewer';
import { getUid } from '../utils/firebase';
import { createContentReport } from '../utils/contentReports';
import { useAndroidBack } from '../hooks/useAndroidBack';
import { DMChatScreen } from './DMChatScreen';
import { resolvePhotoUri } from '../utils/photoStorage'; // 사진 모아보기 썸네일 — dgphoto: 로컬 스킴 → 파일 경로

// 친구 풀 프로필 — 프로필 / 라운딩 피드. 헤더 옵션에서 알림/숨기기/삭제 처리.
// 옵션 액션시트는 자체 오버레이로 표시 (Modal 위 Modal 충돌 회피)
// 피드 카드는 MY와 동일한 DiaryCard(variant='friend') 재사용 — 정보만 선별 ([[friend-feed-design]])
export function FriendProfile({ friend, visible, feedLoading, feedFailed = false, onRetryFeed, onClose, muted, onToggleMute, onHide, onDelete, onBlock }) {
  const [gradeOpen, setGradeOpen] = useState(false);
  const [mannerOpen, setMannerOpen] = useState(false);
  const [handicapInfoOpen, setHandicapInfoOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);   // 헤더 ⋯ 옵션
  const [dmOpen, setDmOpen] = useState(false); // 메시지(DM) 대화방 — Modal 위 Modal freeze 회피 위해 자체 오버레이([[dm-design]])
  const [myUid, setMyUid] = useState(null);                // 좋아요 내 상태 판정용
  const [viewer, setViewer] = useState(null);              // { photos, index } — 사진/영상 전체화면
  const [reportItem, setReportItem] = useState(null);      // 피드 게시물 신고 — 사유 선택 시트 ([[content-report-policy]])
  // 요약보기 — 내 기록(DiaryScreen)과 같은 선호값을 공유한다. '요약으로 보는 사람'은 어느 피드든 요약으로 보는 게 자연스러움.
  const [compact, setCompact] = useState(false);
  // 사진 모아보기(2026-10-16) — 내 기록과 같은 선호값 키(diaryPhotoView) 공유. 이 친구의 보이는 기록 사진만 월별 3열 격자.
  const [photoView, setPhotoView] = useState(false);
  const [gridCard, setGridCard] = useState(null);           // 격자 뷰어 '이 기록 보기' → 그 기록 카드 한 장 오버레이(친구 기록엔 상세 화면이 없다)
  const { width: winW } = useWindowDimensions();
  const [collapseSignal, setCollapseSignal] = useState(0);   // 프로필을 닫을 때 올려 카드 펼침을 원위치
  const [rowOpenId, setRowOpenId] = useState(null);          // 요약보기에서 그 자리에 펼친 행(한 번에 하나)
  // 하단 안전영역 인셋 — SafeAreaView 'bottom' edge 대신 스크롤 콘텐츠 paddingBottom으로 넣어야
  //   피드가 화면 끝까지 자연스럽게 스크롤된다(bottom edge를 쓰면 리스트 아래에 고정 배경 '벽'이 남음).
  const insets = useSafeAreaInsets();
  // ★떠 있는 헤더(2026-09-22, 사용자 "헤드띠는 원래대로 두고 그 위(상태바 자리)가 벽이었는데 거기까지 스크롤이 보이게") —
  //   띠는 원래 크기·색·자리(top=insets.top) 그대로 absolute, 리스트는 상태바 밑까지 화면 전체를 흐른다.
  //   → 상태바 자리(예전엔 SafeAreaView top edge의 단색 벽)로 피드가 지나가 보인다. 콘텐츠 paddingTop = insets.top + 띠 높이.
  //   ★띠를 상태바까지 키우거나 반투명·블러로 만들지 말 것 — 1차 시도에서 그렇게 했다가 "헤드를 길게 하란 게 아니다"(반려).
  const [hdrH, setHdrH] = useState(0);
  const hdrPad = insets.top + (hdrH || 60);   // 측정 전 첫 프레임 폴백(점프 최소화)
  useEffect(() => {
    storage.load(STORAGE_KEYS.diaryCompactView, false).then(v => setCompact(!!v)).catch(() => {});
    storage.load(STORAGE_KEYS.diaryPhotoView, false).then(v => setPhotoView(!!v)).catch(() => {});
  }, []);

  // 요약보기 월별 카드용 메타 — FlatList에서 월별 카드 모양을 내려면 행마다 '그 달 첫/끝 행'만 알면 된다.
  //   ★친구 피드엔 라운딩 수·평균·베스트를 표시하지 않는다(사용자 2026-07-27): 공개여부에 따라 내게 보이는
  //   기록만 집계돼 실제 통계가 아니라 오히려 틀린 숫자다. 통계·색 코딩은 내가 전부 보는 '내 피드'에서만.
  const compactMeta = useMemo(() => {
    const feed = friend?.feed || [];
    const m = new Map();
    let i = 0;
    while (i < feed.length) {
      const ym = (feed[i].date || '').slice(0, 7);
      let j = i; const start = i;
      while (j < feed.length && (feed[j].date || '').slice(0, 7) === ym) j += 1;
      for (let k = start; k < j; k += 1) m.set(feed[k].id, { isStart: k === start, isEnd: k === j - 1 });
      i = j;
    }
    return m;
  }, [friend?.feed]);
  // 보기 방식 'cards' | 'list' | 'photos' — 내 기록(DiaryScreen)과 같은 알약·같은 저장 키. 사진 모드는 compact를 안 건드려 돌아오면 전 모드 그대로.
  const viewMode = photoView ? 'photos' : compact ? 'list' : 'cards';
  const setViewMode = (mode) => {
    const nextPhoto = mode === 'photos';
    setPhotoView(nextPhoto); storage.save(STORAGE_KEYS.diaryPhotoView, nextPhoto);
    if (!nextPhoto) { const nextCompact = mode === 'list'; setCompact(nextCompact); storage.save(STORAGE_KEYS.diaryCompactView, nextCompact); }
  };
  // 사진 모아보기 데이터 — 보이는 기록의 사진(영상은 포스터)을 피드 순서대로 펼치고, FlatList 항목(월 머리 1행 + 사진 3장 1행)으로 묶는다.
  //   가상화 유지를 위해 격자를 '행' 단위 항목으로(내 기록은 비가상화 ScrollView라 통째로 그렸음). 통계(라운딩 수·평균)는 안 넣는다 — 부분 데이터.
  const photoItems = useMemo(() => {
    const out = [];
    (friend?.feed || []).forEach(d => {
      (Array.isArray(d.photos) ? d.photos : []).forEach(p => {
        const video = !!(p && typeof p === 'object' && p.type === 'video');
        const raw = video ? (p.poster || null) : (typeof p === 'object' ? p?.uri : p);
        if (!raw && !video) return;
        out.push({ p, uri: raw ? resolvePhotoUri(raw) : null, video, ym: (d.date || '').slice(0, 7), diary: d, gi: out.length });
      });
    });
    return out;
  }, [friend?.feed]);
  const gridPhotos = useMemo(() => photoItems.map(it => it.p), [photoItems]);
  const gridRows = useMemo(() => {
    if (!photoItems.length) return (friend?.feed || []).length ? [{ key: 'empty', type: 'empty' }] : [];
    const rows = [];
    let i = 0;
    while (i < photoItems.length) {
      const ym = photoItems[i].ym;
      let j = i;
      while (j < photoItems.length && photoItems[j].ym === ym) j += 1;
      rows.push({ key: `m-${ym || i}`, type: 'month', ym, count: j - i });
      for (let k = i; k < j; k += 3) rows.push({ key: `r-${photoItems[k].gi}`, type: 'row', items: photoItems.slice(k, Math.min(k + 3, j)) });
      i = j;
    }
    return rows;
  }, [photoItems, friend?.feed]);
  const [reportMsg, setReportMsg] = useState(null);        // 신고 결과 안내 텍스트
  // (2026-10-05) 그룹·별명 시트는 친구 목록 ⋯/길게누르기 시트로 통일 — 여기선 제거([[friend_groups]])
  useAndroidBack(optionsOpen, () => setOptionsOpen(false)); // 옵션 시트 떠 있을 때 뒤로가기 → 닫기
  useAndroidBack(dmOpen, () => setDmOpen(false)); // 메시지 대화방 뒤로가기 → 닫기
  useAndroidBack(!!viewer, () => setViewer(null));         // 뷰어 떠 있을 때 뒤로가기 → 닫기
  useAndroidBack(!!gridCard, () => setGridCard(null));     // 격자 '이 기록 보기' 카드 뒤로가기 → 닫기
  useAndroidBack(!!reportItem, () => setReportItem(null)); // 신고 시트 뒤로가기 → 닫기
  useAndroidBack(!!reportMsg, () => setReportMsg(null));   // 신고 결과 뒤로가기 → 닫기
  useEffect(() => { getUid().then(setMyUid).catch(() => {}); }, []);
  // 프로필이 닫히면 내부 오버레이 상태를 리셋 — FriendProfile은 언마운트되지 않고 visible만 토글되므로
  //   dmOpen 등이 남아 같은 친구를 다시 열 때 닫았던 DM이 그대로 뜨던 버그 방지([[modal-navigation-pattern]]).
  useEffect(() => {
    if (!visible) {
      setDmOpen(false); setOptionsOpen(false); setViewer(null); setGridCard(null);
      setReportItem(null); setReportMsg(null);
      setCollapseSignal(n => n + 1);   // 펼쳐둔 카드도 접기 — 같은 친구를 다시 열면 접힌 상태로(사용자 2026-07-22)
      setRowOpenId(null);              // 요약보기에서 펼쳐둔 행도 원위치
    }
  }, [visible]);
  if (!friend) return null;

  // 모달 하드웨어 뒤로가기 — 안드 RN Modal의 onRequestClose는 네이티브 다이얼로그가 가로채
  //   useAndroidBack JS 핸들러보다 우선하므로, 내부 오버레이가 떠 있으면 여기서 그것부터 닫는다
  //   (안 그러면 DM 위에서 뒤로가기 시 프로필이 통째로 닫혀 목록으로 가버림). 위→아래 z 순서대로.
  const handleRequestClose = () => {
    if (viewer) { setViewer(null); return; }
    if (gridCard) { setGridCard(null); return; }
    if (reportMsg) { setReportMsg(null); return; }
    if (reportItem) { setReportItem(null); return; }
    if (optionsOpen) { setOptionsOpen(false); return; }
    if (dmOpen) { setDmOpen(false); return; }
    onClose && onClose();
  };

  const handleOption = (fn) => () => { setOptionsOpen(false); fn && fn(); };
  // 별명·그룹 설정은 친구 목록 카드 ⋯(길게누르기) 시트로 통일(2026-10-05) — 옵션에서 제거
  const options = [
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
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['left', 'right']}>
          {/* 헤더 — 버터 띠, 원래 크기·색 그대로 리스트 위에 떠 있음(absolute, top=상태바 아래). 우측 ⋯ 옵션(알림·숨기기·삭제) */}
          <View onLayout={(e) => { const h = Math.round(e.nativeEvent.layout.height); if (h && h !== hdrH) setHdrH(h); }}
            style={{ position: 'absolute', top: insets.top, left: 0, right: 0, zIndex: 10,
              backgroundColor: C.butter, paddingHorizontal: 20, paddingVertical: 13,
              flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: fs(22), color: C.charcoal }}>←</Text>
            </TouchableOpacity>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }}>친구 프로필</Text>
            <View style={{ flex: 1 }} />
            {/* 메시지(DM) — 헤더 우측. 대화방을 자체 오버레이로 연다([[dm-design]]) */}
            <TouchableOpacity onPress={() => setDmOpen(true)} hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 10 }}>
              <Icon name="sendFilled" size={fs(34)} color={C.charcoal} strokeWidth={1.8} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setOptionsOpen(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(22), color: C.charcoal, lineHeight: 22 }}>⋯</Text>
            </TouchableOpacity>
          </View>

          {/* 전체 스크롤 — FlatList 가상화(보이는 카드만 렌더). 명함=ListHeaderComponent, 피드=data. 더보기 제거·자연 무한스크롤(perf 2단계, [[project_fullscroll_profile]]) */}
          <FlatList
            style={{ flex: 1 }}
            data={photoView ? gridRows : (friend.feed || [])}
            keyExtractor={(item) => item.key || item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingTop: hdrPad, paddingBottom: 32 + insets.bottom }}
            scrollIndicatorInsets={{ top: hdrPad }}
            initialNumToRender={6}
            maxToRenderPerBatch={5}
            windowSize={9}
            ListHeaderComponent={(
              <>
                {/* 명함 — 피드와 함께 스크롤 */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18,
                  paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, backgroundColor: C.bgPrimary,
                  borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
                  {/* 사진 탭 → 전체화면 확대 — 피드 사진과 같은 PhotoViewer 재사용(핀치줌 포함). 사진 없으면(이니셜) 탭 무동작 */}
                  <TouchableOpacity activeOpacity={0.85}
                    disabled={!(friend.avatarUri && /^https?:\/\//.test(friend.avatarUri))}
                    onPress={() => setViewer({ photos: [friend.avatarUri], index: 0 })}
                    style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: palette.bg,
                      alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {friend.avatarUri && /^https?:\/\//.test(friend.avatarUri) ? (
                      <Image source={{ uri: friend.avatarUri }} style={{ width: 80, height: 80 }} contentFit="cover" cachePolicy="memory-disk" transition={0} />
                    ) : (
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(32), color: palette.fg }}>{(friend.name || '?').charAt(0)}</Text>
                    )}
                  </TouchableOpacity>
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
                    {/* 라베 │ 핸디 — 알약 대신 구분선 스타일(목록 카드와 통일, 사용자 2026-06-20). 흐린 라벨 + 가는 세로 구분선 */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, marginLeft: 12 }}>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.charcoal }}>
                        <Text style={{ fontFamily: F.sysM, fontSize: fs(11), color: C.textSecondary }}>라베 </Text>{stats.best ?? '—'}
                      </Text>
                      {stats.handicap != null && (
                        <>
                          <View style={{ width: 0.5, height: 12, backgroundColor: C.hairline, marginHorizontal: 10 }} />
                          <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.charcoal }}>
                            <Text style={{ fontFamily: F.sysM, fontSize: fs(11), color: C.textSecondary }}>핸디 </Text>{stats.handicap}
                          </Text>
                        </>
                      )}
                    </View>
                    {fStatus ? (
                      <Text numberOfLines={2} style={{ fontFamily: F.sysM, fontSize: fs(13), color: C.charcoal, marginTop: 7, marginLeft: 12, lineHeight: 22 }}>
                        {fStatus}
                      </Text>
                    ) : null}
                  </View>
                </View>
                {/* 피드 제목 줄 + 보기 방식 글자 알약(카드·목록·사진) — 내 기록 화면과 같은 알약·같은 선호값(2026-10-16 사진 추가) */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 14, marginBottom: 10 }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.warmGray, letterSpacing: 1.5, flex: 1 }}>
                    라운딩 · 일상 피드
                  </Text>
                  {[['cards', '카드'], ['list', '목록'], ['photos', '사진']].map(([k, label], i, arr) => {
                    const on = viewMode === k;
                    return (
                      <TouchableOpacity key={k} activeOpacity={0.7} onPress={() => { if (!on) setViewMode(k); }}
                        accessibilityLabel={`${label}로 보기`} hitSlop={{ top: 8, bottom: 8 }}
                        style={[dS.viewPill, on && dS.viewPillOn, i === arr.length - 1 && { marginRight: 0 }]}>
                        <Text style={[dS.viewPillTxt, on && dS.viewPillTxtOn]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
            renderItem={({ item, index: idx }) => (photoView ? (() => {
              // 사진 모아보기 — 항목 = 월 머리('2026. 9' + 장수) 또는 사진 3장 한 행. 탭 → 전체 사진 뷰어(fromGrid) → '이 기록 보기' 카드 오버레이.
              if (item.type === 'empty') {
                return (
                  <View style={{ alignItems: 'center', paddingTop: 30, paddingBottom: 24 }}>
                    <Icon name="image" size={fs(26)} color={C.warmGrayLight} strokeWidth={1.6} />
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(13.5), color: C.warmGray, marginTop: 10 }}>아직 사진이 있는 기록이 없어요</Text>
                  </View>
                );
              }
              if (item.type === 'month') {
                const [yy, mm] = (item.ym || '').split('.');
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', marginHorizontal: 16, marginBottom: 7, marginTop: idx === 0 ? 2 : 14 }}>
                    <Text style={dS.photoMonth}>{yy ? `${yy}. ${parseInt(mm, 10) || ''}` : '날짜 없음'}</Text>
                    <Text style={dS.photoMonthCount}>{`${item.count}장`}</Text>
                  </View>
                );
              }
              const GAP = 3;
              const cell = Math.floor((winW - 32 - GAP * 2) / 3);
              return (
                <View style={{ flexDirection: 'row', gap: GAP, marginHorizontal: 16, marginBottom: GAP }}>
                  {item.items.map((it) => (
                    <TouchableOpacity key={it.gi} activeOpacity={0.85} onPress={() => setViewer({ photos: gridPhotos, index: it.gi, fromGrid: true })}
                      style={{ width: cell, height: cell, borderRadius: 4, overflow: 'hidden', backgroundColor: '#EDE8DD' }}>
                      {/* transition 없음 — 리스트 셀에서 검게 뜨는 expo-image 함정([[expo-image-black-thumbnail]]) */}
                      {it.uri ? (
                        <Image source={{ uri: it.uri }} style={{ width: cell, height: cell }} contentFit="cover" recyclingKey={it.uri} />
                      ) : (
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name="video" size={fs(18)} color={C.warmGray} strokeWidth={1.8} />
                        </View>
                      )}
                      {it.video && it.uri && (
                        <View style={{ position: 'absolute', right: 5, bottom: 5, width: 20, height: 20, borderRadius: 10,
                          backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name="video" size={fs(11)} color="#fff" strokeWidth={2} />
                        </View>
                      )}
                      {it.diary.kind === 'moment' && (
                        <View style={{ position: 'absolute', left: 5, top: 5, width: 7, height: 7, borderRadius: 4, backgroundColor: C.paleSky }} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              );
            })() : compact ? (() => {
              // 요약보기 — 내 기록과 같은 '월별 하얀 카드'. FlatList라 행마다 테두리를 그려 카드처럼 만든다
              //   (첫 행=위 모서리, 끝 행=아래 모서리, 중간=좌우선+구분선). 헤더에 그 달 요약을 얹는다.
              const meta = compactMeta.get(item.id) || { isStart: true, isEnd: true };
              const ym = (item.date || '').slice(0, 7);
              const open = rowOpenId === item.id;
              return (
              <View style={{ paddingHorizontal: 16 }}>
                <View style={[
                  { backgroundColor: '#FFFFFF', paddingHorizontal: 14 },
                  meta.isStart && { borderTopLeftRadius: 14, borderTopRightRadius: 14, paddingTop: 15, marginTop: idx === 0 ? 2 : 0 },
                  meta.isEnd && { borderBottomLeftRadius: 14, borderBottomRightRadius: 14, paddingBottom: 4, marginBottom: 12 },
                ]}>
                  {meta.isStart && (
                    <View style={dS.compactCardHead}>
                      <Text style={dS.compactCardMonth}>{`${ym.slice(0, 4)}. ${parseInt(ym.slice(5), 10)}`}</Text>
                    </View>
                  )}
                  {/* 행 탭 → 그 자리에서 카드로 펼침(한 번에 하나만). 내 기록 요약보기와 같은 동선(사용자 2026-07-22).
                      ★색 코딩(평균/최저타 기준)도 안 넣는다 — 부분 데이터라 기준이 틀리기 때문(위 compactMeta 주석). */}
                  <DiaryRowCompact item={item} expanded={open}
                    onPress={(it) => setRowOpenId(prev => (prev === it.id ? null : it.id))} />
                  {open && (
                    <View style={{ marginTop: 2, marginBottom: 12 }}>
                      <DiaryCard item={item} variant="friend" myUid={myUid} collapseSignal={collapseSignal}
                        onReport={setReportItem}
                        onOpenPhoto={(photos, index) => setViewer({ photos, index })} />
                    </View>
                  )}
                </View>
              </View>
              );
            })() : (
              <View style={{ paddingHorizontal: 16 }}>
                {/* MY와 동일한 타임라인 — 줄 + 점. 점은 평소 버터, 특별 카드만 골드, 일상은 paleSky(카드 오른쪽 띠와 통일) ([[friend-feed-design]]·[[moment-feed-extension]]) */}
                <View style={dS.tlNode}>
                  {idx < ((friend.feed || []).length - 1) && <View style={dS.tlLine} />}
                  <View style={[dS.tlDot, item.special ? dS.tlDotSpecial : { backgroundColor: item.kind === 'moment' ? C.paleSky : C.butter, borderWidth: 0 }]} />
                  <DiaryCard
                    item={item} variant="friend" myUid={myUid}
                    collapseSignal={collapseSignal}
                    onReport={setReportItem}
                    onOpenPhoto={(photos, index) => setViewer({ photos, index })} />
                </View>
              </View>
            ))}
            ListEmptyComponent={(
              <View style={{ paddingHorizontal: 16 }}>
                {feedLoading ? (
                  <LoadingState label="라운딩 기록 불러오는 중" />
                ) : feedFailed ? (
                  /* 로드 실패(오프라인 등) — '아직 공개된 기록이 없어요'로 위장하지 않는다([[read-failure-disguise]], 2026-09-21) */
                  <View style={{ alignItems: 'center', paddingVertical: 28 }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal, marginBottom: 5 }}>
                      기록을 불러오지 못했어요
                    </Text>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, textAlign: 'center', lineHeight: 18, marginBottom: 14 }}>
                      인터넷 연결을 확인하고{'\n'}다시 시도해주세요
                    </Text>
                    <TouchableOpacity onPress={() => onRetryFeed && onRetryFeed()} activeOpacity={0.8}
                      style={{ borderWidth: 1.2, borderColor: C.charcoal, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 20 }}>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.charcoal }}>다시 시도</Text>
                    </TouchableOpacity>
                  </View>
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
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 30 /* 떠 있는 헤더(zIndex 10) 위 */,
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
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 30 /* 떠 있는 헤더(zIndex 10) 위 */,
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
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 30 /* 떠 있는 헤더(zIndex 10) 위 */,
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

          {/* 격자 뷰어 '이 기록 보기' — 친구 기록엔 상세 화면이 없어 그 기록 카드 한 장을 오버레이로(신고 결과 안내와 같은 자체 오버레이, Modal 위 Modal 회피).
              카드 안 사진 탭은 다시 뷰어(카드의 사진만)로. */}
          {gridCard && (
            <TouchableOpacity activeOpacity={1} onPress={() => setGridCard(null)}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 30,
                backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 16 }}>
              <View style={{ maxHeight: '82%' }} onStartShouldSetResponder={() => true}>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 4 }}>
                  <DiaryCard item={gridCard} variant="friend" myUid={myUid} collapseSignal={collapseSignal}
                    onReport={setReportItem}
                    onOpenPhoto={(photos, index) => setViewer({ photos, index })} />
                </ScrollView>
                <TouchableOpacity activeOpacity={0.8} onPress={() => setGridCard(null)}
                  style={{ alignSelf: 'center', marginTop: 12, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 22, paddingHorizontal: 22, paddingVertical: 10 }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: '#fff' }}>닫기</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}

          {/* 사진·영상 전체화면 뷰어 — 카드 캐러셀에서 탭 시 / 사진 모아보기 격자에서 탭 시(fromGrid → '이 기록 보기') */}
          {viewer && (
            <PhotoViewer photos={viewer.photos} startIndex={viewer.index} onClose={() => setViewer(null)}
              goToPostLabel="이 기록 보기"
              onGoToPost={viewer.fromGrid ? (cur) => {
                const hit = photoItems.find(it => it.p === cur) || photoItems.find(it => it.uri && cur && resolvePhotoUri(cur.uri || cur) === it.uri);
                setViewer(null);
                if (hit) setGridCard(hit.diary);
              } : null} />
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
