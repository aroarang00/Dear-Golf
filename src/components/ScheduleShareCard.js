import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { F, fs } from '../constants/colors';
import QRCode from 'react-native-qrcode-svg';

// 일정 공유 — 공유용 정적 보딩패스 카드. 모집 초대장(RoundupShareCard)과 같은 보딩패스 디자인 재사용(사용자 확정),
// 개인 라운딩 일정용이라 HOST/남은자리 대신 D-day·동반·날씨를 담음. 홈 D-day 카드(ScheduleSheetModal) 공유에서 호출.
// ([[score-brag-card]] 공유 인프라 재사용, [[invite-deeplink-system]] 묶음)

const YELLOW = '#F5E6A8';
const SKY = '#C8D9E6';
const BURGUNDY = '#6B1E2A';
const INK = '#3D3935';
const MUTE = '#8B8680';
const LINE = '#E8E2D0';
const SURFACE = '#FFFFFF';
const PAGE = '#FAF6EC';

// 날씨 문자열 → 이모지 (홈에서 주입한 3일내 예보·사용자 입력 모두 대응)
const wxIcon = (w) => {
  if (!w) return '';
  if (/비|우|소나기|rain/i.test(w)) return '🌧';
  if (/눈|snow/i.test(w)) return '🌨';
  if (/흐|구름|cloud/i.test(w)) return '☁️';
  return '☀️';
};

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

export function ScheduleShareCard({ schedule, width = 320 }) {
  if (!schedule) return null;
  const s = schedule;
  const dateText = `${s.date || '-'}${s.day ? ` (${s.day})` : ''}`;
  const timeText = s.time && s.time !== '--:--' ? s.time : '미정';
  const dNum = typeof s.dDay === 'number' ? s.dDay : null;
  const ddayText = dNum == null ? null : dNum === 0 ? 'D-DAY' : dNum > 0 ? `D-${dNum}` : `D+${-dNum}`;
  const members = typeof s.members === 'number' ? s.members : 0;
  // 날씨 안내 멘트 — 날씨가 없고(주입 안 됨) 라운딩이 3일보다 더 남았을 때만(지난 일정엔 안내도 X). 3일 이내면 날씨가 채워짐.
  const showWxNote = !s.weather && (dNum == null || dNum > 3);

  return (
    <View style={[styles.card, { width }]}>
      <View style={styles.triVert}>
        <View style={[styles.triSeg, { backgroundColor: YELLOW }]} />
        <View style={[styles.triSeg, { backgroundColor: SKY }]} />
        <View style={[styles.triSeg, { backgroundColor: BURGUNDY }]} />
      </View>

      <View style={styles.body}>
        <View style={styles.kickerRow}>
          <Text style={styles.kicker}>ROUND SCHEDULE</Text>
          {/* 우상단 Dear Golf 아래 QR — 보딩패스 항공권처럼 상단 코너. footer 멘트 공간 확보 위해 여기로(사용자 지시) */}
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.brand}>Dear Golf</Text>
            <View style={{ marginTop: 6 }}>
              <QRCode value="https://deargolf.app" size={38} color={INK} backgroundColor="transparent" />
            </View>
          </View>
        </View>

        <View style={{ marginTop: 14 }}>
          {/* ROUND SCHEDULE ↔ COURSE 사이 '고정 높이' 날씨 슬롯 — 날씨 유무에 카드 길이가 안 흔들리게 항상 자리 차지.
              3일 이내(s.weather 주입됨)면 예보, 아니면 '3일 전부터 표시' 안내(지난 일정은 둘 다 없이 빈 슬롯). */}
          <View style={{ height: 30, justifyContent: 'center', marginBottom: 6 }}>
            {s.weather ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <Text style={{ fontSize: fs(22) }}>{wxIcon(s.weather)}</Text>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(19), color: BURGUNDY, letterSpacing: 0.3 }}>{s.weather}</Text>
              </View>
            ) : showWxNote ? (
              <Text style={{ fontFamily: F.sysM, fontSize: fs(13), color: MUTE }}>날씨는 라운딩 3일 전부터 표시돼요</Text>
            ) : null}
          </View>
          <Field label="COURSE" value={s.course || '-'} tone="accent" size="lg" />
        </View>

        <Perforation />

        <View style={styles.fieldRow}>
          <Field label="DATE" value={dateText} />
          <Field label="TEE-OFF" value={timeText} align="right" />
        </View>

        {/* 예약자 — 프론트 체크인 이름(있을 때만). 법인명·양도명도 그대로 ([[schedule-booker]]) */}
        {s.booker ? (
          <View style={{ marginTop: 14 }}>
            <Field label="예약자 · BOOKED BY" value={s.booker} />
          </View>
        ) : null}

        {/* D-day · 동반 (날씨는 코스 위로 이동) */}
        <View style={styles.metaRow}>
          {ddayText ? (
            <View style={styles.ddayPill}>
              <Text style={styles.ddayText}>{ddayText}</Text>
            </View>
          ) : null}
          <Text style={styles.metaText}>{members > 0 ? `👥 ${members}명 동반` : ''}</Text>
        </View>

        {/* 하단 — 멘트(전체 폭 중앙) + 링크. QR은 우상단으로 옮겨 멘트 공간 확보 */}
        <View style={styles.footer}>
          <Text style={styles.footerLead} numberOfLines={1}>라운딩의 모든 순간을 더 특별하게</Text>
          <Text style={styles.footerLink}>deargolf.app</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, backgroundColor: SURFACE, overflow: 'hidden', borderWidth: 1, borderColor: LINE },
  triVert: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 6, flexDirection: 'column', zIndex: 2 },
  triSeg: { flex: 1 },

  body: { paddingHorizontal: 18, paddingLeft: 24, paddingTop: 18, paddingBottom: 18 },

  kickerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
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

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  ddayPill: { backgroundColor: BURGUNDY, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  ddayText: { fontFamily: F.sysB, fontSize: fs(12), color: '#F5E6A8', letterSpacing: 0.5 },
  metaText: { fontFamily: F.sysSb, fontSize: fs(13), color: INK },

  footer: { marginTop: 18, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 14, alignItems: 'center' },
  footerLead: { fontFamily: F.sysM, fontSize: fs(12), lineHeight: fs(12) * 1.45, color: MUTE, textAlign: 'center' },
  footerLink: { fontFamily: F.sysB, fontSize: fs(15), color: INK, letterSpacing: 0.5, marginTop: 4 },
});
