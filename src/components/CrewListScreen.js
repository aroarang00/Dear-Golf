import React from 'react';
import { View, Text, TouchableOpacity, StatusBar, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { Icon } from './common/Icon';
import { useAndroidBack } from '../hooks/useAndroidBack';

// 크루(친구 소수 그룹) 공유 앨범 — 진입 첫 화면 = 내가 속한 크루 리스트 (docs/crew-space-design.md §3.0).
//  DM과 같은 '프라이빗 소통' 식구라 다크룸 팔레트를 DM과 통일(방 전환 시 안 튀게).
//  ※ Phase 1 진입점 스텁 — 리스트/만들기/앨범은 이어서 구현. 지금은 빈 상태 + 만들기 자리만.
const CANVAS  = '#2A2622';                 // 배경 (DMListScreen과 통일)
const SURFACE = '#211E1B';                 // 헤더 영역
const BUTTER  = '#F5E6A8';                 // 제목·아이콘
const PALESKY = '#C8D9E6';                 // 보조 텍스트
const LINE    = 'rgba(255,255,255,0.08)';  // 헤어라인

export function CrewListScreen({ onClose }) {
  useAndroidBack(true, onClose);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: CANVAS }}>
      <StatusBar barStyle="light-content" backgroundColor={SURFACE} />

      {/* 헤더 — ← 닫기 · 제목 · ＋ 만들기 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12,
        backgroundColor: SURFACE, borderBottomWidth: 0.5, borderBottomColor: LINE }}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={{ padding: 4 }}>
          <Text style={{ fontSize: fs(24), color: BUTTER }}>←</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(18), color: BUTTER, marginLeft: 4 }}>크루</Text>
        <TouchableOpacity hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ padding: 4 }}>
          <Icon name="personAdd" size={fs(24)} color={BUTTER} strokeWidth={1.8} />
        </TouchableOpacity>
      </View>

      {/* 빈 상태 — 아직 크루 없음 (리스트 구현 전 자리) */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, borderWidth: 1.5, borderColor: 'rgba(245,230,168,0.4)',
          alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
          <Icon name="crew" size={fs(38)} color={BUTTER} strokeWidth={1.6} />
        </View>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: '#fff', marginBottom: 6 }}>아직 크루가 없어요</Text>
        <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: PALESKY, textAlign: 'center', lineHeight: fs(19) }}>
          친한 친구들과 사진·영상을 함께 모으는{'\n'}프라이빗 공간을 만들어보세요.
        </Text>
      </View>
    </SafeAreaView>
  );
}
