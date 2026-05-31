import React, { useState, useRef } from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import { C, F, fs } from '../constants/colors';
import { HallOfFameCard } from './HallOfFameCard';
import { OverlayAlert } from './common/OverlayAlert';

// 캡처 영역 너비 고정 — ViewShot이 화면 너비를 못 잡으면 셀(47%) 비율이 깨져 박스에 공간이 생기고
// 텍스트가 잘림. ScrollView 좌우 padding 20씩이라 화면폭 - 40으로 고정.
const CARD_WIDTH = Dimensions.get('window').width - 40;

// 공유 옵션 — 갤러리 저장(범용). 저장한 이미지를 사용자가 원하는 앱으로 공유.
// 카카오 직접 공유는 출시 후 추가 예정, 인스타는 제외.
const OPTIONS = [
  { key: 'save', icon: '🖼', label: '이미지 저장 (갤러리)', bg: C.bgSecondary, fg: C.charcoal, border: true },
];

// 특별한 순간 공유 — 카드 미리보기(워터마크 포함) + 갤러리 저장.
export function ShareMomentModal({ moment, visible, onClose }) {
  const [alert, setAlert] = useState(null);
  const [saving, setSaving] = useState(false);
  const cardRef = useRef(null);

  // 안드로이드 뒤로가기 — 확인창이 떠 있으면 그것만 취소로 닫고, 아니면 모달을 닫는다.
  // (RN Modal에선 onRequestClose가 신뢰되는 back 핸들러 — BackHandler 훅 제거)
  const handleRequestClose = () => {
    if (alert) { setAlert(null); return; }
    onClose();
  };

  if (!moment) return null;

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // 사진첩 권한 요청 — iOS는 NSPhotoLibraryAddUsageDescription 필요(app.json)
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        setAlert({
          title: '사진첩 권한이 필요해요',
          message: '이미지를 저장하려면 사진첩 접근 권한이 필요해요. 설정 > Dear Golf에서 허용해주세요.',
          buttons: [{ text: '확인' }],
        });
        return;
      }
      // 카드 + 워터마크 영역을 캡처해서 PNG로 저장
      const uri = await captureRef(cardRef, { format: 'png', quality: 1 });
      await MediaLibrary.saveToLibraryAsync(uri);
      setAlert({
        title: '갤러리에 저장됐어요',
        message: '원하는 앱(카카오톡·인스타 등)에서 갤러리 사진으로 공유해보세요.',
        buttons: [{ text: '확인' }],
      });
    } catch (e) {
      setAlert({
        title: '저장에 실패했어요',
        message: e?.message || '잠시 후 다시 시도해주세요.',
        buttons: [{ text: '확인' }],
      });
    } finally {
      setSaving(false);
    }
  };

  const handleOption = (key) => {
    if (key === 'save') handleSave();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleRequestClose}>
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
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.warmGray, letterSpacing: 1.5, marginBottom: 8 }}>
              공유 미리보기
            </Text>

            {/* 공유될 카드 — 명예의 전당 카드 + Dear Golf 워터마크. ViewShot으로 감싸 캡처 영역 지정 */}
            <ViewShot ref={cardRef} options={{ format: 'png', quality: 1 }} style={{ width: CARD_WIDTH }}>
              {/* 배경 투명 — 카드만 깔끔하게 저장. Dear Golf 마크는 카드 헤더 안(HallOfFameCard, onShare 없을 때)에 들어가
                  투명 배경·SNS 미리보기에 영향받지 않고 항상 또렷하게 보인다.
                  width 고정(CARD_WIDTH)으로 캡처 시 셀 비율 깨짐·이름 잘림 방지. */}
              <View style={{ backgroundColor: 'transparent', width: CARD_WIDTH }}>
                <HallOfFameCard item={moment} />
              </View>
            </ViewShot>
            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 4, lineHeight: 16 }}>
              투명 배경 PNG로 저장돼요. 카드에 Dear Golf 마크가 들어가요.
            </Text>

            {/* 공유 옵션 */}
            <View style={{ gap: 10, marginTop: 22 }}>
              {OPTIONS.map(o => (
                <TouchableOpacity key={o.key} activeOpacity={0.85}
                  onPress={() => handleOption(o.key)}
                  disabled={saving}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                    backgroundColor: o.bg, borderRadius: 12, paddingVertical: 14,
                    borderWidth: o.border ? 1 : 0, borderColor: C.hairline,
                    opacity: saving ? 0.5 : 1 }}>
                  <Text style={{ fontSize: fs(16) }}>{o.icon}</Text>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: o.fg }}>
                    {saving ? '저장 중...' : o.label}
                  </Text>
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
