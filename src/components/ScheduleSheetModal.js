import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { sheetS } from '../styles/sheetS';
import { Icon, GreenFlag } from './common/Icon';
import { TripleStripe } from './common/TripleStripe';
import { buildCompanionNames } from '../utils/scheduleCompanions';
import { getAlarmConfig, computeRoundTimeline, fmtClock } from '../utils/notifications'; // 라운드 알람 요약 표시
import { useCurrentUid } from '../contexts/CurrentUidContext';
import { getScheduleGroup } from '../utils/scheduleShares';
import { loadMyFriendsEnriched } from '../utils/friends';

const SAGE = '#5E7E42';   // 세이지그린 — 교통 아이콘 액센트(앱 크루 세이지와 동색)

export function ScheduleSheetModal({ visible, schedule, onClose, onCourseTap, onWeather, onTraffic, onShare, onInviteFriends, onMeal, onTeam, onOpenRoundup, onEdit, onDelete, onAlarm, courseNavigable, friendMeta = {} }) {
  const insets = useSafeAreaInsets(); // 안드로이드 내비바(edge-to-edge)에 시트 하단이 가리지 않도록
  const myUid = useCurrentUid();      // 동반자 표시에서 본인 제외용
  const [alarmCfg, setAlarmCfg] = useState(null); // 이 라운드에 설정된 알람 { types, opts } — 요약 표시
  useEffect(() => {
    if (!visible || !schedule?.id) { setAlarmCfg(null); return; }
    let alive = true;
    getAlarmConfig(schedule.id).then(c => { if (alive) setAlarmCfg(c); }).catch(() => {});
    return () => { alive = false; };
  }, [visible, schedule?.id]);
  // 시트 안에서 삭제 confirm을 처리 — 별도 Modal(AppAlert) 띄우면 RN의 Modal 3중 중첩에서 z-index 깨져 alert가 부모 뒤에 깔림
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [group, setGroup] = useState(null); // 전파 일정 그룹(동반자 이름 보강)
  const [friendNames, setFriendNames] = useState({}); // uid→닉네임 — friendMeta엔 별명만 있어 닉네임은 친구목록에서 보강
  useEffect(() => { if (!visible) setConfirmDelete(false); }, [visible]); // 시트 닫힐 때 상태 초기화
  // 전파 일정(groupId)이면 그룹 + 친구 닉네임 맵 로드 — memberUids(수락)·audienceUids(초대중)로 동반자 이름 보강.
  //   '친구 초대'로 부른 동반자는 schedule.companions엔 없고 audienceUids에만 있어, 그룹 + 닉네임 없이는 '친구'로만 떴음([[schedule-propagation-spec]]).
  useEffect(() => {
    if (!visible || !schedule?.groupId) { setGroup(null); setFriendNames({}); return; }
    let alive = true;
    getScheduleGroup(schedule.groupId).then(g => {
      if (!alive) return;
      setGroup(g);
      // 그룹에 이름맵(names)이 있으면(신규) 친구목록 조회 생략 = 최적화. 없으면(옛 그룹) 폴백 조회.
      if (g?.names && Object.keys(g.names).length) { setFriendNames({}); return; }
      loadMyFriendsEnriched().then(list => {
        if (!alive) return;
        const m = {};
        (list || []).forEach(f => { if (f?.id) m[f.id] = f.customName || f.name || ''; });
        setFriendNames(m);
      }).catch(() => {});
    }).catch(() => {});
    return () => { alive = false; };
  }, [visible, schedule?.groupId]);
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
    { key: 'sh', icon: 'share', emoji: '📩', label: '동반자에게 공유', onPress: onShare },
    // 인앱 일정 전파 — 친구를 골라 초대, 수락 시 그 친구 일정에도 등록(외부 링크 공유와 별개) ([[schedule-propagation-spec]])
    { key: 'iv', icon: 'personAdd', emoji: '🗓️', label: '친구 일정에 초대', onPress: onInviteFriends },
    // 함께 식사 — 식당 정하기/길찾기(홈 카드와 동일 기능, 일정캘린더에서도 접근) ([[afterround-meal-decision]])
    { key: 'ml', icon: 'bowl', emoji: '🍲', label: '함께 식사', onPress: onMeal },
    { key: 'ed', icon: 'pen', emoji: '✏️', label: '일정 수정', onPress: onEdit },
    { key: 'dl', icon: 'trash', emoji: '🗑️', label: '일정 삭제', onPress: () => setConfirmDelete(true), danger: true },
  ];
  const items = allItems.filter(it => {
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

  // 동반자 닉네임 한 줄 — companions + 전파 그룹(수락=정식 / 미수락=초대중) 보강. 공용 유틸(캘린더 카드와 동일 로직).
  const companionNames = buildCompanionNames(schedule, { group, friendMeta, friendNames, myUid });

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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={sheetS.mask}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => { if (!confirmDelete) onClose(); }} />
        <View style={[sheetS.sheet, { maxHeight: '90%', paddingBottom: 20 + insets.bottom }]}>
          <View style={sheetS.handle} />

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
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                  <View style={{ width: 20, alignItems: 'center' }}><Icon name="calendar" size={16} color={C.textSecondary} strokeWidth={1.6} /></View>
                  <Text style={[sheetS.meta, { marginTop: 0, marginLeft: 5, flex: 1 }]}>{schedule.date} {schedule.day} · {schedule.time} · {schedule.members}명</Text>
                </View>
                {/* 동반자 — 아이콘 열·간격을 예약자와 통일. 전파 일정(groupId) 로딩 중에도 줄 자리를 잡아둠(dDay 리플로우 방지) */}
                {(companionNames.length > 0 || (schedule.groupId && !group)) && (
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 6 }}>
                    <View style={{ width: 20, alignItems: 'center', marginTop: 1 }}><Icon name="people" size={17} color={C.textSecondary} strokeWidth={1.6} /></View>
                    <Text style={[sheetS.meta, { marginTop: 0, marginLeft: 5, flex: 1 }]} numberOfLines={2}>
                      {/* 단체 등 5명 이상이면 이름 나열 대신 인원만(명단은 단체팀 화면에) ([[event-model]]) */}
                      {companionNames.length > 4 ? `동반자 ${companionNames.length}명`
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
              </View>
              <TripleStripe height={2} />
              {items.map((it, i) => (
                <TouchableOpacity
                  key={it.key}
                  style={[sheetS.row, i < items.length - 1 && sheetS.rowBorder, it.highlight && { backgroundColor: '#EDF1F4' }]}
                  onPress={it.onPress}
                  activeOpacity={0.6}>
                  {it.icon
                    ? <View style={{ width: 22, alignItems: 'center' }}><Icon name={it.icon} size={it.size || 21} color={it.highlight ? C.navy : (it.color || (it.danger ? '#D32F2F' : C.charcoal))} /></View>
                    : <Text style={sheetS.rowEmoji}>{it.emoji}</Text>}
                  {it.subtitle ? (
                    // 라벨 + 가치 부제(세로) — flex:1로 우측 NEW 배지를 끝으로 밀어냄
                    <View style={{ flex: 1 }}>
                      <Text style={[sheetS.rowText, it.highlight && { color: C.navy, fontFamily: F.sysB }]}>{it.label}</Text>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: C.warmGray, marginTop: 2 }}>{it.subtitle}</Text>
                    </View>
                  ) : (
                    <Text style={[sheetS.rowText, it.danger && sheetS.rowDanger, it.highlight && { color: C.navy, fontFamily: F.sysB }]}>{it.label}</Text>
                  )}
                  {it.isNew && (
                    <View style={{ backgroundColor: C.burgundy, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(9), color: '#fff', letterSpacing: 0.5 }}>NEW</Text>
                    </View>
                  )}
                  {it.highlight && <Text style={{ marginLeft: 'auto', fontSize: fs(16), color: C.navy }}>›</Text>}
                </TouchableOpacity>
              ))}
              <View style={{ height: 8 }} />
            </>
          )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
