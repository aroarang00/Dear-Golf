import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { F, fs } from '../constants/colors';
import QRCode from 'react-native-qrcode-svg';
import { Icon, WeatherGlyph } from './common/Icon'; // 날씨·동반자 이모지 → 커스텀 SVG

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
  if (/비|우|소나기|rain/i.test(w)) return '🌧️';
  if (/눈|snow/i.test(w)) return '🌨️';
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
  // 동반자 이름 — 시트가 넘겨준 것(companions + 전파 그룹 해석). '(초대중)' 앱 표기는 카드에선 뗀다.
  //   있을 때만 표시(없으면 줄 자체를 안 그림 — 사용자 2026-07-23). 카드가 길어지지 않게 두 줄로 말줄임.
  const playerNames = (Array.isArray(s.companionNames) ? s.companionNames : [])
    .map(n => String(n).replace(/\(초대중\)$/, '').trim()).filter(Boolean);
  // 날씨 안내 멘트 — 날씨가 없고(주입 안 됨) 라운딩이 3일보다 더 남았을 때만(지난 일정엔 안내도 X). 3일 이내면 날씨가 채워짐.
  const showWxNote = !s.weather && (dNum == null || dNum > 3);
  // 구장명 길이별 '고정' 폰트 — adjustsFontSizeToFit은 모달/transform·flex 안에서 글자를 안 그려버리는 RN 버그가 있어
  //   자동축소 대신 길이로 결정적 크기 산정(모든 화면서 안전히 보임). 길면 코스(세부코스)는 아랫줄로(말줄임 방지).
  const courseLen = (s.course || '').length;
  const courseFs = courseLen >= 16 ? 15 : courseLen >= 13 ? 17 : courseLen >= 10 ? 19 : 21;
  const longCourse = courseLen >= 9;

  return (
    <View style={[styles.card, { width }]}>
      <View style={styles.triVert}>
        <View style={[styles.triSeg, { backgroundColor: YELLOW }]} />
        <View style={[styles.triSeg, { backgroundColor: SKY }]} />
        <View style={[styles.triSeg, { backgroundColor: BURGUNDY }]} />
      </View>

      <View style={styles.body}>
        {/* 우상단 코너 — 브랜드+QR을 절대배치로 빼 키커 행 높이에서 제외 → 제목↔날씨 밀착(사용자 2026-06-19).
            QR 블록(≈51px)은 코너에 떠 있고, 좌측 콘텐츠(제목·날씨)는 그 옆/아래로 타이트하게 흐름. 코스명은 QR 아래서 시작. */}
        <View style={{ position: 'absolute', top: 18, right: 18, alignItems: 'flex-end', zIndex: 2 }}>
          <Text style={styles.brand}>Dear Golf</Text>
          {/* QR 32→48 + 위 여백 3→8 — 32px는 캡처(×3=96px)·카톡 재압축 후 실스캔 실패 크기(친구초대 42px도 실패했음).
              48px(×3=144px)+흰 바탕+quiet zone 확보로 교정. 코스명은 QR 블록(≈90px) 아래서 시작해 침범 없음(2026-07-03). */}
          <View style={{ marginTop: 8 }}>
            <QRCode value="https://deargolf.app" size={48} color={INK} backgroundColor="transparent" />
          </View>
        </View>

        <Text style={styles.kicker}>ROUND SCHEDULE</Text>

        <View style={{ marginTop: 14 }}>
          {/* ROUND SCHEDULE ↔ COURSE 사이 '고정 높이' 날씨 슬롯 — 날씨 유무에 카드 길이가 안 흔들리게 항상 자리 차지.
              3일 이내(s.weather 주입됨)면 예보, 아니면 '3일 전부터 표시' 안내(지난 일정은 둘 다 없이 빈 슬롯). */}
          <View style={{ height: 30, justifyContent: 'center', marginBottom: 6 }}>
            {s.weather ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {/* 실제 예보 아이콘(주입된 weatherIcon=kma) 우선, 없으면 텍스트 기반 폴백 — 커스텀 SVG(WeatherGlyph) */}
                <WeatherGlyph icon={s.weatherIcon || wxIcon(s.weather)} size={fs(20)} />
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: BURGUNDY, letterSpacing: 0.3 }}>{s.weather}</Text>
              </View>
            ) : showWxNote ? (
              <Text style={{ fontFamily: F.sysM, fontSize: fs(13), color: MUTE }}>날씨는 라운딩 3일 전부터 표시돼요</Text>
            ) : null}
          </View>
          {/* COURSE — 골프장명. 코스(세부코스)가 있으면 이름 옆에 작게 표시(카드에서만) ([[schedule-booker]]).
              ★flex:1 쓰지 않음 — flex:1(=flexBasis 0%)이 일부 레이아웃(모달/transform)에서 높이 0으로 접혀 구장명이 사라졌음. 내용 높이로. */}
          <View>
            <Text style={styles.fieldLabel}>COURSE</Text>
            <View style={{ flexDirection: longCourse ? 'column' : 'row', alignItems: longCourse ? 'flex-start' : 'baseline', flexWrap: 'wrap' }}>
              <Text style={[styles.fieldValue, styles.fieldValueLg, { color: BURGUNDY, fontSize: fs(courseFs) }]}
                numberOfLines={2}>{s.course || '-'}</Text>
              {!!s.subCourse && (
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: INK, marginLeft: longCourse ? 0 : 8, marginTop: longCourse ? 3 : 0 }}>{s.subCourse}</Text>
              )}
            </View>
          </View>
        </View>

        <Perforation />

        <View style={styles.fieldRow}>
          <Field label="DATE" value={dateText} />
          <Field label="TEE-OFF" value={timeText} align="right" />
        </View>

        {/* 예약자 — 프론트 체크인 이름(있을 때만). 법인명·양도명도 그대로 ([[schedule-booker]]).
            ★Field(flex:1) 대신 커스텀 — 세로 단독 필드는 flex:1이 일부 레이아웃서 높이 0으로 접혀 안 보였음(COURSE와 동일). */}
        {s.booker ? (
          <View style={{ marginTop: 14 }}>
            <Text style={styles.fieldLabel}>예약자 · BOOKED BY</Text>
            <Text style={styles.fieldValue} numberOfLines={1}>{s.booker}</Text>
          </View>
        ) : null}

        {/* D-day · 동반 (날씨는 코스 위로 이동) */}
        <View style={styles.metaRow}>
          {ddayText ? (
            <View style={styles.ddayPill}>
              <Text style={styles.ddayText}>{ddayText}</Text>
            </View>
          ) : null}
          {members > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Icon name="people" size={fs(15)} color={INK} />
              <Text style={styles.metaText}>{members}명 동반</Text>
            </View>
          ) : null}
        </View>

        {/* 동반자 이름 — 있을 때만. '몇 명'만으론 누가 오는지 모른다(사용자 2026-07-23) */}
        {playerNames.length ? (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.fieldLabel}>동반자 · PLAYERS</Text>
            <Text style={styles.fieldValue} numberOfLines={2}>{playerNames.join(' · ')}</Text>
          </View>
        ) : null}

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
