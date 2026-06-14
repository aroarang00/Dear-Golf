import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { F, fs } from '../constants/colors';
import { resolvePhotoUri } from '../utils/photoStorage';
import { getCountryFlag } from '../constants/data';
import { formatNameList } from '../utils/nameList';

// 라운딩 자랑 카드 — '기념(스코어 없음)' 매거진 스타일. 타수 대신 함께한 사람·한줄메모가 주인공.
//  오랜만의 동반 라운딩을 예쁜 사진 한 장으로 남기는 용도 — 스코어에 연연하지 않게 ([[golfer-score-psychology]]).
//  매거진(RoundCard) 골격(풀블리드 사진 + 하단 골드 패널)을 빌리되, 타수 블록을 빼고 'WITH 동반자' + 메모 인용으로 치환.
//  동반자 있으면 'WITH ○○' 줄 표시, 없으면 그 줄 생략(본인 이름은 메타줄에 이미 있어 솔로 라운딩도 자연스럽게 포괄). 메모 없으면 메모 줄 생략.
//  ※ companions는 문자열/객체({name}) 혼재 가능 → name으로 평탄화(MyScheduleTab 패턴). 사진 없으면 차콜 그라데이션 폴백.

const GOLD = '#E8D9A0';
const GOLD_DEEP = '#C9A84C';
const CHAMPAGNE = '#EFE7CC'; // 흰-골드 중간 샴페인 — 구장명에 고급 색감
const WHITE = '#F6F2E9';
const BURGUNDY = '#6B1E2A'; // 특별한 순간 — '그날의 라운딩' 워터마크 자리에 버건디 채움 박스 (매거진과 통일)
const CREAM = '#F5E6A8';
const SHADOW = { textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 };

export function RoundCardMemory({ item, width = 320 }) {
  const height = Math.round(width * 1.25); // 4:5 매거진 세로

  const photoRaw = (item.photos && item.photos[0]) || null;
  const photoUri = photoRaw ? resolvePhotoUri(typeof photoRaw === 'object' ? photoRaw.uri : photoRaw) : null;

  const flag = item.overseas && item.country ? getCountryFlag(item.country) : '';
  const playerName = (item.playerName || '').trim();
  // WITH 명단 — 내 이름(playerName)도 맨 앞에 포함. companions의 isMe는 빼고(중복 방지) 본인은 playerName으로 통일.
  //   긴 닉네임은 WITH 줄 numberOfLines=1 + formatNameList(4명+'외 N명')로 말줄임 → 카드 안 늘어남.
  const _others = (item.companions || [])
    .filter(c => !(typeof c === 'object' && c?.isMe))
    .map(c => (typeof c === 'string' ? c : (c?.name || '')))
    .filter(Boolean);
  const _self = playerName || (((item.companions || []).find(c => typeof c === 'object' && c?.isMe) || {}).name || '').trim();
  // 동반자(나 외)가 있을 때만 WITH 줄 표시 — 솔로면 빈 문자열로 줄 자체를 숨김(다른 문구 안 채움, 사용자 2026-06-14)
  const companionNames = _others.length > 0
    ? formatNameList([...new Set([_self, ..._others].filter(Boolean))], { sep: ', ' })
    : '';
  // 특별한 순간 — 홀인원·이글 등은 item.special(워터마크 자리로), 베스트·싱글은 스코어 기반 영예칩(하단)
  const isSingle = typeof item.score === 'number' && item.score <= 79;
  const isBest = item.badge === '베스트';
  const special = item.special || null;
  const sideBadge = isBest ? 'BEST' : isSingle ? 'SINGLE' : null;

  return (
    <View style={{ width, height, borderRadius: 16, overflow: 'hidden', backgroundColor: '#2A2622' }}>
      {/* 배경 — 대표사진 풀블리드 (없으면 차콜 그라데이션) */}
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" cachePolicy="memory-disk" allowDownscaling={false} />
      ) : (
        <LinearGradient colors={['#4A443D', '#2A2622']} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      )}

      {/* 상단/하단 그라데이션 — 사진 위주로 슬림하게(정보 최소화와 함께, 사용자 2026-06-14) */}
      <LinearGradient colors={['rgba(0,0,0,0.42)', 'transparent']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: Math.round(height * 0.20) }} />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)']} locations={[0.32, 1]} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: Math.round(height * 0.52) }} />
      {/* 얇은 내부 프레임 — 럭셔리 액자 느낌 */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }} />

      {/* 상단 — 좌측: special 있으면 '그날의 라운딩' 자리에 버건디 채움 박스(홀인원 등), 없으면 워터마크 / 우측: Dear Golf.
          special을 워터마크 자리로 올림(사용자 2026-06-14, 매거진과 통일) */}
      <View style={{ position: 'absolute', top: 16, left: 18, right: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        {special ? (
          <View style={{ backgroundColor: BURGUNDY, borderRadius: 4, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' }}>
            <Text style={{ fontFamily: F.en, fontSize: fs(12), color: CREAM, letterSpacing: 2 }}>{special}</Text>
          </View>
        ) : (
          <Text style={[{ fontFamily: F.sysSb, fontSize: fs(13), color: GOLD, letterSpacing: 2 }, SHADOW]}>그날의 라운딩</Text>
        )}
        <Text style={[{ fontFamily: F.brand, fontSize: fs(15), color: WHITE }, SHADOW]}>Dear Golf</Text>
      </View>

      {/* 하단 — special(있으면 기록박스 밖 위·좌측) + 정보 패널(사진 있을 때만 반투명 박스). 타수 대신 WITH 동반자 + 메모 */}
      <View style={{ position: 'absolute', left: 14, right: 14, bottom: 14 }}>
        {/* 영예칩(베스트/싱글) — special은 워터마크 자리로 올려 여기선 제외. 스코어 없는 기념카드는 보통 미표시 */}
        {sideBadge ? (
          <View style={{ alignSelf: 'flex-start', borderWidth: 1, borderColor: GOLD, borderRadius: 4, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: 'rgba(0,0,0,0.42)', marginBottom: 7 }}>
            <Text style={[{ fontFamily: F.en, fontSize: fs(11), color: GOLD, letterSpacing: 2 }, SHADOW]}>{sideBadge}</Text>
          </View>
        ) : null}
        {/* 글씨·박스 위아래 더 컴팩트하게(사용자 2026-06-14) */}
        <View style={[
          { paddingTop: 10, paddingBottom: 10, paddingHorizontal: photoUri ? 15 : 4 },
          photoUri && { backgroundColor: 'rgba(18,16,14,0.48)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(201,168,76,0.45)' },
        ]}>
        {/* 골드 헤어라인 */}
        <View style={{ height: 1.5, width: 30, backgroundColor: GOLD_DEEP, marginBottom: 6 }} />
        <Text numberOfLines={1} style={[{ fontFamily: F.sysB, fontSize: fs(17), color: CHAMPAGNE, letterSpacing: 0.2 }, SHADOW]}>
          {flag ? flag + ' ' : ''}{item.course || '라운딩'}
        </Text>
        {/* 날짜만 — 사진 위주로 정보 최소화(이름·날씨 제거, 동반자가 들어가므로). 사용자 2026-06-14 */}
        <Text numberOfLines={1} style={[{ fontFamily: F.sysM, fontSize: fs(11), color: GOLD, letterSpacing: 0.3, marginTop: 4 }, SHADOW]}>
          {item.date || ''}
        </Text>

        {/* 함께한 사람 — 동반자 있을 때만(없으면 본인 이름은 위 메타줄에 이미 표시됨). 솔로 라운딩도 자연스럽게 포괄 */}
        {companionNames ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 7 }}>
            <Text style={[{ fontFamily: F.en, fontSize: fs(11), color: GOLD_DEEP, letterSpacing: 1, marginRight: 6 }, SHADOW]}>WITH</Text>
            <Text numberOfLines={1} style={[{ flex: 1, fontFamily: F.sysB, fontSize: fs(14), color: WHITE }, SHADOW]}>{companionNames}</Text>
          </View>
        ) : null}

        {/* 한줄메모 제거(2026-06-14) — 기념카드는 사진 주인공, 정보 최소화(구장·날짜·동반자만) */}
        </View>
      </View>
    </View>
  );
}
