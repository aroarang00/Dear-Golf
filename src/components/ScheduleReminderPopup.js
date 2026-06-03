import React from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { C, F, fs } from '../constants/colors';

// 라운딩 일정 리마인드 팝업 — 주최자가 보낸 '동반자에게 일정 알리기'를 수신자가 앱에서 확인.
// 일반 알림창(OverlayAlert)과 의도적으로 다른 디자인(일정 카드형) + 탭 바깥 닫기 없음 +
// "확인했어요" 단일 버튼으로, 무의식적으로 넘기지 않고 일정을 한 번 읽게 한다.
// ([[project_roundup_kakao_chat]] 후속 — 확정 일정 리마인드)
export function ScheduleReminderPopup({ visible, notice, extraCount = 0, onConfirm }) {
  if (!notice) return null;
  const who = notice.actorName || '주최자';
  const course = notice.postTitle || '라운딩';
  const date = notice.scheduleDate || '';
  const time = notice.scheduleTime || '';

  // 요일 계산 (YYYY.MM.DD)
  let dow = '';
  if (date) {
    const [y, m, d] = date.split('.').map(Number);
    if (y && m && d) {
      const wd = ['일', '월', '화', '수', '목', '금', '토'][new Date(y, m - 1, d).getDay()];
      if (wd) dow = `(${wd})`;
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={{ flex: 1, backgroundColor: 'rgba(20,28,46,0.55)', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
        <View style={{ width: '100%', maxWidth: 360, backgroundColor: C.navy, borderRadius: 20, overflow: 'hidden' }}>
          {/* 헤더 */}
          <View style={{ alignItems: 'center', paddingTop: 24, paddingHorizontal: 24 }}>
            <Text style={{ fontSize: fs(30) }}>📣</Text>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.butter, letterSpacing: 2, marginTop: 8 }}>
              라운딩 일정 알림
            </Text>
          </View>

          {/* 일정 카드 */}
          <View style={{ margin: 20, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 14,
            borderWidth: 0.5, borderColor: 'rgba(245,230,168,0.35)', paddingVertical: 20, paddingHorizontal: 18, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(19), color: '#fff', textAlign: 'center', lineHeight: 26 }}>
              {course}
            </Text>
            {!!date && (
              <Text style={{ fontFamily: F.en, fontSize: fs(22), color: C.butter, marginTop: 10, letterSpacing: 0.5 }}>
                {date}{dow ? ` ${dow}` : ''}
              </Text>
            )}
            {!!time && (
              <Text style={{ fontFamily: F.en, fontSize: fs(26), color: '#fff', marginTop: 4, letterSpacing: 1 }}>
                {time}
              </Text>
            )}
          </View>

          <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: 'rgba(255,255,255,0.82)', textAlign: 'center',
            paddingHorizontal: 24, lineHeight: 19 }}>
            {who}님이{'\n'}라운딩 일정을 알렸어요
          </Text>
          {extraCount > 0 && (
            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: 'rgba(245,230,168,0.7)', textAlign: 'center', marginTop: 8 }}>
              외 {extraCount}건의 일정 알림이 더 있어요
            </Text>
          )}

          {/* 확인 버튼 — 의도적 확인 (탭 바깥 닫기 없음) */}
          <TouchableOpacity onPress={onConfirm} activeOpacity={0.85}
            style={{ margin: 20, marginTop: 18, backgroundColor: C.butter, borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: '#2A2008' }}>일정 확인했어요</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
