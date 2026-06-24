import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView, SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { F, fs } from '../constants/colors';
import { useScreenBack } from '../hooks/useScreenBack';
import { useCurrentUid } from '../contexts/CurrentUidContext';
import { containsProfanity, PROFANITY_BLOCK_MESSAGE } from '../utils/profanityFilter';
import { CrewAvatar } from './common/CrewAvatar';
import { CREW_COLORS, DESC_MAX, updateCrewProfile } from '../utils/crews';
import { uploadCrewImage } from '../utils/avatarStorage';
import { showToast } from './AppToast';
import { showAppAlert } from './AppAlert';

// 크루 편집 — 크루장 전용(멤버 화면에서 진입). 이름·색·성격·사진 변경. 생성 화면과 동일 UI(친구 초대만 없음).
//  저장: updateCrewProfile(이름·색·성격) + 사진 새로 골랐으면 uploadCrewImage→imageUrl. 권한은 firestore.rules가 크루장만 허용.
const BG = '#C8D9E6', INK = '#1A3D52', SUB = 'rgba(26,61,82,0.55)', CARD = '#FFFFFF', SAGE_DEEP = '#5E7E42', LINE = 'rgba(26,61,82,0.12)';
const NAME_MAX = 10;

export function CrewEditScreen({ crew, onClose }) {
  useScreenBack(true, onClose);
  const currentUid = useCurrentUid();
  const crewId = crew?.id;
  const [name, setName] = useState(crew?.name || '');
  const [themeColor, setThemeColor] = useState(crew?.themeColor || CREW_COLORS[0]);
  const [desc, setDesc] = useState(crew?.description || '');
  const [photoUri, setPhotoUri] = useState(null);   // 새로 고른 로컬 사진(없으면 기존 imageUrl 유지)
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const pickImage = async () => {
    try {
      const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) await ImagePicker.requestMediaLibraryPermissionsAsync();
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, quality: 1 });
      if (!res.canceled && res.assets?.[0]?.uri) setPhotoUri(res.assets[0].uri);
    } catch (e) { if (__DEV__) console.warn('[crewEdit] pickImage', e?.message); }
  };

  const save = async () => {
    const nm = name.trim();
    if (!nm) { setErr('크루 이름을 입력해주세요'); return; }
    if (containsProfanity(nm)) { setErr(PROFANITY_BLOCK_MESSAGE); return; }
    if (saving || !crewId) return;
    setSaving(true);
    try {
      await updateCrewProfile(crewId, { name: nm, themeColor, description: desc });
      if (photoUri) {
        const url = await uploadCrewImage(currentUid, crewId, photoUri);
        if (url) await updateCrewProfile(crewId, { imageUrl: url });
      }
      showToast('크루 정보를 수정했어요');
      onClose?.();
    } catch (e) {
      if (__DEV__) console.warn('[crewEdit] save', e?.code, e?.message);
      showAppAlert('수정 실패', e?.code === 'permission-denied' ? '크루리더만 수정할 수 있어요.' : '잠시 후 다시 시도해주세요.');
    } finally { setSaving(false); }
  };

  const previewUri = photoUri || crew?.imageUrl || null;

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: LINE }}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={{ fontSize: fs(20), color: INK }}>✕</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(16), color: INK, textAlign: 'center' }}>크루 편집</Text>
        <TouchableOpacity onPress={save} disabled={saving} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: saving ? 'rgba(94,126,66,0.4)' : SAGE_DEEP }}>{saving ? '저장 중' : '저장'}</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* 프로필(탭→사진) + 이름 한 줄 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <TouchableOpacity onPress={pickImage} activeOpacity={0.8} style={{ width: 64, height: 64 }}>
              <CrewAvatar name={name || '크'} color={themeColor} imageUrl={previewUri} size={64} radius={16} />
              <View style={{ position: 'absolute', right: -3, bottom: -3, width: 24, height: 24, borderRadius: 12, backgroundColor: SAGE_DEEP, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: BG }}>
                <Text style={{ fontSize: fs(13), color: '#fff', fontFamily: F.sysB, marginTop: -1 }}>＋</Text>
              </View>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: SUB, marginBottom: 8 }}>크루 이름</Text>
              <TextInput value={name} onChangeText={(t) => { setName(t); if (err) setErr(''); }} maxLength={NAME_MAX}
                allowFontScaling={false} placeholder="크루 이름" placeholderTextColor={SUB}
                style={{ backgroundColor: CARD, borderRadius: 12, borderWidth: 0.5, borderColor: LINE, paddingHorizontal: 14, paddingVertical: 12,
                  fontFamily: F.sysB, fontSize: fs(16), color: INK }} />
            </View>
          </View>
          <Text style={{ alignSelf: 'flex-end', fontFamily: F.sys, fontSize: fs(11), color: SUB, marginTop: 4 }}>{name.length}/{NAME_MAX}</Text>

          {/* 크루 색 */}
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: SUB, marginTop: 14, marginBottom: 10 }}>크루 색 <Text style={{ color: 'rgba(26,61,82,0.4)' }}>· 사진 없을 때 기본</Text></Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {CREW_COLORS.map((c) => {
              const on = themeColor === c;
              return (
                <TouchableOpacity key={c} onPress={() => setThemeColor(c)} activeOpacity={0.8}
                  style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c,
                    borderWidth: on ? 3 : 0, borderColor: CARD,
                    ...(on ? { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 3 } : {}) }} />
              );
            })}
          </View>

          {/* 크루 성격 */}
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: SUB, marginTop: 18, marginBottom: 8 }}>크루 성격 <Text style={{ color: 'rgba(26,61,82,0.4)' }}>· 선택</Text></Text>
          <TextInput value={desc} onChangeText={setDesc} maxLength={DESC_MAX} multiline
            allowFontScaling={false} placeholder="어떤 크루인가요? 예) 주말 라운딩 같이 즐겨요" placeholderTextColor={SUB}
            style={{ backgroundColor: CARD, borderRadius: 12, borderWidth: 0.5, borderColor: LINE, paddingHorizontal: 14, paddingVertical: 12,
              minHeight: 62, textAlignVertical: 'top', fontFamily: F.sysM, fontSize: fs(15), color: INK }} />
          <Text style={{ alignSelf: 'flex-end', fontFamily: F.sys, fontSize: fs(11), color: SUB, marginTop: 5 }}>{desc.length}/{DESC_MAX}</Text>

          {!!err && <Text style={{ color: '#B23B3B', fontFamily: F.sys, fontSize: fs(12), marginTop: 12 }}>{err}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </SafeAreaProvider>
  );
}
