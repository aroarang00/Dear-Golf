import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { mS } from '../styles/mS';
import { Icon } from './common/Icon';
import { Spinner } from './common/Spinner';
import { getUpcomingGolfEvents } from '../utils/deviceCalendar';

// 캘린더에서 가져오기 — 폰 캘린더의 다가오는 일정을 읽어 골프 우선으로 보여주고, 고른 일정을 부모에 전달.
//   AI 호출 없음(무료·오프라인). onPick(event) → 부모(ScheduleModal)가 폼에 프리필. expo-calendar 이미 설치라 빌드 불필요.

const WD = ['일', '월', '화', '수', '목', '금', '토'];
function fmtEvent(d) {
  const mo = d.getMonth() + 1, day = d.getDate(), wd = WD[d.getDay()];
  const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
  return { date: `${mo}/${day} (${wd})`, time: `${hh}:${mm}` };
}

function EventRow({ ev, onPick }) {
  const { date, time } = fmtEvent(ev.start);
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={() => onPick(ev)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12,
        borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
      {/* 날짜/시간 배지 */}
      <View style={{ width: 62, alignItems: 'center' }}>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: ev.isGolf ? '#5F7B51' : C.charcoal }}>{date}</Text>
        <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: C.warmGray, marginTop: 2 }}>{ev.allDay ? '하루' : time}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.charcoal }}>{ev.title || '(제목 없음)'}</Text>
        {(ev.course?.name || ev.location) ? (
          <Text numberOfLines={1} style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 2 }}>
            {ev.course?.name || ev.location}
          </Text>
        ) : null}
      </View>
      <Text style={{ fontFamily: F.sysB, fontSize: fs(18), color: C.warmGrayLight }}>›</Text>
    </TouchableOpacity>
  );
}

export function CalendarImportModal({ visible, onClose, onPick }) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [granted, setGranted] = useState(true);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setLoading(true); setGranted(true); setEvents([]);
    getUpcomingGolfEvents({ days: 60 })
      .then(res => { if (!alive) return; setGranted(res.granted); setEvents(res.events || []); })
      .catch(() => { if (alive) setEvents([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [visible]);

  const golf = events.filter(e => e.isGolf);
  const others = events.filter(e => !e.isGolf);

  const handlePick = (ev) => { onPick?.(ev); onClose?.(); };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={mS.mask}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={[mS.sheet, { paddingBottom: 20 + insets.bottom, maxHeight: '82%' }]}>
          <View style={mS.handle} />

          <View style={{ paddingHorizontal: 20, paddingBottom: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Text style={[mS.title, { flex: 1, marginBottom: 0, fontSize: fs(19) }]}>캘린더에서 가져오기</Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bgSecondary }}>
                <Text style={{ fontSize: fs(15), color: C.warmGray, fontWeight: '600', lineHeight: 17 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, lineHeight: 16 }}>
              폰 캘린더의 다가오는 일정이에요. 가져올 일정을 누르면 구장·날짜·시간을 채워드려요.
            </Text>
          </View>

          {loading ? (
            <View style={{ paddingVertical: 48, alignItems: 'center' }}>
              <Spinner size={22} color="#5F7B51" />
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 10 }}>캘린더를 읽고 있어요...</Text>
            </View>
          ) : !granted ? (
            <View style={{ paddingVertical: 44, paddingHorizontal: 24, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal, textAlign: 'center' }}>캘린더 접근 권한이 필요해요</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, textAlign: 'center', marginTop: 6, lineHeight: 18 }}>
                설정 &gt; 권한에서 캘린더 접근을 허용하면 다가오는 일정을 불러와요.
              </Text>
            </View>
          ) : events.length === 0 ? (
            <View style={{ paddingVertical: 48, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray }}>앞으로 60일 안에 등록된 일정이 없어요</Text>
            </View>
          ) : (
            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}>
              {golf.length > 0 && (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, marginBottom: 2 }}>
                    <Icon name="flag" size={13} color="#5F7B51" strokeWidth={1.8} />
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: '#5F7B51' }}>골프 일정으로 보여요</Text>
                  </View>
                  {golf.map(ev => <EventRow key={ev.id} ev={ev} onPick={handlePick} />)}
                </>
              )}
              {others.length > 0 && (
                <>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.warmGray, marginTop: golf.length ? 18 : 10, marginBottom: 2 }}>
                    {golf.length ? '그 외 다가오는 일정' : '골프 일정을 못 찾았어요 — 직접 골라주세요'}
                  </Text>
                  {others.map(ev => <EventRow key={ev.id} ev={ev} onPick={handlePick} />)}
                </>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
