import React from 'react';
import { View, Text, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import { F, fs } from '../constants/colors';

// 친구 초대 — 우리 앱을 모르는 사람에게 나가는 cold-acquisition 카드. ★랜딩(deargolf.app) 톤:
//   cream + 따뜻한 그라데이션, Lora 이탤릭 "Dear Golf", 삼색 미니스트라이프.
// ★텍스트 난무 방지(사용자 지시): 랜딩의 '플로팅 글래스 카드 스택'을 미니어처로 재현해 앱을 "보여준다".
//   blur(backdrop-filter)는 ViewShot 캡처에서 깨지므로 반투명 그라데이션으로 근사(룩 동일).
// ★우하단 QR(deargolf.app) — 카드는 이미지라 클릭 링크 불가. 탭 안 되는 매체(인스타 스토리·카톡 프로필)
//   유입 대비. 클릭 링크는 카드와 별개로 평문 공유('링크와 함께 공유')가 담당 ([[invite-deeplink-system]]).
// ※ 미니카드 텍스트는 fs() 최소 12 클램프를 피해 고정 px(캡처 이미지라 폰트스케일과 무관).
//   슬로건/헤드라인은 가독성 위해 fs() 사용 ([[brand-slogan]]).

const CREAM = '#FAF6EC';
const CHARCOAL = '#3D3935';
const CHARCOAL_SOFT = 'rgba(61,57,53,0.72)';
const BURGUNDY = '#6B1E2A';
const MS_YELLOW = '#ECD884';
const MS_SKY = '#B2CADD';
const BUTTER = '#F5E6A8';

const ABS_FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 };
const cardShadow = Platform.select({
  ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 14 },
  android: { elevation: 6 },
});

export function FriendInviteCard({ width = 320 }) {
  const height = Math.round(width * 1.5);

  return (
    <View style={{ width, height, borderRadius: 16, overflow: 'hidden', backgroundColor: CREAM, borderWidth: 1, borderColor: 'rgba(61,57,53,0.10)' }}>
      {/* 랜딩 톤 따뜻한 그라데이션 — 버터(좌상)·하늘(우상)·크림(하단)을 옅게 겹쳐 radial 느낌 근사 */}
      <LinearGradient colors={['rgba(252,244,210,0.95)', 'rgba(252,244,210,0)']} start={{ x: 0, y: 0 }} end={{ x: 0.65, y: 0.5 }} style={ABS_FILL} />
      <LinearGradient colors={['rgba(220,233,242,0.85)', 'rgba(220,233,242,0)']} start={{ x: 1, y: 0 }} end={{ x: 0.4, y: 0.55 }} style={ABS_FILL} />
      <LinearGradient colors={['rgba(251,244,217,0)', 'rgba(251,244,217,0.9)']} start={{ x: 0.5, y: 0.5 }} end={{ x: 0.5, y: 1 }} style={ABS_FILL} />

      <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 26, paddingTop: 30 }}>
        {/* 헤드라인(한글) — 정체성 멘트 */}
        <Text style={{ fontFamily: F.sysM, fontSize: fs(13), lineHeight: fs(13) * 1.5, letterSpacing: 0.5, color: CHARCOAL_SOFT, textAlign: 'center' }}>
          골프, 동반자, 그리고{'\n'}우리의 빛나는 아카이브
        </Text>
        {/* Dear Golf 워드마크 */}
        <Text style={{ fontFamily: F.brand, fontSize: fs(40), lineHeight: fs(44), color: CHARCOAL, marginTop: 12 }}>
          Dear Golf
        </Text>
        {/* 영문 부제 */}
        <Text style={{ fontFamily: F.sysM, fontSize: 11, letterSpacing: 2.5, color: BURGUNDY, opacity: 0.82, marginTop: 8 }}>
          For Your Ultimate Golf Life
        </Text>
        {/* 미니스트라이프 */}
        <View style={{ flexDirection: 'row', width: 92, height: 3, borderRadius: 2, overflow: 'hidden', marginTop: 16 }}>
          <View style={{ flex: 1, backgroundColor: MS_YELLOW }} />
          <View style={{ flex: 1, backgroundColor: MS_SKY }} />
          <View style={{ flex: 1, backgroundColor: BURGUNDY }} />
        </View>

        {/* 미니 카드 스택 — 앱 미리보기(랜딩 글래스 카드 근사) */}
        <View style={{ width: '100%', alignItems: 'center', marginTop: 26 }}>
          {/* 카드1: 예정 라운딩(차콜) */}
          <View style={[{ width: '84%', borderRadius: 13, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(245,230,168,0.3)', transform: [{ rotate: '-2.2deg' }, { translateX: -7 }] }, cardShadow]}>
            <LinearGradient colors={['rgba(74,69,63,0.96)', 'rgba(42,38,34,0.98)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingHorizontal: 13, paddingVertical: 12 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: 8, letterSpacing: 1.8, color: BUTTER, marginBottom: 7 }}>예정 라운딩</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: 14, color: '#fff' }}>남서울CC</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: 9, color: 'rgba(255,255,255,0.72)', marginTop: 3 }}>2026.06.15 토 · 08:00 · 4명</Text>
                </View>
                <Text style={{ fontFamily: F.en, fontSize: 25, lineHeight: 26, color: BUTTER }}>D-5</Text>
              </View>
            </LinearGradient>
          </View>
          {/* 카드2: 라운지 모집(네이비) */}
          <View style={[{ width: '84%', borderRadius: 13, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(72,112,135,0.7)', transform: [{ rotate: '1.6deg' }, { translateX: 8 }], marginTop: -12 }, cardShadow]}>
            <LinearGradient colors={['rgba(43,90,118,0.97)', 'rgba(18,46,60,0.98)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingHorizontal: 13, paddingVertical: 12 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: 8, letterSpacing: 1.8, color: BUTTER, marginBottom: 7 }}>라운지</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                <View style={{ backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: 7.5, color: '#1A3D52' }}>확정형</Text>
                </View>
                <View style={{ backgroundColor: BUTTER, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: 7.5, color: '#5A4500' }}>친구공개</Text>
                </View>
              </View>
              <Text style={{ fontFamily: F.sysB, fontSize: 13, color: '#fff' }}>레이크사이드CC</Text>
              <Text style={{ fontFamily: F.sys, fontSize: 9, color: 'rgba(255,255,255,0.72)', marginTop: 3 }}>2026.06.22 (일) · 06:40</Text>
              <Text style={{ fontFamily: F.sysM, fontSize: 9.5, color: 'rgba(255,255,255,0.8)', marginTop: 7 }}>🔄 2 / 4명 · 모집중</Text>
            </LinearGradient>
          </View>
        </View>

        {/* 슬로건 */}
        <Text style={{ fontFamily: F.sys, fontSize: fs(12), lineHeight: fs(12) * 1.5, color: CHARCOAL_SOFT, textAlign: 'center', marginTop: 24 }}>
          라운딩의 모든 순간을 <Text style={{ fontFamily: F.sysSb, color: BURGUNDY }}>더 특별하게</Text>
        </Text>
      </View>

      {/* 우하단 QR — 카드는 이미지라 클릭 링크 불가, 탭 안 되는 매체 유입 대비. 흰 패딩으로 크림 위 대비 확보 */}
      <View style={{ position: 'absolute', right: 16, bottom: 14, alignItems: 'center' }}>
        <View style={{ backgroundColor: 'rgba(255,255,255,0.72)', padding: 4, borderRadius: 6 }}>
          <QRCode value="https://deargolf.app" size={42} color={CHARCOAL} backgroundColor="transparent" />
        </View>
        <Text style={{ fontFamily: F.sysB, fontSize: 8, color: CHARCOAL, marginTop: 3, letterSpacing: 0.3 }}>deargolf.app</Text>
      </View>
    </View>
  );
}
