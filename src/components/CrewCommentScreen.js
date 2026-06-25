import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, ActivityIndicator, TextInput, useWindowDimensions } from 'react-native';
import { SafeAreaView, SafeAreaProvider, useSafeAreaInsets, initialWindowMetrics } from 'react-native-safe-area-context';
import { KeyboardProvider, KeyboardEvents } from 'react-native-keyboard-controller'; // 안드 모달서 입력바를 키보드 높이만큼 들어올림(KAS 자동스크롤이 안 먹어 명령형으로)
import { Image } from 'expo-image';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { F, fs } from '../constants/colors';
import { Icon } from './common/Icon';
import { useScreenBack } from '../hooks/useScreenBack';
import { useCurrentUid } from '../contexts/CurrentUidContext';
import { containsProfanity, PROFANITY_BLOCK_MESSAGE } from '../utils/profanityFilter';
import { subscribeCrewComments, addCrewComment, editCrewComment, deleteCrewComment, toggleCommentLike } from '../utils/crews';
import { resolveMemberDisplay, loadMyFriendsEnriched, loadSentRequests, sendFriendRequest } from '../utils/friends';
import { storage, STORAGE_KEYS } from '../utils/storage';
import { PhotoViewer } from './common/PhotoViewer';
import { LinkText } from './common/LinkText';
import { ReportModal } from './ReportModal';
import { AppAlertHost, showAppAlert } from './AppAlert';

// 크루 게시글별 댓글 화면 — 피드 카드의 '댓글'에서 진입 (docs/crew-space-design.md §3.1).
//  ★상단 원글 요약 + 댓글 리스트 + 하단 '붙은' 입력바로 한 덩어리 — 입력바가 어느 글 댓글인지 명확(2026-06-23 개편).
const BG    = '#C8D9E6';
const INK   = '#1A3D52';
const SUB   = 'rgba(26,61,82,0.55)';
const CARD  = '#FFFFFF';
const SAGE_DEEP = '#5E7E42';
const LINE  = 'rgba(26,61,82,0.12)';
const HEART_RED = '#E5484D';
const ACCENTS = ['#8FB06B', '#5B86A8', '#C98B7F', '#9B7FB0', '#C9A24B', '#5E7E42'];
const colorOf = (id) => ACCENTS[[...String(id)].reduce((a, ch) => a + ch.charCodeAt(0), 0) % ACCENTS.length];

// 상대시각 — DM/목록/앨범과 동일
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

function MiniAvatar({ n, c, size = 30, uri, onPress }) {
  const base = { width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor: '#fff' };
  const inner = uri
    ? <Image source={{ uri }} style={base} contentFit="cover" />
    : (
      <View style={{ ...base, backgroundColor: c, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(size * 0.38), color: '#fff' }}>{n}</Text>
      </View>
    );
  return onPress ? <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{inner}</TouchableOpacity> : inner;
}

// 단일 미디어 — 원본 비율 그대로(앨범 FeedMedia와 동일 규칙)
const clampAR = (ar) => (ar && isFinite(ar)) ? Math.max(0.56, Math.min(1.91, ar)) : null;
function FeedMedia({ m }) {
  const [ar, setAr] = useState(() => clampAR(m?.ar) || 1);
  const uri = m?.type === 'video' ? (m.poster || m.uri) : m?.uri;
  return (
    <View style={{ width: '100%', aspectRatio: ar, borderRadius: 14, backgroundColor: 'rgba(26,61,82,0.06)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={120}
               onLoad={m?.ar ? undefined : (e) => { const a = clampAR((e?.source?.width || 0) / (e?.source?.height || 1)); if (a) setAr(a); }} />
           : <Icon name="image" size={fs(30)} color="rgba(26,61,82,0.35)" strokeWidth={1.4} />}
      {m?.type === 'video' && (
        <View style={{ position: 'absolute', width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: fs(20), color: '#fff', marginLeft: 2 }}>▶</Text>
        </View>
      )}
    </View>
  );
}

// 여러 장 — 풀폭 스와이프 캐러셀(앨범 SwipeCarousel과 동일 규칙)
function SwipeCarousel({ media, width, onOpen }) {
  const [ar, setAr] = useState(() => clampAR(media[0]?.ar) || 1);
  const [page, setPage] = useState(0);
  const height = Math.round(width / ar);
  return (
    <View style={{ borderRadius: 14, overflow: 'hidden', backgroundColor: 'rgba(26,61,82,0.06)' }}>
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ width, height }}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}>
        {media.map((m, mi) => {
          const uri = m?.type === 'video' ? (m.poster || m.uri) : m?.uri;
          return (
            <TouchableOpacity key={mi} activeOpacity={0.97} onPress={() => onOpen(mi)}
              style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
              {uri ? <Image source={{ uri }} style={{ width, height }} contentFit="contain" transition={120}
                       onLoad={(mi === 0 && !media[0]?.ar) ? (e) => { const a = clampAR((e?.source?.width || 0) / (e?.source?.height || 1)); if (a) setAr(a); } : undefined} />
                   : <Icon name="image" size={fs(30)} color="rgba(26,61,82,0.35)" strokeWidth={1.4} />}
              {m?.type === 'video' && (
                <View style={{ position: 'absolute', width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: fs(20), color: '#fff', marginLeft: 2 }}>▶</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {media.length > 1 && (
        <View style={{ position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 11, paddingHorizontal: 9, paddingVertical: 3 }}>
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(11.5), color: '#fff' }}>{page + 1}/{media.length}</Text>
        </View>
      )}
    </View>
  );
}

export function CrewCommentScreen({ crew, post, names = {}, onClose, onOpenDM }) {
  const { width: winW } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const currentUid = useCurrentUid();
  const crewId = crew?.id;
  const postId = post?.id;

  const [commentDocs, setCommentDocs] = useState(null);   // null=로딩
  const [cDisplay, setCDisplay] = useState({});
  const [draft, setDraft] = useState('');
  const [cErr, setCErr] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState(null);            // { id, name }
  const [editingComment, setEditingComment] = useState(null); // { id }

  // 오버레이
  const [profileFor, setProfileFor] = useState(null);      // 프로필 탭 → DM 팝업
  const [actionFor, setActionFor] = useState(null);        // 더보기 { id, authorUid, name, text }
  const [reportTarget, setReportTarget] = useState(null);  // 신고
  const [viewer, setViewer] = useState(null);              // 원글 미디어 풀스크린

  // 친구 여부 — 크루 멤버는 서로 친구 아닐 수 있음(친구=DM / 비친구=친구신청)
  const [friends, setFriends] = useState(null);
  const [sentSet, setSentSet] = useState(new Set());
  const [myName, setMyName] = useState('');
  useEffect(() => {
    let alive = true;
    loadMyFriendsEnriched().then((l) => { if (alive) setFriends(l || []); }).catch(() => alive && setFriends([]));
    loadSentRequests().then((r) => { if (alive) setSentSet(new Set((r || []).map((x) => x.recipientUid))); }).catch(() => {});
    storage.load(STORAGE_KEYS.profile, null).then((p) => { if (alive && p?.nickname) setMyName(p.nickname); });
    return () => { alive = false; };
  }, []);
  const friendSet = useMemo(() => new Set((friends || []).map((f) => f.id)), [friends]);
  const requestFriend = async (uid) => {
    if (!uid || sentSet.has(uid)) return;
    setSentSet((p) => new Set(p).add(uid));
    try { await sendFriendRequest(uid, myName); }
    catch (e) { if (__DEV__) console.warn('[crewComment] friendReq', e?.code, e?.message); }
  };

  // 입력바 키보드 높이만큼 들어올림(안드 RN Modal 대응 — 앨범과 동일)
  const BAR_PAD = 8;
  const CLOSED_PAD = Math.max(0, 8 + insets.bottom - BAR_PAD);
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

  // 안드 뒤로 — 떠 있는 것부터 닫고, 없으면 화면 닫기
  useScreenBack(true, () => {
    if (viewer) { setViewer(null); return; }
    if (reportTarget) { setReportTarget(null); return; }
    if (profileFor) { setProfileFor(null); return; }
    if (actionFor) { setActionFor(null); return; }
    onClose();
  });

  // 댓글 실시간 구독
  useEffect(() => {
    if (!crewId || !postId) { setCommentDocs(null); return; }
    setCommentDocs(null);
    return subscribeCrewComments(crewId, postId, setCommentDocs);
  }, [crewId, postId]);

  // 댓글 작성자 표시정보 resolve(보는 사람 별명 우선)
  const cAuthorKey = useMemo(() => (commentDocs || []).map((c) => c.authorUid).join(','), [commentDocs]);
  useEffect(() => {
    const uids = [...new Set((commentDocs || []).map((c) => c.authorUid).filter(Boolean))];
    if (!uids.length) { setCDisplay({}); return; }
    let alive = true;
    resolveMemberDisplay(uids, { myUid: currentUid, namesFallback: names })
      .then((m) => { if (alive) setCDisplay(m || {}); }).catch(() => {});
    return () => { alive = false; };
  }, [cAuthorKey, currentUid]);

  // 평면 댓글 → 스레드(최상위 + 대댓글)
  const comments = useMemo(() => {
    const deco = (c) => {
      const d = cDisplay[c.authorUid] || {};
      const name = d.name || names[c.authorUid] || '친구';
      const likedBy = c.likedBy || [];
      return { id: c.id, authorUid: c.authorUid, body: c.body || '', time: fmtTime(c.createdAt),
        name, n: name.charAt(0), c: colorOf(c.authorUid), uri: d.avatarUri || null, parentId: c.parentId || null,
        liked: !!currentUid && likedBy.includes(currentUid), likeCount: likedBy.length };
    };
    const all = (commentDocs || []).map(deco);
    const tops = all.filter((c) => !c.parentId);
    return tops.map((t) => ({ ...t, replies: all.filter((r) => r.parentId === t.id) }));
  }, [commentDocs, cDisplay, names, currentUid]);

  const count = (commentDocs || []).length;

  const openProfile = (person) => {
    const uid = person?.authorUid || person?.id;
    if (uid && uid !== currentUid) setProfileFor({ ...person, uid });
  };
  // 댓글·대댓글 좋아요 토글 — 실시간 구독이라 즉시 반영. 현재 상태 반대만(헛쓰기 방지).
  const toggleLike = (cm) => {
    if (!currentUid || !crewId || !postId) return;
    toggleCommentLike(crewId, postId, cm.id, currentUid, !cm.liked)
      .catch((e) => { if (__DEV__) console.warn('[crewComment] like', e?.code, e?.message); });
  };
  const confirmDelete = () => {
    const a = actionFor; setActionFor(null);
    if (!a) return;
    // 삭제 대상이 '최신 댓글'이면 피드 미리보기 재계산용 newLatest 산출(이미 로드된 목록 사용 — 추가 read 0)
    let newLatest;
    const docs = commentDocs || [];
    if (docs.length && docs[docs.length - 1].id === a.id) {
      const prev = docs.length >= 2 ? docs[docs.length - 2] : null;
      newLatest = prev ? { by: prev.authorUid, text: prev.body || '', at: prev.createdAt || null } : null;
    }
    showAppAlert('댓글을 삭제할까요?', '이 댓글이 삭제돼요.', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: async () => {
        try { await deleteCrewComment(crewId, postId, a.id, { newLatest }); }
        catch (e) { if (__DEV__) console.warn('[crewComment] delete', e?.code, e?.message); }
      } },
    ]);
  };
  const reportAction = () => {
    const a = actionFor; setActionFor(null);
    if (!a) return;
    setReportTarget({ id: a.authorUid, name: a.name, evidence: a.text ? `[크루 댓글] ${a.text}` : '' });
  };
  const startEdit = () => {
    const a = actionFor; setActionFor(null);
    if (!a) return;
    setReplyTo(null); setCErr(''); setEditingComment({ id: a.id }); setDraft(a.text || '');
  };
  const sendComment = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    if (containsProfanity(body)) { setCErr(PROFANITY_BLOCK_MESSAGE); return; }
    if (!currentUid || !crewId || !postId) return;
    if (editingComment) {
      const { id } = editingComment;
      const isLatest = (commentDocs || []).length > 0 && commentDocs[commentDocs.length - 1].id === id;
      setDraft(''); setCErr(''); setEditingComment(null); setSending(true);
      try { await editCrewComment(crewId, postId, id, { body, isLatest }); }
      catch (e) { if (__DEV__) console.warn('[crewComment] editComment', e?.code, e?.message); setDraft(body); setEditingComment({ id }); }
      finally { setSending(false); }
      return;
    }
    const parentId = replyTo?.id || null;
    setDraft(''); setCErr(''); setReplyTo(null); setSending(true);
    try { await addCrewComment(crewId, postId, { authorUid: currentUid, body, parentId }); }
    catch (e) { if (__DEV__) console.warn('[crewComment] addComment', e?.code, e?.message); setDraft(body); }
    finally { setSending(false); }
  };

  const media = post?.media || [];

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
        <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(17), color: INK, marginLeft: 6 }}>댓글{count > 0 ? ` ${count}` : ''}</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }}
        showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* 원글 요약 — 어느 글에 댓글 다는지 상단 고정 카드 */}
        <View style={{ backgroundColor: CARD, paddingHorizontal: 14, paddingTop: 13, paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: LINE }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <MiniAvatar n={post?.author?.n} c={post?.author?.c} uri={post?.author?.uri} size={32} onPress={() => openProfile(post?.author)} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: INK }}>{post?.author?.name || '친구'}</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: SUB, marginTop: 1 }}>{post?.time || ''}</Text>
            </View>
          </View>
          {!!post?.text && (
            <LinkText style={{ fontFamily: F.sysM, fontSize: fs(15.5), color: INK, marginTop: 10, lineHeight: fs(22) }}>{post.text}</LinkText>
          )}
          {media.length > 0 && (
            <View style={{ marginTop: 11 }}>
              {media.length === 1 ? (
                <TouchableOpacity activeOpacity={0.95} onPress={() => setViewer({ media, index: 0 })}>
                  <FeedMedia m={media[0]} />
                </TouchableOpacity>
              ) : (
                <SwipeCarousel media={media} width={winW - 28} onOpen={(mi) => setViewer({ media, index: mi })} />
              )}
            </View>
          )}
        </View>

        {/* 댓글 목록 */}
        <View style={{ paddingHorizontal: 14, paddingTop: 14 }}>
          {commentDocs === null ? (
            <View style={{ paddingVertical: 24, alignItems: 'center' }}><ActivityIndicator color={SAGE_DEEP} /></View>
          ) : comments.length === 0 ? (
            <Text style={{ fontFamily: F.sys, fontSize: fs(13.5), color: SUB, paddingVertical: 10 }}>첫 댓글을 남겨보세요.</Text>
          ) : comments.map((cm, ci) => (
            // 댓글 사이 구분선 + 여백 — 댓글이 안 갈리던 것 보강(첫 댓글은 상단 선 생략)
            <View key={cm.id} style={{ paddingBottom: 14,
              borderTopWidth: ci === 0 ? 0 : 0.5, borderTopColor: LINE, paddingTop: ci === 0 ? 0 : 14 }}>
              <View style={{ flexDirection: 'row' }}>
                <MiniAvatar n={cm.n} c={cm.c} uri={cm.uri} size={30} onPress={() => openProfile(cm)} />
                <View style={{ flex: 1, marginLeft: 9 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(13.5), color: INK }}>{cm.name}</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: SUB, marginLeft: 8 }}>{cm.time}</Text>
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }} style={{ paddingHorizontal: 4 }}
                      onPress={() => setActionFor({ id: cm.id, authorUid: cm.authorUid, name: cm.name, text: cm.body })}>
                      <Text style={{ fontSize: fs(17), color: SUB }}>⋯</Text>
                    </TouchableOpacity>
                  </View>
                  <LinkText style={{ fontFamily: F.sys, fontSize: fs(15.5), color: INK, marginTop: 2, lineHeight: fs(21) }}>{cm.body}</LinkText>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5 }}>
                    <TouchableOpacity onPress={() => toggleLike(cm)} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                      style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Icon name={cm.liked ? 'heartFilled' : 'heart'} size={fs(15)} color={cm.liked ? HEART_RED : SUB} strokeWidth={1.9} />
                      {cm.likeCount > 0 && <Text style={{ fontFamily: F.sysM, fontSize: fs(11.5), color: SUB, marginLeft: 4 }}>{cm.likeCount}</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { if (editingComment) { setEditingComment(null); setDraft(''); } setReplyTo({ id: cm.id, name: cm.name }); }}
                      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }} style={{ marginLeft: 16 }}>
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(11.5), color: SAGE_DEEP }}>답글</Text>
                    </TouchableOpacity>
                  </View>
                  {/* 대댓글 */}
                  {(cm.replies || []).map((r) => (
                    <View key={r.id} style={{ flexDirection: 'row', marginTop: 10 }}>
                      <MiniAvatar n={r.n} c={r.c} uri={r.uri} size={26} onPress={() => openProfile(r)} />
                      <View style={{ flex: 1, marginLeft: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: INK }}>{r.name}</Text>
                          <Text style={{ fontFamily: F.sys, fontSize: fs(10.5), color: SUB, marginLeft: 8 }}>{r.time}</Text>
                          <View style={{ flex: 1 }} />
                          <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }} style={{ paddingHorizontal: 4 }}
                            onPress={() => setActionFor({ id: r.id, authorUid: r.authorUid, name: r.name, text: r.body })}>
                            <Text style={{ fontSize: fs(15), color: SUB }}>⋯</Text>
                          </TouchableOpacity>
                        </View>
                        <LinkText style={{ fontFamily: F.sys, fontSize: fs(15), color: INK, marginTop: 2, lineHeight: fs(20) }}>{r.body}</LinkText>
                        <TouchableOpacity onPress={() => toggleLike(r)} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                          style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, alignSelf: 'flex-start' }}>
                          <Icon name={r.liked ? 'heartFilled' : 'heart'} size={fs(14)} color={r.liked ? HEART_RED : SUB} strokeWidth={1.9} />
                          {r.likeCount > 0 && <Text style={{ fontFamily: F.sysM, fontSize: fs(11), color: SUB, marginLeft: 4 }}>{r.likeCount}</Text>}
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* 입력바 — 하단 고정, 키보드 높이만큼 들어올림 */}
      <Animated.View style={[{ backgroundColor: BG, borderTopWidth: 0.5, borderTopColor: LINE }, kbPadStyle]}>
        {editingComment && (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 6, backgroundColor: 'rgba(94,126,66,0.1)' }}>
            <Text style={{ flex: 1, fontFamily: F.sysM, fontSize: fs(12), color: SAGE_DEEP }}>댓글 수정 중</Text>
            <TouchableOpacity onPress={() => { setEditingComment(null); setDraft(''); setCErr(''); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: SUB }}>취소</Text>
            </TouchableOpacity>
          </View>
        )}
        {replyTo && !editingComment && (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 6, backgroundColor: 'rgba(94,126,66,0.1)' }}>
            <Text style={{ flex: 1, fontFamily: F.sysM, fontSize: fs(12), color: SAGE_DEEP }}>{replyTo.name}님에게 답글</Text>
            <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: SUB }}>취소</Text>
            </TouchableOpacity>
          </View>
        )}
        {!!cErr && <Text style={{ color: '#B23B3B', fontFamily: F.sys, fontSize: fs(11.5), paddingHorizontal: 14, paddingBottom: 2 }}>{cErr}</Text>}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 8, paddingBottom: BAR_PAD }}>
          <TextInput value={draft} onChangeText={(t) => { setDraft(t); if (cErr) setCErr(''); }} maxLength={300}
            allowFontScaling={false} placeholder={editingComment ? '댓글 수정…' : (replyTo ? `${replyTo.name}님에게 답글…` : '댓글 달기…')}
            placeholderTextColor={SUB} returnKeyType="send" onSubmitEditing={sendComment} blurOnSubmit={false}
            style={{ flex: 1, backgroundColor: CARD, borderRadius: 22, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11,
              fontFamily: F.sys, fontSize: fs(16), color: INK, borderWidth: 0.5, borderColor: LINE, marginRight: 8 }} />
          <TouchableOpacity onPress={sendComment} disabled={!draft.trim()} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }} style={{ padding: 6 }}>
            <Icon name="paperPlane" size={fs(30)} color={draft.trim() ? SAGE_DEEP : 'rgba(94,126,66,0.4)'} strokeWidth={1.9} />
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* 프로필 탭 → DM 팝업(중앙 카드) — 앨범과 동일 */}
      {profileFor && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <TouchableOpacity activeOpacity={1} onPress={() => setProfileFor(null)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(26,61,82,0.45)' }} />
          <View style={{ width: 250, backgroundColor: CARD, borderRadius: 20, paddingTop: 22, paddingBottom: 18, paddingHorizontal: 18, alignItems: 'center',
            shadowColor: '#1A3D52', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 }}>
            <MiniAvatar n={profileFor.n} c={profileFor.c} uri={profileFor.uri} size={84} />
            <Text style={{ fontFamily: F.sysB, fontSize: fs(18), color: INK, marginTop: 12 }} numberOfLines={1}>{profileFor.name}</Text>
            {(!friends || friendSet.has(profileFor.uid)) ? (
              <TouchableOpacity activeOpacity={0.85} onPress={() => { const x = profileFor; setProfileFor(null); onOpenDM?.(x.uid, x.name, x.uri); }}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 18, alignSelf: 'stretch',
                  backgroundColor: SAGE_DEEP, borderRadius: 12, paddingVertical: 13 }}>
                <Icon name="send" size={fs(20)} color="#fff" strokeWidth={1.9} />
                <Text style={{ fontFamily: F.sysB, fontSize: fs(15.5), color: '#fff', marginLeft: 8 }}>메시지 보내기</Text>
              </TouchableOpacity>
            ) : sentSet.has(profileFor.uid) ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 18, alignSelf: 'stretch',
                backgroundColor: 'rgba(26,61,82,0.08)', borderRadius: 12, paddingVertical: 13 }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(15.5), color: SUB }}>친구 신청됨</Text>
              </View>
            ) : (
              <TouchableOpacity activeOpacity={0.85} onPress={() => requestFriend(profileFor.uid)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 18, alignSelf: 'stretch',
                  backgroundColor: SAGE_DEEP, borderRadius: 12, paddingVertical: 13 }}>
                <Icon name="personAdd" size={fs(20)} color="#fff" strokeWidth={1.9} />
                <Text style={{ fontFamily: F.sysB, fontSize: fs(15.5), color: '#fff', marginLeft: 8 }}>친구 신청</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* 더보기 — 내 댓글=수정·삭제, 남의 것=신고 */}
      {actionFor && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <TouchableOpacity activeOpacity={1} onPress={() => setActionFor(null)} style={{ flex: 1, backgroundColor: 'rgba(26,61,82,0.35)' }} />
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: CARD, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 8, paddingBottom: 30 + insets.bottom }}>
            {actionFor.authorUid === currentUid ? (
              <>
              <TouchableOpacity onPress={startEdit} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16 }}>
                <Text style={{ fontFamily: F.sysM, fontSize: fs(16), color: INK }}>댓글 수정</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmDelete} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16, borderTopWidth: 0.5, borderTopColor: LINE }}>
                <Text style={{ fontFamily: F.sysM, fontSize: fs(16), color: '#B23B3B' }}>댓글 삭제</Text>
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

      {/* 원글 미디어 풀스크린 뷰어 */}
      {viewer && (
        <PhotoViewer photos={viewer.media} startIndex={viewer.index} allowSave onClose={() => setViewer(null)} />
      )}

      {/* 신고 */}
      <ReportModal visible={!!reportTarget}
        presetTarget={reportTarget ? { id: reportTarget.id, name: reportTarget.name } : null}
        prefillEvidence={reportTarget?.evidence || ''}
        onClose={() => setReportTarget(null)} />

      <AppAlertHost />
    </SafeAreaView>
    </KeyboardProvider>
    </SafeAreaProvider>
  );
}
