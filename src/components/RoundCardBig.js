import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { F, fs } from '../constants/colors';
import { resolvePhotoUri } from '../utils/photoStorage';
import { getCountryFlag } from '../constants/data';

// 라운딩 자랑 카드 — '빅 스코어' 스타일. 타수가 주인공(초대형), 미니멀.
//  사진 있으면 어둡게 깔고 그 위 큰 타수 / 없으면 차콜 그라데이션. 타수는 점수와 무관하게 항상 골드
//  (기록에 연연하는 주 사용자층 자존심 보호 [[golfer-score-psychology]]). 매거진(RoundCard)과 결이 다름 — 스코어 자랑용.
//  ※ 초대형 숫자는 fs() 최소12 클램프 무관하지만 캡처 고정 크기라 px 직접 사용.

const GOLD = '#E8D9A0';
const GOLD_DEEP = '#C9A84C';
const WHITE = '#F6F2E9';
const SHADOW = { textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 10 };

export function RoundCardBig({ item, width = 320 }) {
  const height = Math.round(width * 1.25);

  const photoRaw = (item.photos && item.photos[0]) || null;
  const photoUri = photoRaw ? resolvePhotoUri(typeof photoRaw === 'object' ? photoRaw.uri : photoRaw) : null;

  const hasScore = typeof item.score === 'number';
  const diff = hasScore && typeof item.par === 'number' ? item.score - item.par : null;
  const diffLabel = diff == null ? '' : diff > 0 ? `+${diff}` : `${diff}`;
  const isSingle = hasScore && item.score <= 79;
  const isBest = item.badge === '베스트';
  const special = item.special || null;
  const accentLabel = special || (isBest ? 'BEST' : isSingle ? 'SINGLE' : null);
  const flag = item.overseas && item.country ? getCountryFlag(item.country) : '';
  const playerName = (item.playerName || '').trim();

  const bigSize = Math.round(width * 0.36); // 타수 초대형 — 카드 폭 비례

  return (
    <View style={{ width, height, borderRadius: 16, overflow: 'hidden', backgroundColor: '#1C1A17' }}>
      {photoUri ? (
        <>
          <Image source={{ uri: photoUri }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" cachePolicy="memory-disk" allowDownscaling={false} />
          {/* 사진 어둡게 — 초대형 타수 가독성 */}
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(20,18,16,0.52)' }} />
        </>
      ) : (
        <LinearGradient colors={['#3A352F', '#1C1A17']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      )}
      {/* 얇은 골드 프레임 */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(201,168,76,0.32)' }} />

      {/* 상단 라벨 + 특별한 날 칩 */}
      <View style={{ position: 'absolute', top: 20, left: 22, right: 22, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[{ fontFamily: F.en, fontSize: fs(12), color: WHITE, letterSpacing: 3, opacity: 0.92 }, SHADOW]}>ROUND</Text>
        {accentLabel ? (
          <View style={{ borderWidth: 1, borderColor: GOLD, borderRadius: 3, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: 'rgba(0,0,0,0.2)' }}>
            <Text style={{ fontFamily: F.en, fontSize: fs(11), color: GOLD, letterSpacing: 2 }}>{accentLabel}</Text>
          </View>
        ) : null}
      </View>

      {/* 중앙 — 초대형 타수 */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }}>
        {hasScore ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <Text style={[{ fontFamily: F.en, fontSize: bigSize, lineHeight: Math.round(bigSize * 1.02), color: GOLD }, SHADOW]}>{item.score}</Text>
              <Text style={[{ fontFamily: F.sysB, fontSize: fs(20), color: GOLD, marginTop: Math.round(bigSize * 0.16), marginLeft: 5 }, SHADOW]}>타</Text>
            </View>
            {diffLabel ? (
              <Text style={[{ fontFamily: F.en, fontSize: fs(16), color: WHITE, letterSpacing: 1.5, marginTop: 4, opacity: 0.92 }, SHADOW]}>{diffLabel}   ·   par {item.par}</Text>
            ) : null}
          </>
        ) : (
          <Text style={[{ fontFamily: F.brand, fontSize: fs(30), color: GOLD, textAlign: 'center' }, SHADOW]}>{item.course || '라운딩'}</Text>
        )}
      </View>

      {/* 하단 — 구장·이름·날짜 + Dear Golf */}
      <View style={{ position: 'absolute', left: 22, right: 22, bottom: 20 }}>
        <View style={{ height: 1.5, width: 34, backgroundColor: GOLD_DEEP, marginBottom: 9 }} />
        <Text numberOfLines={1} style={[{ fontFamily: F.sysB, fontSize: fs(17), color: WHITE }, SHADOW]}>{flag ? flag + ' ' : ''}{item.course || '라운딩'}</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 4 }}>
          <Text numberOfLines={1} style={[{ fontFamily: F.sysM, fontSize: fs(12), color: GOLD, flex: 1 }, SHADOW]}>{playerName ? playerName + '   ·   ' : ''}{item.date}{item.weather ? '   ·   ' + item.weather : ''}</Text>
          <Text style={[{ fontFamily: F.brand, fontSize: fs(14), color: WHITE, marginLeft: 8 }, SHADOW]}>Dear Golf</Text>
        </View>
      </View>
    </View>
  );
}
