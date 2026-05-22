import React, { useState } from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { HallOfFameCard } from './HallOfFameCard';
import { OverlayAlert } from './common/OverlayAlert';

// 공유 옵션 — 갤러리 저장(범용). 저장한 이미지를 사용자가 원하는 앱으로 공유.
// 카카오 직접 공유는 출시 후 추가 예정, 인스타는 제외.
const OPTIONS = [
  { key: 'save', icon: '🖼', label: '이미지 저장 (갤러리)', bg: C.bgSecondary, fg: C.charcoal, border: true },
];

const STUB_MSG = {
  save: '갤러리 저장은 이미지 캡처 기능 연동 후 제공돼요.',
};

// 특별한 순간 공유 — 카드 미리보기(워터마크 포함) + 공유 옵션. 현재는 UI만.
export function ShareMomentModal({ moment, visible, onClose }) {
  const [alert, setAlert] = useState(null);
  if (!moment) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'bottom', 'left', 'right']}>
          {/* 헤더 */}
          <View style={{ backgroundColor: C.bgPrimary, paddingHorizontal: 20, paddingVertical: 13,
            flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: fs(22), color: C.charcoal }}>←</Text>
            </TouchableOpacity>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }}>특별한 순간 공유</Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingBottom: 36 }}>
            <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGray, letterSpacing: 1.5, marginBottom: 8 }}>
              공유 미리보기
            </Text>

            {/* 공유될 카드 — 명예의 전당 카드 + Dear Golf 워터마크 */}
            <HallOfFameCard item={moment} />
            <View style={{ alignItems: 'center', marginTop: 6, marginBottom: 6 }}>
              <Text style={{ fontFamily: F.brand, fontSize: fs(17), color: C.charcoal }}>Dear Golf</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGray, marginTop: 1, letterSpacing: 1 }}>deargolf.app</Text>
            </View>
            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 4, lineHeight: 16 }}>
              공유하면 카드 하단에 Dear Golf 워터마크가 자동으로 들어가요.
            </Text>

            {/* 공유 옵션 */}
            <View style={{ gap: 10, marginTop: 22 }}>
              {OPTIONS.map(o => (
                <TouchableOpacity key={o.key} activeOpacity={0.85}
                  onPress={() => setAlert({ title: '준비 중이에요', message: STUB_MSG[o.key], buttons: [{ text: '확인' }] })}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                    backgroundColor: o.bg, borderRadius: 12, paddingVertical: 14,
                    borderWidth: o.border ? 1 : 0, borderColor: C.hairline }}>
                  <Text style={{ fontSize: fs(16) }}>{o.icon}</Text>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: o.fg }}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <OverlayAlert data={alert} onClose={() => setAlert(null)} />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
