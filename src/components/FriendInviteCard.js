import React from 'react';
import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { F, fs } from '../constants/colors';

// 친구 초대 — 우리 앱을 모르는 사람에게 나가는 cold-acquisition 카드. ★랜딩페이지(deargolf.app) 디자인 착안(사용자 지시):
// cream + 따뜻한 그라데이션 배경, Lora 이탤릭 "Dear Golf" 워드마크, 삼색 미니스트라이프, 버건디 트래킹 서브.
// ★차별화 확실히(사용자 지시): "골프 모임의 약속·일정·동반자·기록을 한 곳에" 올인원 헤드라인 — 왜 디어골프인지 한눈에.
// 슬로건 "라운딩의 모든 순간을 더 특별하게" + deargolf.app. ([[brand-slogan]] [[invite-deeplink-system]])

const CREAM = '#FAF6EC';
const CHARCOAL = '#3D3935';
const BURGUNDY = '#6B1E2A';
const MS_YELLOW = '#ECD884';
const MS_SKY = '#B2CADD';

export function FriendInviteCard({ width = 320 }) {
  const height = Math.round(width * 1.3);

  return (
    <View style={{ width, height, borderRadius: 16, overflow: 'hidden', backgroundColor: CREAM, borderWidth: 1, borderColor: 'rgba(61,57,53,0.10)' }}>
      {/* 랜딩 톤 따뜻한 그라데이션 — 버터(좌상)·하늘(우상)·크림(하단)을 옅게 겹쳐 radial 느낌 근사 */}
      <LinearGradient colors={['rgba(252,244,210,0.95)', 'rgba(252,244,210,0)']}
        start={{ x: 0, y: 0 }} end={{ x: 0.65, y: 0.5 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      <LinearGradient colors={['rgba(220,233,242,0.85)', 'rgba(220,233,242,0)']}
        start={{ x: 1, y: 0 }} end={{ x: 0.4, y: 0.55 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      <LinearGradient colors={['rgba(251,244,217,0)', 'rgba(251,244,217,0.9)']}
        start={{ x: 0.5, y: 0.55 }} end={{ x: 0.5, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 30 }}>
        {/* 브랜드 헤더 */}
        <Text style={{ fontFamily: F.sysM, fontSize: fs(12), letterSpacing: 2, color: 'rgba(61,57,53,0.78)', textAlign: 'center' }}>
          좋은 동반자, 그날의 기록까지
        </Text>
        <Text style={{ fontFamily: F.brand, fontSize: fs(46), lineHeight: fs(52), color: CHARCOAL, marginTop: 10 }}>
          Dear Golf
        </Text>
        <Text style={{ fontFamily: F.sysM, fontSize: fs(10), letterSpacing: 5, color: BURGUNDY, opacity: 0.8, marginTop: 8 }}>
          GOLF · FRIENDS · LIFE
        </Text>
        <View style={{ flexDirection: 'row', width: 96, height: 3, borderRadius: 2, overflow: 'hidden', marginTop: 18 }}>
          <View style={{ flex: 1, backgroundColor: MS_YELLOW }} />
          <View style={{ flex: 1, backgroundColor: MS_SKY }} />
          <View style={{ flex: 1, backgroundColor: BURGUNDY }} />
        </View>

        {/* 차별화 헤드라인 — 올인원 */}
        <Text style={{ fontFamily: F.sysSb, fontSize: fs(20), lineHeight: fs(30), color: CHARCOAL, textAlign: 'center', letterSpacing: 0.2, marginTop: 26 }}>
          골프 모임의{'\n'}약속 · 일정 · 동반자 · 기록을{'\n'}<Text style={{ color: BURGUNDY }}>한 곳에</Text>
        </Text>

        {/* 슬로건 */}
        <Text style={{ fontFamily: F.sys, fontSize: fs(13), lineHeight: fs(20), color: 'rgba(61,57,53,0.72)', textAlign: 'center', marginTop: 18 }}>
          라운딩의 모든 순간을 <Text style={{ fontFamily: F.sysSb, color: BURGUNDY }}>더 특별하게</Text>
        </Text>
      </View>

      {/* 푸터 — 설치 단서 */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 22, alignItems: 'center' }}>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(15), letterSpacing: 0.5, color: CHARCOAL }}>deargolf.app</Text>
      </View>
    </View>
  );
}
