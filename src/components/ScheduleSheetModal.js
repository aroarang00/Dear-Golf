import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { sheetS } from '../styles/sheetS';
import { TripleStripe } from './common/TripleStripe';

export function ScheduleSheetModal({ visible, schedule, onClose, onCourseTap, onWeather, onTraffic, onShare, onEdit, onDelete, courseNavigable }) {
  const insets = useSafeAreaInsets(); // 안드로이드 내비바(edge-to-edge)에 시트 하단이 가리지 않도록
  // 시트 안에서 삭제 confirm을 처리 — 별도 Modal(AppAlert) 띄우면 RN의 Modal 3중 중첩에서 z-index 깨져 alert가 부모 뒤에 깔림
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => { if (!visible) setConfirmDelete(false); }, [visible]); // 시트 닫힐 때 상태 초기화
  if (!schedule) return null;
  const dd = schedule.dDay;
  const isPast = dd != null && dd < 0;        // 지난 라운딩 — 날씨·교통 숨김
  const isOverseas = !!schedule.overseas;     // 해외 일정 — 교통 숨김

  const allItems = [
    { key: 'wx', emoji: '☀️', label: '날씨 확인', onPress: onWeather },
    { key: 'tr', emoji: '🚗', label: '교통 · 출발시간', onPress: onTraffic },
    { key: 'sh', emoji: '📩', label: '동반자에게 공유', onPress: onShare },
    { key: 'ed', emoji: '✏️', label: '일정 수정', onPress: onEdit },
    { key: 'dl', emoji: '🗑️', label: '일정 삭제', onPress: () => setConfirmDelete(true), danger: true },
  ];
  const items = allItems.filter(it => {
    if (isPast && (it.key === 'wx' || it.key === 'tr')) return false;
    if (isOverseas && it.key === 'tr') return false;
    return true;
  });

  // hasRec: 과거 라운딩 + 다이어리 기록이 있는 경우. 시트 안에서 다이어리 안내만 표시 (삭제 X)
  const hasRec = !!schedule.hasRec;
  // 코스 이동 가능 여부 — 부모(HomeScreen)가 이름 매칭까지 해석해 넘기면 그걸 우선,
  //   없으면 일정 필드(courseLogId/courseId)로 폴백 (MyScheduleTab 등 기존 호출처 무회귀).
  const canOpenCourse = courseNavigable != null
    ? courseNavigable
    : !!(schedule.courseLogId || schedule.courseId);

  // 동반자 닉네임 한 줄 (모집확정·수동입력 일정 공통, 본명 아님)
  const companionNames = (schedule.companions || [])
    .map(c => (typeof c === 'string' ? c : c?.name))
    .filter(Boolean);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={sheetS.mask}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => { if (!confirmDelete) onClose(); }} />
        <View style={[sheetS.sheet, { paddingBottom: 20 + insets.bottom }]}>
          <View style={sheetS.handle} />

          {confirmDelete ? (
            // 시트 안 삭제 confirm — 별도 Modal(AppAlert) 우회. RN의 3중 Modal 중첩 z-index 충돌 회피.
            <View style={{ paddingHorizontal: 22, paddingTop: 14, paddingBottom: 6 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(17), color: C.charcoal, marginBottom: 8 }}>
                {hasRec ? '삭제 안내' : '일정 삭제'}
              </Text>
              <Text style={{ fontFamily: F.sysM, fontSize: fs(14), color: C.charcoal, lineHeight: 22, marginBottom: 22 }}>
                {hasRec
                  ? '이 라운딩은 기록이 있어요.\nMY 탭에서 삭제해주세요.'
                  : isPast
                    ? '이 일정을 삭제하면 일정과\n라운딩 기록이 모두 삭제됩니다.'
                    : '이 예정 라운딩을 삭제할까요?'}
              </Text>
              {hasRec ? (
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
                <Text style={sheetS.meta}>{schedule.date} {schedule.day} · {schedule.time} · {schedule.members}명</Text>
                {companionNames.length > 0 && (
                  <Text style={[sheetS.meta, { marginTop: 4 }]}>👥 {companionNames.join(', ')}</Text>
                )}
                {dd != null && (
                  isPast ? (
                    <Text style={[sheetS.ddayLabel, { marginTop: 12 }]}>지난 라운딩이에요</Text>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 14 }}>
                      <Text style={sheetS.dday}>{dd === 0 ? 'D-DAY' : `D-${dd}`}</Text>
                      <Text style={sheetS.ddayLabel}>
                        {dd === 0 ? '오늘 라운딩이에요 🏌️' : `${dd}일 후 라운딩이에요 🏌️`}
                      </Text>
                    </View>
                  )
                )}
              </View>
              <TripleStripe height={2} />
              {items.map((it, i) => (
                <TouchableOpacity
                  key={it.key}
                  style={[sheetS.row, i < items.length - 1 && sheetS.rowBorder]}
                  onPress={it.onPress}
                  activeOpacity={0.6}>
                  <Text style={sheetS.rowEmoji}>{it.emoji}</Text>
                  <Text style={[sheetS.rowText, it.danger && sheetS.rowDanger]}>{it.label}</Text>
                </TouchableOpacity>
              ))}
              <View style={{ height: 8 }} />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
