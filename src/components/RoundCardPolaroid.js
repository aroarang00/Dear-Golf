import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { F, fs } from '../constants/colors';
import { resolvePhotoUri } from '../utils/photoStorage';
import { getCountryFlag } from '../constants/data';
import { formatNameList } from '../utils/nameList';

// 라운딩 자랑 카드 — '모던 화이트(갤러리)' 스타일. 흰 카드 + 사진 + 정제된 골드/차콜 정보.
//  4종 중 유일한 밝은 카드(다크 매거진·딥그린 스코어·다크 기념과 대비). 빈티지 폴라로이드(Lora 손글씨·세피아)는
//  디어골프 럭셔리 톤과 안 맞아 폐기 → 미술관 액자처럼 깔끔한 화이트 럭셔리로 전환(사용자 2026-06-14).
//  타수는 사진에서 빼고 하단 정보로(구장 / 타수 + Dear Golf / 이름·날짜). 동반자 있으면 본인 이름 대신 동반자(중복 회피).
//  글자색 = 차콜(구장·메타) + 골드 포인트(타수·헤어라인). 너무 튀지 않게 고급스럽게.

const INK = '#2A2622';                  // 차콜 — 구장명(또렷·고급)
const INK_SOFT = 'rgba(42,38,34,0.55)'; // 연한 차콜 — 이름·날짜
const GOLD = '#C9A84C';                 // 골드 포인트 — 타수·헤어라인
const GOLD_DEEP = '#A9854A';            // 깊은 골드 — Dear Golf 워드마크

export function RoundCardPolaroid({ item, width = 320 }) {
  const height = Math.round(width * 1.25);

  const photoRaw = (item.photos && item.photos[0]) || null;
  const photoUri = photoRaw ? resolvePhotoUri(typeof photoRaw === 'object' ? photoRaw.uri : photoRaw) : null;

  const hasScore = typeof item.score === 'number';
  const diff = hasScore && typeof item.par === 'number' ? item.score - item.par : null;
  const diffLabel = diff == null ? '' : diff > 0 ? `+${diff}` : `${diff}`;
  const flag = item.overseas && item.country ? getCountryFlag(item.country) : '';
  const playerName = (item.playerName || '').trim();
  const companionNames = formatNameList(
    (item.companions || []).map(c => (typeof c === 'string' ? c : (c?.name || ''))),
    { sep: ', ' }
  );
  // 하단 메타 — 동반자 있으면 동반자(본인 이름 빼 중복 회피), 없으면 본인 이름
  const who = companionNames || playerName;
  const metaLine = `${who ? who + '   ·   ' : ''}${item.date || ''}`;

  const FRAME = Math.round(width * 0.055);   // 흰 테두리(살짝 슬림)
  const photoH = Math.round(height * 0.62);  // 사진 영역

  return (
    <View style={{ width, height, borderRadius: 8, overflow: 'hidden', backgroundColor: '#FCFAF5', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' }}>
      <View style={{ padding: FRAME }}>
        {/* 사진 영역 — 타수 칩 제거(하단 정보로 이동) */}
        <View style={{ width: '100%', height: photoH, borderRadius: 3, backgroundColor: '#EEE9DC', overflow: 'hidden' }}>
          {photoUri ? (
            <>
              <Image source={{ uri: photoUri }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory-disk" allowDownscaling={false} />
              {/* Dear Golf 워터마크 — 사진 우측 상단(흰색 + 그림자로 사진 위 가독). 사용자 2026-06-14 */}
              <Text style={{ position: 'absolute', top: 9, right: 11, fontFamily: F.brand, fontSize: fs(14), color: '#fff',
                textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 }}>Dear Golf</Text>
            </>
          ) : (
            <LinearGradient colors={['#EFEADD', '#E0D8C5']} style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: F.brand, fontSize: fs(22), color: 'rgba(42,38,34,0.35)' }}>Dear Golf</Text>
            </LinearGradient>
          )}
        </View>

        {/* 하단 정보 — 모던 화이트 갤러리(골드 헤어라인 + 차콜 구장 + 골드 타수 + Dear Golf) */}
        <View style={{ paddingTop: 13, paddingHorizontal: 2 }}>
          <View style={{ height: 1.5, width: 28, backgroundColor: GOLD, marginBottom: 9 }} />
          <Text numberOfLines={1} style={{ fontFamily: F.sysB, fontSize: fs(19), color: INK, letterSpacing: 0.2 }}>
            {flag ? flag + ' ' : ''}{item.course || '라운딩'}
          </Text>
          {/* 타수(좌, 골드) — Dear Golf는 사진 우측 상단으로 이동(사용자 2026-06-14) */}
          {hasScore ? (
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 8 }}>
              <Text style={{ fontFamily: F.en, fontSize: fs(30), lineHeight: fs(32), color: GOLD }}>{item.score}</Text>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: GOLD, marginLeft: 3, marginBottom: 3 }}>타</Text>
              {diffLabel ? (
                <Text style={{ fontFamily: F.en, fontSize: fs(12), color: INK_SOFT, letterSpacing: 0.5, marginLeft: 8, marginBottom: 3 }}>{diffLabel}</Text>
              ) : null}
            </View>
          ) : null}
          {/* 이름·날짜 (동반자 있으면 동반자) */}
          {metaLine ? (
            <Text numberOfLines={1} style={{ fontFamily: F.sysM, fontSize: fs(12), color: INK_SOFT, marginTop: 7 }}>
              {metaLine}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}
