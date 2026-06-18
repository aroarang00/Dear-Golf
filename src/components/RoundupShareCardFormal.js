import React from 'react';
import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { F, fs } from '../constants/colors';

// 모집 초대장(격식) — 공유용 정적 카드. 인앱 InvitationCard formal(미드나잇 네이비+골드) 디자인 재사용([[roundup-invitation]]).
//  캡처용이라 ①진입 애니메이션·수락/거절 버튼 제거 ②인원·남은자리 + deargolf.app 설치 단서 추가(편안형 RoundupShareCard와 대칭).
//  inviteStyle==='formal'일 때 ShareMomentModal이 이 카드를 렌더(편안=보딩패스 RoundupShareCard).

const P = {
  bg: ['#24516C', '#1A3D52', '#143140'],     // 라운지 네이비 그라데이션
  border: '#3A6178',
  accent: '#E6C677', accentDim: '#C9A85E', accentDk: '#A9854A',  // 골드
  body: '#ECE6DA',                            // 웜 아이보리
  hairline: 'rgba(230,198,119,0.4)',
  mute: 'rgba(236,230,218,0.6)',
};

export function RoundupShareCardFormal({ post, width = 320 }) {
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
    <View style={{ width, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: P.border }}>
      <LinearGradient colors={P.bg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} locations={[0, 0.55, 1]}
        style={{ paddingHorizontal: 22, paddingTop: 20, paddingBottom: 20 }}>

        {/* 마스트헤드 — 골드 다이아 문장 + INVITATION 워드마크 */}
        <View style={{ alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 28, height: 1, backgroundColor: P.accentDk }} />
            <View style={{ width: 7, height: 7, backgroundColor: P.accent, transform: [{ rotate: '45deg' }] }} />
            <View style={{ width: 28, height: 1, backgroundColor: P.accentDk }} />
          </View>
          <Text style={{ marginTop: 8, fontFamily: F.en, fontSize: fs(13), color: P.accent, letterSpacing: 5 }}>INVITATION</Text>
        </View>

        {/* 헤드라인 — 이름만 골드 악센트 */}
        <Text style={{ textAlign: 'center', marginTop: 14, fontFamily: F.sysSb, fontSize: fs(17), lineHeight: fs(17) * 1.5, color: P.body }}>
          {isOpen
            ? <><Text style={{ color: P.accent }}>{hostName}</Text> 님이 귀하께{'\n'}라운드를 제안합니다</>
            : <><Text style={{ color: P.accent }}>{hostName}</Text> 님이 귀하를{'\n'}라운드에 초대합니다</>}
        </Text>

        {/* 구분선 — 골드 솔리드 */}
        <View style={{ height: 1, backgroundColor: P.hairline, marginVertical: 16, marginHorizontal: 8 }} />

        {/* 핵심 정보 — 구장·날짜·시간 */}
        <Text style={{ textAlign: 'center', fontFamily: F.sysB, fontSize: fs(19), color: P.body }} numberOfLines={1}>{courseText}</Text>
        <Text style={{ textAlign: 'center', marginTop: 8, fontFamily: F.sysSb, fontSize: fs(15), color: P.accent }}>{dateText}</Text>
        <Text style={{ textAlign: 'center', marginTop: 3, fontFamily: F.sysM, fontSize: fs(14), color: P.accent }}>{timeText}</Text>

        {/* 인원 · 남은 자리 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: P.body }}>👥 {headcount}</Text>
          <View style={{ backgroundColor: 'rgba(230,198,119,0.18)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 0.5, borderColor: P.hairline }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: P.accent }}>{left > 0 ? `남은 자리 ${left}` : '모집 마감'}</Text>
          </View>
        </View>

        {/* 메시지(따옴표) — 있을 때만 */}
        {!!post.word && (
          <Text numberOfLines={2} style={{ textAlign: 'center', marginTop: 14, fontFamily: F.sys, fontSize: fs(13.5), lineHeight: fs(13.5) * 1.5, color: P.body }}>
            <Text style={{ color: P.accentDim }}>“ </Text>{post.word}<Text style={{ color: P.accentDim }}> ”</Text>
          </Text>
        )}

        {tags.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 14 }}>
            {tags.map(t => (
              <View key={t} style={{ backgroundColor: 'rgba(230,198,119,0.12)', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 0.5, borderColor: P.hairline }}>
                <Text style={{ fontFamily: F.sysM, fontSize: fs(11), color: P.accent }}>#{t}</Text>
              </View>
            ))}
          </View>
        )}

        {/* 푸터 — 설치 단서 */}
        <View style={{ marginTop: 18, borderTopWidth: 1, borderTopColor: P.hairline, paddingTop: 14, alignItems: 'center' }}>
          <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: P.mute }}>디어골프에서 친구 맺고 함께해요</Text>
          <Text style={{ fontFamily: F.brand, fontSize: fs(14), color: P.body, letterSpacing: 0.5, marginTop: 3 }}>deargolf.app</Text>
        </View>
      </LinearGradient>
    </View>
  );
}
