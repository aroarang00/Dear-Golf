import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, TextInput, Switch, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView, SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { KeyboardProvider, KeyboardAvoidingView } from 'react-native-keyboard-controller'; // 안드 모달 입력 가림 방지
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { F, fs } from '../constants/colors';
import { Icon } from './common/Icon';
import { useScreenBack } from '../hooks/useScreenBack';
import { useCurrentUid } from '../contexts/CurrentUidContext';
import { containsProfanity, PROFANITY_BLOCK_MESSAGE } from '../utils/profanityFilter';
import { uploadRoundMedia } from '../utils/roundMedia';
import { addCrewPost, editCrewPost, setCrewNotice } from '../utils/crews';
import { showAppAlert } from './AppAlert';
import { CropEditorModal } from './common/CropEditorModal';

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

export function CrewComposeScreen({ crew, post, noticeText = null, onClose }) {
  useScreenBack(true, onClose);
  const editing = !!post;                         // post 있으면 수정 모드(글·미디어 prefill)
  const editingNotice = noticeText != null;       // 공지 수정 모드(텍스트만, 토글·미디어 숨김)
  const currentUid = useCurrentUid();
  const crewId = crew?.id;
  const [text, setText] = useState(post?.text || noticeText || '');
  const [media, setMedia] = useState(post?.media || []);   // 기존 미디어는 https(업로드 완료) — uploadRoundMedia가 멱등 처리
  const [isNotice, setIsNotice] = useState(editingNotice); // 공지 수정 모드면 강제 공지(토글 숨김)
  const [err, setErr] = useState('');
  const [posting, setPosting] = useState(false);
  const [cropTarget, setCropTarget] = useState(null);   // 크롭 대상 { uri, index } — 탭한 사진을 그 자리에서 교체

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
      const imgs = (res.assets || []).filter((a) => a?.uri).slice(0, remaining);
      // 고른 사진은 그대로 추가(자동 크롭 X). iOS서 피커 닫힘과 크롭 Modal이 겹쳐 간헐 실패하던 문제 회피.
      //   크롭은 썸네일 탭으로(피커 없이 = 충돌 없음). ar=원본 가로세로비 → 피드서 원본 비율 표시(정사각 강제 X).
      setMedia((p) => [...p, ...imgs.map((a) => ({ type: 'image', uri: a.uri, ar: (a.width && a.height) ? a.width / a.height : undefined }))].slice(0, MAX_MEDIA));
    } catch (e) { if (__DEV__) console.warn('[crewCompose] addPhoto', e?.message); }
  };
  // 썸네일 탭 → 크롭(1:1). 사진=사진 자체, 영상=커버(포스터) 편집. 피커가 안 떠 있어 Modal 충돌 없음(안드·iOS 동일).
  //   기존 업로드 사진(https)은 expo-image-manipulator가 iOS서 원격 URL을 못 다뤄 '저장 실패' →
  //   로컬 캐시로 내려받아 로컬 경로로 편집(안드는 원격도 되지만 동작 통일).
  //   ★영상 커버는 새로 올린 영상(로컬 포스터)만 편집 — 이미 게시된 영상(https)은 uri가 https라 업로드가 멱등 스킵돼
  //     편집 포스터가 반영 안 되므로 편집 미제공(헛동작 방지).
  const openCrop = async (m, i) => {
    let src, field;
    if (m.type === 'image') { src = m.uri; field = 'uri'; }
    else if (m.type === 'video') { if (!m.poster || /^https?:\/\//.test(m.poster)) return; src = m.poster; field = 'poster'; }
    else return;
    if (/^https?:\/\//.test(src)) {
      try {
        const dl = await FileSystem.downloadAsync(src, FileSystem.cacheDirectory + `dgcrop_${Date.now()}.jpg`);
        src = dl.uri;
      } catch (e) {
        if (__DEV__) console.warn('[crewCompose] crop download', e?.message);
        showAppAlert('사진을 불러오지 못했어요', '잠시 후 다시 시도해주세요.');
        return;   // 원격 uri 그대로 크롭 열면 iOS서 저장 실패 → 중단(헛동작 방지)
      }
    }
    setCropTarget({ uri: src, index: i, field });
  };
  // 크롭 저장 → 같은 자리 교체(사진=uri, 영상=poster). 1:1로 잘렸으니 ar=1. 제출 시 uploadRoundMedia가 새 항목/포스터로 업로드.
  const applyCrop = (uri) => {
    const idx = cropTarget?.index;
    const field = cropTarget?.field || 'uri';
    if (idx == null) return;
    setMedia((p) => p.map((m, i) => (i === idx ? { ...m, [field]: uri, ar: 1 } : m)));
  };
  const addVideo = async () => {
    if (full || hasVideo || posting) return;
    try {
      const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) await ImagePicker.requestMediaLibraryPermissionsAsync();
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], allowsMultipleSelection: false, quality: 1, videoMaxDuration: MAX_VIDEO_SEC });
      if (res.canceled) return;
      const a = (res.assets || [])[0];
      if (!a?.uri) return;
      // 첫 프레임 포스터 생성 → 등록화면 썸네일 표시·커버 편집용(로컬). 실패해도 영상은 추가(업로드 때 재생성).
      let poster = null;
      try { const t = await VideoThumbnails.getThumbnailAsync(a.uri, { time: 0, quality: 0.7 }); poster = t?.uri || null; }
      catch (e) { if (__DEV__) console.warn('[crewCompose] videoPoster', e?.message); }
      const ar = (a.width && a.height) ? a.width / a.height : undefined;   // 영상 원본 비율 → 피드 표시
      setMedia((p) => p.some((m) => m.type === 'video') ? p : [...p, { type: 'video', uri: a.uri, poster, ar }].slice(0, MAX_MEDIA));
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
      const up = media.length ? await uploadRoundMedia(currentUid, media, { maxWidth: 800, thumb: 400 }) : [];   // 크루 피드 사진=800px(뷰어 확대용) + 400px 썸네일(thumb, 리스트 로딩↑). 기존 https는 멱등 스킵
      if (editing) {
        await editCrewPost(crewId, post.id, { text: body, media: up });
      } else if (isNotice) {
        await setCrewNotice(crewId, body, currentUid);
      } else {
        await addCrewPost(crewId, { authorUid: currentUid, text: body, media: up });
      }
      onClose();   // 실시간 구독이 앨범·상세에 즉시 반영
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
        <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(16), color: INK, textAlign: 'center' }}>{editing ? '게시물 수정' : editingNotice ? '공지 수정' : (isNotice ? '공지 작성' : '새 게시물')}</Text>
        <TouchableOpacity onPress={submit} disabled={!canPost || posting} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
          style={{ backgroundColor: (canPost && !posting) ? SAGE_DEEP : 'rgba(94,126,66,0.25)', borderRadius: 9, paddingHorizontal: 16, paddingVertical: 7, minWidth: 56, alignItems: 'center' }}>
          {posting ? <ActivityIndicator size="small" color="#fff" />
                   : <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: '#fff' }}>{(editing || editingNotice) ? '완료' : '게시'}</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* 공지 토글 — 게시물 수정·공지 수정 모드선 숨김(공지는 별도 흐름) */}
          {!editing && !editingNotice && (
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
          )}

          {/* 글 */}
          <TextInput value={text} onChangeText={(t) => { setText(t); if (err) setErr(''); }} multiline maxLength={limit}
            allowFontScaling={false} placeholder={isNotice ? '공지 내용을 입력하세요' : '크루와 나눌 소식을 적어보세요'} placeholderTextColor={SUB}
            style={{ backgroundColor: CARD, borderRadius: 12, borderWidth: 0.5, borderColor: LINE, padding: 14,
              fontFamily: F.sys, fontSize: fs(16), color: INK, marginTop: (editing || editingNotice) ? 0 : 12, minHeight: 130, textAlignVertical: 'top', lineHeight: fs(24) }} />
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

              {/* 안내 + 갯수 (버튼 아래) — 사진은 탭하면 잘라서 편집 */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
                <Text style={{ flex: 1, fontFamily: F.sys, fontSize: fs(11), color: SUB }}>사진·영상 탭하면 잘라서 편집 · 최대 10개(영상 1개·30초)</Text>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: media.length > 0 ? SAGE_DEEP : SUB }}>{media.length}/{MAX_MEDIA}</Text>
              </View>

              {/* 추가된 사진·영상 — 버튼 아래 가로 배열. 사진 탭=크롭 편집 */}
              {media.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
                  {media.map((m, i) => {
                    // 편집 가능 = 사진 / 새로 올린 영상(로컬 포스터). 이미 게시된 영상(https 포스터)은 편집 미제공.
                    const editable = m.type === 'image' || (m.type === 'video' && m.poster && !/^https?:\/\//.test(m.poster));
                    return (
                    <TouchableOpacity key={i} activeOpacity={editable ? 0.8 : 1}
                      onPress={() => openCrop(m, i)}
                      style={{ width: 86, height: 86, borderRadius: 10, marginRight: 8, backgroundColor: 'rgba(26,61,82,0.08)',
                      alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {m.type === 'image'
                        ? <Image source={{ uri: m.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                        : m.poster
                        ? <Image source={{ uri: m.poster }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                        : <Icon name="video" size={fs(24)} color="rgba(26,61,82,0.5)" strokeWidth={1.4} />}
                      {/* 영상 표시 — ▶ 가운데 오버레이 */}
                      {m.type === 'video' && (
                        <View style={{ position: 'absolute', width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: fs(12), color: '#fff', marginLeft: 1 }}>▶</Text>
                        </View>
                      )}
                      {/* 편집 라벨 — 탭하면 커버(1:1) 편집 */}
                      {editable && (
                        <View style={{ position: 'absolute', bottom: 4, left: 4, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 }}>
                          <Text style={{ fontFamily: F.sysSb, fontSize: fs(9), color: '#fff' }}>편집</Text>
                        </View>
                      )}
                      <TouchableOpacity onPress={() => removeMedia(i)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: fs(11), color: '#fff' }}>✕</Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          )}

          {!!err && <Text style={{ color: '#B23B3B', fontFamily: F.sys, fontSize: fs(12), marginTop: 12 }}>{err}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 썸네일 탭 → 크롭(1:1). 저장=그 자리 교체 / 취소=원본 유지(사진 그대로) */}
      <CropEditorModal visible={!!cropTarget} uri={cropTarget?.uri} aspect="square"
        onSave={(uri) => { applyCrop(uri); setCropTarget(null); }}
        onClose={() => setCropTarget(null)} />
    </SafeAreaView>
    </KeyboardProvider>
    </SafeAreaProvider>
  );
}
