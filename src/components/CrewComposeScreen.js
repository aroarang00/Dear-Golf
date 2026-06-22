import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, TextInput, Switch, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView, SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { KeyboardProvider, KeyboardAvoidingView } from 'react-native-keyboard-controller'; // 안드 모달 입력 가림 방지
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { F, fs } from '../constants/colors';
import { Icon } from './common/Icon';
import { useAndroidBack } from '../hooks/useAndroidBack';
import { useCurrentUid } from '../contexts/CurrentUidContext';
import { containsProfanity, PROFANITY_BLOCK_MESSAGE } from '../utils/profanityFilter';
import { uploadRoundMedia } from '../utils/roundMedia';
import { addCrewPost, setCrewNotice } from '../utils/crews';
import { showAppAlert } from './AppAlert';

// 크루 올리기(작성) — 앨범 FAB(＋)에서 진입 (docs/crew-space-design.md §3.3).
//  글 + 사진/영상(합 10개·동영상 1개·30초) / 공지(텍스트만, 토글). 비속어 필터. 페일스카이 라이트.
//  미디어=expo-image-picker → uploadRoundMedia(rounds/{uid}, https)로 업로드 후 addCrewPost.
const BG    = '#C8D9E6';
const INK   = '#1A3D52';
const SUB   = 'rgba(26,61,82,0.55)';
const CARD  = '#FFFFFF';
const SAGE  = '#8FB06B';
const SAGE_DEEP = '#5E7E42';
const LINE  = 'rgba(26,61,82,0.12)';
const MAX_MEDIA = 10;
const MAX_TEXT = 1000;     // 게시물 글
const MAX_NOTICE = 500;    // 공지(핀이라 짧게)
const MAX_VIDEO_SEC = 30;

export function CrewComposeScreen({ crew, onClose }) {
  useAndroidBack(true, onClose);
  const currentUid = useCurrentUid();
  const crewId = crew?.id;
  const [text, setText] = useState('');
  const [media, setMedia] = useState([]);      // {type:'image'|'video', uri}
  const [isNotice, setIsNotice] = useState(false);
  const [err, setErr] = useState('');
  const [posting, setPosting] = useState(false);

  const hasVideo = media.some((m) => m.type === 'video');
  const full = media.length >= MAX_MEDIA;

  const addPhoto = async () => {
    if (full || posting) return;
    try {
      const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) await ImagePicker.requestMediaLibraryPermissionsAsync();
      const remaining = MAX_MEDIA - media.length;
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: remaining, quality: 1 });
      if (res.canceled) return;
      const picked = (res.assets || []).filter((a) => a?.uri).slice(0, remaining).map((a) => ({ type: 'image', uri: a.uri }));
      setMedia((p) => [...p, ...picked].slice(0, MAX_MEDIA));
    } catch (e) { if (__DEV__) console.warn('[crewCompose] addPhoto', e?.message); }
  };
  const addVideo = async () => {
    if (full || hasVideo || posting) return;
    try {
      const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) await ImagePicker.requestMediaLibraryPermissionsAsync();
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], allowsMultipleSelection: false, quality: 1, videoMaxDuration: MAX_VIDEO_SEC });
      if (res.canceled) return;
      const a = (res.assets || [])[0];
      if (a?.uri) setMedia((p) => p.some((m) => m.type === 'video') ? p : [...p, { type: 'video', uri: a.uri }].slice(0, MAX_MEDIA));
    } catch (e) { if (__DEV__) console.warn('[crewCompose] addVideo', e?.message); }
  };
  const removeMedia = (i) => setMedia((p) => p.filter((_, idx) => idx !== i));

  const limit = isNotice ? MAX_NOTICE : MAX_TEXT;
  const canPost = isNotice ? text.trim().length > 0 : (text.trim().length > 0 || media.length > 0);

  const submit = async () => {
    const body = text.trim();
    if (!canPost || posting) return;
    if (body && containsProfanity(body)) { setErr(PROFANITY_BLOCK_MESSAGE); return; }
    if (!currentUid) { showAppAlert('잠시만요', '로그인 정보를 불러오는 중이에요. 잠시 후 다시 시도해주세요.'); return; }
    if (!crewId) return;
    setPosting(true);
    try {
      if (isNotice) {
        await setCrewNotice(crewId, body, currentUid);
      } else {
        const up = media.length ? await uploadRoundMedia(currentUid, media) : [];
        await addCrewPost(crewId, { authorUid: currentUid, text: body, media: up });
      }
      onClose();   // 실시간 구독이 앨범에 즉시 반영
    } catch (e) {
      if (__DEV__) console.warn('[crewCompose] submit', e?.code, e?.message);
      setPosting(false);
      showAppAlert('게시 실패', e?.code === 'permission-denied'
        ? '권한이 없어요. 크루 멤버인지 확인해주세요.' : (e?.message || '잠시 후 다시 시도해주세요.'));
    }
  };

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
    <KeyboardProvider>
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      {/* 헤더 — ✕ · 제목 · 게시 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 0.5, borderBottomColor: LINE }}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={{ fontSize: fs(20), color: INK }}>✕</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(16), color: INK, textAlign: 'center' }}>{isNotice ? '공지 작성' : '새 게시물'}</Text>
        <TouchableOpacity onPress={submit} disabled={!canPost || posting} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
          style={{ backgroundColor: (canPost && !posting) ? SAGE_DEEP : 'rgba(94,126,66,0.25)', borderRadius: 9, paddingHorizontal: 16, paddingVertical: 7, minWidth: 56, alignItems: 'center' }}>
          {posting ? <ActivityIndicator size="small" color="#fff" />
                   : <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: '#fff' }}>게시</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* 공지 토글 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: 12,
            paddingHorizontal: 14, paddingVertical: 12, borderWidth: 0.5, borderColor: LINE }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: fs(15), marginRight: 6 }}>📌</Text>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: INK }}>공지로 올리기</Text>
              </View>
              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: SUB, marginTop: 3 }}>텍스트만 가능 · 최신 공지가 기존을 대체해요</Text>
            </View>
            <Switch value={isNotice} onValueChange={setIsNotice}
              style={Platform.OS === 'ios' ? { transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] } : undefined}
              trackColor={{ false: 'rgba(26,61,82,0.2)', true: SAGE }} thumbColor="#fff" />
          </View>

          {/* 글 */}
          <TextInput value={text} onChangeText={(t) => { setText(t); if (err) setErr(''); }} multiline maxLength={limit}
            allowFontScaling={false} placeholder={isNotice ? '공지 내용을 입력하세요' : '무슨 일이 있었나요?'} placeholderTextColor={SUB}
            style={{ backgroundColor: CARD, borderRadius: 12, borderWidth: 0.5, borderColor: LINE, padding: 14,
              fontFamily: F.sys, fontSize: fs(16), color: INK, marginTop: 12, minHeight: 130, textAlignVertical: 'top', lineHeight: fs(24) }} />
          <Text style={{ alignSelf: 'flex-end', fontFamily: F.sys, fontSize: fs(11), color: text.length >= limit ? '#B23B3B' : SUB, marginTop: 5 }}>{text.length}/{limit}</Text>

          {/* 미디어 — 공지가 아닐 때만 */}
          {!isNotice && (
            <View style={{ marginTop: 14 }}>
              {/* 사진·영상 추가 — 세이지 채움 큰 버튼(밋밋하지 않게) */}
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity onPress={addPhoto} disabled={full} activeOpacity={0.85}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginRight: 8,
                    backgroundColor: full ? 'rgba(26,61,82,0.05)' : 'rgba(143,176,107,0.16)',
                    borderWidth: 1, borderColor: full ? LINE : 'rgba(94,126,66,0.45)', borderRadius: 12, paddingVertical: 11 }}>
                  <Icon name="image" size={fs(20)} color={full ? SUB : SAGE_DEEP} strokeWidth={1.7} />
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: full ? SUB : SAGE_DEEP, marginLeft: 7 }}>사진</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={addVideo} disabled={full || hasVideo} activeOpacity={0.85}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: (full || hasVideo) ? 'rgba(26,61,82,0.05)' : 'rgba(143,176,107,0.16)',
                    borderWidth: 1, borderColor: (full || hasVideo) ? LINE : 'rgba(94,126,66,0.45)', borderRadius: 12, paddingVertical: 11 }}>
                  <Icon name="video" size={fs(20)} color={(full || hasVideo) ? SUB : SAGE_DEEP} strokeWidth={1.7} />
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: (full || hasVideo) ? SUB : SAGE_DEEP, marginLeft: 7 }}>영상</Text>
                </TouchableOpacity>
              </View>

              {/* 안내 + 갯수 (버튼 아래) */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
                <Text style={{ flex: 1, fontFamily: F.sys, fontSize: fs(11), color: SUB }}>사진·영상 합쳐 최대 10개 · 영상은 1개(30초)까지</Text>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: media.length > 0 ? SAGE_DEEP : SUB }}>{media.length}/{MAX_MEDIA}</Text>
              </View>

              {/* 추가된 사진·영상 — 버튼 아래 가로 배열 */}
              {media.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
                  {media.map((m, i) => (
                    <View key={i} style={{ width: 86, height: 86, borderRadius: 10, marginRight: 8, backgroundColor: 'rgba(26,61,82,0.08)',
                      alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {m.type === 'image'
                        ? <Image source={{ uri: m.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                        : <Icon name="video" size={fs(24)} color="rgba(26,61,82,0.5)" strokeWidth={1.4} />}
                      {m.type === 'video' && (
                        <View style={{ position: 'absolute', bottom: 5, left: 5, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 7, paddingHorizontal: 5, paddingVertical: 1 }}>
                          <Text style={{ fontSize: fs(9), color: '#fff' }}>영상</Text>
                        </View>
                      )}
                      <TouchableOpacity onPress={() => removeMedia(i)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: fs(11), color: '#fff' }}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          )}

          {!!err && <Text style={{ color: '#B23B3B', fontFamily: F.sys, fontSize: fs(12), marginTop: 12 }}>{err}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </KeyboardProvider>
    </SafeAreaProvider>
  );
}
