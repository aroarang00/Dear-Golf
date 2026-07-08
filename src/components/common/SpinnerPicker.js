import React, { useRef, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet, Platform, Modal, ScrollView } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { C, F, fs } from '../../constants/colors';

const pad2 = (n) => String(n).padStart(2, '0');
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

// 앱 자체 스크롤 휠 한 열(시 또는 분). 네이티브 피커에 의존하지 않아 모든 안드 기기에서 동일 작동.
const ITEM_H = 42;
const VISIBLE = 5;                       // 보이는 줄 수(홀수) — 가운데가 선택
const PAD = ((VISIBLE - 1) / 2) * ITEM_H; // 첫/마지막 항목도 가운데로 올 수 있게 상하 여백

function Wheel({ data, initial, onSelect }) {
  const ref = useRef(null);
  const [idx, setIdx] = useState(Math.max(0, data.indexOf(initial)));
  // 마운트 시 초기값 위치로 스크롤(무애니메이션). 레이아웃 후 잡히도록 살짝 지연.
  useEffect(() => {
    const t = setTimeout(() => ref.current?.scrollTo({ y: idx * ITEM_H, animated: false }), 0);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const handle = (y, commit) => {
    let i = Math.round(y / ITEM_H);
    i = Math.min(Math.max(i, 0), data.length - 1);
    setIdx(i);
    if (commit) onSelect(data[i]);
  };
  return (
    <ScrollView
      ref={ref}
      style={{ width: 74, height: VISIBLE * ITEM_H }}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_H}
      decelerationRate="fast"
      scrollEventThrottle={16}
      nestedScrollEnabled
      onScroll={(e) => handle(e.nativeEvent.contentOffset.y, false)}
      // 관성 없이 손 떼도(느린 드래그) 확정되도록 두 이벤트 모두에서 커밋
      onScrollEndDrag={(e) => handle(e.nativeEvent.contentOffset.y, true)}
      onMomentumScrollEnd={(e) => handle(e.nativeEvent.contentOffset.y, true)}
      contentContainerStyle={{ paddingVertical: PAD }}
    >
      {data.map((n, i) => (
        <View key={n} style={{ height: ITEM_H, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: i === idx ? F.sysB : F.sysM, fontSize: fs(i === idx ? 25 : 20),
            color: i === idx ? C.charcoalDeep : C.warmGrayLight }}>{pad2(n)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

// 안드 시간 입력 — 앱 자체 스크롤 휠(24시간). OEM 네이티브 시간 피커 회피용.
//   ★왜: 일부 기기·OS(삼성 등)는 display:'spinner'를 무시하고 '원형 시계' 피커를 띄운다. 거기선
//     ① 분이 5분 단위로 스냅되고(테스터 '47분→50분'), ② 시↔분 전환 시 value 재주입으로 시가 시드값(7시)으로 튕겼다.
//     내 dev폰(휠 렌더)에선 재현 안 되는 전형적 OEM 엣지케이스 → 네이티브 대신 JS 휠로 통일(1분 단위 정밀).
//   호출부 계약(value=Date, onPick(Date), onClose)은 그대로 → 시간 피커 5곳 전부 트리거 변경 없이 안전.
function AndroidTimeEntry({ value, onPick, onClose }) {
  const [hour, setHour] = useState(value.getHours());
  const [minute, setMinute] = useState(value.getMinutes());
  const confirm = () => {
    const d = new Date(value);            // 날짜(Y/M/D)는 보존, 시·분만 교체
    d.setHours(hour, minute, 0, 0);
    onPick && onPick(d);
    onClose && onClose();
  };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        {/* 배경 탭-닫기는 '뒤에 깔린' Pressable로 — 카드/휠을 touchable로 감싸면 안드에서 스크롤 제스처를 뺏겨 먹통 */}
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} onPress={onClose} />
        <View style={{ backgroundColor: C.bgPrimary, borderRadius: 20, padding: 20, width: '100%', maxWidth: 300 }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoalDeep, textAlign: 'center', marginBottom: 12 }}>티오프 시간</Text>
          <View style={{ height: VISIBLE * ITEM_H }}>
            {/* 가운데 선택 밴드(휠 뒤에 깔림) */}
            <View pointerEvents="none" style={{ position: 'absolute', left: 20, right: 20, top: PAD, height: ITEM_H,
              borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.hairline, backgroundColor: C.bgSecondary, borderRadius: 8 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4 }}>
              <Wheel data={HOURS} initial={hour} onSelect={setHour} />
              <Text style={{ fontFamily: F.sysB, fontSize: fs(24), color: C.charcoal }}>:</Text>
              <Wheel data={MINUTES} initial={minute} onSelect={setMinute} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
            <TouchableOpacity onPress={onClose} activeOpacity={0.85}
              style={{ flex: 1, paddingVertical: 12, borderRadius: 11, backgroundColor: C.bgSecondary, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.warmGray }}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={confirm} activeOpacity={0.85}
              style={{ flex: 1, paddingVertical: 12, borderRadius: 11, backgroundColor: C.charcoal, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.butter }}>확인</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// @react-native-community/datetimepicker 'spinner' 플랫폼 차이 흡수 — 공용.
//   ★기존 버그: onChange에서 매 변경마다 picker를 닫아(setShow(false)), iOS 인라인 스피너가 한 칸만 굴리면
//     바로 닫혀 스크롤이 사실상 안 됐다(테스터 '날짜 스크롤 안 됨' 2026-06-26).
//   ▸ iOS: 인라인 스피너 유지 — onChange는 값만 갱신(닫지 않음) + 아래 '완료' 버튼으로 닫는다.
//   ▸ Android(날짜): 네이티브 다이얼로그 — onChange가 확정/취소 시 1회 발화 → 그 때 닫고 값 반영(dismissed면 값 X).
//   ▸ Android(시간): OEM 시계 피커 엣지케이스(위 AndroidTimeEntry 주석) 회피 위해 앱 자체 스크롤 휠로 대체.
//   ★안드 value 튕김: 네이티브 피커는 value '참조'가 바뀔 때마다 스피너를 재초기화 → 호출부가 value를 매 렌더
//     `new Date()`로 새로 만들어(참조가 매번 달라짐), 열린 동안 부모가 리렌더되면 스피너가 시드값으로 튕겼다.
//     → 안드는 '열리는 순간'의 value를 한 번만 캡처해 고정 참조로 넘긴다.
//   onPick(date): 선택된 Date를 호출부가 받아 자기 로직(setDate/clamp/시·분 분해 등)을 수행.
export function SpinnerPicker({ visible, value, mode = 'date', onPick, onClose, minimumDate, maximumDate, is24Hour }) {
  // 안드 전용: 피커가 닫혔다 열리는 상승엣지에서만 value를 캡처(부모 리렌더로 인한 스피너 리셋 차단).
  const openValRef = useRef(value);
  const wasVisibleRef = useRef(false);
  if (visible && !wasVisibleRef.current) openValRef.current = value;
  wasVisibleRef.current = visible;

  if (!visible) return null;
  const stableValue = Platform.OS === 'android' ? openValRef.current : value;

  if (Platform.OS === 'android') {
    if (mode === 'time') {
      return <AndroidTimeEntry value={stableValue} onPick={onPick} onClose={onClose} />;
    }
    return (
      <DateTimePicker value={stableValue} mode={mode} display="spinner"
        minimumDate={minimumDate} maximumDate={maximumDate} is24Hour={is24Hour} locale="ko"
        onChange={(e, d) => { onClose && onClose(); if (e?.type !== 'dismissed' && d) onPick && onPick(d); }} />
    );
  }
  return (
    <View>
      <DateTimePicker value={value} mode={mode} display="spinner"
        minimumDate={minimumDate} maximumDate={maximumDate} is24Hour={is24Hour} locale="ko"
        onChange={(e, d) => { if (d) onPick && onPick(d); }} />
      <TouchableOpacity onPress={onClose} activeOpacity={0.85}
        style={{ alignSelf: 'center', marginTop: 2, marginBottom: 8, paddingHorizontal: 30, paddingVertical: 9,
          borderRadius: 10, backgroundColor: C.charcoal }}>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.butter }}>완료</Text>
      </TouchableOpacity>
    </View>
  );
}
