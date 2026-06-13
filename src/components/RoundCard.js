import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { F, fs } from '../constants/colors';
import { resolvePhotoUri } from '../utils/photoStorage';
import { getCountryFlag } from '../constants/data';

// 라운딩 카드 — 공유용 매거진 스타일(대표사진 풀블리드 + 하단 오버레이).
// ★명예의전당(트로피·골드·업적)과 결이 다름: 그날의 일상 기록이 주인공 ([[score-brag-card]]).
// ★평면·만화 금지, 입체·고급 필수(사용자 지시): 다층 그라데이션 + 비네팅 + 텍스트 그림자로 글자가 사진 위로 뜨고,
//   따뜻한 화이트·골드 헤어라인·얇은 내부 프레임으로 editorial 럭셔리. 사진은 allowDownscaling=false로 선명 유지.
//  - 스코어 숫자 Playfair 세리프(F.en), "Dear Golf" Lora 이탤릭(F.brand).
//  - 좋은 날(베스트·싱글·홀인원 등)만 골드 액센트, 평범·힘든 날은 중립(110타에 자랑 강요 X).
//  - 사진 없으면 따뜻한 차콜 그라데이션 폴백(라운지색 네이비 회피 [[navy-lounge-color]]).
//  - ViewShot으로 캡처되는 그래픽 — width는 캡처 컨테이너 폭을 받아 4:5 세로 비율로 그림.

const GOLD = '#E8D9A0';
const GOLD_DEEP = '#C9A84C';
const WHITE = '#F6F2E9'; // 순백 대신 따뜻한 화이트 — 평면감 줄이고 고급 톤
const SHADOW = { textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 7 };

export function RoundCard({ item, width = 320 }) {
  const height = Math.round(width * 1.25); // 4:5 매거진 세로

  const photoRaw = (item.photos && item.photos[0]) || null;
  const photoUri = photoRaw
    ? resolvePhotoUri(typeof photoRaw === 'object' ? photoRaw.uri : photoRaw)
    : null;

  const hasScore = typeof item.score === 'number';
  const diff = hasScore && typeof item.par === 'number' ? item.score - item.par : null;
  const diffLabel = diff == null ? '' : diff > 0 ? `+${diff}` : `${diff}`;

  const isSingle = hasScore && item.score <= 79;
  const isBest = item.badge === '베스트';
  const special = item.special || null;
  const noteworthy = isSingle || isBest || !!special;
  const accentLabel = special || (isBest ? 'BEST' : isSingle ? 'SINGLE' : null);
  const scoreColor = noteworthy ? GOLD : WHITE;

  const flag = item.overseas && item.country ? getCountryFlag(item.country) : '';

  return (
    <View style={{ width, height, borderRadius: 16, overflow: 'hidden', backgroundColor: '#2A2622' }}>
      {/* 배경 — 대표사진 풀블리드 (없으면 차콜 그라데이션). allowDownscaling=false로 캡처 선명도 유지 */}
      {photoUri ? (
        <Image
          source={{ uri: photoUri }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          contentFit="cover"
          cachePolicy="memory-disk"
          allowDownscaling={false}
        />
      ) : (
        <LinearGradient
          colors={['#4A443D', '#2A2622']}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
      )}

      {/* 비네팅 — 좌/우 가장자리 미세하게 어둡게(사진 깊이감). 너무 세지 않게 0.22 */}
      <LinearGradient
        colors={['rgba(0,0,0,0.22)', 'transparent']}
        start={{ x: 0, y: 0.5 }} end={{ x: 0.32, y: 0.5 }}
        style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.22)']}
        start={{ x: 0.68, y: 0.5 }} end={{ x: 1, y: 0.5 }}
        style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
      />
      {/* 상단 살짝 어둡게 — 라벨 가독성 */}
      <LinearGradient
        colors={['rgba(0,0,0,0.42)', 'transparent']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: Math.round(height * 0.24) }}
      />
      {/* 하단 그라데이션 — 정보 영역(깊은 다층) */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0.86)']}
        locations={[0, 0.42, 1]}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: Math.round(height * 0.64) }}
      />

      {/* 얇은 내부 프레임 — 럭셔리 액자 느낌 */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' }}
      />

      {/* 상단 editorial 라벨 + 특별한 날 액센트 */}
      <View style={{ position: 'absolute', top: 18, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[{ fontFamily: F.en, fontSize: fs(11), color: WHITE, letterSpacing: 3, opacity: 0.95 }, SHADOW]}>ROUND</Text>
        {accentLabel ? (
          <View style={{ borderWidth: 1, borderColor: GOLD, borderRadius: 2, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: 'rgba(0,0,0,0.18)' }}>
            <Text style={{ fontFamily: F.en, fontSize: fs(10), color: GOLD, letterSpacing: 2 }}>{accentLabel}</Text>
          </View>
        ) : null}
      </View>

      {/* 하단 콘텐츠 */}
      <View style={{ position: 'absolute', left: 20, right: 20, bottom: 20 }}>
        {/* 골드 헤어라인 — 흰 줄 대신 럭셔리 */}
        <View style={{ height: 1.5, width: 40, backgroundColor: GOLD_DEEP, marginBottom: 12 }} />
        <Text numberOfLines={2} style={[{ fontFamily: F.sysB, fontSize: fs(22), lineHeight: fs(28), color: WHITE, letterSpacing: 0.3 }, SHADOW]}>
          {flag ? flag + ' ' : ''}{item.course || '라운딩'}
        </Text>
        <Text style={[{ fontFamily: F.en, fontSize: fs(12), color: 'rgba(246,242,233,0.88)', letterSpacing: 1.5, marginTop: 6 }, SHADOW]}>
          {item.date}{item.weather ? '   ·   ' + item.weather : ''}
        </Text>

        {hasScore ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 12 }}>
            <Text style={[{ fontFamily: F.en, fontSize: fs(50), lineHeight: fs(52), color: scoreColor }, SHADOW]}>{item.score}</Text>
            <Text style={[{ fontFamily: F.sysB, fontSize: fs(16), color: scoreColor, marginLeft: 4, marginBottom: 7 }, SHADOW]}>타</Text>
            {diffLabel ? (
              <Text style={[{ fontFamily: F.en, fontSize: fs(15), color: 'rgba(246,242,233,0.88)', letterSpacing: 1, marginLeft: 12, marginBottom: 8 }, SHADOW]}>
                {diffLabel}   ·   par {item.par}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Dear Golf 워드마크 — 매거진 마스트헤드 */}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 }}>
          <Text style={[{ fontFamily: F.brand, fontSize: fs(15), color: WHITE, opacity: 0.95 }, SHADOW]}>Dear Golf</Text>
        </View>
      </View>
    </View>
  );
}
