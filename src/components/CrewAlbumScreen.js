import React, { useState, useRef, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, RefreshControl, useWindowDimensions, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView, SafeAreaProvider, useSafeAreaInsets, initialWindowMetrics } from 'react-native-safe-area-context';
import { KeyboardProvider, KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Image } from 'expo-image';
import Animated, { SlideInRight } from 'react-native-reanimated'; // 깊은 화면 푸시 슬라이드 전환
import { F, fs } from '../constants/colors';
import { Icon } from './common/Icon';
import { useScreenBack } from '../hooks/useScreenBack';
import { useCurrentUid } from '../contexts/CurrentUidContext';
import { containsProfanity, PROFANITY_BLOCK_MESSAGE } from '../utils/profanityFilter';
import {
  subscribeCrew, subscribeCrewPosts, subscribeCrewComments,
  addCrewComment, editCrewComment, deleteCrewPost, deleteCrewComment,
} from '../utils/crews';
import { resolveMemberDisplay } from '../utils/friends';
import { CrewComposeScreen } from './CrewComposeScreen';
import { CrewMembersScreen } from './CrewMembersScreen';
import { PhotoViewer } from './common/PhotoViewer';
import { ReportModal } from './ReportModal';
import { AppAlertHost, showAppAlert } from './AppAlert';

// 크루 앨범 — 리스트에서 크루 탭 시 진입 (docs/crew-space-design.md §3.1).
//  ★상세화면 폐지 — 피드 카드에서 바로 댓글 펼치기·작성/수정/삭제·신고까지 인라인 처리(2026-06-23 개편).
//  피드 + 사진 토글: 피드=글·사진·영상 카드, 사진=미디어만 그리드. 댓글은 카드 펼침(게시물별, 실시간).
const BG    = '#C8D9E6';
const INK   = '#1A3D52';
const SUB   = 'rgba(26,61,82,0.55)';
const CARD  = '#FFFFFF';
const SAGE  = '#8FB06B';
const SAGE_DEEP = '#5E7E42';
const LINE  = 'rgba(26,61,82,0.12)';
const ACCENTS = ['#8FB06B', '#5B86A8', '#C98B7F', '#9B7FB0', '#C9A24B', '#5E7E42'];
const colorOf = (id) => ACCENTS[[...String(id)].reduce((a, ch) => a + ch.charCodeAt(0), 0) % ACCENTS.length];

// 상대시각 — DM/목록과 동일(방금/N분 전/N시간 전/어제/N일 전/날짜)
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

// 사진 있으면 프로필 사진, 없으면 이니셜. onPress=프로필(DM) 시트, i>0이면 겹쳐쌓기.
function MiniAvatar({ n, c, i = 0, size = 30, uri, onPress }) {
  const base = { width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor: '#fff', marginLeft: i === 0 ? 0 : -(size * 0.3) };
  const inner = uri
    ? <Image source={{ uri }} style={base} contentFit="cover" />
    : (
      <View style={{ ...base, backgroundColor: c, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(size * 0.38), color: '#fff' }}>{n}</Text>
      </View>
    );
  return onPress ? <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{inner}</TouchableOpacity> : inner;
}

// 미디어 타일 — 사진은 uri, 영상은 poster(없으면 uri) + ▶ 오버레이
function MediaTile({ m, style, radius = 12, playSize = 'lg' }) {
  const uri = m?.type === 'video' ? (m.poster || m.uri) : m?.uri;
  return (
    <View style={{ ...style, borderRadius: radius, backgroundColor: 'rgba(26,61,82,0.06)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={120} />
           : <Icon name="image" size={fs(28)} color="rgba(26,61,82,0.35)" strokeWidth={1.4} />}
      {m?.type === 'video' && (playSize === 'lg' ? (
        <View style={{ position: 'absolute', width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: fs(18), color: '#fff', marginLeft: 2 }}>▶</Text>
        </View>
      ) : (
        <View style={{ position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: fs(10), color: '#fff', marginLeft: 1 }}>▶</Text>
        </View>
      ))}
    </View>
  );
}

export function CrewAlbumScreen({ crew, onClose, onOpenDM }) {
  const { width: winW } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const currentUid = useCurrentUid();
  const crewId = crew?.id;
  const [tab, setTab] = useState('feed');         // 'feed' | 'photos'
  const [composeOpen, setComposeOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [editingPost, setEditingPost] = useState(null);   // 작성화면 재사용(수정)

  const [crewDoc, setCrewDoc] = useState(crew?._doc || null);
  const [postDocs, setPostDocs] = useState(null);   // null=로딩
  const [display, setDisplay] = useState({});       // uid→{name,avatarUri,self}
  const [noticeExpanded, setNoticeExpanded] = useState(false);
  const scrollRef = useRef(null);
  const [showTop, setShowTop] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = () => { setRefreshing(true); setTimeout(() => setRefreshing(false), 600); }; // 실시간 구독이라 표시만(당김 UX 유지)

  // 인라인 댓글 — 펼친 게시물(단일)만 구독
  const [expandedId, setExpandedId] = useState(null);
  const [commentDocs, setCommentDocs] = useState(null);   // 펼친 글의 댓글(null=로딩)
  const [cDisplay, setCDisplay] = useState({});
  const [draft, setDraft] = useState('');
  const [cErr, setCErr] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState(null);            // 대댓글 대상 { id, name }
  const [editingComment, setEditingComment] = useState(null); // { id, postId }

  // 오버레이(앨범 루트)
  const [profileFor, setProfileFor] = useState(null);      // 프로필 탭 → DM 팝업
  const [actionFor, setActionFor] = useState(null);        // 더보기 { kind, id, postId?, authorUid, name, text, post? }
  const [reportTarget, setReportTarget] = useState(null);  // 신고 { id, name, evidence }
  const [viewer, setViewer] = useState(null);              // 풀스크린 뷰어 { media, index, caption }

  // 안드 뒤로 — 떠 있는 것부터 닫고, 없으면 앨범 닫기(목록으로). 모달 다단계 위임은 useScreenBack이 처리
  useScreenBack(true, () => {
    if (viewer) { setViewer(null); return; }
    if (reportTarget) { setReportTarget(null); return; }
    if (profileFor) { setProfileFor(null); return; }
    if (actionFor) { setActionFor(null); return; }
    if (expandedId) { setExpandedId(null); return; }
    onClose();
  });

  // 크루 doc(공지·멤버) + 게시물 실시간 구독
  useEffect(() => {
    if (!crewId) return;
    const un1 = subscribeCrew(crewId, (d) => { if (d) setCrewDoc(d); });
    const un2 = subscribeCrewPosts(crewId, setPostDocs);
    return () => { un1(); un2(); };
  }, [crewId]);

  const memberUids = crewDoc?.memberUids || [];
  const namesFallback = crewDoc?.names || {};
  const notice = crewDoc?.notice || '';

  // 멤버 + 작성자 표시정보 resolve(보는 사람 별명 우선)
  const authorKey = useMemo(() => (postDocs || []).map((p) => p.authorUid).join(','), [postDocs]);
  useEffect(() => {
    const uids = [...new Set([...memberUids, ...(postDocs || []).map((p) => p.authorUid)].filter(Boolean))];
    if (!uids.length) { setDisplay({}); return; }
    let alive = true;
    resolveMemberDisplay(uids, { myUid: currentUid, namesFallback }).then((m) => { if (alive) setDisplay(m || {}); }).catch(() => {});
    return () => { alive = false; };
  }, [memberUids.join(','), authorKey, currentUid]);

  // 펼친 글 댓글 실시간 구독
  useEffect(() => {
    if (!crewId || !expandedId) { setCommentDocs(null); return; }
    setCommentDocs(null);
    return subscribeCrewComments(crewId, expandedId, setCommentDocs);
  }, [crewId, expandedId]);

  // 댓글 작성자 표시정보 resolve
  const cAuthorKey = useMemo(() => (commentDocs || []).map((c) => c.authorUid).join(','), [commentDocs]);
  useEffect(() => {
    const uids = [...new Set((commentDocs || []).map((c) => c.authorUid).filter(Boolean))];
    if (!uids.length) { setCDisplay({}); return; }
    let alive = true;
    resolveMemberDisplay(uids, { myUid: currentUid, namesFallback: crewDoc?.names || {} })
      .then((m) => { if (alive) setCDisplay(m || {}); }).catch(() => {});
    return () => { alive = false; };
  }, [cAuthorKey, currentUid]);

  const members = useMemo(() => memberUids.map((u) => {
    const d = display[u] || {};
    const name = d.name || namesFallback[u] || '친구';
    return { id: u, name, n: name.charAt(0), c: colorOf(u), uri: d.avatarUri || null };
  }), [memberUids.join(','), display]);

  // 게시물 표시 모델
  const posts = useMemo(() => (postDocs || []).map((p) => {
    const d = display[p.authorUid] || {};
    const name = d.name || namesFallback[p.authorUid] || '친구';
    return {
      id: p.id,
      author: { id: p.authorUid, name, n: name.charAt(0), c: colorOf(p.authorUid), uri: d.avatarUri || null },
      time: fmtTime(p.createdAt), text: p.text || '', media: p.media || [], comments: p.commentCount || 0,
      _doc: p,
    };
  }), [postDocs, display]);

  // 평면 댓글 → 스레드(최상위 + 대댓글), 표시정보 입힘
  const comments = useMemo(() => {
    const deco = (c) => {
      const d = cDisplay[c.authorUid] || {};
      const name = d.name || namesFallback[c.authorUid] || '친구';
      return { id: c.id, authorUid: c.authorUid, body: c.body || '', time: fmtTime(c.createdAt),
        name, n: name.charAt(0), c: colorOf(c.authorUid), uri: d.avatarUri || null, parentId: c.parentId || null };
    };
    const all = (commentDocs || []).map(deco);
    const tops = all.filter((c) => !c.parentId);
    return tops.map((t) => ({ ...t, replies: all.filter((r) => r.parentId === t.id) }));
  }, [commentDocs, cDisplay]);

  // ── 동작 ──
  const toggleExpand = (postId) => {
    setReplyTo(null); setEditingComment(null); setDraft(''); setCErr('');
    setExpandedId((prev) => (prev === postId ? null : postId));
  };
  const openProfile = (person) => {
    const uid = person?.authorUid || person?.id;
    if (uid && uid !== currentUid) setProfileFor({ ...person, uid });
  };
  const confirmDelete = () => {
    const a = actionFor; setActionFor(null);
    if (!a) return;
    const isPost = a.kind === 'post';
    showAppAlert(isPost ? '게시물을 삭제할까요?' : '댓글을 삭제할까요?',
      isPost ? '사진·글·댓글이 모두 삭제돼요.' : '이 댓글이 삭제돼요.', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: async () => {
        try {
          if (isPost) { await deleteCrewPost(crewId, a.id); if (expandedId === a.id) setExpandedId(null); }
          else { await deleteCrewComment(crewId, a.postId, a.id); }
        } catch (e) { if (__DEV__) console.warn('[crewAlbum] delete', e?.code, e?.message); }
      } },
    ]);
  };
  const reportAction = () => {
    const a = actionFor; setActionFor(null);
    if (!a) return;
    setReportTarget({ id: a.authorUid, name: a.name,
      evidence: a.text ? `[크루 ${a.kind === 'post' ? '게시물' : '댓글'}] ${a.text}` : '' });
  };
  const startEdit = () => {
    const a = actionFor; setActionFor(null);
    if (!a) return;
    if (a.kind === 'post') { setEditingPost(a.post); return; }
    setReplyTo(null); setCErr(''); setEditingComment({ id: a.id, postId: a.postId }); setDraft(a.text || '');
  };
  const sendComment = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    if (containsProfanity(body)) { setCErr(PROFANITY_BLOCK_MESSAGE); return; }
    if (!currentUid || !crewId) return;
    if (editingComment) {
      const { id, postId } = editingComment;
      setDraft(''); setCErr(''); setEditingComment(null); setSending(true);
      try { await editCrewComment(crewId, postId, id, { body }); }
      catch (e) { if (__DEV__) console.warn('[crewAlbum] editComment', e?.code, e?.message); setDraft(body); setEditingComment({ id, postId }); }
      finally { setSending(false); }
      return;
    }
    if (!expandedId) return;
    const parentId = replyTo?.id || null;
    setDraft(''); setCErr(''); setReplyTo(null); setSending(true);
    try { await addCrewComment(crewId, expandedId, { authorUid: currentUid, body, parentId }); }
    catch (e) { if (__DEV__) console.warn('[crewAlbum] addComment', e?.code, e?.message); setDraft(body); }
    finally { setSending(false); }
  };

  if (composeOpen) return (
    <Animated.View style={{ flex: 1 }} entering={SlideInRight.duration(230)}>
      <CrewComposeScreen crew={crew} onClose={() => setComposeOpen(false)} />
    </Animated.View>
  );
  if (editingPost) return (
    <Animated.View style={{ flex: 1 }} entering={SlideInRight.duration(230)}>
      <CrewComposeScreen crew={crew} post={editingPost} onClose={() => setEditingPost(null)} />
    </Animated.View>
  );
  if (membersOpen) return (
    <Animated.View style={{ flex: 1 }} entering={SlideInRight.duration(230)}>
      <CrewMembersScreen crew={crew} onClose={() => setMembersOpen(false)} onLeave={() => { setMembersOpen(false); onClose(); }} onOpenDM={onOpenDM} />
    </Animated.View>
  );

  // 사진 탭 — 모든 게시물의 미디어를 펼친 그리드
  const PAD = 12, GAP = 4, COLS = 3;
  const cell = Math.floor((winW - PAD * 2 - GAP * (COLS - 1)) / COLS);
  const tiles = posts.flatMap((p) => (p.media || []).map((m, mi) => ({ ...m, postId: p.id, mi, key: `${p.id}_${mi}` })));
  const loading = postDocs === null;

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
    <KeyboardProvider>
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      {/* 헤더 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12,
        borderBottomWidth: 0.5, borderBottomColor: LINE }}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ padding: 4 }}>
          <Text style={{ fontSize: fs(26), color: SAGE_DEEP, fontWeight: '600' }}>←</Text>
        </TouchableOpacity>
        <Text style={{ flexShrink: 1, fontFamily: F.sysB, fontSize: fs(18), color: INK, marginLeft: 6 }}
          numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>{crewDoc?.name || crew?.name || '크루'}</Text>
        <TouchableOpacity onPress={() => setMembersOpen(true)} hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
          style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 10 }}>
          {members.slice(0, 3).map((m, i) => <MiniAvatar key={m.id} n={m.n} c={m.c} uri={m.uri} i={i} size={24} />)}
          {members.length > 3 && (
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(26,61,82,0.45)', borderWidth: 1.5, borderColor: '#fff',
              alignItems: 'center', justifyContent: 'center', marginLeft: -7 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(9), color: '#fff' }}>+{members.length - 3}</Text>
            </View>
          )}
          <Text style={{ fontSize: fs(20), color: SAGE_DEEP, fontWeight: '700', marginLeft: 5, marginTop: -2 }}>›</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={() => setMembersOpen(true)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ padding: 4 }}>
          <Icon name="personAdd" size={fs(27)} color={SAGE_DEEP} strokeWidth={2.2} />
        </TouchableOpacity>
      </View>

      {/* 피드/사진 토글 — 고정 바(ScrollView 밖) */}
      <View style={{ backgroundColor: BG, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 0.5, borderBottomColor: LINE }}>
        <View style={{ flexDirection: 'row', marginHorizontal: 14,
          backgroundColor: 'rgba(26,61,82,0.08)', borderRadius: 11, padding: 3 }}>
          {[['feed', '피드'], ['photos', '사진']].map(([t, label]) => (
            <TouchableOpacity key={t} onPress={() => setTab(t)} activeOpacity={0.85} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              style={{ flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center', backgroundColor: tab === t ? SAGE_DEEP : 'transparent' }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: tab === t ? '#fff' : SUB }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <KeyboardAwareScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 90 }}
        showsVerticalScrollIndicator={false} scrollEventThrottle={16} keyboardShouldPersistTaps="handled" bottomOffset={20}
        onScroll={(e) => setShowTop(e.nativeEvent.contentOffset.y > 320)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={SAGE_DEEP} colors={[SAGE_DEEP]} />}>

        {/* 공지(스크롤로 흘러감, 길면 더보기) */}
        {!!notice && (
          <View style={{ paddingHorizontal: 14, paddingTop: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', backgroundColor: CARD, borderRadius: 12,
              paddingHorizontal: 12, paddingVertical: 10, borderWidth: 0.5, borderColor: LINE }}>
              <Text style={{ fontSize: fs(13), marginRight: 8, marginTop: 1 }}>📌</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.sysM, fontSize: fs(12.5), color: INK, lineHeight: fs(19) }}
                  numberOfLines={noticeExpanded ? undefined : 2}>{notice}</Text>
                {(notice || '').length > 45 && (
                  <TouchableOpacity onPress={() => setNoticeExpanded((v) => !v)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={{ marginTop: 5, alignSelf: 'flex-start' }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: SAGE_DEEP }}>{noticeExpanded ? '접기' : '더보기'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        )}

        {/* 콘텐츠 */}
        <View style={{ paddingTop: 10 }}>
        {loading ? (
          <View style={{ paddingTop: 50, alignItems: 'center' }}><ActivityIndicator color={SAGE_DEEP} /></View>
        ) : posts.length === 0 ? (
          <View style={{ paddingTop: 54, alignItems: 'center', paddingHorizontal: 40 }}>
            <Icon name="image" size={fs(34)} color="rgba(26,61,82,0.3)" strokeWidth={1.4} />
            <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: INK, marginTop: 12 }}>아직 올라온 게 없어요</Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: SUB, marginTop: 5, textAlign: 'center', lineHeight: fs(19) }}>
              아래 ＋ 버튼으로 사진·영상이나{'\n'}소식을 처음으로 남겨보세요.
            </Text>
          </View>
        ) : tab === 'feed' ? (
          // ── 피드: 카드(작성자·글·미디어·댓글 인라인) ──
          posts.map((p) => {
            const open = expandedId === p.id;
            return (
            <View key={p.id} style={{ backgroundColor: CARD, borderRadius: 16, marginHorizontal: 14, marginBottom: 12, padding: 13,
              shadowColor: '#1A3D52', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 }}>
              {/* 작성자 + ⋯(수정·삭제/신고) */}
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <MiniAvatar n={p.author.n} c={p.author.c} uri={p.author.uri} size={32} onPress={() => openProfile(p.author)} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: INK }}>{p.author.name}</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: SUB, marginTop: 1 }}>{p.time}</Text>
                </View>
                <TouchableOpacity hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ padding: 4 }}
                  onPress={() => setActionFor({ kind: 'post', id: p.id, authorUid: p.author.id, name: p.author.name, text: p.text, post: p })}>
                  <Text style={{ fontSize: fs(22), color: INK }}>⋯</Text>
                </TouchableOpacity>
              </View>
              {/* 글 */}
              {!!p.text && (
                <Text style={{ fontFamily: F.sysM, fontSize: fs(16), color: INK, marginTop: 10, lineHeight: fs(22) }}>{p.text}</Text>
              )}
              {/* 미디어 — 탭하면 풀스크린 뷰어 */}
              {p.media.length > 0 && (
                <View style={{ marginTop: 11 }}>
                  {p.media.length === 1 ? (
                    <TouchableOpacity activeOpacity={0.95} onPress={() => setViewer({ media: p.media, index: 0 })}>
                      <MediaTile m={p.media[0]} style={{ width: '100%', aspectRatio: 1 }} playSize="lg" />
                    </TouchableOpacity>
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {p.media.map((m, mi) => (
                        <TouchableOpacity key={mi} activeOpacity={0.95} onPress={() => setViewer({ media: p.media, index: mi })}>
                          <MediaTile m={m} style={{ width: winW * 0.42, height: winW * 0.42, marginRight: 6 }} playSize="sm" />
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}
                </View>
              )}
              {/* 댓글 펼치기 토글 */}
              <TouchableOpacity onPress={() => toggleExpand(p.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ flexDirection: 'row', alignItems: 'center', marginTop: 11 }}>
                <Text style={{ fontFamily: F.sysM, fontSize: fs(12.5), color: open ? SAGE_DEEP : SUB }}>
                  💬 {p.comments > 0 ? `댓글 ${p.comments}` : '댓글 달기'}
                </Text>
                <Text style={{ fontSize: fs(10), color: open ? SAGE_DEEP : SUB, marginLeft: 6 }}>{open ? '▲' : '▼'}</Text>
              </TouchableOpacity>

              {/* 펼침 — 댓글·답글 + 입력 (인라인) */}
              {open && (
                <View style={{ marginTop: 12, borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 12 }}>
                  {commentDocs === null ? (
                    <View style={{ paddingVertical: 14, alignItems: 'center' }}><ActivityIndicator color={SAGE_DEEP} /></View>
                  ) : (
                    <>
                      {comments.length === 0 && (
                        <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: SUB, marginBottom: 10 }}>첫 댓글을 남겨보세요.</Text>
                      )}
                      {comments.map((cm) => (
                        <View key={cm.id} style={{ marginBottom: 12 }}>
                          <View style={{ flexDirection: 'row' }}>
                            <MiniAvatar n={cm.n} c={cm.c} uri={cm.uri} size={28} onPress={() => openProfile(cm)} />
                            <View style={{ flex: 1, marginLeft: 9 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: INK }}>{cm.name}</Text>
                                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: SUB, marginLeft: 8 }}>{cm.time}</Text>
                                <View style={{ flex: 1 }} />
                                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }} style={{ paddingHorizontal: 4 }}
                                  onPress={() => setActionFor({ kind: 'comment', id: cm.id, postId: p.id, authorUid: cm.authorUid, name: cm.name, text: cm.body })}>
                                  <Text style={{ fontSize: fs(17), color: SUB }}>⋯</Text>
                                </TouchableOpacity>
                              </View>
                              <Text style={{ fontFamily: F.sys, fontSize: fs(15), color: INK, marginTop: 2, lineHeight: fs(21) }}>{cm.body}</Text>
                              <TouchableOpacity onPress={() => { if (editingComment) { setEditingComment(null); setDraft(''); } setReplyTo({ id: cm.id, name: cm.name }); }}
                                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={{ marginTop: 4, alignSelf: 'flex-start' }}>
                                <Text style={{ fontFamily: F.sysSb, fontSize: fs(11.5), color: SAGE_DEEP }}>답글</Text>
                              </TouchableOpacity>
                              {/* 대댓글 */}
                              {(cm.replies || []).map((r) => (
                                <View key={r.id} style={{ flexDirection: 'row', marginTop: 10 }}>
                                  <MiniAvatar n={r.n} c={r.c} uri={r.uri} size={24} onPress={() => openProfile(r)} />
                                  <View style={{ flex: 1, marginLeft: 8 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                      <Text style={{ fontFamily: F.sysB, fontSize: fs(12.5), color: INK }}>{r.name}</Text>
                                      <Text style={{ fontFamily: F.sys, fontSize: fs(10.5), color: SUB, marginLeft: 8 }}>{r.time}</Text>
                                      <View style={{ flex: 1 }} />
                                      <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }} style={{ paddingHorizontal: 4 }}
                                        onPress={() => setActionFor({ kind: 'comment', id: r.id, postId: p.id, authorUid: r.authorUid, name: r.name, text: r.body })}>
                                        <Text style={{ fontSize: fs(15), color: SUB }}>⋯</Text>
                                      </TouchableOpacity>
                                    </View>
                                    <Text style={{ fontFamily: F.sys, fontSize: fs(15), color: INK, marginTop: 2, lineHeight: fs(20) }}>{r.body}</Text>
                                  </View>
                                </View>
                              ))}
                            </View>
                          </View>
                        </View>
                      ))}

                      {/* 입력 배너 */}
                      {editingComment && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
                          <Text style={{ flex: 1, fontFamily: F.sysM, fontSize: fs(12), color: SAGE_DEEP }}>댓글 수정 중</Text>
                          <TouchableOpacity onPress={() => { setEditingComment(null); setDraft(''); setCErr(''); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: SUB }}>취소</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                      {replyTo && !editingComment && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
                          <Text style={{ flex: 1, fontFamily: F.sysM, fontSize: fs(12), color: SAGE_DEEP }}>{replyTo.name}님에게 답글</Text>
                          <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: SUB }}>취소</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                      {!!cErr && <Text style={{ color: '#B23B3B', fontFamily: F.sys, fontSize: fs(11.5), marginBottom: 4 }}>{cErr}</Text>}

                      {/* 입력 — 포커스 시 KeyboardAwareScrollView가 키보드 위로 스크롤 */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                        <TextInput value={draft} onChangeText={(t) => { setDraft(t); if (cErr) setCErr(''); }} maxLength={300}
                          allowFontScaling={false} placeholder={editingComment ? '댓글 수정…' : (replyTo ? `${replyTo.name}님에게 답글…` : '댓글 달기…')}
                          placeholderTextColor={SUB} returnKeyType="send" onSubmitEditing={sendComment} blurOnSubmit={false}
                          style={{ flex: 1, backgroundColor: '#F2F5F8', borderRadius: 20, paddingHorizontal: 14, paddingTop: 9, paddingBottom: 9,
                            fontFamily: F.sys, fontSize: fs(15), color: INK, borderWidth: 0.5, borderColor: LINE, marginRight: 6 }} />
                        <TouchableOpacity onPress={sendComment} disabled={!draft.trim()} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }} style={{ padding: 4 }}>
                          <Icon name="paperPlane" size={fs(26)} color={draft.trim() ? SAGE_DEEP : 'rgba(94,126,66,0.4)'} strokeWidth={1.9} />
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </View>
              )}
            </View>
            );
          })
        ) : (
          // ── 사진: 미디어만 그리드 → 탭하면 풀스크린 뷰어 ──
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: PAD }}>
            {tiles.map((t, i) => (
              <TouchableOpacity key={t.key} activeOpacity={0.8}
                onPress={() => { const post = posts.find((p) => p.id === t.postId); if (post) setViewer({ media: post.media, index: t.mi }); }}
                style={{ marginRight: i % COLS === COLS - 1 ? 0 : GAP, marginBottom: GAP }}>
                <MediaTile m={t} style={{ width: cell, height: cell }} radius={8} playSize="sm" />
              </TouchableOpacity>
            ))}
            {tiles.length === 0 && (
              <View style={{ width: '100%', alignItems: 'center', paddingTop: 50 }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: SUB }}>아직 사진·영상이 없어요.</Text>
              </View>
            )}
          </View>
        )}
        </View>
      </KeyboardAwareScrollView>

      {/* 맨 위로 — 스크롤 내려갔을 때만 (좌하단) */}
      {showTop && (
        <TouchableOpacity activeOpacity={0.85} onPress={() => scrollRef.current?.scrollTo?.({ y: 0, animated: true })}
          style={{ position: 'absolute', left: 20, bottom: insets.bottom + 22, width: 46, height: 46, borderRadius: 23,
            backgroundColor: '#fff', borderWidth: 1, borderColor: LINE, alignItems: 'center', justifyContent: 'center',
            shadowColor: '#1A3D52', shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 }}>
          <Text style={{ fontSize: fs(22), color: SAGE_DEEP, marginTop: 1 }}>↑</Text>
        </TouchableOpacity>
      )}

      {/* 올리기 FAB */}
      <TouchableOpacity activeOpacity={0.85} onPress={() => setComposeOpen(true)}
        style={{ position: 'absolute', right: 20, bottom: insets.bottom + 18, width: 56, height: 56, borderRadius: 28, backgroundColor: SAGE_DEEP,
          alignItems: 'center', justifyContent: 'center', shadowColor: '#1A3D52', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 5 }}>
        <Text style={{ fontSize: fs(30), color: '#fff', marginTop: -2 }}>＋</Text>
      </TouchableOpacity>

      {/* 프로필 탭 → DM 팝업(중앙 카드) */}
      {profileFor && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <TouchableOpacity activeOpacity={1} onPress={() => setProfileFor(null)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(26,61,82,0.45)' }} />
          <View style={{ width: 250, backgroundColor: CARD, borderRadius: 20, paddingTop: 22, paddingBottom: 18, paddingHorizontal: 18, alignItems: 'center',
            shadowColor: '#1A3D52', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 }}>
            <MiniAvatar n={profileFor.n} c={profileFor.c} uri={profileFor.uri} size={84} />
            <Text style={{ fontFamily: F.sysB, fontSize: fs(18), color: INK, marginTop: 12 }} numberOfLines={1}>{profileFor.name}</Text>
            <TouchableOpacity activeOpacity={0.85} onPress={() => { const x = profileFor; setProfileFor(null); onOpenDM?.(x.uid, x.name, x.uri); }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 18, alignSelf: 'stretch',
                backgroundColor: SAGE_DEEP, borderRadius: 12, paddingVertical: 13 }}>
              <Icon name="send" size={fs(20)} color="#fff" strokeWidth={1.9} />
              <Text style={{ fontFamily: F.sysB, fontSize: fs(15.5), color: '#fff', marginLeft: 8 }}>메시지 보내기</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 더보기 — 내 것=수정·삭제, 남의 것=신고 */}
      {actionFor && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <TouchableOpacity activeOpacity={1} onPress={() => setActionFor(null)} style={{ flex: 1, backgroundColor: 'rgba(26,61,82,0.35)' }} />
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: CARD, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 8, paddingBottom: 30 + insets.bottom }}>
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

      {/* 풀스크린 줌 뷰어 — 사진/영상 가운데 확대만(캡션 없음), 저장 허용 */}
      {viewer && (
        <PhotoViewer photos={viewer.media} startIndex={viewer.index} allowSave onClose={() => setViewer(null)} />
      )}

      {/* 신고 — 작성자 대상 + 본문 인용 근거 prefill */}
      <ReportModal visible={!!reportTarget}
        presetTarget={reportTarget ? { id: reportTarget.id, name: reportTarget.name } : null}
        prefillEvidence={reportTarget?.evidence || ''}
        onClose={() => setReportTarget(null)} />

      {/* 크루 모달 위 alert 자체 호스트(삭제 확인 등) */}
      <AppAlertHost />
    </SafeAreaView>
    </KeyboardProvider>
    </SafeAreaProvider>
  );
}
