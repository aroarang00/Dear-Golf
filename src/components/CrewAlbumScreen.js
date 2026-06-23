import React, { useState, useRef, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, RefreshControl, useWindowDimensions, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView, SafeAreaProvider, useSafeAreaInsets, initialWindowMetrics } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Animated, { SlideInRight } from 'react-native-reanimated';
import { F, fs } from '../constants/colors';
import { Icon } from './common/Icon';
import { useScreenBack } from '../hooks/useScreenBack';
import { useCurrentUid } from '../contexts/CurrentUidContext';
import {
  subscribeCrew, subscribeCrewPosts, deleteCrewPost, setCrewNotice,
} from '../utils/crews';
import { resolveMemberDisplay, loadMyFriendsEnriched, loadSentRequests, sendFriendRequest } from '../utils/friends';
import { storage, STORAGE_KEYS } from '../utils/storage';
import { CrewComposeScreen } from './CrewComposeScreen';
import { CrewMembersScreen } from './CrewMembersScreen';
import { CrewCommentScreen } from './CrewCommentScreen';
import { CrewInviteSheet } from './CrewInviteSheet';
import { PhotoViewer } from './common/PhotoViewer';
import { ReportModal } from './ReportModal';
import { AppAlertHost, showAppAlert } from './AppAlert';

// 크루 앨범 — 리스트에서 크루 탭 시 진입 (docs/crew-space-design.md §3.1).
//  ★상세화면 폐지 — 피드 카드에서 바로 댓글 펼치기·작성/수정/삭제·신고까지 인라인 처리(2026-06-23 개편).
//  게시글 + 갤러리 토글: 게시글=글·사진·영상 카드, 갤러리=미디어만 그리드. 댓글은 카드 펼침(게시물별, 실시간).
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

// 가로세로비 범위 — 일반 사진(세로 9:16 ~ 가로 1.91:1)은 통째로 보이고, 극단 비율만 살짝 보정
const clampAR = (ar) => (ar && isFinite(ar)) ? Math.max(0.56, Math.min(1.91, ar)) : null;

// 단일 미디어 — 원본 비율 그대로 표시(정사각 강제 X). ar 없으면 onLoad로 알아내 보정(레거시·문자열 항목 대응).
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

// 여러 장 — 풀폭 스와이프 캐러셀. 한 장씩 꽉 차게 넘겨보고, 각 사진은 안 잘리게(contain) 통째로. 하단 페이지 점.
//   캐러셀 높이는 첫 장 비율 기준(보통 한 게시물은 방향이 비슷) — 다른 비율은 여백 두고 전체 표시.
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
      {/* 우상단 장수 뱃지 — 점 대신(10장이어도 깔끔). 예: 3/10 */}
      {media.length > 1 && (
        <View style={{ position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 11, paddingHorizontal: 9, paddingVertical: 3 }}>
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(11.5), color: '#fff' }}>{page + 1}/{media.length}</Text>
        </View>
      )}
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
  const [inviteOpen, setInviteOpen] = useState(false);    // 사람+ = 친구 초대 시트(현재 화면 위에 바로)
  const [editingPost, setEditingPost] = useState(null);   // 작성화면 재사용(수정)
  const [editingNotice, setEditingNotice] = useState(false); // 공지 수정(작성화면 공지모드)
  const [commentPost, setCommentPost] = useState(null);   // 댓글 화면 열린 게시물(글별 분리)

  const [crewDoc, setCrewDoc] = useState(crew?._doc || null);
  const [postDocs, setPostDocs] = useState(null);   // null=로딩
  const [display, setDisplay] = useState({});       // uid→{name,avatarUri,self}
  const [noticeExpanded, setNoticeExpanded] = useState(false);
  const [noticeClamped, setNoticeClamped] = useState(false);  // 공지가 실제로 2줄 넘는지(숨김 측정) — 무의미한 '더보기' 방지
  const scrollRef = useRef(null);
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = () => { setRefreshing(true); setTimeout(() => setRefreshing(false), 600); }; // 실시간 구독이라 표시만(당김 UX 유지)

  // 오버레이(앨범 루트)
  const [profileFor, setProfileFor] = useState(null);      // 프로필 탭 → DM 팝업
  const [actionFor, setActionFor] = useState(null);        // 더보기 { kind, id, postId?, authorUid, name, text, post? }
  const [reportTarget, setReportTarget] = useState(null);  // 신고 { id, name, evidence }
  const [viewer, setViewer] = useState(null);              // 풀스크린 뷰어 { media, index, caption }
  // 친구 여부 — 크루 멤버는 서로 친구 아닐 수 있음. 프로필 팝업서 친구=DM / 비친구=친구신청 분기(비친구 DM은 규칙상 막힘).
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
    catch (e) { if (__DEV__) console.warn('[crewAlbum] friendReq', e?.code, e?.message); }
  };

  // 안드 뒤로 — 떠 있는 것부터 닫고, 없으면 앨범 닫기(목록으로). 모달 다단계 위임은 useScreenBack이 처리
  useScreenBack(true, () => {
    if (viewer) { setViewer(null); return; }
    if (reportTarget) { setReportTarget(null); return; }
    if (profileFor) { setProfileFor(null); return; }
    if (actionFor) { setActionFor(null); return; }
    if (inviteOpen) { setInviteOpen(false); return; }
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
  const namesSig = useMemo(() => JSON.stringify(crewDoc?.names || {}), [crewDoc]); // names 변경 시 resolve 재실행용(폴백 이름 stale 방지)

  // 멤버 + 작성자 표시정보 resolve(보는 사람 별명 우선)
  const authorKey = useMemo(() => (postDocs || []).map((p) => p.authorUid).join(','), [postDocs]);
  useEffect(() => {
    const uids = [...new Set([...memberUids, ...(postDocs || []).map((p) => p.authorUid)].filter(Boolean))];
    if (!uids.length) { setDisplay({}); return; }
    let alive = true;
    resolveMemberDisplay(uids, { myUid: currentUid, namesFallback }).then((m) => { if (alive) setDisplay(m || {}); }).catch(() => {});
    return () => { alive = false; };
  }, [memberUids.join(','), authorKey, currentUid, namesSig]);

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

  // ── 동작 ──
  const openProfile = (person) => {
    const uid = person?.authorUid || person?.id;
    if (uid && uid !== currentUid) setProfileFor({ ...person, uid });
  };
  const confirmDelete = () => {
    const a = actionFor; setActionFor(null);
    if (!a) return;
    if (a.kind === 'notice') {
      showAppAlert('공지를 삭제할까요?', '상단 공지가 사라져요.', [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: async () => {
          try { await setCrewNotice(crewId, '', currentUid); }
          catch (e) { if (__DEV__) console.warn('[crewAlbum] deleteNotice', e?.code, e?.message); }
        } },
      ]);
      return;
    }
    // 게시물 삭제(공지는 위에서 처리). 댓글 삭제는 댓글 화면에서.
    showAppAlert('게시물을 삭제할까요?', '사진·글·댓글이 모두 삭제돼요.', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: async () => {
        try { await deleteCrewPost(crewId, a.id); if (commentPost?.id === a.id) setCommentPost(null); }
        catch (e) { if (__DEV__) console.warn('[crewAlbum] delete', e?.code, e?.message); }
      } },
    ]);
  };
  const reportAction = () => {
    const a = actionFor; setActionFor(null);
    if (!a) return;
    setReportTarget({ id: a.authorUid, name: a.name, evidence: a.text ? `[크루 게시물] ${a.text}` : '' });
  };
  const startEdit = () => {
    const a = actionFor; setActionFor(null);
    if (!a) return;
    if (a.kind === 'notice') { setEditingNotice(true); return; }
    setEditingPost(a.post);   // 게시물 수정
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
  if (editingNotice) return (
    <Animated.View style={{ flex: 1 }} entering={SlideInRight.duration(230)}>
      <CrewComposeScreen crew={crew} noticeText={notice} onClose={() => setEditingNotice(false)} />
    </Animated.View>
  );
  if (membersOpen) return (
    <Animated.View style={{ flex: 1 }} entering={SlideInRight.duration(230)}>
      <CrewMembersScreen crew={crew}
        onClose={() => setMembersOpen(false)}
        onLeave={() => { setMembersOpen(false); onClose(); }} onOpenDM={onOpenDM} />
    </Animated.View>
  );
  if (commentPost) return (
    <Animated.View style={{ flex: 1 }} entering={SlideInRight.duration(230)}>
      <CrewCommentScreen crew={crew} post={commentPost} names={crewDoc?.names || {}}
        onClose={() => setCommentPost(null)} onOpenDM={onOpenDM} />
    </Animated.View>
  );

  // 사진 탭 — 모든 게시물의 미디어를 펼친 그리드
  const PAD = 12, GAP = 4, COLS = 3;
  const cell = Math.floor((winW - PAD * 2 - GAP * (COLS - 1)) / COLS);
  const tiles = posts.flatMap((p) => (p.media || []).map((m, mi) => ({ ...m, postId: p.id, mi, key: `${p.id}_${mi}` })));
  const loading = postDocs === null;

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      {/* 헤더 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12,
        borderBottomWidth: 0.5, borderBottomColor: LINE }}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ padding: 4 }}>
          <Text style={{ fontSize: fs(26), color: SAGE_DEEP, fontWeight: '600' }}>←</Text>
        </TouchableOpacity>
        {/* 별명(나만 보기) 우선 — 목록서 넘어온 crew.name=별명∥서버명. 서버 name은 불변이라 live crewDoc보다 우선 안전 */}
        <Text style={{ flexShrink: 1, fontFamily: F.sysB, fontSize: fs(18), color: INK, marginLeft: 6 }}
          numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>{crew?.name || crewDoc?.name || '크루'}</Text>
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
        {/* 사람+ = 순수 초대(멤버 목록은 좌측 아바타 탭). 친구 초대 시트를 현재 화면 위에 바로 띄움 */}
        <TouchableOpacity onPress={() => setInviteOpen(true)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ padding: 4 }}>
          <Icon name="personAdd" size={fs(27)} color={SAGE_DEEP} strokeWidth={2.2} />
        </TouchableOpacity>
      </View>

      {/* 피드/사진 토글 — 고정 바(ScrollView 밖) */}
      <View style={{ backgroundColor: BG, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 0.5, borderBottomColor: LINE }}>
        <View style={{ flexDirection: 'row', marginHorizontal: 14,
          backgroundColor: 'rgba(26,61,82,0.08)', borderRadius: 11, padding: 3 }}>
          {[['feed', '게시글'], ['photos', '갤러리']].map(([t, label]) => (
            <TouchableOpacity key={t} onPress={() => setTab(t)} activeOpacity={0.85} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              style={{ flex: 1, paddingVertical: Platform.OS === 'android' ? 7 : 10, borderRadius: 9, alignItems: 'center', backgroundColor: tab === t ? SAGE_DEEP : 'transparent' }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: tab === t ? '#fff' : SUB }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 일반 ScrollView — 댓글 입력은 하단 고정바가 키보드 위로 올라옴(KAS 자동스크롤이 안드서 안 먹어 교체) */}
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 90 }}
        showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={SAGE_DEEP} colors={[SAGE_DEEP]} />}>

        {/* 공지(스크롤로 흘러감, 길면 더보기). 작성자 본인에게만 ⋯ 수정·삭제 */}
        {!!notice && (
          <View style={{ paddingHorizontal: 14, paddingTop: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', backgroundColor: CARD, borderRadius: 12,
              paddingHorizontal: 12, paddingVertical: 10, borderWidth: 0.5, borderColor: LINE }}>
              <Text style={{ fontSize: fs(13), marginRight: 8, marginTop: 1 }}>📌</Text>
              <View style={{ flex: 1 }}>
                {/* 숨김 측정용 — 클램프 없이 실제 줄 수 파악(2줄 초과면 '더보기' 노출). 글꼴은 본문과 동일해야 측정 정확(absolute·opacity0) */}
                <Text style={{ position: 'absolute', opacity: 0, fontFamily: F.sysSb, fontSize: fs(12.5), lineHeight: fs(19) }}
                  onTextLayout={(e) => { const over = (e.nativeEvent.lines?.length || 0) > 2; if (over !== noticeClamped) setNoticeClamped(over); }}>{notice}</Text>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: INK, lineHeight: fs(19) }}
                  numberOfLines={noticeExpanded ? undefined : 2}>{notice}</Text>
                {(noticeClamped || noticeExpanded) && (
                  <TouchableOpacity onPress={() => setNoticeExpanded((v) => !v)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={{ marginTop: 5, alignSelf: 'flex-start' }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: SAGE_DEEP }}>{noticeExpanded ? '접기' : '더보기'}</Text>
                  </TouchableOpacity>
                )}
              </View>
              {crewDoc?.noticeBy === currentUid && (
                <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ paddingHorizontal: 4, marginLeft: 4, marginTop: -2 }}
                  onPress={() => setActionFor({ kind: 'notice', authorUid: currentUid, name: '공지' })}>
                  <Text style={{ fontSize: fs(18), color: SUB }}>⋯</Text>
                </TouchableOpacity>
              )}
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
          // ── 게시글: 카드(작성자·글·미디어). 댓글은 카드 탭=게시글별 댓글 화면 ──
          posts.map((p) => {
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
                      <FeedMedia m={p.media[0]} />
                    </TouchableOpacity>
                  ) : (
                    <SwipeCarousel media={p.media} width={winW - 54} onOpen={(mi) => setViewer({ media: p.media, index: mi })} />
                  )}
                </View>
              )}
              {/* 댓글 — 탭하면 게시글별 댓글 화면(원글+댓글+입력 한 덩어리) */}
              <TouchableOpacity onPress={() => setCommentPost(p)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ flexDirection: 'row', alignItems: 'center', marginTop: 11 }}>
                <Text style={{ fontFamily: F.sysM, fontSize: fs(12.5), color: SUB }}>
                  💬 {p.comments > 0 ? `댓글 ${p.comments}` : '댓글 달기'}
                </Text>
                <Text style={{ fontSize: fs(11), color: SUB, marginLeft: 6, marginTop: -1 }}>›</Text>
              </TouchableOpacity>
            </View>
            );
          })
        ) : (
          // ── 사진: 미디어만 그리드 → 탭하면 풀스크린 뷰어 ──
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: PAD }}>
            {tiles.map((t, i) => (
              <TouchableOpacity key={t.key} activeOpacity={0.8}
                onPress={() => setViewer({ media: tiles, index: i })}
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
      </ScrollView>

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
            {/* 친구=메시지 보내기(DM) / 비친구=친구 신청 — 비친구 DM은 규칙상 전송 막힘. friends 로드 전엔 DM 폴백(보통 친구) */}
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

      {/* 더보기 — 내 것=수정·삭제, 남의 것=신고 */}
      {actionFor && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <TouchableOpacity activeOpacity={1} onPress={() => setActionFor(null)} style={{ flex: 1, backgroundColor: 'rgba(26,61,82,0.35)' }} />
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: CARD, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 8, paddingBottom: 30 + insets.bottom }}>
            {actionFor.authorUid === currentUid ? (
              <>
              <TouchableOpacity onPress={startEdit} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16 }}>
                <Text style={{ fontFamily: F.sysM, fontSize: fs(16), color: INK }}>{actionFor.kind === 'post' ? '게시물 수정' : actionFor.kind === 'notice' ? '공지 수정' : '댓글 수정'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmDelete} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16, borderTopWidth: 0.5, borderTopColor: LINE }}>
                <Text style={{ fontFamily: F.sysM, fontSize: fs(16), color: '#B23B3B' }}>{actionFor.kind === 'post' ? '게시물 삭제' : actionFor.kind === 'notice' ? '공지 삭제' : '댓글 삭제'}</Text>
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

      {/* 사람+ → 친구 초대 시트(현재 화면 위에 바로) */}
      {inviteOpen && (
        <CrewInviteSheet crewId={crewId} memberUids={memberUids} onClose={() => setInviteOpen(false)} />
      )}

      {/* 크루 모달 위 alert 자체 호스트(삭제 확인 등) */}
      <AppAlertHost />
    </SafeAreaView>
    </SafeAreaProvider>
  );
}
