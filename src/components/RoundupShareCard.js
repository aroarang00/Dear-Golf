import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { F, fs } from '../constants/colors';

// 모집 초대장 — 공유용 정적 보딩패스 카드. 인앱 InvitationTicket([[roundup-invitation]]) 디자인 재사용(사용자 확정),
// 단 캡처용이라 ①진입 애니메이션·CTA 버튼 제거 ②인원·남은자리 + deargolf.app 설치 단서 추가.
// 단톡방 공유 시 클릭 링크는 평문 공유(shareRoundup)가 별도로 담당 — 카드엔 deargolf.app를 시각 단서로 박음 ([[invite-deeplink-system]]).

const YELLOW = '#F5E6A8';
const SKY = '#C8D9E6';
const BURGUNDY = '#6B1E2A';
const INK = '#3D3935';
const MUTE = '#8B8680';
const LINE = '#E8E2D0';
const SURFACE = '#FFFFFF';
const PAGE = '#FAF6EC';

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

export function RoundupShareCard({ post, width = 320 }) {
  if (!post) return null;
  const isOpen = post.type === 'open';
  const isTeam = (post.teams || 1) > 1;
  const cap = post.capacity || (isTeam ? (post.teams || 1) * 4 : 4);
  const joined = Array.isArray(post.participantUids) ? post.participantUids.length : 1;
  const left = Math.max(0, cap - joined);

  const hostName = post.authorName || '호스트';
  const courseText = post.course || (isOpen ? '함께 정해요' : '-');
  const dateText = isOpen ? '미정' : `${post.date || '-'}${post.day ? ` (${post.day})` : ''}`;
  const timeText = isOpen ? '함께 조율' : (post.time || '-');
  const headcount = isTeam ? `단체 ${post.teams}팀 · 총 ${cap}명` : `${cap}명 모집`;
  const tags = Array.isArray(post.tags) ? post.tags.slice(0, 4) : [];

  return (
    <View style={[styles.card, { width }]}>
      {/* 시그니처 삼색 좌측 세로탭 */}
      <View style={styles.triVert}>
        <View style={[styles.triSeg, { backgroundColor: YELLOW }]} />
        <View style={[styles.triSeg, { backgroundColor: SKY }]} />
        <View style={[styles.triSeg, { backgroundColor: BURGUNDY }]} />
      </View>

      <View style={styles.body}>
        <View style={styles.kickerRow}>
          <Text style={styles.kicker}>ROUND INVITATION</Text>
          <Text style={styles.brand}>Dear Golf</Text>
        </View>

        <View style={styles.fieldRow}>
          <Field label="HOST" value={`${hostName}님`} />
          <Field label="COURSE" value={courseText} align="right" tone="accent" size="lg" />
        </View>

        <Perforation />

        <View style={styles.fieldRow}>
          <Field label="DATE" value={dateText} />
          <Field label="TEE-OFF" value={timeText} align="right" />
        </View>

        {/* 인원 · 남은 자리 */}
        <View style={styles.headcountRow}>
          <Text style={styles.headcount}>👥 {headcount}</Text>
          {left > 0 ? (
            <View style={styles.leftPill}>
              <Text style={styles.leftPillText}>남은 자리 {left}</Text>
            </View>
          ) : (
            <View style={[styles.leftPill, { backgroundColor: '#EEE9DC' }]}>
              <Text style={[styles.leftPillText, { color: MUTE }]}>모집 마감</Text>
            </View>
          )}
        </View>

        {!!post.word && (
          <View style={styles.noteWrap}>
            <Text style={styles.fieldLabel}>NOTE</Text>
            <Text style={styles.note} numberOfLines={2}>{post.word}</Text>
          </View>
        )}

        {tags.length > 0 && (
          <View style={styles.tagRow}>
            {tags.map(t => (
              <View key={t} style={styles.tagPill}>
                <Text style={styles.tagText}>#{t}</Text>
              </View>
            ))}
          </View>
        )}

        {/* 푸터 — 설치 단서 */}
        <View style={styles.footer}>
          <Text style={styles.footerLead}>디어골프에서 친구 맺고 함께해요</Text>
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

  headcountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  headcount: { fontFamily: F.sysSb, fontSize: fs(14), color: INK },
  leftPill: { backgroundColor: '#F7EDD2', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  leftPillText: { fontFamily: F.sysB, fontSize: fs(12), color: '#5A4500' },

  noteWrap: { marginTop: 16 },
  note: { fontFamily: F.sys, fontSize: fs(14), color: INK, lineHeight: fs(14) * 1.5 },

  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 },
  tagPill: { backgroundColor: '#F7F1E1', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  tagText: { fontFamily: F.sysM, fontSize: fs(11), color: BURGUNDY },

  footer: { marginTop: 18, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 14, alignItems: 'center' },
  footerLead: { fontFamily: F.sysM, fontSize: fs(12), color: MUTE },
  footerLink: { fontFamily: F.sysB, fontSize: fs(15), color: INK, letterSpacing: 0.5, marginTop: 3 },
});
