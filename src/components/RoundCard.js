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
//  - 줄 간격 촘촘하게(횅함 방지). 워터마크 = 상단 ROUND RECAP(Playfair 세리프) + Dear Golf(Lora 이탤릭).
//  - 좋은 날(베스트·싱글·해외 등)만 골드 액센트 칩, 평범·힘든 날은 중립.
//  ★사진 없음(차콜 폴백)은 별도 레이아웃 — 풍부한 차콜 그라데이션 + 광원/비네팅으로 사진 같은 질감을 주고,
//   정보는 하단 패널에 배치(중앙은 그라데이션 여백). special(홀인원·이글 등)은 구장명 위 골드바 위에 크게.
//   (중앙배열은 그라데이션 느낌이 안 살아 하단 배치로 되돌림 — 사용자 빌드 확인 2026-06-14)
//  - ViewShot으로 캡처되는 그래픽 — width는 캡처 컨테이너 폭을 받아 4:5 세로 비율로 그림.

const GOLD = '#E8D9A0';
const GOLD_DEEP = '#C9A84C';
const CHAMPAGNE = '#EFE7CC'; // 흰-골드 중간 샴페인 — 구장명에 고급 색감(타수 골드보다 옅어 위계 유지)
const WHITE = '#F6F2E9'; // 순백 대신 따뜻한 화이트
const BURGUNDY = '#6B1E2A'; // 특별한 순간(홀인원·이글 등) 채움 박스 — 골드(평범)보다 특별, 사진 위에서도 또렷. 에메랄드는 촌스러워 버건디로(사용자 2026-06-14) ([[score-brag-card]])
const CREAM = '#F5E6A8';   // 버건디 채움 박스 위 글자
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
  const sideBadge = isBest ? 'BEST' : isSingle ? 'SINGLE' : null; // special 외 영예칩(베스트/싱글)
  const accentLabel = special || sideBadge;
  // 타수 색 — 점수로 색을 깎으면(흰·무채) 기록에 연연하는 주 사용자층(80~100타) 자존심을 상하게 함.
  //   타수는 점수와 무관하게 항상 골드로 강조(평범한 흰색 폐기). 싱글·베스트의 영예는 SINGLE/BEST 칩으로 구분 ([[golfer-score-psychology]])
  const scoreColor = GOLD;

  const flag = item.overseas && item.country ? getCountryFlag(item.country) : '';
  const playerName = (item.playerName || '').trim();
  const metaLine = `${playerName ? playerName + '   ·   ' : ''}${item.date || ''}${item.weather ? '   ·   ' + item.weather : ''}`;

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
        // 사진 없음 — 풍부한 차콜 그라데이션(3색 깊이). 아래 분기의 광원·비네팅 레이어와 합쳐 사진 같은 질감
        <LinearGradient
          colors={['#46403A', '#2E2A25', '#1A1815']}
          locations={[0, 0.55, 1]}
          start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
      )}

      {/* 얇은 내부 프레임 — 럭셔리 액자 느낌 (사진 유무 공통) */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }}
      />

      {photoUri ? (
        // ───────────────── 사진 있음 — 풀블리드 + 하단 정보 패널(현행) ─────────────────
        <>
          {/* 상단/하단 그라데이션 — 사진 위주로 슬림하게(가림 최소화, 사용자 2026-06-14) */}
          <LinearGradient
            colors={['rgba(0,0,0,0.42)', 'transparent']}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: Math.round(height * 0.20) }}
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.55)']}
            locations={[0.35, 1]}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: Math.round(height * 0.46) }}
          />

          {/* 상단 — 좌측: special 있으면 에메랄드 채움 박스(홀인원 등), 없으면 ROUND RECAP / 우측: Dear Golf 워터마크.
              special을 좌상단에 올려 특별함을 먼저 보여줌(사용자 2026-06-14, [[score-brag-card]]). */}
          <View style={{ position: 'absolute', top: 15, left: 18, right: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            {special ? (
              // 사진版 special — 차콜 바탕 + 골드 텍스트(사용자 2026-06-14). no-photo版(골드 테두리 박스)과 다른 결
              <View style={{ backgroundColor: 'rgba(42,38,34,0.92)', borderRadius: 6, paddingHorizontal: 14, paddingVertical: 8 }}>
                <Text style={{ fontFamily: F.en, fontSize: fs(20), color: GOLD, letterSpacing: 3 }}>{special}</Text>
              </View>
            ) : (
              <Text style={[{ fontFamily: F.en, fontSize: fs(12), color: GOLD, letterSpacing: 3 }, SHADOW]}>ROUND RECAP</Text>
            )}
            <Text style={[{ fontFamily: F.brand, fontSize: fs(14), color: WHITE }, SHADOW]}>Dear Golf</Text>
          </View>

          {/* 하단 — 영예칩(베스트/싱글, 골드 테두리) + 정보 박스. special은 좌상단으로 올려 여기선 중복 표시 안 함. */}
          <View style={{ position: 'absolute', left: 14, right: 14, bottom: 12 }}>
            {sideBadge ? (
              <View style={{ alignSelf: 'flex-start', borderWidth: 1, borderColor: GOLD, borderRadius: 4, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: 'rgba(0,0,0,0.42)', marginBottom: 8 }}>
                <Text style={[{ fontFamily: F.en, fontSize: fs(11), color: GOLD, letterSpacing: 2 }, SHADOW]}>{sideBadge}</Text>
              </View>
            ) : null}
            <View style={{ paddingTop: 9, paddingBottom: 10, paddingHorizontal: 13,
              backgroundColor: 'rgba(18,16,14,0.46)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(201,168,76,0.42)' }}>
              <View style={{ height: 1.5, width: 28, backgroundColor: GOLD_DEEP, marginBottom: 6 }} />
              <Text numberOfLines={1} style={[{ fontFamily: F.sysB, fontSize: fs(17), color: CHAMPAGNE, letterSpacing: 0.2 }, SHADOW]}>
                {flag ? flag + ' ' : ''}{item.course || '라운딩'}
              </Text>
              <Text numberOfLines={1} style={[{ fontFamily: F.sysM, fontSize: fs(11), color: GOLD, letterSpacing: 0.3, marginTop: 4 }, SHADOW]}>
                {metaLine}
              </Text>
              {hasScore ? (
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 4 }}>
                  <Text style={[{ fontFamily: F.en, fontSize: fs(34), lineHeight: fs(36), color: scoreColor }, SHADOW]}>{item.score}</Text>
                  <Text style={[{ fontFamily: F.sysB, fontSize: fs(13), color: scoreColor, marginLeft: 4, marginBottom: 4 }, SHADOW]}>타</Text>
                  {diffLabel ? (
                    <Text style={[{ fontFamily: F.en, fontSize: fs(12), color: 'rgba(246,242,233,0.9)', letterSpacing: 1, marginLeft: 8, marginBottom: 5 }, SHADOW]}>
                      {diffLabel}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
        </>
      ) : (
        // ───────────────── 사진 없음 — 그라데이션 질감 배경 + 하단 정보 패널 ─────────────────
        <>
          {/* 배경 깊이(사진 같은 질감) — 좌상단 광원 + 우하단 비네팅 + 하단 어둡게(패널 안착) */}
          <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.09)', 'transparent']}
            start={{ x: 0, y: 0 }} end={{ x: 0.7, y: 0.62 }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          <LinearGradient pointerEvents="none" colors={['transparent', 'rgba(0,0,0,0.32)', 'rgba(0,0,0,0.58)']}
            locations={[0.32, 0.74, 1]} start={{ x: 0.4, y: 0.2 }} end={{ x: 1, y: 1 }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />

          {/* 상단 — special 있으면 ROUND RECAP 자리에 골드 박스(크게), 없으면 ROUND RECAP. Dear Golf는 하단으로(사용자 2026-06-14) */}
          <View style={{ position: 'absolute', top: 16, left: 18, right: 18, flexDirection: 'row' }}>
            {special ? (
              <View style={{ borderWidth: 1.5, borderColor: GOLD, borderRadius: 6, paddingHorizontal: 15, paddingVertical: 9, backgroundColor: 'rgba(0,0,0,0.25)' }}>
                <Text style={[{ fontFamily: F.en, fontSize: fs(19), color: GOLD, letterSpacing: 3 }, SHADOW]}>{special}</Text>
              </View>
            ) : (
              <Text style={[{ fontFamily: F.en, fontSize: fs(13), color: GOLD, letterSpacing: 3 }, SHADOW]}>ROUND RECAP</Text>
            )}
          </View>

          {/* 하단 정보 패널 — special(크게)·골드바·구장·메타·타수. 차콜 배경 위라 박스 없이 또렷.
              하단에 완전히 붙이지 않고 여유를 둠(bottom 32, 사용자 지시 2026-06-14) */}
          <View style={{ position: 'absolute', left: 20, right: 20, bottom: 32 }}>
            {/* 영예칩(베스트/싱글) — special은 상단 ROUND RECAP 자리로 올려 여기선 BEST/SINGLE만(중복 방지) */}
            {sideBadge ? (
              <Text style={[{ fontFamily: F.en, fontSize: fs(18), color: GOLD, letterSpacing: 3, marginBottom: 9 }, SHADOW]}>{sideBadge}</Text>
            ) : null}
            <View style={{ height: 1.5, width: 34, backgroundColor: GOLD_DEEP, marginBottom: 10 }} />
            <Text numberOfLines={1} style={[{ fontFamily: F.sysB, fontSize: fs(22), color: CHAMPAGNE, letterSpacing: 0.2 }, SHADOW]}>
              {flag ? flag + ' ' : ''}{item.course || '라운딩'}
            </Text>
            <Text numberOfLines={1} style={[{ fontFamily: F.sysM, fontSize: fs(12), color: GOLD, letterSpacing: 0.3, marginTop: 7 }, SHADOW]}>
              {metaLine}
            </Text>
            {hasScore ? (
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 8 }}>
                <Text style={[{ fontFamily: F.en, fontSize: fs(48), lineHeight: fs(50), color: scoreColor }, SHADOW]}>{item.score}</Text>
                <Text style={[{ fontFamily: F.sysB, fontSize: fs(15), color: scoreColor, marginLeft: 4, marginBottom: 6 }, SHADOW]}>타</Text>
                {diffLabel ? (
                  <Text style={[{ fontFamily: F.en, fontSize: fs(14), color: 'rgba(246,242,233,0.9)', letterSpacing: 1, marginLeft: 10, marginBottom: 7 }, SHADOW]}>
                    {diffLabel}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
          {/* Dear Golf — 하단 우측(상단에서 이동, 사용자 2026-06-14) */}
          <Text style={[{ position: 'absolute', bottom: 16, right: 20, fontFamily: F.brand, fontSize: fs(15), color: WHITE }, SHADOW]}>Dear Golf</Text>
        </>
      )}
    </View>
  );
}
