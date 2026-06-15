import React from 'react';
import { View, Text, ImageBackground } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { F } from '../constants/colors';

// 카카오 공유용 가로 카드 — 골프장 사진 위에 어두운 투명 레이어 + 글자(홈 화면 방식).
//   ([[invite-deeplink-system]] [[home-bg-curation]], 사용자 2026-06-15)
//
//   ★난제 해결: 카카오 피드는 이미지를 가로로 가운데만 크롭해 보여준다. 사진 배경은 어디가 잘려도 풍경이라
//     무손실이고, 글자는 정중앙에 모아 어떤 크롭에서도 핵심(구장·날짜)이 살아남는다.
//   ★역할 분리: 카드엔 분위기·핵심만. 인원·남은자리는 카카오 description 텍스트, 수락/거절은 카카오 버튼.
//   배경 = 로컬 번들 사진(require) — 네트워크 없이 즉시·선명, 캡처(captureRef)도 안정적(원격 이미지는 미로딩 위험).
//   앱 내 미리보기·'공유하기'(OS 이미지)는 세로 카드(RoundupShareCard) 그대로.
//  ※ 캡처 이미지라 폰트는 width 기준 px 스케일(S)로 — fs()의 폰트스케일·클램프 회피, 어느 폰에서 캡처해도 동일.

const KAKAO_RATIO = 2; // 카카오 피드 가로 표준(800×400)
const BG = require('../../assets/home-bg/day1.jpg'); // 정돈된 페어웨이·호수 풍경([[home-bg-curation]] 큐레이션 통과 사진)

const GOLD = '#E6C677';
const WHITE = '#FFFFFF';
const IVORY = '#F2EEE4';
const WHITE_DIM = 'rgba(255,255,255,0.82)';

// 사진 위 글씨 가독 — 은은한 그림자(홈과 동일 접근)
const SHADOW = { textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 };

export function RoundupShareCardWide({ post, width = 600 }) {
  if (!post) return null;
  const height = Math.round(width / KAKAO_RATIO); // 2:1 — 카카오 피드 가로 슬롯에 맞춤
  const S = (n) => Math.round(n * (width / 600)); // 기준 600 기준 스케일

  const isOpen = post.type === 'open';
  const isInvite = post.scope === 'select'; // 친구지정 = 개인 초대, 그 외 = 모집

  const courseText = post.course || (isOpen ? '함께 정하는 라운드' : '-');
  // 날짜·시간은 한 줄에 붙이지 않고 구장 아래 각각 별도 줄로 — 길어도 잘리지 않게 (사용자 2026-06-15)
  const dateLine = isOpen ? '날짜는 함께 정해요' : `${post.date || ''}${post.day ? ` (${post.day})` : ''}`.trim();
  const timeLine = isOpen ? '' : (post.time || '');
  const word = isInvite ? '라운딩 초대' : '동반자 모집';

  return (
    <View style={{ width, height, borderRadius: S(16), overflow: 'hidden' }}>
      <ImageBackground source={BG} resizeMode="cover" style={{ width, height }}>
        {/* 어두운 그라데이션 오버레이 — 사진 톤 죽이고 글씨 가독(아래로 갈수록 진하게) */}
        <LinearGradient
          colors={['rgba(6,18,12,0.40)', 'rgba(6,18,12,0.50)', 'rgba(6,18,12,0.76)']}
          locations={[0, 0.5, 1]}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: S(28), paddingVertical: S(20) }}>

          {/* 워드마크 — 골드 (상태) */}
          <Text style={{ fontFamily: F.sysSb, fontSize: S(13), letterSpacing: S(3), color: GOLD, ...SHADOW }}>{word}</Text>

          {/* 구장명 — 주인공 (화이트, 정중앙) */}
          <Text numberOfLines={1} style={{ marginTop: S(12), fontFamily: F.sysB, fontSize: S(28), color: WHITE, textAlign: 'center', ...SHADOW }}>
            {courseText}
          </Text>
          {/* 날짜 — 구장 아래 별도 줄 (말줄임 없이 전체 표시) */}
          <Text style={{ marginTop: S(8), fontFamily: F.sysM, fontSize: S(15), letterSpacing: S(0.5), color: IVORY, textAlign: 'center', ...SHADOW }}>
            {dateLine}
          </Text>
          {/* 시간 — 또 별도 줄 (날짜와 한 줄에 붙이지 않아 잘림 방지) */}
          {timeLine ? (
            <Text style={{ marginTop: S(3), fontFamily: F.sysM, fontSize: S(14), letterSpacing: S(0.5), color: IVORY, textAlign: 'center', ...SHADOW }}>
              {timeLine}
            </Text>
          ) : null}

          {/* 하단 중앙 — 브랜드 */}
          <Text style={{ position: 'absolute', bottom: S(12), left: 0, right: 0, textAlign: 'center', fontFamily: F.brand, fontSize: S(14), color: WHITE_DIM, ...SHADOW }}>
            Dear Golf
          </Text>
        </LinearGradient>
      </ImageBackground>
    </View>
  );
}
