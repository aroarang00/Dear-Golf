import React, { useState, useEffect, useMemo } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { mS } from '../styles/mS';
import { nameWithMaskedReal } from '../utils/maskName';

// 친구지정 모집글 — 친구 선택 모달 ([[roundup-visibility-design]] UI 흐름).
// 포함/제외 토글 + 친구 체크박스 + 검색. 확인 시 onConfirm({ selectMode, selectedUids }).
// 친구 데이터(friends: [{ uid|id, name(닉네임), realName }])는 부모에서 props로 주입
//   — RoundupTab이 friendships 컬렉션에서 실제 친구를 로드해 전달. 표시는 닉네임+마스킹 본명 ([[realname-policy]]).

const MODE_OPTIONS = [
  ['include', '이 친구에게만'],
  ['exclude', '이 친구 빼고'],
];

// mode: 'select'(기본, 친구지정 — 포함/제외 토글) | 'companion'(동반자 선택 — 토글 없이 다중선택)
export function FriendSelectModal({ visible, friends = [], initial, onClose, onConfirm, mode = 'select' }) {
  const insets = useSafeAreaInsets();
  const isCompanion = mode === 'companion';
  const [selectMode, setSelectMode] = useState(initial?.selectMode || 'include');
  const [selected, setSelected] = useState(initial?.selectedUids || []);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!visible) return;
    setSelectMode(initial?.selectMode || 'include');
    setSelected(initial?.selectedUids || []);
    setQuery('');
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return friends;
    // 검색은 닉네임 + 본명(내부 풀네임)으로 매칭, 표시는 마스킹 ([[realname-policy]] B안)
    return friends.filter(f => f.name?.includes(q) || f.realName?.includes(q));
  }, [friends, query]);

  const toggle = (uid) => {
    setSelected(prev => prev.includes(uid) ? prev.filter(x => x !== uid) : [...prev, uid]);
  };

  const submit = () => {
    onConfirm?.({ selectMode, selectedUids: selected });
    onClose?.();
  };

  // 가드 — include + 0명은 의미 없음 (작성자만 봄), exclude + 0명은 친구공개와 동일. 동반자 모드는 가드 없음.
  const guardHint = isCompanion ? null
    : selectMode === 'include' && selected.length === 0
      ? '한 명도 선택하지 않으면 아무도 모집글을 볼 수 없어요'
      : selectMode === 'exclude' && selected.length === 0
        ? '한 명도 선택하지 않으면 친구공개와 같아요'
        : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={mS.mask}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={[mS.sheet, { paddingBottom: 20 + insets.bottom, maxHeight: '88%' }]}>
          <View style={mS.handle} />

          <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Text style={[mS.title, { flex: 1, marginBottom: 0, fontSize: fs(19) }]}>{isCompanion ? '동반자 선택' : '친구지정'}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: C.bgSecondary }}>
                <Text style={{ fontSize: fs(15), color: C.warmGray, fontWeight: '600', lineHeight: 17 }}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* 포함/제외 토글 — 친구지정 모드만. 동반자 모드는 단순 다중선택이라 숨김 */}
            {!isCompanion && (<>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              {MODE_OPTIONS.map(([k, l]) => (
                <TouchableOpacity key={k} activeOpacity={0.7} onPress={() => setSelectMode(k)}
                  style={[mS.chip, selectMode === k && mS.chipOn, { flex: 1, alignItems: 'center', paddingVertical: 10 }]}>
                  <Text style={[mS.chipTxt, selectMode === k && mS.chipTxtOn, { fontSize: fs(12) }]}>{l}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 8, lineHeight: 16 }}>
              {selectMode === 'include'
                ? '선택한 친구에게만 모집글이 보여요'
                : '선택한 친구를 제외한 모든 친구에게 보여요'}
            </Text>
            </>)}

            {/* 검색 */}
            <TextInput
              style={{ ...mS.input, marginTop: 12, marginBottom: 0 }}
              placeholder="친구 이름으로 검색"
              placeholderTextColor={C.warmGrayLight}
              value={query}
              onChangeText={setQuery}
            />
          </View>

          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
            keyboardShouldPersistTaps="handled">
            {filtered.length === 0 ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray }}>
                  {query ? '검색 결과가 없어요' : '아직 친구가 없어요'}
                </Text>
              </View>
            ) : (
              filtered.map(f => {
                const on = selected.includes(f.uid || f.id);
                return (
                  <TouchableOpacity key={f.uid || f.id} activeOpacity={0.7}
                    onPress={() => toggle(f.uid || f.id)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11,
                      borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.bgSecondary,
                      alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal }}>
                        {f.name?.charAt(0) || '?'}
                      </Text>
                    </View>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.charcoal, flex: 1 }}>
                      {nameWithMaskedReal(f.name, f.realName)}
                    </Text>
                    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5,
                      borderColor: on ? C.burgundy : C.hairline,
                      backgroundColor: on ? C.burgundy : 'transparent',
                      alignItems: 'center', justifyContent: 'center' }}>
                      {on && <Text style={{ color: '#fff', fontFamily: F.sysB, fontSize: fs(12), lineHeight: 14 }}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>

          <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
            {guardHint && (
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: '#8B6914',
                textAlign: 'center', marginBottom: 8 }}>
                {guardHint}
              </Text>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray }}>
                {selected.length}명 선택됨
              </Text>
              {selected.length > 0 && (
                <TouchableOpacity onPress={() => setSelected([])} activeOpacity={0.7}
                  style={{ marginLeft: 'auto' }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.warmGray,
                    textDecorationLine: 'underline' }}>모두 해제</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity style={mS.saveBtn} onPress={submit}>
              <Text style={[mS.saveBtnTxt, { fontSize: fs(15) }]}>확인</Text>
            </TouchableOpacity>
          </View>

        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
