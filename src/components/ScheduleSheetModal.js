import React from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { sheetS } from '../styles/sheetS';
import { TripleStripe } from './common/TripleStripe';

export function ScheduleSheetModal({ visible, schedule, onClose, onCourseTap, onWeather, onTraffic, onShare, onEdit, onDelete }) {
  if (!schedule) return null;
  const dd = schedule.dDay;
  const isPast = dd != null && dd < 0;        // 지난 라운딩 — 날씨·교통 숨김
  const isOverseas = !!schedule.overseas;     // 해외 일정 — 교통 숨김

  const allItems = [
    { key: 'wx', emoji: '☀️', label: '날씨 확인', onPress: onWeather },
    { key: 'tr', emoji: '🚗', label: '교통 · 출발시간', onPress: onTraffic },
    { key: 'sh', emoji: '📩', label: '동반자에게 공유', onPress: onShare },
    { key: 'ed', emoji: '✏️', label: '일정 수정', onPress: onEdit },
    { key: 'dl', emoji: '🗑️', label: '일정 삭제', onPress: onDelete, danger: true },
  ];
  const items = allItems.filter(it => {
    if (isPast && (it.key === 'wx' || it.key === 'tr')) return false;
    if (isOverseas && it.key === 'tr') return false;
    return true;
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={sheetS.mask}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={sheetS.sheet}>
          <View style={sheetS.handle} />
          <View style={{ paddingHorizontal: 22, paddingTop: 6, paddingBottom: 14 }}>
            <TouchableOpacity onPress={onCourseTap} activeOpacity={(schedule.courseLogId || schedule.courseId) ? 0.6 : 1}>
              <Text style={sheetS.course}>{schedule.course}
                {(schedule.courseLogId || schedule.courseId) ? <Text style={sheetS.courseArrow}> ›</Text> : null}
              </Text>
            </TouchableOpacity>
            <Text style={sheetS.meta}>{schedule.date} {schedule.day} · {schedule.time} · {schedule.members}명</Text>
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
        </View>
      </View>
    </Modal>
  );
}
