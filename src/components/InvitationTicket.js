import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, Platform, Animated, StyleSheet } from 'react-native';
import { F, fs } from '../constants/colors';

// 초대장 — 미니멀 골프 티켓/보딩패스 감성 ([[roundup-invitation]]).
// 시그니처 삼색(노랑·하늘·자주)을 accent로 깔끔하게:
//   accent='strip' : 카드 맨 위 얇은 가로 보더 스트립
//   accent='tab'   : 좌측 세로 엣지 탭
// 타이포 계층: kicker(초소형 트래킹) → 필드 라벨(마이크로) → 값(볼드). 천공 점선 + 양옆 노치로 티켓감.

const YELLOW = '#F5E6A8';   // 시그니처 노랑(버터)
const SKY = '#C8D9E6';      // 시그니처 하늘(paleSky)
const BURGUNDY = '#6B1E2A'; // 시그니처 자주
const INK = '#3D3935';      // 본문(charcoal)
const MUTE = '#8B8680';     // 라벨(warmGray)
const LINE = '#E8E2D0';     // 헤어라인
const SURFACE = '#FFFFFF';  // 카드 면
const PAGE = '#FAF6EC';     // 카드 바깥 배경색(노치 컷아웃)

function TriStrip({ vertical }) {
  return (
    <View style={[styles.triWrap, vertical ? styles.triVert : styles.triHorz]}>
      <View style={[styles.triSeg, { backgroundColor: YELLOW }]} />
      <View style={[styles.triSeg, { backgroundColor: SKY }]} />
      <View style={[styles.triSeg, { backgroundColor: BURGUNDY }]} />
    </View>
  );
}

// 천공 점선 + 양옆 노치(티켓 절취선 느낌)
function Perforation() {
  return (
    <View style={styles.perfRow}>
      <View style={[styles.notch, styles.notchLeft]} />
      <View style={styles.dashWrap}>
        {Array.from({ length: 44 }).map((_, i) => <View key={i} style={styles.dash} />)}
      </View>
      <View style={[styles.notch, styles.notchRight]} />
    </View>
  );
}

// 보딩패스 필드(라벨 위·값 아래)
function Field({ label, value, align = 'left', tone = 'ink', size = 'md' }) {
  return (
    <View style={[styles.field, align === 'right' && { alignItems: 'flex-end' }]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text
        style={[styles.fieldValue, size === 'lg' && styles.fieldValueLg, tone === 'accent' && { color: BURGUNDY }]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

export function InvitationTicket({
  accent = 'tab', type = 'fixed',
  hostName, course, date, time, message,
  onAccept, onDecline,
}) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 320, useNativeDriver: true }).start();
  }, [anim]);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });

  const isOpen = type === 'open';
  const courseText = course || (isOpen ? '함께 정해요' : '-');
  const dateText = isOpen ? '미정' : (date || '-');
  const timeText = isOpen ? '함께 조율' : (time || '-');

  return (
    <Animated.View style={[styles.card, { opacity: anim, transform: [{ translateY }] }]}>
      <TriStrip vertical={accent === 'tab'} />
      <View style={[styles.body, accent === 'tab' && styles.bodyTab, accent === 'strip' && styles.bodyStrip]}>
        {/* kicker — 항공권 상단 라인(편명/항공사 자리) */}
        <View style={styles.kickerRow}>
          <Text style={styles.kicker}>ROUND INVITATION</Text>
          <Text style={styles.brand}>Dear Golf</Text>
        </View>

        {/* HOST / COURSE */}
        <View style={styles.fieldRow}>
          <Field label="HOST" value={`${hostName}님`} />
          <Field label="COURSE" value={courseText} align="right" tone="accent" size="lg" />
        </View>

        <Perforation />

        {/* DATE / TEE-OFF */}
        <View style={styles.fieldRow}>
          <Field label="DATE" value={dateText} />
          <Field label="TEE-OFF" value={timeText} align="right" />
        </View>

        {/* NOTE — 멘트(직접 입력, 있을 때만) */}
        {!!message && (
          <View style={styles.noteWrap}>
            <Text style={styles.fieldLabel}>NOTE</Text>
            <Text style={styles.note}>{message}</Text>
          </View>
        )}

        {/* 액션 */}
        <TouchableOpacity activeOpacity={0.85} onPress={onAccept} style={styles.cta}>
          <Text style={styles.ctaText}>함께해요</Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.7} onPress={onDecline}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.declineBtn}>
          <Text style={styles.declineText}>다음에 또 불러줘</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16, marginBottom: 12, backgroundColor: SURFACE, overflow: 'hidden',
    borderWidth: 1, borderColor: LINE,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  triWrap: { position: 'absolute', zIndex: 2 },
  triHorz: { top: 0, left: 0, right: 0, height: 5, flexDirection: 'row' },
  triVert: { top: 0, bottom: 0, left: 0, width: 6, flexDirection: 'column' },
  triSeg: { flex: 1 },

  body: { paddingHorizontal: 18, paddingBottom: 16 },
  bodyStrip: { paddingTop: 20 },
  bodyTab: { paddingTop: 18, paddingLeft: 24 },

  kickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: { fontFamily: F.sysB, fontSize: fs(11), letterSpacing: 3, color: MUTE },
  brand: { fontFamily: F.brand, fontSize: fs(13), color: BURGUNDY },

  fieldRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 16 },
  field: { flex: 1 },
  fieldLabel: { fontFamily: F.sysB, fontSize: fs(10), letterSpacing: 1.5, color: MUTE, marginBottom: 4 },
  fieldValue: { fontFamily: F.sysB, fontSize: fs(16), color: INK },
  fieldValueLg: { fontSize: fs(19) },

  perfRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, marginHorizontal: -18 },
  notch: { width: 16, height: 16, borderRadius: 8, backgroundColor: PAGE },
  notchLeft: { marginLeft: -8 },
  notchRight: { marginRight: -8 },
  dashWrap: { flex: 1, flexDirection: 'row', overflow: 'hidden', justifyContent: 'center' },
  dash: { width: 5, height: 1, marginHorizontal: 2, backgroundColor: LINE },

  noteWrap: { marginTop: 16 },
  note: { fontFamily: F.sys, fontSize: fs(14), color: INK, lineHeight: fs(14) * 1.5 },

  cta: { marginTop: 20, backgroundColor: INK, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  ctaText: { fontFamily: F.sysB, fontSize: fs(16), color: '#FFFFFF' },
  declineBtn: { marginTop: 10, alignItems: 'center', paddingVertical: 4 },
  declineText: { fontFamily: F.sysM, fontSize: fs(13), color: MUTE },
});
