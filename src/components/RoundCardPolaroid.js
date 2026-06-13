import React from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { F, fs } from '../constants/colors';
import { resolvePhotoUri } from '../utils/photoStorage';
import { getCountryFlag } from '../constants/data';

// 라운딩 자랑 카드 — '폴라로이드' 스타일. 흰 프레임 + 사진 + 하단 두꺼운 여백 캡션(Lora 이탤릭, 감성 결).
//  사진이 주인공이라 그날 분위기·일상 결에 어울림. 사진 없으면 크림 그라데이션 폴백.
//  스코어는 사진 위 작은 골드 칩(과하지 않게). 매거진·빅스코어와 다른 '감성' 카드 ([[score-brag-card]]).

const INK = '#3D3935';
const BURGUNDY = '#6B1E2A';
const GOLD = '#E8D9A0';

export function RoundCardPolaroid({ item, width = 320 }) {
  const height = Math.round(width * 1.25);

  const photoRaw = (item.photos && item.photos[0]) || null;
  const photoUri = photoRaw ? resolvePhotoUri(typeof photoRaw === 'object' ? photoRaw.uri : photoRaw) : null;

  const hasScore = typeof item.score === 'number';
  const diff = hasScore && typeof item.par === 'number' ? item.score - item.par : null;
  const diffLabel = diff == null ? '' : diff > 0 ? `+${diff}` : `${diff}`;
  const flag = item.overseas && item.country ? getCountryFlag(item.country) : '';
  const playerName = (item.playerName || '').trim();

  const FRAME = Math.round(width * 0.06);          // 폴라로이드 흰 테두리
  const photoH = Math.round(height * 0.6);         // 사진 영역

  return (
    <View style={{ width, height, borderRadius: 6, overflow: 'hidden', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' }}>
      <View style={{ padding: FRAME }}>
        {/* 사진 영역 */}
        <View style={{ width: '100%', height: photoH, backgroundColor: '#EEE9DC', overflow: 'hidden' }}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory-disk" allowDownscaling={false} />
          ) : (
            <LinearGradient colors={['#E8E2D0', '#D7CFB8']} style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: F.brand, fontSize: fs(22), color: 'rgba(61,57,53,0.4)' }}>Dear Golf</Text>
            </LinearGradient>
          )}
          {hasScore ? (
            // 사진 위 우상단 스코어 칩 — 과하지 않게
            <View style={{ position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(20,18,16,0.62)', borderRadius: 11, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ fontFamily: F.en, fontSize: fs(14), color: GOLD }}>{item.score}타</Text>
            </View>
          ) : null}
        </View>

        {/* 하단 캡션 여백 — 폴라로이드 손글씨 결(Lora 이탤릭) */}
        <View style={{ paddingTop: Math.round(FRAME * 0.8), paddingHorizontal: 2 }}>
          <Text numberOfLines={1} style={{ fontFamily: F.brand, fontSize: fs(20), color: INK }}>
            {flag ? flag + ' ' : ''}{item.course || '라운딩'}
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
            <Text numberOfLines={1} style={{ fontFamily: F.sys, fontSize: fs(12), color: 'rgba(61,57,53,0.7)', flex: 1 }}>
              {playerName ? playerName + '   ·   ' : ''}{item.date}{diffLabel ? '   ·   ' + diffLabel : ''}
            </Text>
            <Text style={{ fontFamily: F.brand, fontSize: fs(13), color: BURGUNDY, marginLeft: 8 }}>Dear Golf</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
