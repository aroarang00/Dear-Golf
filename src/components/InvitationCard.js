import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, Platform, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { F, fs } from '../constants/colors';

// 친구지정·포함 모집 = "개인 초대장" — 프리미엄 경험 ([[roundup-invitation]]).
// variant로 컬러·톤을 전혀 다르게:
//   formal(격식) = 미드나잇/라운지 네이비 + 골드 럭셔리 (격을 차리는 상대)
//   casual(편안) = 따뜻한 크림 + 잔디 그린 (편한 친구)
// type: 'fixed'(날짜 확정) | 'open'(함께 일정 정하기). 이모지 X, 그려서 OS 무관.

const PALETTE = {
  formal: {
    bg: ['#24516C', '#1A3D52', '#143140'],     // 라운지 네이비 그라데이션
    border: '#3A6178',
    accent: '#E6C677', accentDim: '#C9A85E', accentDk: '#A9854A',  // 골드
    body: '#ECE6DA',                            // 웜 아이보리
    hairline: 'rgba(230,198,119,0.4)',
    btn: ['#F8E7B2', '#D2AC63', '#7C5C28'], btnText: '#13303F',    // 골드 베벨 버튼
    shadowOpacity: 0.22,
    seal: 'INVITATION', sealFont: F.en, sealSpacing: 5,
    accept: '함께하겠습니다', decline: '나중에 다시 볼게요', declineColor: '#C9A85E', openNote: '원하시는 날을 함께 정해요',
  },
  casual: {
    bg: ['#FCF8F0', '#F2E8D4'],                 // 따뜻한 크림 (시그니처)
    border: '#E3D8C0',
    accent: '#6B1E2A', accentDim: '#9A4150', accentDk: '#511522',  // 버건디 (시그니처 — 친구지정 뱃지와 동일 계열)
    body: '#3D3935',                            // 차콜
    hairline: 'rgba(107,30,42,0.25)',
    btn: ['#4A453F', '#3D3935'], btnText: '#FAF6EC',               // 채콜 버튼(앱 공통색) + 크림 글자
    shadowOpacity: 0.16,
    seal: '초대합니다', sealFont: F.sysB, sealSpacing: 2,
    accept: '좋아, 함께!', decline: '다음에 또 불러줘', declineColor: '#8B8680', openNote: '같이 날짜 맞춰보자',
    fallbackHero: '한 라운드 함께 어때요',
  },
};

// 마스트헤드(상단 씨얼) — variant별로 전혀 다른 격식.
//   formal: 골드 다이아몬드 문장 + 양옆 골드 라인 + INVITATION 워드마크 (crest)
//   casual: "초대합니다" 그린 스탬프(도장) — 친근하고 산뜻
// 삼색 바(버터·팔레스카이·버건디, 풀폭) — 편안형 카드 위·아래 마감 모티브
function TriBar() {
  return (
    <View style={{ flexDirection: 'row', alignSelf: 'stretch', height: 6, borderRadius: 3, overflow: 'hidden' }}>
      <View style={{ flex: 1, backgroundColor: '#F5E6A8' }} />
      <View style={{ flex: 1, backgroundColor: '#C8D9E6' }} />
      <View style={{ flex: 1, backgroundColor: '#6B1E2A' }} />
    </View>
  );
}

function Masthead({ variant, hostName, p }) {
  if (variant === 'casual') {
    // 길게 뻗은 버건디 리본 배너 — "○님이 초대합니다"를 얹고 양끝 제비꼬리 V홈(카드 크림과 매칭).
    const notch = '#FCF8F0';
    return (
      <View style={{ alignItems: 'center' }}>
        <View style={{ alignSelf: 'stretch', height: 34, backgroundColor: p.accent, justifyContent: 'center', overflow: 'hidden' }}>
          <Text style={{ textAlign: 'center', fontFamily: F.sysB, fontSize: fs(15), color: '#F5E6A8', letterSpacing: 1 }}>
            {hostName}님이 초대합니다
          </Text>
          {/* 좌측 제비꼬리 */}
          <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, justifyContent: 'center' }}>
            <View style={{ width: 0, height: 0, borderTopWidth: 17, borderBottomWidth: 17, borderLeftWidth: 15,
              borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: notch }} />
          </View>
          {/* 우측 제비꼬리 */}
          <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, justifyContent: 'center' }}>
            <View style={{ width: 0, height: 0, borderTopWidth: 17, borderBottomWidth: 17, borderRightWidth: 15,
              borderTopColor: 'transparent', borderBottomColor: 'transparent', borderRightColor: notch }} />
          </View>
        </View>
      </View>
    );
  }
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 28, height: 1, backgroundColor: p.accentDk }} />
        <View style={{ width: 7, height: 7, backgroundColor: p.accent, transform: [{ rotate: '45deg' }] }} />
        <View style={{ width: 28, height: 1, backgroundColor: p.accentDk }} />
      </View>
      <Text style={{ marginTop: 8, fontFamily: p.sealFont, fontSize: fs(13), color: p.accent, letterSpacing: p.sealSpacing }}>{p.seal}</Text>
    </View>
  );
}

// 구분선 — 격식: 솔리드 골드선 / 편안: 삼색바(컨트리클럽 스트라이프)
function Divider({ variant, p }) {
  if (variant === 'casual') {
    return <View style={{ marginVertical: 19 }}><TriBar /></View>;
  }
  return <View style={{ height: 1, backgroundColor: p.hairline, marginVertical: 19, marginHorizontal: 8 }} />;
}

// 헤드라인 — 이름만 악센트색. variant·type별 문구.
function Headline({ variant, type, hostName, p }) {
  const base = { textAlign: 'center', marginTop: 14, fontFamily: F.sysSb, fontSize: fs(18), lineHeight: fs(18) * 1.5, color: p.body };
  const acc = { color: p.accent };
  if (variant === 'formal') {
    return type === 'open'
      ? <Text style={base}><Text style={acc}>{hostName}</Text> 님이 귀하께{'\n'}라운드를 제안합니다</Text>
      : <Text style={base}><Text style={acc}>{hostName}</Text> 님이 귀하를{'\n'}라운드에 초대합니다</Text>;
  }
  return type === 'open'
    ? <Text style={base}><Text style={acc}>{hostName}</Text>님이 같이{'\n'}라운딩 어떻냐고 해요</Text>
    : <Text style={base}><Text style={acc}>{hostName}</Text>님이 같이{'\n'}라운딩 가자고 해요</Text>;
}

export function InvitationCard({
  variant = 'formal', type = 'fixed',
  hostName, course, date, time, openInfo, message,
  onAccept, onDecline,
}) {
  const p = PALETTE[variant] || PALETTE.formal;
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 320, useNativeDriver: true }).start();
  }, [anim]);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });

  return (
    <Animated.View style={{
      opacity: anim, transform: [{ translateY }],
      borderRadius: 16, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: p.border,
      ...Platform.select({
        ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: p.shadowOpacity, shadowRadius: 10 },
        android: { elevation: 5 },
      }),
    }}>
      <LinearGradient colors={p.bg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} locations={[0, 0.55, 1]}
        style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 22 }}>

        {/* 마스트헤드 (상단) */}
        <Masthead variant={variant} hostName={hostName} p={p} />

        {/* 헤드라인/히어로 — 편안형은 멘트를 주인공으로(없으면 기본 문구). 격식형은 템플릿 헤드라인 */}
        {variant === 'casual' ? (
          <Text style={{ textAlign: 'center', marginTop: 16, fontFamily: F.sysSb, fontSize: fs(16), lineHeight: fs(16) * 1.55, color: p.body }}>
            {message || p.fallbackHero}
          </Text>
        ) : (
          <Headline variant={variant} type={type} hostName={hostName} p={p} />
        )}

        {/* 구분선 */}
        <Divider variant={variant} p={p} />

        {/* 핵심 정보 — 구장·시간 강조 (격식/편안 공통, 박스 없이 또렷하게) */}
        {(() => {
          const inner = (type === 'open' && !course) ? (
            <Text style={{ textAlign: 'center', fontFamily: F.sysB, fontSize: fs(17), lineHeight: fs(17) * 1.45, color: p.body }}>
              어디서 언제 칠지{'\n'}<Text style={{ color: p.accent }}>함께 정해요</Text>
            </Text>
          ) : (
            <>
              <Text style={{ textAlign: 'center', fontFamily: F.sysB, fontSize: fs(19), color: p.body }}>{course}</Text>
              {type === 'open' ? (
                <>
                  <Text style={{ textAlign: 'center', marginTop: 5, fontFamily: F.sysSb, fontSize: fs(14), color: p.accent }}>{p.openNote}</Text>
                  {!!openInfo && <Text style={{ textAlign: 'center', marginTop: 2, fontFamily: F.sysM, fontSize: fs(13), color: p.body }}>{openInfo}</Text>}
                </>
              ) : (
                <>
                  <Text style={{ textAlign: 'center', marginTop: 8, fontFamily: F.sysSb, fontSize: fs(15), color: p.accent }}>{date}</Text>
                  {!!time && <Text style={{ textAlign: 'center', marginTop: 3, fontFamily: F.sysM, fontSize: fs(14), color: p.accent }}>{time}</Text>}
                </>
              )}
            </>
          );
          return inner;
        })()}

        {/* 메시지(따옴표) — 격식형 + 멘트 있을 때만 (편안형은 위에서 히어로로 노출) */}
        {variant === 'formal' && !!message && (
          <Text style={{ textAlign: 'center', marginTop: 14, fontFamily: F.sys, fontSize: fs(14), lineHeight: fs(14) * 1.5, color: p.body }}>
            <Text style={{ color: p.accentDim }}>“ </Text>{message}<Text style={{ color: p.accentDim }}> ”</Text>
          </Text>
        )}

        {/* 수락 버튼 */}
        <TouchableOpacity activeOpacity={0.85} onPress={onAccept} style={{ marginTop: 22, borderRadius: 12, overflow: 'hidden' }}>
          <LinearGradient colors={p.btn} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} locations={p.btn.length === 3 ? [0, 0.5, 1] : [0, 1]}
            style={{ paddingVertical: 14, alignItems: 'center', borderWidth: 0.5, borderColor: p.accentDk, borderRadius: 12 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: p.btnText }}>{p.accept}</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* 거절 — 고스트(낮은 강조, 부담 최소화) */}
        <TouchableOpacity activeOpacity={0.7} onPress={onDecline} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ marginTop: 14, alignItems: 'center', paddingVertical: 4 }}>
          <Text style={{ fontFamily: F.sysM, fontSize: fs(13), color: p.declineColor }}>{p.decline}</Text>
        </TouchableOpacity>

        {/* 레터헤드 서명 — 우측 (격식·편안 공통) */}
        <Text style={{ textAlign: 'right', marginTop: 18, fontFamily: F.brand, fontSize: fs(11), color: p.accentDk }}>Dear Golf</Text>
      </LinearGradient>
    </Animated.View>
  );
}
