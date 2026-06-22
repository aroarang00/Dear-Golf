import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView, SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { F, fs } from '../constants/colors';
import { Icon } from './common/Icon';
import { useAndroidBack } from '../hooks/useAndroidBack';
import { containsProfanity, PROFANITY_BLOCK_MESSAGE } from '../utils/profanityFilter';

// 크루 만들기 — 리스트 헤더 ＋에서 진입 (docs/crew-space-design.md §3.3).
//  이름 + 친구 초대(다중). 인원 20명 한도. 비속어 필터. 페일스카이 라이트.
//  ※ Phase 1 — 친구목록 mock. 실제 친구 로드(loadMyFriendsEnriched)·생성 CF/규칙은 디테일 단계.
const BG = '#C8D9E6', INK = '#1A3D52', SUB = 'rgba(26,61,82,0.55)', CARD = '#FFFFFF', SAGE_DEEP = '#5E7E42', LINE = 'rgba(26,61,82,0.12)';
const MAX_MEMBERS = 20;   // 나 포함
const NAME_MAX = 10;
const MOCK_FRIENDS = [
  { id: 'f1', n: '민', c: '#5B86A8', name: '민수' },
  { id: 'f2', n: '영', c: '#8FB06B', name: '영지' },
  { id: 'f3', n: '수', c: '#C98B7F', name: '수진' },
  { id: 'f4', n: '준', c: '#9B7FB0', name: '준호' },
  { id: 'f5', n: '태', c: '#5E7E42', name: '태현' },
  { id: 'f6', n: '지', c: '#C9A24B', name: '지원' },
];

export function CrewCreateScreen({ onClose, onCreate }) {
  useAndroidBack(true, onClose);
  const [name, setName] = useState('');
  const [sel, setSel] = useState([]);
  const [err, setErr] = useState('');

  const atMax = 1 + sel.length >= MAX_MEMBERS;   // 나(1) + 초대
  const toggle = (id) => setSel((p) => p.includes(id) ? p.filter((x) => x !== id) : (atMax ? p : [...p, id]));

  const canCreate = name.trim().length > 0;
  const create = () => {
    const nm = name.trim();
    if (!nm) return;
    if (containsProfanity(nm)) { setErr(PROFANITY_BLOCK_MESSAGE); return; }
    onCreate({ name: nm, members: 1 + sel.length });
  };

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      {/* 헤더 — ✕ · 크루 만들기 · 만들기 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 0.5, borderBottomColor: LINE }}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={{ fontSize: fs(20), color: INK }}>✕</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(16), color: INK, textAlign: 'center' }}>크루 만들기</Text>
        <TouchableOpacity onPress={create} disabled={!canCreate} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: canCreate ? SAGE_DEEP : 'rgba(94,126,66,0.4)' }}>만들기</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* 이름 */}
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: SUB, marginBottom: 8 }}>크루 이름</Text>
          <TextInput value={name} onChangeText={(t) => { setName(t); if (err) setErr(''); }} maxLength={NAME_MAX}
            allowFontScaling={false} placeholder="예) 수요회, 대학 동기" placeholderTextColor={SUB}
            style={{ backgroundColor: CARD, borderRadius: 12, borderWidth: 0.5, borderColor: LINE, paddingHorizontal: 14, paddingVertical: 12,
              fontFamily: F.sysB, fontSize: fs(15), color: INK }} />
          <Text style={{ alignSelf: 'flex-end', fontFamily: F.sys, fontSize: fs(11), color: SUB, marginTop: 5 }}>{name.length}/{NAME_MAX}</Text>

          {/* 친구 초대 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14, marginBottom: 8 }}>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: SUB }}>함께할 친구</Text>
            <View style={{ flex: 1 }} />
            <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: SUB }}>{1 + sel.length}/{MAX_MEMBERS}명</Text>
          </View>

          <View style={{ backgroundColor: CARD, borderRadius: 12, borderWidth: 0.5, borderColor: LINE, overflow: 'hidden' }}>
            {MOCK_FRIENDS.map((f, i) => {
              const on = sel.includes(f.id);
              return (
                <TouchableOpacity key={f.id} activeOpacity={0.7} onPress={() => toggle(f.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11,
                    borderTopWidth: i === 0 ? 0 : 0.5, borderTopColor: LINE }}>
                  {f.uri ? (
                    <Image source={{ uri: f.uri }} style={{ width: 36, height: 36, borderRadius: 18 }} contentFit="cover" />
                  ) : (
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: f.c, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: '#fff' }}>{f.n}</Text>
                    </View>
                  )}
                  <Text style={{ flex: 1, fontFamily: F.sysM, fontSize: fs(14.5), color: INK, marginLeft: 12 }}>{f.name}</Text>
                  <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1.5,
                    borderColor: on ? SAGE_DEEP : 'rgba(26,61,82,0.25)', backgroundColor: on ? SAGE_DEEP : 'transparent',
                    alignItems: 'center', justifyContent: 'center' }}>
                    {on && <Text style={{ fontSize: fs(13), color: '#fff' }}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: SUB, marginTop: 8 }}>초대는 만든 뒤에도 추가할 수 있어요 · 최대 {MAX_MEMBERS}명</Text>

          {!!err && <Text style={{ color: '#B23B3B', fontFamily: F.sys, fontSize: fs(12), marginTop: 12 }}>{err}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </SafeAreaProvider>
  );
}
