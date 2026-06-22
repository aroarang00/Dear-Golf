import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, TextInput, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaView, SafeAreaProvider, useSafeAreaInsets, initialWindowMetrics } from 'react-native-safe-area-context';
import { KeyboardProvider, KeyboardEvents } from 'react-native-keyboard-controller'; // 안드 RN Modal서 reanimated 키보드훅 무효 → 명령형 이벤트로 처리(DM 동일)
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { F, fs } from '../constants/colors';
import { Icon } from './common/Icon';
import { useAndroidBack } from '../hooks/useAndroidBack';
import { useCurrentUid } from '../contexts/CurrentUidContext';
import { containsProfanity, PROFANITY_BLOCK_MESSAGE } from '../utils/profanityFilter';
import { subscribeCrewComments, subscribeCrewPost, addCrewComment, editCrewComment, deleteCrewPost, deleteCrewComment } from '../utils/crews';
import { resolveMemberDisplay } from '../utils/friends';
import { PhotoViewer } from './common/PhotoViewer';
import { ReportModal } from './ReportModal';
import { CrewComposeScreen } from './CrewComposeScreen';
import { AppAlertHost, showAppAlert } from './AppAlert';

// 크루 게시물 상세 — 피드/그리드에서 게시물 탭 시 진입 (docs/crew-space-design.md §3.2).
//  글(옵션) + 미디어(옵션, 글만 가능) + 그 게시물의 댓글(B안, 실시간). 페일스카이 라이트 테마.
const BG      = '#C8D9E6';               // 헤더·하단 입력바 = 페일스카이(타 화면과 통일)
const CONTENT = '#FFFFFF';               // ★본문(스크롤)만 화이트 — 게시글 부각
const INK   = '#1A3D52';
const SUB   = 'rgba(26,61,82,0.55)';
const CARD  = '#FFFFFF';
const SAGE_DEEP = '#5E7E42';
const LINE  = 'rgba(26,61,82,0.12)';
const ACCENTS = ['#8FB06B', '#5B86A8', '#C98B7F', '#9B7FB0', '#C9A24B', '#5E7E42'];
const colorOf = (id) => ACCENTS[[...String(id)].reduce((a, ch) => a + ch.charCodeAt(0), 0) % ACCENTS.length];

function fmtTime(ts) {
  const ms = ts?.toMillis ? ts.toMillis() : 0;
  if (!ms) return '방금';
  const d = new Date(ms);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return '방금';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`;
  if (d.toDateString() === now.toDateString()) return `${Math.floor(diff / 3600000)}시간 전`;
  const a = new Date(d); a.setHours(0, 0, 0, 0);
  const t = new Date(now); t.setHours(0, 0, 0, 0);
  const days = Math.round((t - a) / 86400000);
  if (days === 1) return '어제';
  if (days <= 6) return `${days}일 전`;
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`;
}

// 사진 있으면 프로필 사진, 없으면 이니셜(친구·DM과 동일 폴백). uri는 실데이터 연결 시 주입.
function Avatar({ n, c, size = 32, onPress, uri }) {
  const inner = uri ? (
    <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />
  ) : (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: F.sysB, fontSize: fs(size * 0.4), color: '#fff' }}>{n}</Text>
    </View>
  );
  return onPress ? <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{inner}</TouchableOpacity> : inner;
}

export function CrewPostScreen({ post, crew, onClose, onOpenDM }) {
  useAndroidBack(true, onClose);
  const { width: winW } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // 안드 RN Modal — KeyboardAvoidingView(reanimated 훅)가 값 0에 머물러 무효 → KeyboardEvents로 입력바를 키보드 높이만큼 들어올림(DM 패턴).
  const BAR_PAD = 8;
  const CLOSED_PAD = Math.max(0, 10 + insets.bottom - BAR_PAD);
  const kbLift = useSharedValue(0);
  const kbPadStyle = useAnimatedStyle(() => ({ paddingBottom: Math.max(kbLift.value, CLOSED_PAD) }));
  useEffect(() => {
    const onShow = (e) => { kbLift.value = withTiming(Math.round(e?.height || 0), { duration: e?.duration || 220 }); };
    const onHide = (e) => { kbLift.value = withTiming(0, { duration: e?.duration || 220 }); };
    const subs = [
      KeyboardEvents.addListener('keyboardWillShow', onShow),
      KeyboardEvents.addListener('keyboardDidShow', onShow),
      KeyboardEvents.addListener('keyboardWillHide', onHide),
      KeyboardEvents.addListener('keyboardDidHide', onHide),
    ];
    return () => subs.forEach((s) => s.remove());
  }, []);
  const currentUid = useCurrentUid();
  const crewId = crew?.id;
  const postId = post?.id;
  const [commentDocs, setCommentDocs] = useState(null);  // 평면 댓글(parentId로 스레딩) — null=로딩
  const [display, setDisplay] = useState({});            // uid→{name,avatarUri}
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState('');                  // 비속어 안내
  const [sending, setSending] = useState(false);
  const [profileFor, setProfileFor] = useState(null);  // 프로필 탭 → DM 시트 대상
  const [replyTo, setReplyTo] = useState(null);        // 대댓글 대상 { id, name }
  const [liveDoc, setLiveDoc] = useState(post?._doc || null);   // 본문·미디어 수정 실시간 반영(목록 거치지 않고)
  const [editingPost, setEditingPost] = useState(false);        // 게시물 편집(작성화면 재사용)
  const [editingComment, setEditingComment] = useState(null);   // 댓글 인라인 편집 { id }

  const author = post?.author || { n: '나', c: SAGE_DEEP, name: '나' };
  const media = liveDoc?.media || post?.media || [];
  const caption = (liveDoc?.text != null ? liveDoc.text : post?.text) || '';
  const time = post?.time || '';

  // 댓글 + 게시물(본문·미디어 수정 반영) 실시간 구독
  useEffect(() => {
    if (!crewId || !postId) return;
    const un1 = subscribeCrewComments(crewId, postId, setCommentDocs);
    const un2 = subscribeCrewPost(crewId, postId, (d) => { if (d) setLiveDoc(d); });
    return () => { un1(); un2(); };
  }, [crewId, postId]);

  // 댓글 작성자 표시정보 resolve(보는 사람 별명 우선)
  const authorKey = useMemo(() => (commentDocs || []).map((c) => c.authorUid).join(','), [commentDocs]);
  useEffect(() => {
    const uids = [...new Set([...(commentDocs || []).map((c) => c.authorUid), author?.id].filter(Boolean))];
    if (!uids.length) { setDisplay({}); return; }
    let alive = true;
    resolveMemberDisplay(uids, { myUid: currentUid, namesFallback: crew?._doc?.names || {} })
      .then((m) => { if (alive) setDisplay(m || {}); }).catch(() => {});
    return () => { alive = false; };
  }, [authorKey, currentUid]);

  // 평면 → 스레드(최상위 + 대댓글). 각 댓글에 표시정보 입힘.
  const comments = useMemo(() => {
    const deco = (c) => {
      const d = display[c.authorUid] || {};
      const name = d.name || (crew?._doc?.names || {})[c.authorUid] || '친구';
      return { id: c.id, authorUid: c.authorUid, body: c.body || '', time: fmtTime(c.createdAt),
        name, n: name.charAt(0), c: colorOf(c.authorUid), uri: d.avatarUri || null, parentId: c.parentId || null };
    };
    const all = (commentDocs || []).map(deco);
    const tops = all.filter((c) => !c.parentId);
    return tops.map((t) => ({ ...t, replies: all.filter((r) => r.parentId === t.id) }));
  }, [commentDocs, display]);

  const totalCount = (commentDocs || []).length;

  // 프로필 탭 → DM 시트(나 자신은 제외). uid는 작성자(authorUid) 또는 글 작성자(id)로 정규화.
  const openProfile = (person) => {
    const uid = person?.authorUid || person?.id;
    if (uid && uid !== currentUid) setProfileFor({ ...person, uid });
  };

  const [viewerIdx, setViewerIdx] = useState(null);   // 풀스크린 뷰어 시작 인덱스(null=닫힘)
  const [actionFor, setActionFor] = useState(null);   // 게시물/댓글 더보기 액션 { kind, id, authorUid, name, text }
  const [reportTarget, setReportTarget] = useState(null); // 신고 대상 { id, name, evidence }

  const confirmDelete = () => {
    const a = actionFor; setActionFor(null);
    if (!a) return;
    const isPost = a.kind === 'post';
    showAppAlert(isPost ? '게시물을 삭제할까요?' : '댓글을 삭제할까요?',
      isPost ? '사진·글·댓글이 모두 삭제돼요.' : '이 댓글이 삭제돼요.', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: async () => {
        try {
          if (isPost) { await deleteCrewPost(crewId, a.id); onClose(); }
          else { await deleteCrewComment(crewId, postId, a.id); }
        } catch (e) { if (__DEV__) console.warn('[crewPost] delete', e?.code, e?.message); }
      } },
    ]);
  };
  const reportAction = () => {
    const a = actionFor; setActionFor(null);
    if (!a) return;
    setReportTarget({ id: a.authorUid, name: a.name,
      evidence: a.text ? `[크루 ${a.kind === 'post' ? '게시물' : '댓글'}] ${a.text}` : '' });
  };
  // 수정 — 게시물=작성화면 재사용, 댓글=하단 입력바 인라인 편집
  const startEdit = () => {
    const a = actionFor; setActionFor(null);
    if (!a) return;
    if (a.kind === 'post') { setEditingPost(true); return; }
    setReplyTo(null); setErr(''); setEditingComment({ id: a.id }); setDraft(a.text || '');
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    if (containsProfanity(body)) { setErr(PROFANITY_BLOCK_MESSAGE); return; }   // 기존 필터 재사용
    if (!currentUid || !crewId || !postId) return;
    // 댓글 수정 모드 — 새 댓글 대신 본문만 갱신
    if (editingComment) {
      const id = editingComment.id;
      setDraft(''); setErr(''); setEditingComment(null); setSending(true);
      try {
        await editCrewComment(crewId, postId, id, { body });
      } catch (e) {
        if (__DEV__) console.warn('[crewPost] editComment', e?.code, e?.message);
        setDraft(body); setEditingComment({ id });   // 실패 시 입력·모드 복원
      } finally {
        setSending(false);
      }
      return;
    }
    const parentId = replyTo?.id || null;
    setDraft(''); setErr(''); setReplyTo(null); setSending(true);
    try {
      await addCrewComment(crewId, postId, { authorUid: currentUid, body, parentId });
    } catch (e) {
      if (__DEV__) console.warn('[crewPost] addComment', e?.code, e?.message);
      setDraft(body);   // 실패 시 입력 복원
    } finally {
      setSending(false);
    }
  };

  // 게시물 수정 — 작성화면 재사용(글·미디어 prefill). 닫으면 구독이 본문 즉시 갱신.
  if (editingPost) return (
    <CrewComposeScreen crew={crew} post={{ id: postId, text: caption, media }} onClose={() => setEditingPost(false)} />
  );

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
    <KeyboardProvider>
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      {/* 헤더 — ← · 크루명 (더보기 ⋯는 작성자 줄로 이동) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12,
        borderBottomWidth: 0.5, borderBottomColor: LINE }}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ padding: 4 }}>
          <Text style={{ fontSize: fs(26), color: SAGE_DEEP, fontWeight: '600' }}>←</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(16), color: INK, marginLeft: 6 }} numberOfLines={1}>{crew?.name || '크루'}</Text>
      </View>

        <ScrollView style={{ flex: 1, backgroundColor: CONTENT }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* 작성자 — 우측 ⋯로 수정·삭제(내 글)/신고(남의 글) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14 }}>
            <Avatar n={author.n} c={author.c} uri={author.uri} size={34} onPress={() => openProfile(author)} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: INK }}>{author.name}</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: SUB, marginTop: 1 }}>{time}</Text>
            </View>
            <TouchableOpacity hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ padding: 4 }}
              onPress={() => setActionFor({ kind: 'post', id: postId, authorUid: author.id, name: author.name, text: caption })}>
              <Text style={{ fontSize: fs(22), color: INK }}>⋯</Text>
            </TouchableOpacity>
          </View>

          {/* 글 */}
          {!!caption && (
            <Text style={{ fontFamily: F.sysM, fontSize: fs(16), color: INK, marginTop: 12, marginHorizontal: 16, lineHeight: fs(24) }}>{caption}</Text>
          )}

          {/* 미디어 — 있을 때만(글만이면 생략). 여러장 가로 페이저 */}
          {media.length > 0 && (
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ marginTop: 14 }}>
              {media.map((m, mi) => {
                const imgUri = m.type === 'video' ? m.poster : m.uri;
                return (
                <TouchableOpacity key={mi} activeOpacity={0.96} onPress={() => setViewerIdx(mi)}
                  style={{ width: winW, height: winW, backgroundColor: 'rgba(26,61,82,0.06)', alignItems: 'center', justifyContent: 'center' }}>
                  {imgUri
                    ? <Image source={{ uri: imgUri }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={120} />
                    : <Icon name={m.type === 'video' ? 'video' : 'image'} size={fs(48)} color="rgba(26,61,82,0.35)" strokeWidth={1.3} />}
                  {m.type === 'video' && (
                    <View style={{ position: 'absolute', width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: fs(24), color: '#fff', marginLeft: 3 }}>▶</Text>
                    </View>
                  )}
                  {media.length > 1 && (
                    <View style={{ position: 'absolute', top: 10, right: 12, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(11), color: '#fff' }}>{mi + 1}/{media.length}</Text>
                    </View>
                  )}
                  {/* 탭 → 풀스크린 줌 뷰어(저장 가능, expo-media-library) */}
                </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          <View style={{ height: 0.5, backgroundColor: LINE, marginVertical: 16, marginHorizontal: 16 }} />

          {/* 댓글 + 대댓글 */}
          <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: SUB, marginBottom: 14 }}>댓글 {totalCount}</Text>
            {comments.length === 0 && (
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: SUB, marginBottom: 8 }}>첫 댓글을 남겨보세요.</Text>
            )}
            {comments.map((cm, ci) => (
              <View key={cm.id} style={{ marginBottom: 14, paddingTop: ci === 0 ? 0 : 14,
                borderTopWidth: ci === 0 ? 0 : 0.5, borderTopColor: 'rgba(26,61,82,0.08)' }}>
                {/* 댓글 */}
                <View style={{ flexDirection: 'row' }}>
                  <Avatar n={cm.n} c={cm.c} uri={cm.uri} size={30} onPress={() => openProfile(cm)} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: INK }}>{cm.name}</Text>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: SUB, marginLeft: 8 }}>{cm.time}</Text>
                      <View style={{ flex: 1 }} />
                      <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }} style={{ paddingHorizontal: 4 }}
                        onPress={() => setActionFor({ kind: 'comment', id: cm.id, authorUid: cm.authorUid, name: cm.name, text: cm.body })}>
                        <Text style={{ fontSize: fs(18), color: SUB }}>⋯</Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity activeOpacity={0.6} delayLongPress={300}
                      onLongPress={() => setActionFor({ kind: 'comment', id: cm.id, authorUid: cm.authorUid, name: cm.name, text: cm.body })}>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(16), color: INK, marginTop: 3, lineHeight: fs(22) }}>{cm.body}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { if (editingComment) { setEditingComment(null); setDraft(''); } setReplyTo({ id: cm.id, name: cm.name }); }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={{ marginTop: 5, alignSelf: 'flex-start' }}>
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(11.5), color: SAGE_DEEP }}>답글</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                {/* 대댓글(들여쓰기) */}
                {(cm.replies || []).map((r) => (
                  <View key={r.id} style={{ flexDirection: 'row', marginLeft: 40, marginTop: 12 }}>
                    <Avatar n={r.n} c={r.c} uri={r.uri} size={26} onPress={() => openProfile(r)} />
                    <View style={{ flex: 1, marginLeft: 9 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={{ fontFamily: F.sysB, fontSize: fs(12.5), color: INK }}>{r.name}</Text>
                        <Text style={{ fontFamily: F.sys, fontSize: fs(10.5), color: SUB, marginLeft: 8 }}>{r.time}</Text>
                        <View style={{ flex: 1 }} />
                        <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }} style={{ paddingHorizontal: 4 }}
                          onPress={() => setActionFor({ kind: 'comment', id: r.id, authorUid: r.authorUid, name: r.name, text: r.body })}>
                          <Text style={{ fontSize: fs(16), color: SUB }}>⋯</Text>
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity activeOpacity={0.6} delayLongPress={300}
                        onLongPress={() => setActionFor({ kind: 'comment', id: r.id, authorUid: r.authorUid, name: r.name, text: r.body })}>
                        <Text style={{ fontFamily: F.sys, fontSize: fs(16), color: INK, marginTop: 2, lineHeight: fs(20) }}>{r.body}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>

        {/* 입력 영역 — kbPadStyle: 키보드 높이만큼 paddingBottom으로 들어올림(안드 RN Modal 대응) */}
        <Animated.View style={[{ backgroundColor: BG }, kbPadStyle]}>
          {/* 댓글 수정 중 배너 */}
          {editingComment && (
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 7, backgroundColor: 'rgba(94,126,66,0.1)' }}>
              <Text style={{ flex: 1, fontFamily: F.sysM, fontSize: fs(12), color: SAGE_DEEP }}>댓글 수정 중</Text>
              <TouchableOpacity onPress={() => { setEditingComment(null); setDraft(''); setErr(''); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: SUB }}>취소</Text>
              </TouchableOpacity>
            </View>
          )}
          {/* 대댓글 대상 배너 */}
          {replyTo && !editingComment && (
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 7, backgroundColor: 'rgba(94,126,66,0.1)' }}>
              <Text style={{ flex: 1, fontFamily: F.sysM, fontSize: fs(12), color: SAGE_DEEP }}>{replyTo.name}님에게 답글</Text>
              <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: SUB }}>취소</Text>
              </TouchableOpacity>
            </View>
          )}
          {/* 비속어 안내 */}
          {!!err && <Text style={{ color: '#B23B3B', fontFamily: F.sys, fontSize: fs(11.5), paddingHorizontal: 16, paddingBottom: 2 }}>{err}</Text>}
          {/* 댓글 입력 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 8, paddingBottom: BAR_PAD,
            borderTopWidth: 0.5, borderTopColor: LINE }}>
            <TextInput value={draft} onChangeText={(t) => { setDraft(t); if (err) setErr(''); }} maxLength={300}
              allowFontScaling={false} placeholder={editingComment ? '댓글 수정…' : (replyTo ? `${replyTo.name}님에게 답글…` : '댓글 달기…')} placeholderTextColor={SUB}
              style={{ flex: 1, backgroundColor: CARD, borderRadius: 22, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11,
                fontFamily: F.sys, fontSize: fs(17), lineHeight: 23, color: INK, marginRight: 8, borderWidth: 0.5, borderColor: LINE }}
              returnKeyType="send" onSubmitEditing={send} />
            {/* 전송 = 종이비행기 */}
            <TouchableOpacity onPress={send} disabled={!draft.trim()} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }} style={{ padding: 6 }}>
              <Icon name="paperPlane" size={fs(30)} color={draft.trim() ? SAGE_DEEP : 'rgba(94,126,66,0.4)'} strokeWidth={1.9} />
            </TouchableOpacity>
          </View>
        </Animated.View>

      {/* 프로필 탭 → 메시지(DM) 팝업 — 하단 시트 대신 화면 중앙 카드(프로필서 바로 확인). 크루는 친구라 바로 DM 가능 */}
      {profileFor && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <TouchableOpacity activeOpacity={1} onPress={() => setProfileFor(null)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(26,61,82,0.45)' }} />
          <View style={{ width: 250, backgroundColor: CARD, borderRadius: 20, paddingTop: 22, paddingBottom: 18, paddingHorizontal: 18, alignItems: 'center',
            shadowColor: '#1A3D52', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 }}>
            {/* 큰 프로필 사진 */}
            <Avatar n={profileFor.n} c={profileFor.c} uri={profileFor.uri} size={84} />
            <Text style={{ fontFamily: F.sysB, fontSize: fs(18), color: INK, marginTop: 12 }} numberOfLines={1}>{profileFor.name}</Text>
            {/* 메시지 보내기 — 세이지 채움 버튼(눈에 띄게) */}
            <TouchableOpacity activeOpacity={0.85} onPress={() => { const p = profileFor; setProfileFor(null); onOpenDM?.(p.uid, p.name, p.uri); }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 18, alignSelf: 'stretch',
                backgroundColor: SAGE_DEEP, borderRadius: 12, paddingVertical: 13 }}>
              <Icon name="send" size={fs(20)} color="#fff" strokeWidth={1.9} />
              <Text style={{ fontFamily: F.sysB, fontSize: fs(15.5), color: '#fff', marginLeft: 8 }}>메시지 보내기</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 게시물/댓글 더보기 — 내 것=수정·삭제, 남의 것=신고 */}
      {actionFor && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <TouchableOpacity activeOpacity={1} onPress={() => setActionFor(null)} style={{ flex: 1, backgroundColor: 'rgba(26,61,82,0.35)' }} />
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: CARD, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 8, paddingBottom: 30 }}>
            {actionFor.authorUid === currentUid ? (
              <>
              <TouchableOpacity onPress={startEdit} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16 }}>
                <Text style={{ fontFamily: F.sysM, fontSize: fs(16), color: INK }}>{actionFor.kind === 'post' ? '게시물 수정' : '댓글 수정'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmDelete} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16, borderTopWidth: 0.5, borderTopColor: LINE }}>
                <Text style={{ fontFamily: F.sysM, fontSize: fs(16), color: '#B23B3B' }}>{actionFor.kind === 'post' ? '게시물 삭제' : '댓글 삭제'}</Text>
              </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity onPress={reportAction} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16 }}>
                <Text style={{ fontFamily: F.sysM, fontSize: fs(16), color: INK }}>신고하기</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setActionFor(null)} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16, borderTopWidth: 0.5, borderTopColor: LINE }}>
              <Text style={{ fontFamily: F.sysM, fontSize: fs(16), color: SUB }}>취소</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 풀스크린 줌 뷰어 — 저장(expo-media-library) 허용 */}
      {viewerIdx != null && (
        <PhotoViewer photos={media} startIndex={viewerIdx} caption={caption} allowSave onClose={() => setViewerIdx(null)} />
      )}

      {/* 신고 — 작성자 대상 + 본문 인용 근거 prefill */}
      <ReportModal visible={!!reportTarget}
        presetTarget={reportTarget ? { id: reportTarget.id, name: reportTarget.name } : null}
        prefillEvidence={reportTarget?.evidence || ''}
        onClose={() => setReportTarget(null)} />

      {/* 크루 모달 위 alert가 뒤로 깔리지 않게 자체 호스트(삭제 확인 등) */}
      <AppAlertHost />
    </SafeAreaView>
    </KeyboardProvider>
    </SafeAreaProvider>
  );
}
