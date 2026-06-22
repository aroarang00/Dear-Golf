import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, TextInput, Switch, Platform } from 'react-native';
import { SafeAreaView, SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { KeyboardProvider, KeyboardAvoidingView } from 'react-native-keyboard-controller'; // 안드 모달 입력 가림 방지
import { F, fs } from '../constants/colors';
import { Icon } from './common/Icon';
import { useAndroidBack } from '../hooks/useAndroidBack';
import { containsProfanity, PROFANITY_BLOCK_MESSAGE } from '../utils/profanityFilter';

// 크루 올리기(작성) — 앨범 FAB(＋)에서 진입 (docs/crew-space-design.md §3.3).
//  글 + 사진/영상(합 10개·동영상 1개·30초) / 공지(텍스트만, 토글). 비속어 필터. 페일스카이 라이트.
//  ※ Phase 1 — 미디어는 mock(placeholder)로 추가. 실제 expo-image-picker(MAX_PHOTOS=10·MAX_VIDEO_SEC=30) 연결은 디테일 단계.
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
const TINTS = ['#A9C2D6', '#C9B7A0', '#B0C99A', '#D6BBA9', '#A9B8D6', '#C7A9C2'];

export function CrewComposeScreen({ crew, onClose, onSubmit }) {
  useAndroidBack(true, onClose);
  const [text, setText] = useState('');
  const [media, setMedia] = useState([]);
  const [isNotice, setIsNotice] = useState(false);
  const [err, setErr] = useState('');

  const hasVideo = media.some((m) => m.type === 'video');
  const full = media.length >= MAX_MEDIA;
  const addPhoto = () => { if (full) return; setMedia((p) => [...p, { type: 'image', tint: TINTS[p.length % TINTS.length] }]); };
  const addVideo = () => { if (full || hasVideo) return; setMedia((p) => [...p, { type: 'video', tint: TINTS[p.length % TINTS.length] }]); };
  const removeMedia = (i) => setMedia((p) => p.filter((_, idx) => idx !== i));

  const limit = isNotice ? MAX_NOTICE : MAX_TEXT;
  const canPost = isNotice ? text.trim().length > 0 : (text.trim().length > 0 || media.length > 0);

  const submit = () => {
    const body = text.trim();
    if (!canPost) return;
    if (body && containsProfanity(body)) { setErr(PROFANITY_BLOCK_MESSAGE); return; }
    onSubmit({ isNotice, text: body, media: isNotice ? [] : media });
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
        <TouchableOpacity onPress={submit} disabled={!canPost} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: canPost ? SAGE_DEEP : 'rgba(94,126,66,0.4)' }}>게시</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* 공지 토글 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: CARD, borderRadius: 12,
            paddingHorizontal: 14, paddingVertical: 12, borderWidth: 0.5, borderColor: LINE }}>
            <Text style={{ fontSize: fs(15), marginRight: 8 }}>📌</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: INK }}>공지로 올리기</Text>
              {isNotice && <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: SUB, marginTop: 2 }}>텍스트만 · 최신 공지가 기존을 대체해요</Text>}
            </View>
            <Switch value={isNotice} onValueChange={setIsNotice}
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
              {media.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                  {media.map((m, i) => (
                    <View key={i} style={{ width: 86, height: 86, borderRadius: 10, marginRight: 8, backgroundColor: m.tint,
                      alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      <Icon name="image" size={fs(24)} color="rgba(255,255,255,0.85)" strokeWidth={1.4} />
                      {m.type === 'video' && (
                        <View style={{ position: 'absolute', bottom: 5, left: 5, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 7, paddingHorizontal: 5, paddingVertical: 1 }}>
                          <Text style={{ fontSize: fs(9), color: '#fff' }}>▶ 영상</Text>
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
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity onPress={addPhoto} disabled={full} activeOpacity={0.8}
                  style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: full ? LINE : SAGE_DEEP, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, marginRight: 8 }}>
                  <Icon name="image" size={fs(18)} color={full ? SUB : SAGE_DEEP} strokeWidth={1.6} />
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: full ? SUB : SAGE_DEEP, marginLeft: 6 }}>사진</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={addVideo} disabled={full || hasVideo} activeOpacity={0.8}
                  style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: (full || hasVideo) ? LINE : SAGE_DEEP, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 }}>
                  <Text style={{ fontSize: fs(13), color: (full || hasVideo) ? SUB : SAGE_DEEP, marginRight: 5 }}>▶</Text>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: (full || hasVideo) ? SUB : SAGE_DEEP }}>영상</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }} />
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: SUB }}>{media.length}/{MAX_MEDIA}</Text>
              </View>
              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: SUB, marginTop: 8 }}>사진·영상 합쳐 최대 10개 · 영상은 1개(30초)까지</Text>
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
