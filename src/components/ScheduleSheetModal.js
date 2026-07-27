import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { sheetS } from '../styles/sheetS';
import { Icon, GreenFlag } from './common/Icon';
import { TripleStripe } from './common/TripleStripe';
import AppTextInput from './common/AppTextInput';
import { buildCompanionNames } from '../utils/scheduleCompanions';
import { getAlarmConfig, computeRoundTimeline, fmtClock } from '../utils/notifications'; // 라운드 알람 요약 표시
import { useCurrentUid } from '../contexts/CurrentUidContext';
import { getScheduleGroup, ackGroupMemo } from '../utils/scheduleShares';
import { loadRoundup } from '../utils/roundup';   // 라운지 일정 공지(teamNotice) 로드
import { subscribeScheduleComments } from '../utils/scheduleComments';   // 전파 일정 '이야기'(댓글) 미리보기
import { loadMyFriendsEnriched } from '../utils/friends';

const SAGE = '#5E7E42';   // 세이지그린 — 교통 아이콘 액센트(앱 크루 세이지와 동색)

// 액션 타일 — 시트 하단 '한눈에 들어오는 아이콘 격자'용(중장년 스캔성, 사용자 2026-07-27).
//   나열식 텍스트 행 → 아이콘+짧은 라벨 3열 격자. 의미색 + 옅은 원 배경으로 구분(밋밋함 방지).
const TILE = {
  wx:   { color: '#E0A100', tint: 'rgba(224,161,0,0.10)',  short: '날씨' },
  tr:   { color: SAGE,      tint: 'rgba(94,126,66,0.12)',  short: '교통' },
  al:   { color: '#B07A2E', tint: 'rgba(176,122,46,0.14)', short: '알람' },
  team: { color: '#1A3D52', tint: 'rgba(26,61,82,0.10)',   short: '단체팀' },
  rd:   { color: '#1A3D52', tint: 'rgba(26,61,82,0.10)',   short: '모집' },
  ml:   { color: '#C4622D', tint: 'rgba(196,98,45,0.12)',  short: '식사' },
  sh:   { color: '#1A3D52', tint: 'rgba(26,61,82,0.10)',   short: '공유' },   // 과거 일정 등 카드 미표시 시 격자에 남는 공유
  ed:   { color: '#4A4A48', tint: 'rgba(74,74,72,0.09)',   short: '수정' },
  dl:   { color: '#D32F2F', tint: 'rgba(211,47,47,0.10)',  short: '삭제' },   // danger — 탭 시 confirmDelete 확인 화면을 거침
};

export function ScheduleSheetModal({ visible, schedule, onClose, onCourseTap, onWeather, onTraffic, onShare, onInviteFriends, onMeal, onTeam, onOpenRoundup, onEdit, onDelete, onAlarm, onSaveMemo, onOpenComments, courseNavigable, friendMeta = {} }) {
  const insets = useSafeAreaInsets(); // 안드로이드 내비바(edge-to-edge)에 시트 하단이 가리지 않도록
  const myUid = useCurrentUid();      // 동반자 표시에서 본인 제외용
  const [alarmCfg, setAlarmCfg] = useState(null); // 이 라운드에 설정된 알람 { types, opts } — 요약 표시
  // 시트 안에서 삭제 confirm을 처리 — 별도 Modal(AppAlert) 띄우면 RN의 Modal 3중 중첩에서 z-index 깨져 alert가 부모 뒤에 깔림
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [group, setGroup] = useState(null); // 전파 일정 그룹(동반자 이름 보강)
  const [roundupPost, setRoundupPost] = useState(null); // 라운지 일정의 모집글 — 공지(teamNotice)·호스트(authorUid) 원본
  const [comments, setComments] = useState([]); // 전파 일정 '이야기'(댓글) — 미리보기용(전체는 별도 모달). 실시간 구독.
  // 이야기는 전파(동반자 공유) 일정만 — 라운지는 라운지 댓글이 따로 있음
  const canComment = !!(schedule?.groupId && !schedule?.roundupId);
  useEffect(() => {
    if (!visible || !canComment) { setComments([]); return; }
    const unsub = subscribeScheduleComments(schedule.groupId, setComments, 30);
    return () => unsub();
  }, [visible, canComment, schedule?.groupId]);
  const [friendNames, setFriendNames] = useState({}); // uid→닉네임 — friendMeta엔 별명만 있어 닉네임은 친구목록에서 보강
  // 메모(공지) 인라인 편집 — 일정수정 폼 안 열고 카드에서 바로. 저장은 부모 onSaveMemo(전파 로직 포함)에 위임.
  const [editingMemo, setEditingMemo] = useState(false);
  const [memoDraft, setMemoDraft] = useState('');
  const [savingMemo, setSavingMemo] = useState(false);
  useEffect(() => { if (!visible) { setConfirmDelete(false); setEditingMemo(false); setSavingMemo(false); } }, [visible]); // 시트 닫힐 때 상태 초기화

  // 인라인 메모 저장 — 부모가 문서 갱신(editSchedule)+그룹 전파(propagateMemoEdit) 처리. 성공 후 그룹 최신화(공지/확인 갱신).
  const saveMemoInline = async () => {
    if (savingMemo || !onSaveMemo) return;
    // 변경 없으면 저장/전파 생략. 표시 중인 메모(라운지=teamNotice / 전파=group.memo / 개인=schedule.memo) 기준 비교.
    const current = (schedule?.roundupId
      ? (roundupPost?.teamNotice || '')
      : (schedule?.groupId && group ? (group?.memo || schedule?.memo || '') : (schedule?.memo || ''))).trim();
    if (memoDraft.trim() === current) { setEditingMemo(false); return; }
    setSavingMemo(true);
    try {
      await onSaveMemo(schedule, memoDraft, current);   // current=표시 중이던 옛 메모(전파 시 공지 미리보기 기준)
      // 저장 후 원본 최신화 — 라운지=모집글 공지 / 전파=그룹 공지·확인
      if (schedule?.roundupId) {
        try { const rp = await loadRoundup(schedule.roundupId); if (rp) setRoundupPost(rp); } catch (e) {}
      } else if (schedule?.groupId) {
        try { const g = await getScheduleGroup(schedule.groupId); if (g) setGroup(g); } catch (e) {}
      }
      setEditingMemo(false);
    } catch (e) {
      // 실패 시 편집 상태 유지(입력 보존)
    } finally { setSavingMemo(false); }
  };

  // 공지 확인 ✓ — 서버에 내 uid 키만 기록 + 로컬 group에 낙관 반영(재로드 없이 즉시 표시).
  //   유효성은 at > memoAt 비교라 공지가 수정되면 자동 무효(2026-07-10, [[schedule-propagation-spec]] 공지 확인).
  const handleAckMemo = async () => {
    if (!schedule?.groupId || !myUid) return;
    const name = group?.names?.[myUid] || '';
    setGroup(g => g ? { ...g, memoAcks: { ...(g.memoAcks || {}), [myUid]: { name, at: { toMillis: () => Date.now() } } } } : g);
    try { await ackGroupMemo(schedule.groupId, myUid, name); }
    catch (e) { if (__DEV__) console.warn('[sheet] ackMemo', e?.message); }
  };
  // 시트를 '완성된 상태로' 슬라이드시킨다 — 부가데이터(알람 설정·전파 그룹·친구 닉네임)를 먼저 로드한 뒤에야
  //   Modal을 열어(showSheet), 열린 뒤 알람요약·동반자·메모가 계단식으로 삽입/리플로우되던 것을 근본 제거
  //   (사용자 2026-07-07 — '열고 나서 채우기'는 무엇이 늦든 계단식이 생겨, '로드 후 열기'로 전환).
  //   느린 네트워크 대비 최대 600ms 캡 — 그 안에 못 받으면 있는 것만으로 오픈(드물게만 잔여 채움). 솔로는 알람만이라 즉시.
  const [showSheet, setShowSheet] = useState(false);
  useEffect(() => {
    if (!visible || !schedule?.id) { setShowSheet(false); setAlarmCfg(null); setGroup(null); setRoundupPost(null); setFriendNames({}); return; }
    let alive = true;
    const cap = setTimeout(() => { if (alive) setShowSheet(true); }, 600);
    (async () => {
      const [cfg, g, rp] = await Promise.all([
        getAlarmConfig(schedule.id).catch(() => null),
        schedule.groupId ? getScheduleGroup(schedule.groupId).catch(() => null) : Promise.resolve(null),
        schedule.roundupId ? loadRoundup(schedule.roundupId).catch(() => null) : Promise.resolve(null),
      ]);
      if (!alive) return;
      setRoundupPost(rp);
      // 동반자 이름은 그룹뿐 아니라(옛 그룹=이름맵 없음) 친구목록까지 필요 → 함께 받아 한 번에 반영
      //   ([[schedule-propagation-spec]] — '친구 초대' 동반자는 audienceUids에만 있어 그룹+닉네임 없이는 '친구'로만 떴음).
      let fnames = {};
      if (g && !(g.names && Object.keys(g.names).length)) {
        const list = await loadMyFriendsEnriched().catch(() => null);
        if (!alive) return;
        if (list) list.forEach(f => { if (f?.id) fnames[f.id] = f.customName || f.name || ''; });
      }
      if (!alive) return;
      setAlarmCfg(cfg); setGroup(g); setFriendNames(fnames);
      setShowSheet(true); // 데이터 준비 완료 → 완성된 상태로 슬라이드
    })();
    return () => { alive = false; clearTimeout(cap); };
  }, [visible, schedule?.id, schedule?.groupId, schedule?.roundupId]);
  if (!schedule) return null;
  const dd = schedule.dDay;
  const isPast = dd != null && dd < 0;        // 지난 라운딩 — 날씨·교통 숨김
  const isOverseas = !!schedule.overseas;     // 해외 일정 — 교통 숨김
  // 라운딩 종료(티오프+4h) 경과 여부 — 홈 종료 카드(HomeScreen.teeoffEndMs)·캘린더(MyScheduleTab.roundEnded)와 통일.
  //   라운딩이 끝나면 모집연동 D-0 일정이 '라운지에서 취소'도 못 하고 캘린더 삭제도 막혀 갇히던 함정 해소
  //   (사용자 2026-06-20). date 'YYYY.MM.DD' + time 'HH:MM'.
  const roundOver = (() => {
    if (!schedule.date) return false;
    const [y, m, d] = String(schedule.date).split('.').map(Number);
    const [hh, mm] = String(schedule.time || '08:00').split(':').map(Number);
    if (!y || !m || !d) return false;
    const teeOff = new Date(y, m - 1, d, hh || 8, mm || 0).getTime();
    if (Number.isNaN(teeOff)) return false;
    return Date.now() > teeOff + 4 * 3600 * 1000;
  })();

  // 동반자 닉네임 한 줄 — companions + 전파 그룹(수락=정식 / 미수락=초대중) 보강. 공용 유틸(캘린더 카드와 동일 로직).
  //   공유(동반자에게 공유)에도 이 이름을 넘겨 카드·텍스트에 표시한다 — 시트가 이미 그룹까지 해석해 갖고 있어 재계산 불필요.
  const companionNames = buildCompanionNames(schedule, { group, friendMeta, friendNames, myUid });

  // ★공유·초대를 나열 리스트에서 빼 '친구와 함께' 큰 카드로 승격(사용자 2026-07-27, 중장년 스캔성).
  //   둘 다 "친구한테 알리기"인데 리스트에 미묘한 라벨로 파묻혀 못 찾던 걸, 큰 터치타깃 + 부제 설명으로.
  //   과거 일정엔 초대가 없고(캘린더 공유만) 카드 프레이밍('이 라운딩, 친구와 함께')도 안 맞아 기존 리스트 행으로 남긴다.
  const canInvite = !!onInviteFriends && !isPast && !schedule.roundupId;   // 앱 친구 인앱 전파(수락 시 그 친구 캘린더에)
  const canShare = !!onShare && !isPast;                                   // 카드+링크 외부 공유(카톡·문자)
  // ★모집(라운지)에서 생긴 일정은 '이야기'가 없고 '일정 수정'도 막혀 있어 '모집 보기'가 사실상 주 관리 동선.
  //   그래서 격자에 묻지 않고 상단 카드(링크 공유 옆)로 올린다(사용자 2026-07-27). 친구초대와는 조건이 배타적이라 항상 2칸.
  const canRoundupView = !!onOpenRoundup && !!schedule.roundupId && !isPast;
  const showTogether = canInvite || canShare || canRoundupView;

  // icon: 커스텀 라인 아이콘 있으면 그걸로(통일감), 없으면 emoji 폴백(공유·삭제는 매칭 아이콘 없음).
  const allItems = [
    { key: 'wx', icon: 'sun', emoji: '☀️', label: '날씨 확인', onPress: onWeather },   // 해만(앰버) — cloudSun은 흰 구름이라 밝은 시트서 안 보임
    { key: 'tr', icon: 'car', color: SAGE, size: 24, emoji: '🚗', label: '교통 · 출발시간', onPress: onTraffic },   // 차 그림이 납작해 살짝 키움
    // 알람 — 기상·출발 시각 설정/변경(설정돼 있으면 위 요약에 시각 표시). 닫고 부모가 알람 화면 엶 ([[smart-preround-timing-plan]])
    //   아직 안 건 라운드엔 부제·NEW로 발견성↑(기능 모르고 지나치는 것 방지). 이미 걸면 깔끔히 '알람 변경'만(잔소리 X).
    { key: 'al', icon: 'bell', emoji: '🔔', label: alarmCfg?.types?.length ? '알람 변경' : '알람 설정', onPress: onAlarm,
      subtitle: alarmCfg?.types?.length ? null : '기상·출발 시각 자동 계산', isNew: !alarmCfg?.types?.length },
    // 단체팀 — 조 편성·팀별 티오프(단체 모집 일정만). 교통 바로 밑·navy 강조로 눈에 띄게 ([[event-model]])
    { key: 'team', icon: 'clipboard', emoji: '🗂', label: '단체팀 · 조 편성·티오프', onPress: onTeam, highlight: true },
    // 모집 보기 — 모집 연동 예정 일정은 일정수정이 막혀 있어, 원본 모집글(라운지 상세)로 직행해 거기서 관리 ([[roundup-schedule-delete-policy]])
    { key: 'rd', icon: 'flag', emoji: '🚩', label: '모집 보기', onPress: onOpenRoundup },
    // 동반자에게 공유 — 카드(이미지)+링크 텍스트. 시트가 해석한 동반자 이름을 넘겨 카드·텍스트에 표시한다.
    { key: 'sh', icon: 'share', emoji: '📩', label: '동반자에게 공유', onPress: () => onShare && onShare(companionNames) },
    // 인앱 일정 전파 — 친구를 골라 초대, 수락 시 그 친구 일정에도 등록(외부 링크 공유와 별개) ([[schedule-propagation-spec]])
    { key: 'iv', icon: 'personAdd', emoji: '🗓️', label: '친구 일정에 초대', onPress: onInviteFriends },
    // 함께 식사 — 식당 정하기/길찾기(홈 카드와 동일 기능, 일정캘린더에서도 접근) ([[afterround-meal-decision]])
    { key: 'ml', icon: 'bowl', emoji: '🍲', label: '함께 식사', onPress: onMeal },
    { key: 'ed', icon: 'pen', emoji: '✏️', label: '일정 수정', onPress: onEdit },
    { key: 'dl', icon: 'trash', emoji: '🗑️', label: '일정 삭제', onPress: () => setConfirmDelete(true), danger: true },
  ];
  const items = allItems.filter(it => {
    // 공유·초대는 '친구와 함께' 카드로 승격됐으니 리스트에선 뺀다(과거 일정은 카드가 없어 공유 행 유지).
    if ((it.key === 'sh' || it.key === 'iv') && showTogether) return false;
    // 모집 보기도 상단 카드로 승격(모집 일정만) — 격자에서 뺀다.
    if (it.key === 'rd' && canRoundupView) return false;
    if (isPast && (it.key === 'wx' || it.key === 'tr')) return false;
    if (isOverseas && it.key === 'tr') return false;
    // 알람 — 핸들러 있을 때만, 지난 일정엔 숨김(예정 라운드 알람용)
    if (it.key === 'al' && (!onAlarm || isPast)) return false;
    // 친구 일정 초대 — 핸들러 있을 때만, 지난 일정·라운지연동 일정엔 숨김(라운지는 자체 참여 동선)
    if (it.key === 'iv' && (!onInviteFriends || isPast || schedule.roundupId)) return false;
    // 함께 식사 — 핸들러 있을 때만, 지난 일정엔 숨김(뒤풀이는 당일까지). 라운지연동도 허용(동호회 단체 식사).
    if (it.key === 'ml' && (!onMeal || isPast)) return false;
    // 단체팀 — 라운지 단체 모집(roundupId + teams>1) 일정에만. 핸들러 있을 때만.
    if (it.key === 'team' && !(onTeam && schedule.roundupId && (schedule.teams || 1) > 1)) return false;
    // 모집 보기 — 모집 연동 예정 일정에만(일정수정이 숨겨진 자리 대체). 핸들러 있을 때만.
    if (it.key === 'rd' && !(onOpenRoundup && schedule.roundupId && !isPast)) return false;
    // 일정 수정 — 라운지 모집으로 만들어진 예정 일정은 구장·날짜가 모집에서 내려와 로컬 수정이 반영 안 됨(라운지에서 관리) → 숨김.
    //   삭제는 '라운지 일정' 안내로 별도 처리. 지난 일정은 기록 흐름이 있어 유지. (사용자 2026-06-23)
    if (it.key === 'ed' && schedule.roundupId && !isPast) return false;
    return true;
  });

  // 모든 액션(수정·삭제 포함)을 같은 아이콘 격자로(사용자 2026-07-27). 삭제는 danger 색으로 구분하고,
  //   탭하면 곧바로 지우지 않고 확인 화면(confirmDelete)을 거쳐 오탭이 사고로 이어지지 않는다.
  const gridItems = items;
  const gridRows = [];
  for (let gi = 0; gi < gridItems.length; gi += 3) gridRows.push(gridItems.slice(gi, gi + 3));

  // hasRec: 과거 라운딩 + 다이어리 기록이 있는 경우. 시트 안에서 다이어리 안내만 표시 (삭제 X)
  const hasRec = !!schedule.hasRec;
  // 모집으로 생긴 예정 일정 — 캘린더에서 직접 삭제 막고 라운지로 안내 ([[roundup-schedule-delete-policy]]).
  //   취소는 라운지 정식 동선(모집 취소·나가기)이 일정까지 정리. 과거(isPast)는 이미 끝나 일반 삭제 허용.
  //   단, 티오프+5h 지나 라운지에서 이미 숨겨졌으면(roundOver) 라운지 취소 동선이 불가 → 캘린더 직접 삭제 허용(갇힘 방지).
  const isRoundupLinked = !!schedule.roundupId && !isPast && !roundOver;
  // 코스 이동 가능 여부 — 부모(HomeScreen)가 이름 매칭까지 해석해 넘기면 그걸 우선,
  //   없으면 일정 필드(courseLogId/courseId)로 폴백 (MyScheduleTab 등 기존 호출처 무회귀).
  const canOpenCourse = courseNavigable != null
    ? courseNavigable
    : !!(schedule.courseLogId || schedule.courseId);

  // 라운드 알람 요약 — 설정된 시각(기상·출발·모임)과 고정 시점(D-3/D-1/당일)을 한 줄로.
  const alarmTL = (alarmCfg?.opts && schedule) ? computeRoundTimeline(schedule, alarmCfg.opts) : null;
  const alarmSummary = (() => {
    const t = alarmCfg?.types;
    if (!t?.length) return null;
    const parts = [];
    if (t.includes('wake') && alarmTL?.wake) parts.push(`기상 ${fmtClock(alarmTL.wake)}`);
    if (t.includes('depart') && alarmTL?.depart) parts.push(`출발 ${fmtClock(alarmTL.depart)}`);
    if (alarmCfg?.opts?.arriveAt) parts.push(`모임 ${alarmCfg.opts.arriveAt}`);
    // 고정 미리알림(3일전·전날·당일)은 요약에서 뺌 — 바로 아래 큰 D-DAY 블록과 중복(사용자 2026-07-01). 시각(기상·출발·모임)만 표시.
    return parts.length ? parts.join(' · ') : null;
  })();

  return (
    <Modal visible={visible && showSheet} transparent animationType="slide" onRequestClose={onClose}>
      <View style={sheetS.mask}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => { if (!confirmDelete) onClose(); }} />
        <View style={[sheetS.sheet, { maxHeight: '90%', paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={sheetS.handle} />
          {/* 고정 ✕ — iOS는 백버튼 없고 시트가 길면 상단(핸들)이 노치 근처라 닫기 어려움(사용자 2026-07-06).
              스크롤·길이와 무관하게 우상단 고정. 삭제 확인 중엔 숨김(취소/삭제 버튼으로 유도). */}
          {!confirmDelete && (
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={{ position: 'absolute', top: 8, right: 12, zIndex: 5, width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: fs(19), color: C.warmGray }}>✕</Text>
            </TouchableOpacity>
          )}

          {/* 확대(디스플레이 줌) 시 메뉴가 길어져 시트가 화면 위로 넘쳐 상단(구장명) 잘리던 것 방지 — maxHeight + 스크롤 */}
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
          {confirmDelete ? (
            // 시트 안 삭제 confirm — 별도 Modal(AppAlert) 우회. RN의 3중 Modal 중첩 z-index 충돌 회피.
            <View style={{ paddingHorizontal: 22, paddingTop: 14, paddingBottom: 6 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(17), color: C.charcoal, marginBottom: 8 }}>
                {hasRec ? '삭제 안내' : isRoundupLinked ? '라운지 일정' : '일정 삭제'}
              </Text>
              <Text style={{ fontFamily: F.sysM, fontSize: fs(14), color: C.charcoal, lineHeight: 22, marginBottom: 22 }}>
                {hasRec
                  ? '이 라운딩은 기록이 있어요.\nMY 탭에서 삭제해주세요.'
                  : isRoundupLinked
                    ? '이 라운딩은 라운지 모집으로\n만들어졌어요.\n취소하려면 라운지에서 모집 취소\n또는 참여 취소를 해주세요.'
                    : isPast
                      ? '이 일정을 삭제하면 일정과\n라운딩 기록이 모두 삭제됩니다.'
                      : '이 예정 라운딩을 삭제할까요?'}
              </Text>
              {(hasRec || isRoundupLinked) ? (
                <TouchableOpacity activeOpacity={0.85}
                  onPress={() => { setConfirmDelete(false); onClose(); }}
                  style={{ paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: C.charcoal }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: C.butter }}>확인</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {/* [취소]는 시트 자체 닫음 (메뉴 UI로 복귀하지 않음 — 사용자가 '또 떴다'고 부정적 인식했던 동작 제거) */}
                  <TouchableOpacity activeOpacity={0.85}
                    onPress={() => { setConfirmDelete(false); onClose(); }}
                    style={{ flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', borderWidth: 0.5, borderColor: C.hairline, backgroundColor: C.bgSecondary }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: C.charcoal }}>취소</Text>
                  </TouchableOpacity>
                  <TouchableOpacity activeOpacity={0.85}
                    onPress={() => { onDelete && onDelete(); }}
                    style={{ flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: C.burgundy }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: C.butter }}>삭제</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : (
            // 시트 기본 메뉴
            <>
              <View style={{ paddingHorizontal: 22, paddingTop: 6, paddingBottom: 14 }}>
                <TouchableOpacity onPress={onCourseTap} activeOpacity={canOpenCourse ? 0.6 : 1}>
                  <Text style={sheetS.course}>{schedule.course}
                    {canOpenCourse ? <Text style={sheetS.courseArrow}> ›</Text> : null}
                  </Text>
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                  <View style={{ width: 20, alignItems: 'center' }}><Icon name="calendar" size={17} color={C.charcoal} strokeWidth={1.7} /></View>
                  {/* 날짜·시간은 시트의 핵심 정보 — 메타(옅은 회색·작음)보다 진하고 크게(사용자 2026-07-27, 한눈에) */}
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(14.5), color: C.charcoal, marginLeft: 5, flex: 1 }}>{schedule.date} {schedule.day} · {schedule.time} · {schedule.members}명</Text>
                </View>
                {/* 동반자 — 아이콘 열·간격을 예약자와 통일. 전파 일정(groupId) 로딩 중에도 줄 자리를 잡아둠(dDay 리플로우 방지) */}
                {(companionNames.length > 0 || (schedule.groupId && !group)) && (
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 6 }}>
                    <View style={{ width: 20, alignItems: 'center', marginTop: 1 }}><Icon name="people" size={17} color={C.textSecondary} strokeWidth={1.6} /></View>
                    <Text style={[sheetS.meta, { marginTop: 0, marginLeft: 5, flex: 1 }]} numberOfLines={3}>
                      {/* 일정 전파는 최대 8명 → 8명까지 이름 다 표시(초대중 포함). 9명↑(라운지 단체 대량 모집)만 인원 축약,
                          명단은 단체팀 화면에 ([[event-model]], 5→9 상향 사용자 2026-07-06) */}
                      {companionNames.length > 8 ? `동반자 ${companionNames.length}명`
                        : companionNames.length > 0 ? companionNames.join(', ') : '동반자 확인 중…'}
                    </Text>
                  </View>
                )}
                {/* 예약자 — 프론트 체크인 이름(있을 때만) ([[schedule-booker]]) */}
                {!!schedule.booker && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                    <View style={{ width: 20, alignItems: 'center' }}><Icon name="clipboard" size={17} color={C.textSecondary} strokeWidth={1.6} /></View>
                    <Text style={[sheetS.meta, { marginTop: 0, marginLeft: 5, flex: 1 }]} numberOfLines={1}>예약자 {schedule.booker}</Text>
                  </View>
                )}
                {/* 라운드 알람 — 설정된 기상·출발·모임 시각 한 줄(있을 때만). 변경은 아래 메뉴 '알람'에서 */}
                {!isPast && alarmSummary && (
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 6 }}>
                    <View style={{ width: 20, alignItems: 'center', marginTop: 1 }}><Icon name="bell" size={15} color={C.textSecondary} strokeWidth={1.6} /></View>
                    <Text style={[sheetS.meta, { marginTop: 0, marginLeft: 5, flex: 1 }]} numberOfLines={2}>{alarmSummary}</Text>
                  </View>
                )}
                {dd != null && (
                  isPast ? (
                    <Text style={[sheetS.ddayLabel, { marginTop: 12 }]}>지난 라운딩이에요</Text>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 14 }}>
                      <Text style={sheetS.dday}>{dd === 0 ? 'D-DAY' : `D-${dd}`}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={sheetS.ddayLabel}>{dd === 0 ? '오늘 라운딩이에요' : `${dd}일 후 라운딩이에요`}</Text>
                        <GreenFlag size={18} />
                      </View>
                    </View>
                  )
                )}
                {/* 메모(공지) 카드 — 인라인 편집 지원. 3종:
                    ①라운지 모집(roundupId) = 모집글 공지(teamNotice), '호스트만' 편집·참가자 열람
                    ②전파(groupId)          = group.memo, 동반자 공유(전원 편집·확인)
                    ③혼자                    = schedule.memo, 개인 메모 */}
                {(() => {
                  const isRoundup = !!schedule.roundupId;
                  const isGroupMemo = !isRoundup && !!(schedule.groupId && group);
                  const isNotice = isRoundup || isGroupMemo;   // 공지(확성기) vs 개인 메모(메모판)
                  // group.memo가 비어 있으면 schedule.memo로 폴백(그룹 동기화 전 '잠깐 보이다 사라짐' 방지, 2026-07-06).
                  const memoText = isRoundup ? (roundupPost?.teamNotice || '')
                    : isGroupMemo ? (group?.memo || schedule.memo || '')
                    : (schedule.memo || '');
                  const label = isNotice ? '공지' : '메모';
                  // 편집 권한: 라운지=호스트(authorUid)만 / 전파·개인=onSaveMemo 있으면 누구나
                  const isHost = isRoundup && !!roundupPost && roundupPost.authorUid === myUid;
                  const canEdit = !!onSaveMemo && (isRoundup ? isHost : true);

                  // ── 편집 중 ── 카드 안에서 바로 수정(일정수정 폼 안 엶)
                  if (editingMemo) {
                    return (
                      <View style={{ marginTop: 16, backgroundColor: 'rgba(245,230,168,0.5)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                          <Icon name={isNotice ? 'megaphone' : 'clipboard'} size={fs(15)} color={C.burgundy} />
                          <Text style={{ fontFamily: F.sysSb, fontSize: fs(11.5), color: C.burgundy, marginLeft: 5, letterSpacing: 0.4 }}>{label} 수정</Text>
                        </View>
                        <AppTextInput
                          value={memoDraft} onChangeText={setMemoDraft} multiline autoFocus
                          placeholder={'준비물·집결 장소·조 편성 등 자유롭게'}
                          placeholderTextColor={C.warmGrayLight}
                          style={{ fontFamily: F.sys, fontSize: fs(15), color: C.charcoal, lineHeight: 22, minHeight: 66, textAlignVertical: 'top', backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }}
                        />
                        {isNotice && (
                          <Text style={{ fontFamily: F.sys, fontSize: fs(10.5), color: C.warmGray, marginTop: 6 }}>
                            {isRoundup ? '모집 참가자 모두에게 공지로 보여요' : '수정하면 동반자에게 공지가 다시 전달되고 확인이 초기화돼요'}
                          </Text>
                        )}
                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 6, marginTop: 10 }}>
                          <TouchableOpacity onPress={() => setEditingMemo(false)} disabled={savingMemo} activeOpacity={0.7} style={{ paddingHorizontal: 14, paddingVertical: 7 }}>
                            <Text style={{ fontFamily: F.sysM, fontSize: fs(13), color: C.warmGray }}>취소</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={saveMemoInline} disabled={savingMemo} activeOpacity={0.85}
                            style={{ paddingHorizontal: 16, paddingVertical: 7, borderRadius: 9, backgroundColor: C.burgundy, opacity: savingMemo ? 0.6 : 1 }}>
                            <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.butter }}>{savingMemo ? '저장 중…' : '저장'}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  }

                  // ── 메모 없음 → '추가하기' (편집 가능할 때만) ──
                  if (!memoText) {
                    if (!canEdit) return null;
                    return (
                      <TouchableOpacity onPress={() => { setMemoDraft(''); setEditingMemo(true); }} activeOpacity={0.7}
                        style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, backgroundColor: 'rgba(107,30,42,0.06)', paddingHorizontal: 14, paddingVertical: 11 }}>
                        <Icon name="pen" size={15} color={C.burgundy} />
                        <Text style={{ fontFamily: F.sysM, fontSize: fs(13), color: C.burgundy }}>{label} 추가하기</Text>
                      </TouchableOpacity>
                    );
                  }

                  // ── 메모 있음 → 카드 + 연필(수정) ──
                  const editor = isRoundup ? (roundupPost?.authorName || '') : (isGroupMemo ? (group?.memoByName || '') : '');
                  // 확인(✓) — at > memoAt 인 것만 유효(공지가 수정되면 자동 리셋). 이름은 그룹 names 맵 → ack 기록 순.
                  const memoAtMs = group?.memoAt?.toMillis ? group.memoAt.toMillis() : 0;
                  const acks = isGroupMemo ? Object.entries(group?.memoAcks || {})
                    .filter(([, a]) => a?.at?.toMillis && a.at.toMillis() >= memoAtMs)
                    .map(([u, a]) => ({ uid: u, name: group?.names?.[u] || a.name || '' })) : [];
                  const iAcked = acks.some(a => a.uid === myUid);
                  const isAuthor = isGroupMemo && group?.memoBy === myUid;
                  const ackNames = acks.map(a => a.name).filter(Boolean).join(' · ');
                  return (
                    <View style={{ marginTop: 16, backgroundColor: 'rgba(245,230,168,0.5)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                        <Icon name={isNotice ? 'megaphone' : 'clipboard'} size={fs(15)} color={C.burgundy} />
                        {/* 라운지·전파 일정은 '공지' — 참가자·동반자에게 보이는 성격이라 개인 '메모'와 표기 분리(사용자 2026-07-10) */}
                        <Text style={{ fontFamily: F.sysSb, fontSize: fs(11.5), color: C.burgundy, marginLeft: 5, letterSpacing: 0.4 }}>{label}</Text>
                        {canEdit && (
                          <TouchableOpacity onPress={() => { setMemoDraft(memoText); setEditingMemo(true); }} activeOpacity={0.7}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Icon name="pen" size={13} color={C.warmGray} />
                            <Text style={{ fontFamily: F.sysM, fontSize: fs(11.5), color: C.warmGray }}>수정</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(15), color: C.charcoal, lineHeight: 23 }}>{memoText}</Text>
                      {!!editor && (
                        <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 8 }}>
                          {isRoundup ? `${editor}님(호스트) 공지` : `✎ ${editor}님이 마지막으로 수정`}
                        </Text>
                      )}
                      {/* 확인 줄 — 누가 봤는지 + 내 확인 버튼('네~' 답장 수정 대신, 푸시 소음 없이) */}
                      {isGroupMemo && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, flexWrap: 'wrap', gap: 8 }}>
                          <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, flexShrink: 1 }}>
                            {ackNames ? `확인 ✓ ${ackNames}` : '아직 확인한 동반자가 없어요'}
                          </Text>
                          {!isAuthor && !iAcked && (
                            <TouchableOpacity onPress={handleAckMemo} activeOpacity={0.8}
                              style={{ paddingHorizontal: 11, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: C.burgundy, backgroundColor: 'rgba(107,30,42,0.06)' }}>
                              <Text style={{ fontFamily: F.sysSb, fontSize: fs(11.5), color: C.burgundy }}>확인했어요 ✓</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })()}

                {/* 이야기(댓글) 미리보기 — 전파 일정만. 공지(결론) 아래 대화(과정). 시트 길어지지 않게 최근 1개만·전체는 모달. */}
                {canComment && !!onOpenComments && (
                  <TouchableOpacity onPress={onOpenComments} activeOpacity={0.7}
                    style={{ marginTop: 16, borderRadius: 12, backgroundColor: 'rgba(26,61,82,0.09)', paddingHorizontal: 14, paddingVertical: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: comments.length ? 7 : 0 }}>
                      <Icon name="chat" size={fs(16)} color={C.navy} />
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.navy, marginLeft: 6, letterSpacing: 0.3 }}>이야기</Text>
                      {comments.length > 0 && <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.navy, marginLeft: 4 }}>{comments.length}</Text>}
                      <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: C.warmGray, marginLeft: 'auto' }}>{comments.length ? '모두 보기 ›' : '한마디 남기기 ›'}</Text>
                    </View>
                    {comments.length > 0 && (() => {
                      const last = comments[comments.length - 1];
                      const nm = (last.authorName || '').trim();
                      return (
                        <Text numberOfLines={1} style={{ fontFamily: F.sys, fontSize: fs(13), lineHeight: 20, color: C.charcoal }}>
                          {nm ? <Text style={{ color: C.warmGray }}>{nm}: </Text> : null}{last.body}
                        </Text>
                      );
                    })()}
                  </TouchableOpacity>
                )}

                {/* ★친구와 함께 — 공유·초대를 리스트에서 승격한 큰 카드(중장년 스캔성). 타일 2개(하나면 전폭).
                    친구 초대=앱 친구 캘린더에 전파 / 링크 공유=카톡·문자 외부 공유. 부제로 차이를 바로 설명. */}
                {showTogether && (
                  <View style={{ marginTop: 18 }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(13.5), color: C.textSecondary, marginBottom: 10, letterSpacing: 0.3 }}>
                      {/* 모집 일정은 [링크 공유][모집 보기] 조합이라 '친구와 함께'가 안 맞음 → '관리'로(사용자 2026-07-27) */}
                      {canRoundupView ? '이 라운딩 관리' : '이 라운딩, 친구와 함께'}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      {[
                        canInvite && { key: 'iv', icon: 'personAdd', tint: 'rgba(107,30,42,0.08)', color: C.burgundy,
                          title: '친구 초대', sub: '앱 친구 캘린더에', onPress: onInviteFriends },
                        canShare && { key: 'sh', icon: 'share', tint: 'rgba(26,61,82,0.08)', color: C.navy,
                          title: '링크 공유', sub: '카톡·문자로', onPress: () => onShare && onShare(companionNames) },
                        canRoundupView && { key: 'rd', icon: 'flag', tint: 'rgba(94,126,66,0.12)', color: SAGE,
                          title: '모집 보기', sub: '라운지에서 관리', onPress: onOpenRoundup },
                      ].filter(Boolean).map(t => (
                        <TouchableOpacity key={t.key} onPress={t.onPress} activeOpacity={0.85}
                          style={{ flex: 1, alignItems: 'center', paddingVertical: 16, paddingHorizontal: 8, borderRadius: 16,
                            backgroundColor: C.bgSecondary }}>
                          <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: t.tint,
                            alignItems: 'center', justifyContent: 'center', marginBottom: 9 }}>
                            <Icon name={t.icon} size={25} color={t.color} strokeWidth={1.7} />
                          </View>
                          <Text style={{ fontFamily: F.sysB, fontSize: fs(15.5), color: C.charcoal }}>{t.title}</Text>
                          <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 3 }}>{t.sub}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
              </View>
              <TripleStripe height={2} />
              {/* ★액션 격자 — 날씨·교통·알람·식사·단체팀·모집을 큰 아이콘 타일로(중장년 '한눈에', 사용자 2026-07-27).
                  나열식 텍스트 행 → 아이콘+짧은 라벨 3열 격자. 위험한 관리(수정·삭제)는 격자에 안 섞고 아래 별도. */}
              {gridRows.length > 0 && (
                <View style={{ paddingHorizontal: 18, paddingTop: 16 }}>
                  {gridRows.map((row, ri) => (
                    <View key={ri} style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                      {row.map(it => {
                        const cfg = TILE[it.key] || { color: C.charcoal, tint: C.bgSecondary, short: it.label };
                        return (
                          <TouchableOpacity key={it.key} onPress={it.onPress} activeOpacity={0.85}
                            style={{ flex: 1, alignItems: 'center', paddingVertical: 15, paddingHorizontal: 4, borderRadius: 16,
                              backgroundColor: it.highlight ? '#EDF1F4' : C.bgSecondary }}>
                            {it.isNew && (
                              <View style={{ position: 'absolute', top: 7, right: 7, backgroundColor: C.burgundy,
                                borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1.5 }}>
                                <Text style={{ fontFamily: F.sysB, fontSize: fs(8.5), color: '#fff', letterSpacing: 0.4 }}>NEW</Text>
                              </View>
                            )}
                            <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: cfg.tint,
                              alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                              <Icon name={it.icon} size={it.size || 24} color={cfg.color} strokeWidth={1.7} />
                            </View>
                            <Text style={{ fontFamily: F.sysSb, fontSize: fs(13.5), color: it.danger ? '#D32F2F' : C.charcoal }} numberOfLines={1}>{cfg.short}</Text>
                          </TouchableOpacity>
                        );
                      })}
                      {/* 마지막 줄이 3칸이 안 차면 빈 칸으로 정렬 유지 */}
                      {row.length < 3 && Array.from({ length: 3 - row.length }).map((_, k) => (
                        <View key={`sp${k}`} style={{ flex: 1 }} />
                      ))}
                    </View>
                  ))}
                </View>
              )}

              <View style={{ height: 8 }} />
            </>
          )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
