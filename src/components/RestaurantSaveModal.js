import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, Platform, ScrollView } from 'react-native';
import AppTextInput from './common/AppTextInput';
import { KeyboardProvider, KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { C, F, fs } from '../constants/colors';

// 맛집 저장 모달 — 카카오 검색 결과 또는 직접 입력한 맛집을 내 목록에 추가
//  seed: { name, type, loc, x, y, kakaoId } — 카카오 결과면 kakaoId 존재
export function RestaurantSaveModal({ visible, seed, courseName, onClose, onSave }) {
  const [name, setName] = useState('');
  const [memo, setMemo] = useState('');

  useEffect(() => {
    if (visible) {
      setName(seed?.name || '');
      setMemo(seed?.memo || '');
    }
  }, [visible, seed]);

  const canSave = name.trim().length > 0;
  const fromKakao = !!seed?.kakaoId;
  const isEdit = !!seed?.id; // 저장된 맛집 메모 수정 모드

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      id: seed?.id || null,
      name: name.trim(),
      memo: memo.trim(),
      type: seed?.type || '',
      loc: seed?.loc || '',
      x: seed?.x ?? null,
      y: seed?.y ?? null,
      kakaoId: seed?.kakaoId || null,
    });
  };

  const inputBase = {
    fontFamily: F.sys, color: C.charcoal,
    backgroundColor: '#fff', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
  };

  return (
    <Modal visible={visible} transparent animationType="fade"
      statusBarTranslucent={Platform.OS === 'android'} onRequestClose={onClose}>
      {/* KeyboardProvider — RN Modal은 별도 네이티브 윈도우라 모달 안 자체 Provider 필요(DM·일정모달 동일 패턴).
          중앙 카드라 안드 기본 KeyboardAvoidingView(behavior undefined)가 무효 → 메모 입력창이 키보드에 가려졌음. */}
      <KeyboardProvider>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <TouchableOpacity activeOpacity={1} onPress={onClose}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 28 }}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}
            style={{ backgroundColor: C.bgPrimary, borderRadius: 16, maxHeight: '100%' }}>
            {/* 확대+키보드 시 카드가 화면 넘쳐 입력칸/버튼 잘리던 것 방지 — 스크롤(패딩은 contentContainer로) */}
            <ScrollView contentContainerStyle={{ padding: 20 }} bounces={false} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={{ fontFamily: F.sysB, fontSize: fs(20), color: C.charcoal }}>
              {isEdit ? '메모 수정' : '맛집 저장'}
            </Text>
            <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: C.textSecondary, marginTop: 4, marginBottom: 16 }}>
              {courseName ? `${courseName} · ` : ''}{isEdit ? '저장한 맛집' : (fromKakao ? '카카오 검색 결과' : '직접 추가')}
            </Text>

            <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.charcoal, marginBottom: 6 }}>맛집 이름</Text>
            <AppTextInput
              value={name}
              onChangeText={setName}
              placeholder="맛집 이름"
              placeholderTextColor={C.warmGrayLight}
              style={[inputBase, { fontSize: fs(16), fontFamily: F.sysSb, marginBottom: fromKakao && seed?.loc ? 6 : 14 }]}
            />
            {fromKakao && !!seed?.loc && (
              <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: C.textSecondary, marginBottom: 14 }}>
                📍 {seed.loc}
              </Text>
            )}

            <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.charcoal, marginBottom: 6 }}>메모 (선택)</Text>
            <AppTextInput
              value={memo}
              onChangeText={(t) => setMemo(t.slice(0, 100))}
              placeholder="라운딩 후 꼭 가기, 추천 메뉴 등"
              placeholderTextColor={C.warmGrayLight}
              multiline
              style={[inputBase, { fontSize: fs(13), minHeight: 64, textAlignVertical: 'top', marginBottom: 18 }]}
            />

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={onClose}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 0.5, borderColor: C.hairline, alignItems: 'center' }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal }}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSave} disabled={!canSave}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: canSave ? C.burgundy : C.hairline }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: canSave ? C.butter : C.warmGrayLight }}>{isEdit ? '수정' : '저장'}</Text>
              </TouchableOpacity>
            </View>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </KeyboardAvoidingView>
      </KeyboardProvider>
    </Modal>
  );
}
