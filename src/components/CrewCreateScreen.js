import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView, SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { F, fs } from '../constants/colors';
import { Icon } from './common/Icon';
import { useScreenBack } from '../hooks/useScreenBack';
import { containsProfanity, PROFANITY_BLOCK_MESSAGE } from '../utils/profanityFilter';
import { loadMyFriendsEnriched } from '../utils/friends';
import { storage, STORAGE_KEYS } from '../utils/storage';

// 크루 만들기 — 리스트 헤더 ＋에서 진입 (docs/crew-space-design.md §3.3).
//  이름 + 친구 초대(다중). 인원 20명 한도. 비속어 필터. 페일스카이 라이트.
//  실제 친구 로드(loadMyFriendsEnriched) · 생성은 createCrew(리스트 handleCreate)로 연결.
const BG = '#C8D9E6', INK = '#1A3D52', SUB = 'rgba(26,61,82,0.55)', CARD = '#FFFFFF', SAGE_DEEP = '#5E7E42', LINE = 'rgba(26,61,82,0.12)';
const MAX_MEMBERS = 20;   // 나 포함
const NAME_MAX = 10;
// 아바타 폴백 색 — uid 해시로 안정 배정(리스트 액센트와 동일 팔레트)
const ACCENTS = ['#8FB06B', '#5B86A8', '#C98B7F', '#9B7FB0', '#C9A24B', '#5E7E42'];
const colorOf = (id) => ACCENTS[[...String(id)].reduce((a, ch) => a + ch.charCodeAt(0), 0) % ACCENTS.length];

export function CrewCreateScreen({ onClose, onCreate }) {
  useScreenBack(true, onClose);
  const [name, setName] = useState('');
  const [sel, setSel] = useState([]);
  const [err, setErr] = useState('');
  const [friends, setFriends] = useState(null);   // null=로딩 중. [{id,name,customName,avatarUri}]
  const [myName, setMyName] = useState('');

  useEffect(() => {
    let alive = true;
    loadMyFriendsEnriched().then((list) => { if (alive) setFriends(list || []); }).catch(() => alive && setFriends([]));
    storage.load(STORAGE_KEYS.profile, null).then((p) => { if (alive && p?.nickname) setMyName(p.nickname); });
    return () => { alive = false; };
  }, []);

  const atMax = 1 + sel.length >= MAX_MEMBERS;   // 나(1) + 초대
  const toggle = (id) => setSel((p) => p.includes(id) ? p.filter((x) => x !== id) : (atMax ? p : [...p, id]));

  const canCreate = name.trim().length > 0;
  const create = () => {
    const nm = name.trim();
    if (!nm) return;
    if (containsProfanity(nm)) { setErr(PROFANITY_BLOCK_MESSAGE); return; }
    // 초대 이름맵 — 선택 친구 uid→표시명(별명 우선). 비친구 폴백·생성자 이름은 createCrew가 처리.
    const names = {};
    (friends || []).forEach((f) => { if (sel.includes(f.id)) names[f.id] = f.customName || f.name || ''; });
    onCreate({ name: nm, friendUids: sel, names, creatorName: myName });
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
          <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: canCreate ? SAGE_DEEP : 'rgba(94,126,66,0.4)' }}>만들기</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* 이름 */}
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: SUB, marginBottom: 8 }}>크루 이름</Text>
          <TextInput value={name} onChangeText={(t) => { setName(t); if (err) setErr(''); }} maxLength={NAME_MAX}
            allowFontScaling={false} placeholder="예) 수요회, 대학 동기" placeholderTextColor={SUB}
            style={{ backgroundColor: CARD, borderRadius: 12, borderWidth: 0.5, borderColor: LINE, paddingHorizontal: 14, paddingVertical: 12,
              fontFamily: F.sysB, fontSize: fs(16), color: INK }} />
          <Text style={{ alignSelf: 'flex-end', fontFamily: F.sys, fontSize: fs(11), color: SUB, marginTop: 5 }}>{name.length}/{NAME_MAX}</Text>

          {/* 친구 초대 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14, marginBottom: 8 }}>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: SUB }}>함께할 친구</Text>
            <View style={{ flex: 1 }} />
            <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: SUB }}>{1 + sel.length}/{MAX_MEMBERS}명</Text>
          </View>

          <View style={{ backgroundColor: CARD, borderRadius: 12, borderWidth: 0.5, borderColor: LINE, overflow: 'hidden' }}>
            {friends === null ? (
              <View style={{ paddingVertical: 28, alignItems: 'center' }}><ActivityIndicator color={SAGE_DEEP} /></View>
            ) : friends.length === 0 ? (
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: SUB, padding: 20, textAlign: 'center', lineHeight: fs(20) }}>
                초대할 친구가 없어요.{'\n'}먼저 친구를 추가하거나, 만든 뒤에 초대할 수 있어요.
              </Text>
            ) : friends.map((f, i) => {
              const on = sel.includes(f.id);
              const dn = f.customName || f.name || '친구';
              return (
                <TouchableOpacity key={f.id} activeOpacity={0.7} onPress={() => toggle(f.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11,
                    borderTopWidth: i === 0 ? 0 : 0.5, borderTopColor: LINE }}>
                  {f.avatarUri ? (
                    <Image source={{ uri: f.avatarUri }} style={{ width: 36, height: 36, borderRadius: 18 }} contentFit="cover" />
                  ) : (
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colorOf(f.id), alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: '#fff' }}>{dn.charAt(0)}</Text>
                    </View>
                  )}
                  <Text style={{ flex: 1, fontFamily: F.sysM, fontSize: fs(16), color: INK, marginLeft: 12 }}>{dn}</Text>
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
