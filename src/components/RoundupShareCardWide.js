import React from 'react';
import { View, Text } from 'react-native';
import { F } from '../constants/colors';

// 카카오 공유용 가로 초대장 — 세로 보딩패스(RoundupShareCard) 정보를 카카오 피드 이미지 비율에 맞춰 가로 재배치.
//   ★비율 = hero.jpg와 동일 ~1.36:1(1080×793). 카카오 피드는 이 비율로 보여줘서, 2:1로 만들면 좌우(HOST·DATE)가 잘림.
//   세로 카드(0.76:1)는 하단 짤림 → 카카오 전송 전용 이 가로 카드로 슬롯을 꽉 채움(잘림 0).
//   ([[invite-deeplink-system]], 사용자 2026-06-15). 앱 내 미리보기·'공유하기'(OS 이미지)는 세로 카드 그대로.
//  ※ 캡처 이미지라 폰트는 width 기준 px 스케일(S)로 — fs()의 폰트스케일·클램프 회피, 어느 폰에서 캡처해도 동일.

const KAKAO_RATIO = 1080 / 793; // ≈1.362 — 카카오 피드가 잘 보여주는 비율(hero.jpg와 동일)

const YELLOW = '#F5E6A8';
const SKY = '#C8D9E6';
const BURGUNDY = '#6B1E2A';
const INK = '#3D3935';
const MUTE = '#8B8680';
const LINE = '#E8E2D0';
const SURFACE = '#FFFFFF';

export function RoundupShareCardWide({ post, width = 600 }) {
  if (!post) return null;
  const height = Math.round(width / KAKAO_RATIO); // ~1.36:1 — 카카오 슬롯 꽉 채움(잘림 0)
  const S = (n) => Math.round(n * (width / 600)); // 기준 600 기준 스케일

  const isOpen = post.type === 'open';
  const isInvite = post.scope === 'select';
  const isTeam = (post.teams || 1) > 1;
  const cap = post.capacity || (isTeam ? (post.teams || 1) * 4 : 4);
  const joined = Array.isArray(post.participantUids) ? post.participantUids.length : 1;
  const left = Math.max(0, cap - joined);

  const hostName = post.authorName || '호스트';
  const courseText = post.course || (isOpen ? '함께 정해요' : '-');
  const dateText = isOpen ? '미정' : `${post.date || '-'}${post.day ? ` (${post.day})` : ''}`;
  const timeText = isOpen ? '함께 조율' : (post.time || '-');
  const headcount = isTeam ? `단체 ${post.teams}팀 · 총 ${cap}명` : `${cap}명 모집`;

  return (
    <View style={{ width, height, backgroundColor: SURFACE, borderRadius: S(16), overflow: 'hidden',
      borderWidth: 1, borderColor: LINE, flexDirection: 'row' }}>
      {/* 좌측 시그니처 삼색 세로탭 */}
      <View style={{ width: S(10), flexDirection: 'column' }}>
        <View style={{ flex: 1, backgroundColor: YELLOW }} />
        <View style={{ flex: 1, backgroundColor: SKY }} />
        <View style={{ flex: 1, backgroundColor: BURGUNDY }} />
      </View>

      {/* 본문 */}
      <View style={{ flex: 1, paddingVertical: S(22), paddingHorizontal: S(28) }}>
        {/* 상단 — kicker + 브랜드 */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontFamily: F.sysB, fontSize: S(13), letterSpacing: S(3), color: MUTE }}>
            {isInvite ? 'ROUND INVITATION' : 'ROUND RECRUIT'}
          </Text>
          <Text style={{ fontFamily: F.brand, fontSize: S(17), color: BURGUNDY }}>Dear Golf</Text>
        </View>

        {/* 메인 — 좌(HOST·COURSE) / 점선 / 우(DATE·TEE-OFF·인원) */}
        <View style={{ flex: 1, flexDirection: 'row', marginTop: S(14) }}>
          <View style={{ flex: 1.5, justifyContent: 'center' }}>
            <Text style={{ fontFamily: F.sysB, fontSize: S(11), letterSpacing: S(1.5), color: MUTE }}>HOST</Text>
            <Text numberOfLines={1} style={{ fontFamily: F.sysB, fontSize: S(19), color: INK, marginTop: S(3) }}>{hostName}님</Text>
            <Text style={{ fontFamily: F.sysB, fontSize: S(11), letterSpacing: S(1.5), color: MUTE, marginTop: S(16) }}>COURSE</Text>
            <Text numberOfLines={1} style={{ fontFamily: F.sysB, fontSize: S(26), color: BURGUNDY, marginTop: S(3) }}>{courseText}</Text>
          </View>

          {/* 세로 점선 구분 */}
          <View style={{ marginHorizontal: S(22), borderLeftWidth: 1.4, borderStyle: 'dashed', borderColor: LINE }} />

          <View style={{ flex: 1, justifyContent: 'center' }}>
            <Text style={{ fontFamily: F.sysB, fontSize: S(11), letterSpacing: S(1.5), color: MUTE }}>DATE</Text>
            <Text numberOfLines={1} style={{ fontFamily: F.sysB, fontSize: S(16), color: INK, marginTop: S(2) }}>{dateText}</Text>
            <Text style={{ fontFamily: F.sysB, fontSize: S(11), letterSpacing: S(1.5), color: MUTE, marginTop: S(12) }}>TEE-OFF</Text>
            <Text numberOfLines={1} style={{ fontFamily: F.sysB, fontSize: S(16), color: INK, marginTop: S(2) }}>{timeText}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: S(13), gap: S(8) }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: S(13), color: INK }}>👥 {headcount}</Text>
              {left > 0 ? (
                <View style={{ backgroundColor: '#F7EDD2', borderRadius: S(8), paddingHorizontal: S(8), paddingVertical: S(3) }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: S(12), color: '#5A4500' }}>남은 {left}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* 하단 — 설치 단서 */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          borderTopWidth: 1, borderTopColor: LINE, paddingTop: S(11) }}>
          <Text style={{ fontFamily: F.sysM, fontSize: S(12), color: MUTE }}>디어골프에서 친구 맺고 함께해요</Text>
          <Text style={{ fontFamily: F.sysB, fontSize: S(15), color: INK, letterSpacing: S(0.5) }}>deargolf.app</Text>
        </View>
      </View>
    </View>
  );
}
