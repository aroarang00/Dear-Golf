import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, TextInput, Switch, Platform, ActivityIndicator, useWindowDimensions, Keyboard } from 'react-native';
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
import { createRoundup } from '../utils/roundup';
import { RoundupCreateModal } from './RoundupCreateModal';
import { storage, STORAGE_KEYS } from '../utils/storage';
import { showAppAlert } from './AppAlert';
import { CropEditorModal } from './common/CropEditorModal';

// 게시 전 미리보기 — 피드 카드와 같은 비율 규칙(앨범 FeedMedia: 세로 0.8~가로 1.91)
const clampAR = (ar) => (ar && isFinite(ar)) ? Math.max(0.8, Math.min(1.91, ar)) : null;

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
const BURGUNDY = '#6B1E2A';   // 모집 첨부 액센트(라운지 톤)
const MAX_MEDIA = 10;
const MAX_TEXT = 1000;     // 게시물 글
const MAX_NOTICE = 500;    // 공지(핀이라 짧게)
const MAX_VIDEO_SEC = 30;

// 미리보기 카드 — 앨범 피드 카드와 같은 레이아웃(작성자·글·미디어). 게시 전 '올라간 모습' 확인용(읽기 전용).
function PreviewCard({ text, media, name, avatarUri, width }) {
  const [ar, setAr] = useState(() => clampAR(media[0]?.ar) || 1);
  const [page, setPage] = useState(0);
  const single = media.length === 1;
  const initial = (name || '나').trim().charAt(0) || '나';
  const srcOf = (m) => (m?.type === 'video' ? (m.poster || m.uri) : m?.uri);
  return (
    <View style={{ backgroundColor: CARD, borderRadius: 16, padding: 14,
      shadowColor: '#1A3D52', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {avatarUri
          ? <Image source={{ uri: avatarUri }} style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: '#fff' }} contentFit="cover" />
          : <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: SAGE_DEEP, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: '#fff' }}>{initial}</Text>
            </View>}
        <View style={{ flex: 1, marginLeft: 11 }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(17.5), color: INK }} numberOfLines={1}>{name || '나'}</Text>
          <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: SUB, marginTop: 1 }}>방금</Text>
        </View>
      </View>
      {!!text && <Text style={{ fontFamily: F.sysM, fontSize: fs(17.5), color: INK, marginTop: 12, lineHeight: fs(25) }}>{text}</Text>}
      {media.length > 0 && (
        <View style={{ marginTop: 11 }}>
          {single ? (
            <View style={{ width: '100%', aspectRatio: ar, borderRadius: 14, backgroundColor: 'rgba(26,61,82,0.06)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <Image source={{ uri: srcOf(media[0]) }} style={{ width: '100%', height: '100%' }} contentFit="cover"
                onLoad={media[0]?.ar ? undefined : (e) => { const a = clampAR((e?.source?.width || 0) / (e?.source?.height || 1)); if (a) setAr(a); }} />
              {media[0]?.type === 'video' && (
                <View style={{ position: 'absolute', width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: fs(20), color: '#fff', marginLeft: 2 }}>▶</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={{ borderRadius: 14, overflow: 'hidden', backgroundColor: 'rgba(26,61,82,0.06)' }}>
              <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ width, height: Math.round(width / ar) }}
                onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}>
                {media.map((m, mi) => (
                  <View key={mi} style={{ width, height: Math.round(width / ar), alignItems: 'center', justifyContent: 'center' }}>
                    <Image source={{ uri: srcOf(m) }} style={{ width, height: Math.round(width / ar) }} contentFit="contain"
                      onLoad={(mi === 0 && !media[0]?.ar) ? (e) => { const a = clampAR((e?.source?.width || 0) / (e?.source?.height || 1)); if (a) setAr(a); } : undefined} />
                    {m?.type === 'video' && (
                      <View style={{ position: 'absolute', width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: fs(20), color: '#fff', marginLeft: 2 }}>▶</Text>
                      </View>
                    )}
                  </View>
                ))}
              </ScrollView>
              {media.length > 1 && (
                <View style={{ position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 11, paddingHorizontal: 9, paddingVertical: 3 }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(11.5), color: '#fff' }}>{page + 1}/{media.length}</Text>
                </View>
              )}
            </View>
          )}
        </View>
      )}
      {/* 좋아요·댓글 줄(읽기 전용 모양만) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 11 }}>
        <Icon name="heart" size={fs(21)} color={SUB} strokeWidth={1.9} />
        <Text style={{ fontFamily: F.sysM, fontSize: fs(12.5), color: SUB, marginLeft: 18 }}>💬 댓글 달기</Text>
      </View>
    </View>
  );
}

export function CrewComposeScreen({ crew, post, noticeText = null, canNotice = false, memberUids = [], crewName = '', onClose, onOpenRoundup }) {
  useScreenBack(true, () => { if (previewing) { setPreviewing(false); return; } onClose(); });
  const editing = !!post;                         // post 있으면 수정 모드(글·미디어 prefill)
  const editingNotice = noticeText != null;       // 공지 수정 모드(텍스트만, 토글·미디어 숨김)
  const currentUid = useCurrentUid();
  const crewId = crew?.id;
  const [text, setText] = useState(post?.text || noticeText || '');
  const [media, setMedia] = useState(post?.media || []);   // 기존 미디어는 https(업로드 완료) — uploadRoundMedia가 멱등 처리
  const [isNotice, setIsNotice] = useState(editingNotice); // 공지 수정 모드면 강제 공지(토글 숨김)
  const [err, setErr] = useState('');
  const [posting, setPosting] = useState(false);
  const [showRoundupModal, setShowRoundupModal] = useState(false);
  const [cropTarget, setCropTarget] = useState(null);   // 크롭 대상 { uri, index } — 탭한 사진을 그 자리에서 교체
  const [previewing, setPreviewing] = useState(false);  // 게시 전 미리보기 모드(피드 카드 모습)
  const [myName, setMyName] = useState('');             // 미리보기 작성자 표시(내 닉네임)
  const [myAvatar, setMyAvatar] = useState(null);
  const [draftRestored, setDraftRestored] = useState(false); // 임시저장 글 복원됨(배너 표시)
  const { width: winW } = useWindowDimensions();
  const isNewPost = !editing && !editingNotice;        // 새 글 작성(임시저장 대상 — 수정·공지 제외)
  const draftTouchedRef = useRef(false);               // 사용자가 입력 시작했는지 — 복원이 방금 친 글 덮어쓰는 레이스 방지

  // 임시저장 불러오기 — 새 글 작성 진입 시 이전에 쓰다 만 글 복원(글만, 미디어는 휘발이라 제외)
  useEffect(() => {
    if (!isNewPost || !crewId) return;
    let alive = true;
    storage.load(STORAGE_KEYS.crewDraft, {}).then((m) => {
      if (!alive || draftTouchedRef.current) return;   // 로드 늦게 와도 이미 타이핑 시작했으면 복원 안 함
      const d = (m || {})[crewId];
      if (d && d.trim()) { setText(d); setDraftRestored(true); }
    });
    return () => { alive = false; };
  }, [isNewPost, crewId]);

  // 자동 임시저장 — 타이핑 멈추면(400ms) 글 저장(공지 모드 제외). 빈 글은 삭제. 앱이 죽어도 살아남게 기기 로컬.
  useEffect(() => {
    if (!isNewPost || isNotice || !crewId) return;
    const t = setTimeout(async () => {
      const m = (await storage.load(STORAGE_KEYS.crewDraft, {})) || {};
      if (text.trim()) m[crewId] = text; else delete m[crewId];
      storage.save(STORAGE_KEYS.crewDraft, m);
    }, 400);
    return () => clearTimeout(t);
  }, [text, isNotice, isNewPost, crewId]);

  const clearCrewDraft = () => {
    if (!crewId) return;
    storage.load(STORAGE_KEYS.crewDraft, {}).then((m) => { const n = m || {}; delete n[crewId]; storage.save(STORAGE_KEYS.crewDraft, n); }).catch(() => {});
  };
  const discardDraft = () => { setText(''); setDraftRestored(false); setErr(''); clearCrewDraft(); };

  // 미리보기 작성자 = 나 — 닉네임·프로필 사진 로드(앨범선 보는 사람 별명이지만, 내 글 미리보기는 내 닉으로 충분)
  useEffect(() => {
    let alive = true;
    storage.load(STORAGE_KEYS.profile, null).then((p) => {
      if (!alive || !p) return;
      if (p.nickname) setMyName(p.nickname);
      // avatarUri는 dgphoto: 로컬 스킴일 수 있어 그대로 expo-image에 주면 안 뜸 → http(s)만, 아니면 이니셜 폴백
      if (p.avatarUri && /^https?:\/\//.test(p.avatarUri)) setMyAvatar(p.avatarUri);
    });
    return () => { alive = false; };
  }, []);

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
      // 권한 — 요청 결과까지 확인(거부 시 조용히 빈 피커가 떴다 닫혀 '선택해도 안 됨'으로 보이던 것 방지)
      let perm = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { showAppAlert('사진 접근 권한이 필요해요', '설정 > 권한에서 사진·동영상 접근을 허용해주세요.'); return; }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'], allowsMultipleSelection: false, quality: 1, videoMaxDuration: MAX_VIDEO_SEC,
        // ★iOS 영상 export H264 720p — 미설정 시 원본(HEVC·4K 등)을 그대로 내보내다 export 실패로 조용히 canceled되거나
        //   대용량으로 업로드·UI 먹통이 됐다(다이어리엔 이 옵션이 있어 멀쩡했음). 동일 프리셋으로 통일 — 호환·용량↓·faststart. [[video-playback-faststart]]
        videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
      });
      if (res.canceled) return;
      const a = (res.assets || [])[0];
      if (!a?.uri) { showAppAlert('영상을 불러오지 못했어요', '다른 영상으로 다시 시도해주세요.'); return; }
      // 길이 제한 — 라이브러리 선택은 videoMaxDuration이 강제되지 않아(특히 안드) duration(ms)으로 직접 검사.
      //   넘으면 조용히 들어갔다 업로드·재생서 깨지던 것 → 선택 단계에서 안내하고 막음.
      if (a.duration && a.duration > (MAX_VIDEO_SEC + 1) * 1000) {
        showAppAlert('영상이 너무 길어요', `${MAX_VIDEO_SEC}초 이내 영상만 올릴 수 있어요 (선택한 영상 약 ${Math.round(a.duration / 1000)}초).`);
        return;
      }
      const ar = (a.width && a.height) ? a.width / a.height : undefined;   // 영상 원본 비율 → 피드 표시
      // ★영상 먼저 추가 — 포스터 생성(getThumbnailAsync)을 await로 막으면, iOS서 특정 영상(HEVC·iCloud 등)에
      //   대해 이 호출이 응답 없이 행(hang)할 때 영상 추가까지 막혀 '선택해도 아무 일 없음'(조용한 실패)이 됐다.
      //   다이어리는 선택 때 포스터를 안 만들어 멀쩡했던 차이. → 영상은 즉시 추가하고 포스터는 비차단으로 채운다
      //   (실패·지연해도 업로드 때 uploadVideoPoster가 첫 프레임으로 재생성하므로 등록·표시에 지장 없음).
      setMedia((p) => p.some((m) => m.type === 'video') ? p : [...p, { type: 'video', uri: a.uri, poster: null, ar }].slice(0, MAX_MEDIA));
      VideoThumbnails.getThumbnailAsync(a.uri, { time: 0, quality: 0.7 })
        .then((t) => { if (t?.uri) setMedia((p) => p.map((m) => (m.type === 'video' && m.uri === a.uri && !m.poster) ? { ...m, poster: t.uri } : m)); })
        .catch((e) => { if (__DEV__) console.warn('[crewCompose] videoPoster', e?.message); });
    } catch (e) {
      if (__DEV__) console.warn('[crewCompose] addVideo', e?.message);
      showAppAlert('영상을 불러오지 못했어요', '잠시 후 다시 시도해주세요.');   // 조용한 실패 방지(2026-06-26 감사 원칙)
    }
  };
  const removeMedia = (i) => setMedia((p) => p.filter((_, idx) => idx !== i));
  // 사진 순서 — 이웃과 자리 교환(◀=앞으로, ▶=뒤로). 드래그 대신 탭(중장년 친화·모달서 견고). 피드 표시 순서가 이 순서.
  const moveMedia = (i, dir) => {
    const j = i + dir;
    setMedia((p) => { if (j < 0 || j >= p.length) return p; const n = [...p]; [n[i], n[j]] = [n[j], n[i]]; return n; });
  };

  const limit = isNotice ? MAX_NOTICE : MAX_TEXT;
  const canPost = isNotice ? text.trim().length > 0 : (text.trim().length > 0 || media.length > 0);

  // rPayload 있으면 '모집글'(모달 '크루에 올리기'가 넘김) — 생성+게시 한 번에. 없으면 일반 글.
  const submit = async (rPayload) => {
    const roundup = rPayload || null;
    const body = text.trim();
    if (posting) return;
    if (!roundup && !canPost) return;   // 일반글은 내용 필요, 모집글은 항상 게시 가능
    if (body && containsProfanity(body)) { setErr(PROFANITY_BLOCK_MESSAGE); return; }
    if (!currentUid) { showAppAlert('잠시만요', '로그인 정보를 불러오는 중이에요. 잠시 후 다시 시도해주세요.'); return; }
    if (!crewId) return;
    setPosting(true);
    try {
      const up = (!roundup && media.length) ? await uploadRoundMedia(currentUid, media, { maxWidth: 800, thumb: 400 }) : [];   // 크루 피드 사진=800px(뷰어 확대용) + 400px 썸네일. 모집글은 카드만이라 미디어 업로드 스킵
      if (editing) {
        await editCrewPost(crewId, post.id, { text: body, media: up });
      } else if (isNotice) {
        await setCrewNotice(crewId, body, currentUid);
      } else if (roundup) {
        // 모집글 = 카드만(텍스트·미디어 없이). 라운지 모집과 동일하게 끝나면(확정·티오프+5h) 사라짐. 게시글과 분리.
        const r = await createRoundup({ ...roundup, authorName: myName || '' });
        await addCrewPost(crewId, { authorUid: currentUid, text: '', media: [], roundupId: r?.id || null });
      } else {
        await addCrewPost(crewId, { authorUid: currentUid, text: body, media: up });
        clearCrewDraft();   // 게시 성공 → 임시저장 삭제
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
        <TouchableOpacity onPress={() => { if (previewing) { setPreviewing(false); } else { onClose(); } }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={{ fontSize: fs(20), color: INK }}>{previewing ? '←' : '✕'}</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(16), color: INK, textAlign: 'center' }}>{previewing ? '미리보기' : editing ? '게시물 수정' : editingNotice ? '공지 수정' : (isNotice ? '공지 작성' : '새 게시물')}</Text>
        {/* 미리보기 — 게시 전 올라간 모습 확인(공지는 텍스트만이라 제외). 미리보기 중엔 숨김 */}
        {!isNotice && canPost && !previewing && (
          <TouchableOpacity onPress={() => { Keyboard.dismiss(); setPreviewing(true); }} hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            style={{ marginRight: 10, paddingVertical: 6 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: SAGE_DEEP }}>미리보기</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => submit()} disabled={!canPost || posting} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
          style={{ backgroundColor: (canPost && !posting) ? SAGE_DEEP : 'rgba(94,126,66,0.25)', borderRadius: 9, paddingHorizontal: 16, paddingVertical: 7, minWidth: 56, alignItems: 'center' }}>
          {posting ? <ActivityIndicator size="small" color="#fff" />
                   : <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: '#fff' }}>{(editing || editingNotice) ? '완료' : '게시'}</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {previewing ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 6, paddingTop: 14, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
          <Text style={{ fontFamily: F.sysM, fontSize: fs(13), color: SUB, marginBottom: 12, textAlign: 'center' }}>게시하면 크루 피드에 이렇게 보여요</Text>
          <PreviewCard text={text.trim()} media={media} name={myName} avatarUri={myAvatar} width={winW - 6 * 2 - 14 * 2} />
        </ScrollView>
        ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* 공지 토글 — 게시물 수정·공지 수정 모드선 숨김. 공지는 크루장·운영진(canNotice)만 올릴 수 있음 */}
          {!editing && !editingNotice && canNotice && (
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

          {/* 임시저장 복원 안내 — 쓰다 만 글을 불러왔을 때(새 글·비공지). '지우고 새로'로 비움 */}
          {isNewPost && !isNotice && draftRestored && !!text && (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(143,176,107,0.14)', borderRadius: 10,
              paddingHorizontal: 12, paddingVertical: 9, marginTop: 12 }}>
              <Text style={{ fontSize: fs(13), marginRight: 7 }}>📝</Text>
              <Text style={{ flex: 1, fontFamily: F.sysM, fontSize: fs(12.5), color: SAGE_DEEP }}>쓰다 만 글을 불러왔어요</Text>
              <TouchableOpacity onPress={discardDraft} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: SUB }}>지우고 새로</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 라운딩 모집 만들기 — 입력박스 위(새 글에서만). 모달 '크루에 올리기' 한 번에 모집 생성+게시 */}
          {isNewPost && (
            <TouchableOpacity onPress={() => setShowRoundupModal(true)} activeOpacity={0.88}
              style={{ alignItems: 'center', justifyContent: 'center', marginTop: 12,
                backgroundColor: BURGUNDY, borderRadius: 12, paddingVertical: 13 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: '#fff', letterSpacing: 0.3 }}>라운딩 모집 만들기</Text>
            </TouchableOpacity>
          )}

          {/* 글 */}
          <TextInput value={text} onChangeText={(t) => { draftTouchedRef.current = true; setText(t); if (err) setErr(''); }} multiline maxLength={limit}
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
                <Text style={{ flex: 1, fontFamily: F.sys, fontSize: fs(11), color: SUB }}>탭=잘라서 편집 · ◀▶=순서 · 최대 10개(영상 1개·30초)</Text>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: media.length > 0 ? SAGE_DEEP : SUB }}>{media.length}/{MAX_MEDIA}</Text>
              </View>

              {/* 추가된 사진·영상 — 가로 배열. 사진 탭=크롭 편집, ◀▶=순서 */}
              {media.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
                  {media.map((m, i) => {
                    // 편집 가능 = 사진 / 새로 올린 영상(로컬 포스터). 이미 게시된 영상(https 포스터)은 편집 미제공.
                    const editable = m.type === 'image' || (m.type === 'video' && m.poster && !/^https?:\/\//.test(m.poster));
                    return (
                    <View key={i} style={{ marginRight: 8, alignItems: 'center' }}>
                    <TouchableOpacity activeOpacity={editable ? 0.8 : 1}
                      onPress={() => openCrop(m, i)}
                      style={{ width: 86, height: 86, borderRadius: 10, backgroundColor: 'rgba(26,61,82,0.08)',
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
                    {/* 순서 변경 — ◀ 앞으로 / ▶ 뒤로 (사진 2개 이상일 때만). 피드 노출 순서가 이 순서 */}
                    {media.length > 1 && (
                      <View style={{ flexDirection: 'row', width: 86, marginTop: 5, justifyContent: 'space-between' }}>
                        <TouchableOpacity onPress={() => moveMedia(i, -1)} disabled={i === 0} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                          style={{ width: 38, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center',
                            backgroundColor: i === 0 ? 'rgba(26,61,82,0.04)' : 'rgba(143,176,107,0.18)' }}>
                          <Text style={{ fontSize: fs(15), color: i === 0 ? 'rgba(26,61,82,0.25)' : SAGE_DEEP, marginTop: -1 }}>◀</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => moveMedia(i, 1)} disabled={i === media.length - 1} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                          style={{ width: 38, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center',
                            backgroundColor: i === media.length - 1 ? 'rgba(26,61,82,0.04)' : 'rgba(143,176,107,0.18)' }}>
                          <Text style={{ fontSize: fs(15), color: i === media.length - 1 ? 'rgba(26,61,82,0.25)' : SAGE_DEEP, marginTop: -1 }}>▶</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    </View>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          )}

          {!!err && <Text style={{ color: '#B23B3B', fontFamily: F.sys, fontSize: fs(12), marginTop: 12 }}>{err}</Text>}
        </ScrollView>
        )}
      </KeyboardAvoidingView>

      {/* 썸네일 탭 → 크롭(1:1). 저장=그 자리 교체 / 취소=원본 유지(사진 그대로) */}
      <CropEditorModal visible={!!cropTarget} uri={cropTarget?.uri} aspect="square"
        onSave={(uri) => { applyCrop(uri); setCropTarget(null); }}
        onClose={() => setCropTarget(null)} />
      {/* 크루 모집 만들기 — 공개범위=이 크루 멤버 고정(crewAudience). onCreate는 payload만 받아두고 제출 시 생성. 열 때만 마운트 */}
      {showRoundupModal && (
        <RoundupCreateModal visible onClose={() => setShowRoundupModal(false)}
          onCreate={(payload) => submit(payload)} crewAudience={memberUids} crewName={crewName} />
      )}
    </SafeAreaView>
    </KeyboardProvider>
    </SafeAreaProvider>
  );
}
