import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
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
    borderWidth: 0.5, borderColor: C.hairline,
    paddingHorizontal: 12, paddingVertical: 10,
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}>
        <TouchableOpacity activeOpacity={1} onPress={onClose}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 28 }}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}
            style={{ backgroundColor: C.bgPrimary, borderRadius: 16, padding: 20 }}>
            <Text style={{ fontFamily: F.serifKR, fontSize: fs(19), color: C.charcoal }}>
              {isEdit ? '메모 수정' : '맛집 저장'}
            </Text>
            <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: C.textSecondary, marginTop: 4, marginBottom: 16 }}>
              {courseName ? `${courseName} · ` : ''}{isEdit ? '저장한 맛집' : (fromKakao ? '카카오 검색 결과' : '직접 추가')}
            </Text>

            <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.charcoal, marginBottom: 6 }}>맛집 이름</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="맛집 이름"
              placeholderTextColor={C.warmGrayLight}
              style={[inputBase, { fontSize: fs(14), marginBottom: fromKakao && seed?.loc ? 6 : 14 }]}
            />
            {fromKakao && !!seed?.loc && (
              <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: C.textSecondary, marginBottom: 14 }}>
                📍 {seed.loc}
              </Text>
            )}

            <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.charcoal, marginBottom: 6 }}>메모 (선택)</Text>
            <TextInput
              value={memo}
              onChangeText={(t) => { if (t.length <= 100) setMemo(t); }}
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
          </TouchableOpacity>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}
