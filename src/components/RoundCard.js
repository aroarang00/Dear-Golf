import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { F, fs } from '../constants/colors';
import { resolvePhotoUri } from '../utils/photoStorage';
import { getCountryFlag } from '../constants/data';

// 라운딩 카드 — 공유용 매거진 스타일(대표사진 풀블리드 + 하단 반투명 정보 패널).
// ★명예의전당(트로피·골드·업적)과 결이 다름: 그날의 라운딩이 주인공 ([[score-brag-card]]).
// ★평면·만화 금지, 입체·고급 필수(사용자 지시): 홈 카드 톤의 다크 반투명 패널 + 골드 헤어라인/보더 + 텍스트 그림자로
//   글자가 사진 위로 또렷이 뜨고, 흰색 일변도 대신 골드 액센트로 색감을 준다. 사진은 allowDownscaling=false로 선명.
//  - 플레이어 이름(realName||nickname, DiaryScreen에서 주입) 표시 — "누구의 라운딩"인지 분명히.
//  - 줄 간격 촘촘하게(횅함 방지). 워터마크 = 상단 ROUND RECAP(Playfair 세리프) + 패널 Dear Golf(Lora 이탤릭).
//  - 좋은 날(베스트·싱글·해외 등)만 골드 액센트 칩, 평범·힘든 날은 중립.
//  - 사진 없으면 따뜻한 차콜 그라데이션 폴백(라운지색 네이비 회피 [[navy-lounge-color]]).
//  - ViewShot으로 캡처되는 그래픽 — width는 캡처 컨테이너 폭을 받아 4:5 세로 비율로 그림.

const GOLD = '#E8D9A0';
const GOLD_DEEP = '#C9A84C';
const CHAMPAGNE = '#EFE7CC'; // 흰-골드 중간 샴페인 — 구장명에 고급 색감(타수 골드보다 옅어 위계 유지)
const WHITE = '#F6F2E9'; // 순백 대신 따뜻한 화이트
const SHADOW = { textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 };

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
  // 타수 색 — 점수로 색을 깎으면(흰·무채) 기록에 연연하는 주 사용자층(80~100타) 자존심을 상하게 함.
  //   타수는 점수와 무관하게 항상 골드로 강조(평범한 흰색 폐기). 싱글·베스트의 영예는 SINGLE/BEST 칩으로 구분 ([[golfer-score-psychology]])
  const scoreColor = GOLD;

  const flag = item.overseas && item.country ? getCountryFlag(item.country) : '';
  const playerName = (item.playerName || '').trim();

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

      {/* 상단 살짝 어둡게(라벨 가독) + 하단 깊은 그라데이션(패널 안착감) */}
      <LinearGradient
        colors={['rgba(0,0,0,0.45)', 'transparent']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: Math.round(height * 0.28) }}
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.55)']}
        locations={[0.35, 1]}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: Math.round(height * 0.62) }}
      />
      {/* 얇은 내부 프레임 — 럭셔리 액자 느낌 */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }}
      />

      {/* 상단 — ROUND RECAP 워터마크(세리프) + 특별한 날 액센트 칩 */}
      <View style={{ position: 'absolute', top: 16, left: 18, right: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[{ fontFamily: F.en, fontSize: fs(13), color: GOLD, letterSpacing: 3 }, SHADOW]}>ROUND RECAP</Text>
        {accentLabel ? (
          <View style={{ borderWidth: 1, borderColor: GOLD, borderRadius: 3, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: 'rgba(0,0,0,0.25)' }}>
            <Text style={{ fontFamily: F.en, fontSize: fs(10), color: GOLD, letterSpacing: 2 }}>{accentLabel}</Text>
          </View>
        ) : null}
      </View>

      {/* 하단 정보 — 사진 있을 때만 반투명 박스(홈 카드 톤 + 골드 보더)로 가독성 확보.
          사진 없으면 차콜 배경 위 텍스트가 이미 또렷 → 박스 생략(있으면 되려 촌스러움, 사용자 지시) */}
      <View style={[
        { position: 'absolute', left: 14, right: 14, bottom: 14, paddingTop: 13, paddingBottom: 14, paddingHorizontal: photoUri ? 16 : 4 },
        photoUri && { backgroundColor: 'rgba(18,16,14,0.48)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(201,168,76,0.45)' },
      ]}>
        {/* 골드 헤어라인 */}
        <View style={{ height: 1.5, width: 34, backgroundColor: GOLD_DEEP, marginBottom: 9 }} />
        <Text numberOfLines={1} style={[{ fontFamily: F.sysB, fontSize: fs(20), color: CHAMPAGNE, letterSpacing: 0.2 }, SHADOW]}>
          {flag ? flag + ' ' : ''}{item.course || '라운딩'}
        </Text>
        {/* 이름 · 날짜 · 날씨 — 골드 한 줄, 촘촘하게 */}
        <Text numberOfLines={1} style={[{ fontFamily: F.sysM, fontSize: fs(12), color: GOLD, letterSpacing: 0.3, marginTop: 6 }, SHADOW]}>
          {playerName ? playerName + '   ·   ' : ''}{item.date}{item.weather ? '   ·   ' + item.weather : ''}
        </Text>

        {/* 줄 간격 균일(6) — 타수 줄만 유난히 떨어져 보이던 것 해소(사용자 지시). Dear Golf는 타수 줄 우측에 맞춤 */}
        {hasScore ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 6 }}>
            <Text style={[{ fontFamily: F.en, fontSize: fs(46), lineHeight: fs(48), color: scoreColor }, SHADOW]}>{item.score}</Text>
            <Text style={[{ fontFamily: F.sysB, fontSize: fs(15), color: scoreColor, marginLeft: 4, marginBottom: 6 }, SHADOW]}>타</Text>
            {diffLabel ? (
              <Text style={[{ fontFamily: F.en, fontSize: fs(14), color: 'rgba(246,242,233,0.9)', letterSpacing: 1, marginLeft: 10, marginBottom: 7 }, SHADOW]}>
                {diffLabel}   ·   par {item.par}
              </Text>
            ) : null}
            <View style={{ flex: 1 }} />
            <Text style={[{ fontFamily: F.brand, fontSize: fs(14), color: WHITE, marginBottom: 5 }, SHADOW]}>Dear Golf</Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6 }}>
            <Text style={[{ fontFamily: F.brand, fontSize: fs(14), color: WHITE }, SHADOW]}>Dear Golf</Text>
          </View>
        )}
      </View>
    </View>
  );
}
