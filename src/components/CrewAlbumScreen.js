import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, FlatList, StatusBar, RefreshControl, useWindowDimensions, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView, SafeAreaProvider, useSafeAreaInsets, initialWindowMetrics } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Animated, { SlideInRight } from 'react-native-reanimated';
import { F, fs } from '../constants/colors';
import { Icon } from './common/Icon';
import { CrewAvatar } from './common/CrewAvatar';
import { useScreenBack } from '../hooks/useScreenBack';
import { useCurrentUid } from '../contexts/CurrentUidContext';
import {
  subscribeCrew, subscribeCrewPosts, deleteCrewPost, setCrewNotice, togglePostLike,
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
const HEART_RED = '#E5484D';

// 단일 탭=확대(뷰어), 더블 탭=좋아요(인스타 결). 단일은 더블 여부 확인 위해 delay만큼만 지연.
//   gesture-handler 없이 JS 타이머로 — iOS/안드 동일 동작, 풀스크린 모달 중첩과도 무관.
function useDoubleTap(onSingle, onDouble, delay = 250) {
  const lastRef = useRef(0);
  const timerRef = useRef(null);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  return useCallback((...args) => {
    const now = Date.now();
    if (now - lastRef.current < delay) {           // 더블 탭
      lastRef.current = 0;
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      onDouble(...args);
    } else {                                        // 일단 단일 후보 — 두 번째 탭 대기
      lastRef.current = now;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => { timerRef.current = null; onSingle(...args); }, delay);
    }
  }, [onSingle, onDouble, delay]);
}

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
    ? <Image source={{ uri }} style={base} contentFit="cover" transition={Platform.OS === 'android' ? 0 : 200} />
    : (
      <View style={{ ...base, backgroundColor: c, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(size * 0.38), color: '#fff' }}>{n}</Text>
      </View>
    );
  return onPress ? <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{inner}</TouchableOpacity> : inner;
}

// 미디어 타일 — 사진은 uri, 영상은 poster(없으면 uri) + ▶ 오버레이
function MediaTile({ m, style, radius = 12, playSize = 'lg' }) {
  const uri = m?.type === 'video' ? (m.poster || m.uri) : (m?.thumb || m?.uri); // 리스트=썸네일(있으면), 영상=poster
  return (
    <View style={{ ...style, borderRadius: radius, backgroundColor: 'rgba(26,61,82,0.06)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={Platform.OS === 'android' ? 0 : 120} />
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
// 세로 하한 0.8(4:5) — 1:1 정사각은 세로 사진을 가로처럼 눌러 부자연스러워 4:5 세로 비율 허용. 폭의 1.25배로
//   적당히 작게(원래 0.56=1.79배 대비 크게 ↓). 피드는 cover로 꽉, 원본 전체는 탭→풀스크린 뷰어(2026-06-24). 가로 상한 1.91.
const clampAR = (ar) => (ar && isFinite(ar)) ? Math.max(0.8, Math.min(1.91, ar)) : null;

// 사진 로딩 — 빈 회색으로 있다가 툭 나타나지 않게 로딩 중 스피너 + 로드 시 부드러운 페이드(transition).
//   expo-image onLoad/onError로 스피너 숨김(2026-06-24). 부모(회색 박스)가 크기·정렬을 잡고 여기선 채움.
function ImageWithSpinner({ uri, contentFit = 'cover', transition = 220, onLoad }) {
  const [loading, setLoading] = useState(true);
  return (
    <>
      {loading && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={SAGE_DEEP} />
        </View>
      )}
      <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit={contentFit} transition={Platform.OS === 'android' ? 0 : transition}
        onLoad={(e) => { setLoading(false); onLoad?.(e); }} onError={() => setLoading(false)} />
    </>
  );
}

// 단일 미디어 — 원본 비율 그대로 표시(정사각 강제 X). ar 없으면 onLoad로 알아내 보정(레거시·문자열 항목 대응).
function FeedMedia({ m }) {
  const [ar, setAr] = useState(() => clampAR(m?.ar) || 1);
  const uri = m?.type === 'video' ? (m.poster || m.uri) : (m?.thumb || m?.uri); // 피드=썸네일(있으면), 뷰어 확대는 원본

  return (
    <View style={{ width: '100%', aspectRatio: ar, borderRadius: 14, backgroundColor: 'rgba(26,61,82,0.06)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {uri ? <ImageWithSpinner uri={uri}
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
          const uri = m?.type === 'video' ? (m.poster || m.uri) : (m?.thumb || m?.uri); // 캐러셀=썸네일(있으면)
          return (
            <TouchableOpacity key={mi} activeOpacity={0.97} onPress={() => onOpen(mi)}
              style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
              {uri ? <ImageWithSpinner uri={uri}
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

// 피드 카드 미디어 영역 — 단일 탭=풀스크린 뷰어, 더블 탭=좋아요. 더블탭 시 가운데 큰 하트 잠깐.
//   useDoubleTap이 훅이라 renderItem 안에서 못 부름 → 별도 컴포넌트로 분리.
function PostMedia({ media, width, onOpen, onDoubleLike, burst }) {
  const handleTap = useDoubleTap((mi) => onOpen(mi), () => onDoubleLike());
  return (
    <View>
      {media.length === 1 ? (
        <TouchableOpacity activeOpacity={0.95} onPress={() => handleTap(0)}>
          <FeedMedia m={media[0]} />
        </TouchableOpacity>
      ) : (
        <SwipeCarousel media={media} width={width} onOpen={(mi) => handleTap(mi)} />
      )}
      {burst && (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="heartFilled" size={fs(78)} color={HEART_RED} />
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
  const [noticeLineCount, setNoticeLineCount] = useState(0);  // 한 줄 공지는 가운데 정렬용(2026-06-24)
  const [contentReady, setContentReady] = useState(false);    // 슬라이드 전환 끝난 뒤 본문(FlatList) 마운트 — 안드 진입 뻑뻑 방지
  const scrollRef = useRef(null);
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = () => { setRefreshing(true); setTimeout(() => setRefreshing(false), 600); }; // 실시간 구독이라 표시만(당김 UX 유지)

  // 오버레이(앨범 루트)
  const [profileFor, setProfileFor] = useState(null);      // 프로필 탭 → DM 팝업
  const [actionFor, setActionFor] = useState(null);        // 더보기 { kind, id, postId?, authorUid, name, text, post? }
  const [reportTarget, setReportTarget] = useState(null);  // 신고 { id, name, evidence }
  const [viewer, setViewer] = useState(null);              // 풀스크린 뷰어 { media, index, caption }
  const [likersFor, setLikersFor] = useState(null);        // 좋아요 누른 사람 목록 { count, members:[{n,c,uri,name}] }
  const [burstId, setBurstId] = useState(null);            // 더블탭 좋아요 시 큰 하트 잠깐 표시(게시물 id)
  const burstTimer = useRef(null);
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
    if (likersFor) { setLikersFor(null); return; }
    if (reportTarget) { setReportTarget(null); return; }
    if (profileFor) { setProfileFor(null); return; }
    if (actionFor) { setActionFor(null); return; }
    if (inviteOpen) { setInviteOpen(false); return; }
    onClose();
  });

  // 진입 슬라이드(CrewListScreen SlideInRight 230ms)가 도는 동안 무거운 FlatList+이미지가 같은 프레임에 마운트되면
  //   안드서 전환이 뻑뻑함 → 전환 끝난 뒤 본문 마운트(슬라이드 매끄럽게 + 내용 한 번에 등장). iOS도 무해.
  useEffect(() => {
    const t = setTimeout(() => setContentReady(true), 250);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => () => { if (burstTimer.current) clearTimeout(burstTimer.current); }, []);

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
  // 권한 — 크루장(creatorUid) / 운영진(adminUids). 공지·게시물·댓글 삭제는 staff(크루장+운영진)가 할 수 있음.
  const iAmMaster = !!currentUid && currentUid === crewDoc?.creatorUid;
  const iAmStaff = iAmMaster || (!!currentUid && (crewDoc?.adminUids || []).includes(currentUid));

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
    const likedBy = p.likedBy || [];
    const lcBy = p.lastCommentBy || null;
    const lcName = lcBy ? ((display[lcBy] || {}).name || namesFallback[lcBy] || '친구') : '';
    return {
      id: p.id,
      author: { id: p.authorUid, name, n: name.charAt(0), c: colorOf(p.authorUid), uri: d.avatarUri || null },
      time: fmtTime(p.createdAt), text: p.text || '', media: p.media || [], comments: p.commentCount || 0,
      likedBy, liked: !!currentUid && likedBy.includes(currentUid), likeCount: likedBy.length,
      lastCommentText: p.lastCommentText || '', lastCommentName: lcName,
      _doc: p,
    };
  }), [postDocs, display, currentUid]);

  // 피드 사진 미리 받기 — 첫 화면 몇 장만. 전체 원본을 한꺼번에 prefetch하면 사진 많은 크루 진입 시
  //   네트워크·디코드 폭주로 버벅임(가상화와 별개로 prefetch가 전량을 깨움). 6장으로 제한(2026-06-24 성능).
  useEffect(() => {
    const uris = posts.flatMap((p) => (p.media || []).map((m) => (m?.type === 'video' ? m?.poster : (m?.thumb || m?.uri)))).filter(Boolean).slice(0, 6);
    if (uris.length) Image.prefetch(uris, { cachePolicy: 'memory-disk' });
  }, [posts]);

  // 갤러리 타일 — 모든 게시물 미디어를 펼친 평면 배열(가상화 data·풀스크린 뷰어 공용). early-return 위에서 메모.
  const tiles = useMemo(
    () => posts.flatMap((p) => (p.media || []).map((m, mi) => ({ ...m, postId: p.id, mi, key: `${p.id}_${mi}` }))),
    [posts]);

  // ── 동작 ──
  const openProfile = (person) => {
    const uid = person?.authorUid || person?.id;
    if (uid && uid !== currentUid) setProfileFor({ ...person, uid });
  };
  // 좋아요 토글 — 실시간 구독(로컬 즉시반영)이라 별도 낙관 상태 불필요. 헛쓰기 방지로 현재 상태 반대만.
  const toggleLike = (p) => {
    if (!currentUid || !crewId) return;
    togglePostLike(crewId, p.id, currentUid, !p.liked)
      .catch((e) => { if (__DEV__) console.warn('[crewAlbum] like', e?.code, e?.message); });
  };
  // 사진 더블탭 — 항상 '좋아요'(취소 아님, 멱등). 가운데 큰 하트 잠깐 표시.
  const likeOnDouble = (p) => {
    if (!currentUid || !crewId) return;
    setBurstId(p.id);
    if (burstTimer.current) clearTimeout(burstTimer.current);
    burstTimer.current = setTimeout(() => setBurstId(null), 650);
    if (!p.liked) togglePostLike(crewId, p.id, currentUid, true)
      .catch((e) => { if (__DEV__) console.warn('[crewAlbum] like2', e?.code, e?.message); });
  };
  // 좋아요 누른 사람 목록 — likedBy uid를 별명/아바타로 resolve(이미 받아둔 display + 폴백)
  const openLikers = (p) => {
    if (!p.likeCount) return;
    const list = (p.likedBy || []).map((u) => {
      const d = display[u] || {};
      const name = d.name || namesFallback[u] || '친구';
      return { id: u, name, n: name.charAt(0), c: colorOf(u), uri: d.avatarUri || null };
    });
    setLikersFor({ count: p.likeCount, members: list });
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
      <CrewComposeScreen crew={crew} canNotice={iAmStaff} onClose={() => setComposeOpen(false)} />
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
  const loading = postDocs === null;

  // ── FlatList 렌더 헬퍼 (가상화: 보이는 것만 마운트→이미지도 보이는 것만 로드) ──
  // 헤더 = 공지(있을 때만). 토글 바는 리스트 밖 고정.
  const renderHeader = () => (!notice ? null : (
    <View style={{ paddingHorizontal: 14, paddingBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: noticeLineCount === 1 ? 'center' : 'flex-start', backgroundColor: '#F5ECD6', borderRadius: 12,
        paddingHorizontal: 12, paddingVertical: 10, borderWidth: 0.5, borderColor: 'rgba(150,120,60,0.25)', borderLeftWidth: 3, borderLeftColor: SAGE_DEEP }}>
        <Text style={{ fontSize: fs(13), marginRight: 8, marginTop: 1 }}>📌</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ position: 'absolute', opacity: 0, fontFamily: F.sysSb, fontSize: fs(12.5), lineHeight: fs(19) }}
            onTextLayout={(e) => { const n = e.nativeEvent.lines?.length || 0; const over = n > 2; if (over !== noticeClamped) setNoticeClamped(over); if (n !== noticeLineCount) setNoticeLineCount(n); }}>{notice}</Text>
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: INK, lineHeight: fs(19) }}
            numberOfLines={noticeExpanded ? undefined : 2}>{notice}</Text>
          {(noticeClamped || noticeExpanded) && (
            <TouchableOpacity onPress={() => setNoticeExpanded((v) => !v)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={{ marginTop: 5, alignSelf: 'flex-start' }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: SAGE_DEEP }}>{noticeExpanded ? '접기' : '더보기'}</Text>
            </TouchableOpacity>
          )}
        </View>
        {/* 공지 관리 — 크루장·운영진(staff). authorUid=실제 작성자(noticeBy)로 넘겨 액션시트가 작성자/staff를 구분 */}
        {iAmStaff && (
          <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ paddingHorizontal: 4, marginLeft: 4, marginTop: -2 }}
            onPress={() => setActionFor({ kind: 'notice', authorUid: crewDoc?.noticeBy || null, name: '공지' })}>
            <Text style={{ fontSize: fs(18), color: SUB }}>⋯</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  ));

  const renderEmpty = () => (loading ? (
    <View style={{ paddingTop: 50, alignItems: 'center' }}><ActivityIndicator color={SAGE_DEEP} /></View>
  ) : tab === 'photos' ? (
    <View style={{ width: '100%', alignItems: 'center', paddingTop: 50 }}>
      <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: SUB }}>아직 사진·영상이 없어요.</Text>
    </View>
  ) : (
    <View style={{ paddingTop: 54, alignItems: 'center', paddingHorizontal: 40 }}>
      <Icon name="image" size={fs(34)} color="rgba(26,61,82,0.3)" strokeWidth={1.4} />
      <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: INK, marginTop: 12 }}>아직 올라온 게 없어요</Text>
      <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: SUB, marginTop: 5, textAlign: 'center', lineHeight: fs(19) }}>
        아래 ＋ 버튼으로 사진·영상이나{'\n'}소식을 처음으로 남겨보세요.
      </Text>
    </View>
  ));

  // 게시글 카드 — 작성자·글·미디어. 댓글은 탭하면 게시글별 댓글 화면.
  const renderFeedItem = ({ item: p }) => (
    <View style={{ backgroundColor: CARD, borderRadius: 16, marginHorizontal: 14, marginBottom: 12, padding: 13,
      shadowColor: '#1A3D52', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 }}>
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
      {!!p.text && (
        <Text style={{ fontFamily: F.sysM, fontSize: fs(16), color: INK, marginTop: 10, lineHeight: fs(22) }}>{p.text}</Text>
      )}
      {p.media.length > 0 && (
        <View style={{ marginTop: 11 }}>
          <PostMedia media={p.media} width={winW - 54} burst={burstId === p.id}
            onOpen={(mi) => setViewer({ media: p.media, index: mi })} onDoubleLike={() => likeOnDouble(p)} />
        </View>
      )}
      {/* 좋아요 · 댓글 줄 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 11 }}>
        <TouchableOpacity onPress={() => toggleLike(p)} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Icon name={p.liked ? 'heartFilled' : 'heart'} size={fs(21)} color={p.liked ? HEART_RED : SUB} strokeWidth={1.9} />
          {p.likeCount > 0 && (
            <Text onPress={() => openLikers(p)} suppressHighlighting
              style={{ fontFamily: F.sysM, fontSize: fs(12.5), color: SUB, marginLeft: 5 }}>{p.likeCount}</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setCommentPost(p)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 18 }}>
          <Text style={{ fontFamily: F.sysM, fontSize: fs(12.5), color: SUB }}>
            💬 {p.comments > 0 ? `댓글 ${p.comments}` : '댓글 달기'}
          </Text>
          <Text style={{ fontSize: fs(11), color: SUB, marginLeft: 6, marginTop: -1 }}>›</Text>
        </TouchableOpacity>
      </View>
      {/* 최신 댓글 한 줄 미리보기 — 들어가지 않아도 누가 뭐라 했는지 보임. 탭=댓글 화면 */}
      {!!p.lastCommentText && (
        <TouchableOpacity onPress={() => setCommentPost(p)} activeOpacity={0.7} style={{ marginTop: 8 }}>
          <Text numberOfLines={1} style={{ fontSize: fs(13), color: SUB, lineHeight: fs(19) }}>
            <Text style={{ fontFamily: F.sysB, color: INK }}>{p.lastCommentName}</Text>
            <Text style={{ fontFamily: F.sys }}>  {p.lastCommentText}</Text>
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // 갤러리 타일 — 탭하면 풀스크린 뷰어. 간격은 columnWrapperStyle gap이 처리.
  const renderTile = ({ item: t, index: i }) => (
    <TouchableOpacity activeOpacity={0.8} onPress={() => setViewer({ media: tiles, index: i })} style={{ marginBottom: GAP }}>
      <MediaTile m={t} style={{ width: cell, height: cell }} radius={8} playSize="sm" />
    </TouchableOpacity>
  );

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
        {/* 크루 프로필(색+이니셜/사진) */}
        <View style={{ marginLeft: 4 }}>
          <CrewAvatar name={crewDoc?.name || crew?.name || '크루'} color={crewDoc?.themeColor} imageUrl={crewDoc?.imageUrl} size={34} radius={11} />
        </View>
        {/* 별명(나만 보기) 우선 — 목록서 넘어온 crew.name=별명∥서버명. 서버 name은 불변이라 live crewDoc보다 우선 안전. 성격은 아래 줄 */}
        <View style={{ flexShrink: 1, marginLeft: 8 }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(17), color: INK }}
            numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>{crew?.name || crewDoc?.name || '크루'}</Text>
          {crewDoc?.description ? (
            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: SUB, marginTop: 1 }} numberOfLines={1}>{crewDoc.description}</Text>
          ) : null}
        </View>
        {/* 멤버 — 작은 아바타 대신 인원수만(탭하면 멤버 목록) */}
        <TouchableOpacity onPress={() => setMembersOpen(true)} hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
          style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 10 }}>
          <Icon name="crew" size={fs(17)} color={INK} strokeWidth={1.8} />
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: INK, marginLeft: 4 }}>{members.length}명</Text>
          <Text style={{ fontSize: fs(20), color: SAGE_DEEP, fontWeight: '700', marginLeft: 3, marginTop: -2 }}>›</Text>
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

      {/* 콘텐츠 — FlatList 가상화(보이는 것만 마운트→이미지도 보이는 것만 로드). 공지=헤더, 토글바는 위에 고정.
          feed=1열 / photos=3열. tab 전환 시 numColumns 바뀌므로 key={tab}로 깔끔하게 remount(스크롤 초기화).
          contentReady — 진입 슬라이드 끝난 뒤 마운트(안드 전환 뻑뻑 방지). 그 전엔 가벼운 스피너만. */}
      {!contentReady ? (
        <View style={{ flex: 1, alignItems: 'center', paddingTop: 60 }}><ActivityIndicator color={SAGE_DEEP} /></View>
      ) : (
      <FlatList
        key={tab}
        ref={scrollRef}
        data={loading ? [] : (tab === 'feed' ? posts : tiles)}
        numColumns={tab === 'feed' ? 1 : COLS}
        keyExtractor={(item) => (tab === 'feed' ? item.id : item.key)}
        renderItem={tab === 'feed' ? renderFeedItem : renderTile}
        columnWrapperStyle={tab === 'photos' ? { paddingHorizontal: PAD, gap: GAP } : undefined}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={{ paddingTop: 10, paddingBottom: 90, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={tab === 'feed' ? 4 : 12}
        maxToRenderPerBatch={tab === 'feed' ? 4 : 12}
        windowSize={7}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={SAGE_DEEP} colors={[SAGE_DEEP]} />}
      />
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
              <>
              {/* 크루장·운영진 — 부적절 공지는 수정(최신 대체)·삭제, 게시물·댓글은 삭제 가능 */}
              {iAmStaff && actionFor.kind === 'notice' && (
                <TouchableOpacity onPress={startEdit} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16 }}>
                  <Text style={{ fontFamily: F.sysM, fontSize: fs(16), color: INK }}>공지 수정</Text>
                </TouchableOpacity>
              )}
              {iAmStaff && (
                <TouchableOpacity onPress={confirmDelete} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16, borderTopWidth: actionFor.kind === 'notice' ? 0.5 : 0, borderTopColor: LINE }}>
                  <Text style={{ fontFamily: F.sysM, fontSize: fs(16), color: '#B23B3B' }}>{actionFor.kind === 'post' ? '게시물 삭제' : actionFor.kind === 'notice' ? '공지 삭제' : '댓글 삭제'}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={reportAction} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16, borderTopWidth: iAmStaff ? 0.5 : 0, borderTopColor: LINE }}>
                <Text style={{ fontFamily: F.sysM, fontSize: fs(16), color: INK }}>신고하기</Text>
              </TouchableOpacity>
              </>
            )}
            <TouchableOpacity onPress={() => setActionFor(null)} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16, borderTopWidth: 0.5, borderTopColor: LINE }}>
              <Text style={{ fontFamily: F.sysM, fontSize: fs(16), color: SUB }}>취소</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 좋아요 누른 사람 — 카운트 탭 시 이름 목록(친구앨범이라 '누가'가 자연스러움) */}
      {likersFor && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <TouchableOpacity activeOpacity={1} onPress={() => setLikersFor(null)} style={{ flex: 1, backgroundColor: 'rgba(26,61,82,0.35)' }} />
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: CARD, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 16, paddingBottom: 24 + insets.bottom, maxHeight: '70%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, paddingBottom: 12 }}>
              <Icon name="heartFilled" size={fs(18)} color={HEART_RED} />
              <Text style={{ fontFamily: F.sysB, fontSize: fs(15.5), color: INK, marginLeft: 7 }}>좋아요 {likersFor.count}</Text>
            </View>
            <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ paddingHorizontal: 22 }}>
              {likersFor.members.map((m) => (
                <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9 }}>
                  <MiniAvatar n={m.n} c={m.c} uri={m.uri} size={36} />
                  <Text style={{ fontFamily: F.sysM, fontSize: fs(15), color: INK, marginLeft: 11 }} numberOfLines={1}>{m.name}</Text>
                </View>
              ))}
            </ScrollView>
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
        <CrewInviteSheet crewId={crewId} memberUids={memberUids} friends={friends} onClose={() => setInviteOpen(false)} />
      )}

      {/* 크루 모달 위 alert 자체 호스트(삭제 확인 등) */}
      <AppAlertHost />
    </SafeAreaView>
    </SafeAreaProvider>
  );
}
