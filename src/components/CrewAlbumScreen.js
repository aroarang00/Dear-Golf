import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, FlatList, StatusBar, RefreshControl, useWindowDimensions, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView, SafeAreaProvider, useSafeAreaInsets, initialWindowMetrics } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Animated, { SlideInRight } from 'react-native-reanimated';
import { F, fs } from '../constants/colors';
import { Icon } from './common/Icon';
import { CrewAvatar } from './common/CrewAvatar';
import { LinkText } from './common/LinkText';
import { useScreenBack } from '../hooks/useScreenBack';
import { useCurrentUid } from '../contexts/CurrentUidContext';
import {
  subscribeCrew, subscribeCrewPosts, deleteCrewPost, setCrewNotice, togglePostLike,
} from '../utils/crews';
import { resolveMemberDisplay, loadMyFriendsEnriched, loadSentRequests, sendFriendRequest, getCachedMemberDisplay } from '../utils/friends';
import { friendDisplayName, getCachedFriendMeta } from '../utils/friendGroups';   // 별명 캐시 — 첫 페인트 flicker 방지
import { storage, STORAGE_KEYS } from '../utils/storage';
import { CrewComposeScreen } from './CrewComposeScreen';
import { CrewMembersScreen } from './CrewMembersScreen';
import { CrewCommentScreen } from './CrewCommentScreen';
import { PhotoViewer, primePhotoRatio } from './common/PhotoViewer';
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
const NEWMARK = '#6B1E2A';   // 안 본 글·내 글 새 댓글 표식 — 목록 '새 글' 배지와 같은 버건디 톤
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

// 게시글 작성 시점 — 상대시간 대신 '날짜 + 시간'으로 표시(언제 올렸는지 명확). 같은 해는 연도 생략.
function fmtDateTime(ts) {
  const ms = ts?.toMillis ? ts.toMillis() : 0;
  if (!ms) return '방금';
  const d = new Date(ms);
  const now = new Date();
  const h = d.getHours();
  const time = `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`;
  const date = d.getFullYear() === now.getFullYear()
    ? `${d.getMonth() + 1}월 ${d.getDate()}일`
    : `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`;
  return `${date} ${time}`;
}

// 사진 있으면 프로필 사진, 없으면 이니셜. onPress=프로필(DM) 시트, i>0이면 겹쳐쌓기.
function MiniAvatar({ n, c, i = 0, size = 30, uri, onPress }) {
  const base = { width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor: '#fff', marginLeft: i === 0 ? 0 : -(size * 0.3) };
  const inner = uri
    ? <Image source={{ uri }} style={base} contentFit="cover" cachePolicy="memory-disk" transition={0} />
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

// 갤러리 타일 — React.memo로 부모 UI상태 churn(뷰어·버스트·시트 등) 시 헛 리렌더 차단(사진 많은 크루 갤러리 매끄럽게).
//   props가 원시값(cell·index)+안정 객체(m=tiles 원소)+안정 콜백(onOpen)이라 memo 유효. style/onPress는 내부 생성이라
//   부모 함수 재생성과 무관(MediaTile은 비-memo지만 이 타일 안에 갇혀 함께 스킵됨). marginBottom 4 = GAP.
const GalleryTile = React.memo(function GalleryTile({ m, cell, index, onOpen }) {
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={() => onOpen(index)} style={{ marginBottom: 4 }}>
      <MediaTile m={m} style={{ width: cell, height: cell }} radius={8} playSize="sm" />
    </TouchableOpacity>
  );
});

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

// 여러 장 — 콜라주 그리드(좌우 스와이프 대신 한눈에). 2=나란히 / 3=좌 큰 1+우 작은 2 / 4=2×2 / 5장+=2×2에 마지막 +N.
//   각 타일 탭 = 풀스크린 뷰어(그 인덱스부터, 거기선 전체 스와이프). 더블탭=좋아요는 상위 PostMedia가 처리.
function CrewGrid({ media, width, onOpen }) {
  const G = 3;
  const n = media.length;
  const srcOf = (m) => (m?.type === 'video' ? (m.poster || m.uri) : (m?.thumb || m?.uri));
  const tile = (idx, w, h, more = 0) => {
    const m = media[idx];
    const uri = srcOf(m);
    return (
      <TouchableOpacity key={idx} activeOpacity={0.95} onPress={() => onOpen(idx)}
        style={{ width: w, height: h, backgroundColor: 'rgba(26,61,82,0.06)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={Platform.OS === 'android' ? 0 : 120} />
             : <Icon name="image" size={fs(26)} color="rgba(26,61,82,0.35)" strokeWidth={1.4} />}
        {m?.type === 'video' && (
          <View style={{ position: 'absolute', width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: fs(17), color: '#fff', marginLeft: 2 }}>▶</Text>
          </View>
        )}
        {more > 0 && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(24), color: '#fff' }}>+{more}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };
  const box = { borderRadius: 14, overflow: 'hidden' };
  if (n === 2) {
    const t = Math.round((width - G) / 2);
    return <View style={{ ...box, flexDirection: 'row' }}>{tile(0, t, t)}<View style={{ width: G }} />{tile(1, t, t)}</View>;
  }
  if (n === 3) {
    const H = Math.round(width * 0.62);
    const leftW = Math.round((width - G) * 0.62);
    const rightW = width - G - leftW;
    const rh = Math.round((H - G) / 2);
    return (
      <View style={{ ...box, flexDirection: 'row' }}>
        {tile(0, leftW, H)}
        <View style={{ width: G }} />
        <View style={{ width: rightW }}>{tile(1, rightW, rh)}<View style={{ height: G }} />{tile(2, rightW, rh)}</View>
      </View>
    );
  }
  // 4장 이상 — 2×2(마지막 칸 +N)
  const t = Math.round((width - G) / 2);
  const extra = n - 4;
  return (
    <View style={box}>
      <View style={{ flexDirection: 'row' }}>{tile(0, t, t)}<View style={{ width: G }} />{tile(1, t, t)}</View>
      <View style={{ height: G }} />
      <View style={{ flexDirection: 'row' }}>{tile(2, t, t)}<View style={{ width: G }} />{tile(3, t, t, extra > 0 ? extra : 0)}</View>
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
        <CrewGrid media={media} width={width} onOpen={(mi) => handleTap(mi)} />
      )}
      {burst && (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="heartFilled" size={fs(78)} color={HEART_RED} />
        </View>
      )}
    </View>
  );
}

// 피드 카드 — React.memo로 부모 UI상태(뷰어·시트·버스트 등) 변화 시 헛 리렌더 차단(콜백은 부모서 useCallback 안정화).
//   p는 데이터(posts useMemo) 변할 때만 신원 바뀜 / burst는 이 카드만 true→그 카드만 리렌더. 라운지 PostCard memo 패턴.
const PostCard = React.memo(function PostCard({ p, burst, width, onOpenProfile, onAction, onOpenViewer, onDoubleLike, onToggleLike, onOpenLikers, onComment }) {
  return (
    <View style={{ backgroundColor: CARD, borderRadius: 16, marginHorizontal: 14, marginBottom: 12, padding: 13,
      shadowColor: '#1A3D52', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <MiniAvatar n={p.author.n} c={p.author.c} uri={p.author.uri} size={32} onPress={() => onOpenProfile(p.author)} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: INK }} numberOfLines={1}>{p.author.name}</Text>
            {p.isNew && (
              <View style={{ backgroundColor: NEWMARK, borderRadius: 7, paddingHorizontal: 6, paddingVertical: 1, marginLeft: 7 }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(9.5), color: '#fff', letterSpacing: 0.4 }}>NEW</Text>
              </View>
            )}
          </View>
          <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: SUB, marginTop: 1 }}>{p.time}</Text>
        </View>
        <TouchableOpacity hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ padding: 4 }} onPress={() => onAction(p)}>
          <Text style={{ fontSize: fs(22), color: INK }}>⋯</Text>
        </TouchableOpacity>
      </View>
      {!!p.text && (
        <LinkText style={{ fontFamily: F.sysM, fontSize: fs(16), color: INK, marginTop: 10, lineHeight: fs(22) }}>{p.text}</LinkText>
      )}
      {p.media.length > 0 && (
        <View style={{ marginTop: 11 }}>
          <PostMedia media={p.media} width={width} burst={burst}
            onOpen={(mi) => onOpenViewer(p.media, mi)} onDoubleLike={() => onDoubleLike(p)} />
        </View>
      )}
      {/* 좋아요 · 댓글 줄 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 11 }}>
        <TouchableOpacity onPress={() => onToggleLike(p)} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
          style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Icon name={p.liked ? 'heartFilled' : 'heart'} size={fs(21)} color={p.liked ? HEART_RED : SUB} strokeWidth={1.9} />
          {p.likeCount > 0 && (
            <Text onPress={() => onOpenLikers(p)} suppressHighlighting
              style={{ fontFamily: F.sysM, fontSize: fs(12.5), color: SUB, marginLeft: 5 }}>{p.likeCount}</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onComment(p)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 18 }}>
          <Text style={{ fontFamily: F.sysM, fontSize: fs(12.5), color: SUB }}>
            💬 {p.comments > 0 ? `댓글 ${p.comments}` : '댓글 달기'}
          </Text>
          <Text style={{ fontSize: fs(11), color: SUB, marginLeft: 6, marginTop: -1 }}>›</Text>
        </TouchableOpacity>
      </View>
      {/* 최신 댓글 한 줄 미리보기 — 내 글에 새 댓글이면 앞에 버건디 점 + 진하게 */}
      {!!p.lastCommentText && (
        <TouchableOpacity onPress={() => onComment(p)} activeOpacity={0.7}
          style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
          {p.hasNewComment && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: NEWMARK, marginRight: 6 }} />}
          <Text numberOfLines={1} style={{ flex: 1, fontSize: fs(13), color: p.hasNewComment ? INK : SUB, lineHeight: fs(19) }}>
            <Text style={{ fontFamily: F.sysB, color: INK }}>{p.lastCommentName}</Text>
            <Text style={{ fontFamily: F.sys }}>  {p.lastCommentText}</Text>
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

export function CrewAlbumScreen({ crew, onClose, onOpenDM, seenAt = 0 }) {
  const { width: winW } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const currentUid = useCurrentUid();
  const crewId = crew?.id;
  const [tab, setTab] = useState('feed');         // 'feed' | 'photos'
  const [composeOpen, setComposeOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [editingPost, setEditingPost] = useState(null);   // 작성화면 재사용(수정)
  const [editingNotice, setEditingNotice] = useState(false); // 공지 수정(작성화면 공지모드)
  const [commentPost, setCommentPost] = useState(null);   // 댓글 화면 열린 게시물(글별 분리)

  const [crewDoc, setCrewDoc] = useState(crew?._doc || null);
  const [postDocs, setPostDocs] = useState(null);   // null=로딩
  // uid→{name,avatarUri,self} — 세션 캐시로 초기화(첫 페인트에 아바타·이름 즉시, 기본아바타→사진 flicker 방지)
  const [display, setDisplay] = useState(() => getCachedMemberDisplay(crew?._doc?.memberUids || [], { myUid: currentUid }));
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
  const [bannerDismissed, setBannerDismissed] = useState(false); // '내 글 새 댓글' 상단 배너 이번 세션 닫음
  const jumpIdxRef = useRef(0);                            // 배너 '보기' 탭 시 새 댓글 글들을 차례로 순회
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
  // 공지 작성자 역할 — 크루장(creatorUid)·운영진(adminUids) 둘 다 공지 작성 가능하니, 누가 썼는지 표시(사용자 요청 2026-06-26).
  const noticeBy = crewDoc?.noticeBy || null;
  const noticeRole = noticeBy === crewDoc?.creatorUid ? '크루리더'
    : (noticeBy && (crewDoc?.adminUids || []).includes(noticeBy)) ? '서브리더' : null;
  const noticeAuthorName = noticeBy
    ? (noticeBy === currentUid ? (display[noticeBy]?.name || '나')
       : friendDisplayName(getCachedFriendMeta(), noticeBy, display[noticeBy]?.name || namesFallback[noticeBy] || ''))
    : '';

  // 멤버 + 작성자 표시정보 resolve(보는 사람 별명 우선)
  const authorKey = useMemo(() => (postDocs || []).map((p) => p.authorUid).join(','), [postDocs]);
  useEffect(() => {
    const uids = [...new Set([...memberUids, ...(postDocs || []).map((p) => p.authorUid)].filter(Boolean))];
    if (!uids.length) { setDisplay({}); return; }
    let alive = true;
    // 캐시 즉시 적용(새 uid는 cache로, 기존은 prev 유지) → 아바타·이름 깜빡임 없이 바로, 그 뒤 최신으로 refine
    setDisplay((prev) => ({ ...getCachedMemberDisplay(uids, { myUid: currentUid }), ...prev }));
    resolveMemberDisplay(uids, { myUid: currentUid, namesFallback }).then((m) => { if (alive) setDisplay(m || {}); }).catch(() => {});
    return () => { alive = false; };
  }, [memberUids.join(','), authorKey, currentUid, namesSig]);

  const members = useMemo(() => {
    const cachedMeta = getCachedFriendMeta();   // 별명 캐시 — display 로드 전 첫 페인트에 별명 즉시 적용(flicker 방지)
    return memberUids.map((u) => {
      const d = display[u] || {};
      const name = u === currentUid ? (d.name || '나') : friendDisplayName(cachedMeta, u, d.name || namesFallback[u] || '친구');
      return { id: u, name, n: name.charAt(0), c: colorOf(u), uri: d.avatarUri || null };
    });
  }, [memberUids.join(','), display, currentUid]);

  // 게시물 표시 모델
  const posts = useMemo(() => {
    const cachedMeta = getCachedFriendMeta();   // 별명 캐시 — 작성자명도 첫 페인트부터 별명(원래 닉네임 깜빡임 방지)
    return (postDocs || []).map((p) => {
    const d = display[p.authorUid] || {};
    const name = p.authorUid === currentUid ? (d.name || '나') : friendDisplayName(cachedMeta, p.authorUid, d.name || namesFallback[p.authorUid] || '친구');
    const likedBy = p.likedBy || [];
    const lcBy = p.lastCommentBy || null;
    const lcName = lcBy ? (lcBy === currentUid ? ((display[lcBy] || {}).name || '나') : friendDisplayName(cachedMeta, lcBy, (display[lcBy] || {}).name || namesFallback[lcBy] || '친구')) : '';
    const createdMs = p.createdAt?.toMillis ? p.createdAt.toMillis() : 0;
    const lastCMs = p.lastCommentAt?.toMillis ? p.lastCommentAt.toMillis() : 0;
    return {
      id: p.id,
      author: { id: p.authorUid, name, n: name.charAt(0), c: colorOf(p.authorUid), uri: d.avatarUri || null },
      time: fmtDateTime(p.createdAt), text: p.text || '', media: p.media || [], comments: p.commentCount || 0,
      likedBy, liked: !!currentUid && likedBy.includes(currentUid), likeCount: likedBy.length,
      lastCommentText: p.lastCommentText || '', lastCommentName: lcName,
      // 신호 — seenAt(마지막 본 시각) 기준. 첫 진입(seenAt=0)은 전부 NEW로 도배되지 않게 억제.
      isNew: seenAt > 0 && createdMs > seenAt && p.authorUid !== currentUid,         // 남이 올린 안 본 글
      hasNewComment: seenAt > 0 && p.authorUid === currentUid && lastCMs > seenAt && !!lcBy && lcBy !== currentUid, // 내 글에 새 댓글
      _doc: p,
    };
    });
  }, [postDocs, display, currentUid, seenAt]);

  // 피드 사진 미리 받기 — 첫 화면 몇 장만. 전체 원본을 한꺼번에 prefetch하면 사진 많은 크루 진입 시
  //   네트워크·디코드 폭주로 버벅임(가상화와 별개로 prefetch가 전량을 깨움). 6장으로 제한(2026-06-24 성능).
  useEffect(() => {
    const uris = posts.flatMap((p) => (p.media || []).map((m) => (m?.type === 'video' ? m?.poster : (m?.thumb || m?.uri)))).filter(Boolean).slice(0, 6);
    if (uris.length) Image.prefetch(uris, { cachePolicy: 'memory-disk' });
  }, [posts]);

  // 풀스크린 뷰어 비율 미리 심기 — 미디어의 ar(저장된 비율)을 뷰어 캐시에 넣어두면, 뷰어가 폴백 크기로 열렸다
  //   onLoad 후 진짜 비율로 '다시 커지는'(두단계 확대) 리플로우 없이 처음부터 정확한 크기로 열림.
  useEffect(() => {
    posts.forEach((p) => (p.media || []).forEach((m) => {
      const key = m?.type === 'video' ? m?.poster : m?.uri;
      if (key && m?.ar) primePhotoRatio(key, m.ar);
    }));
  }, [posts]);

  // 갤러리 타일 — 모든 게시물 미디어를 펼친 평면 배열(가상화 data·풀스크린 뷰어 공용). early-return 위에서 메모.
  const tiles = useMemo(
    () => posts.flatMap((p) => (p.media || []).map((m, mi) => ({ ...m, postId: p.id, mi, key: `${p.id}_${mi}` }))),
    [posts]);

  // '내 글에 새 댓글' 달린 글들의 피드 인덱스 — 상단 배너 카운트 + '보기' 점프 대상(옛날 글이라 스크롤해야 보이던 것 해소)
  const newMineIdx = useMemo(
    () => posts.reduce((acc, p, i) => { if (p.hasNewComment) acc.push(i); return acc; }, []),
    [posts]);
  // 배너 '보기' — 새 댓글 달린 내 글로 차례로 스크롤(여러 개면 탭마다 다음 것, 끝나면 처음으로 순환)
  const jumpToNewComment = () => {
    if (!newMineIdx.length || !scrollRef.current) return;
    const k = jumpIdxRef.current % newMineIdx.length;
    jumpIdxRef.current = k + 1;
    try { scrollRef.current.scrollToIndex({ index: newMineIdx[k], animated: true, viewPosition: 0.12 }); }
    catch (e) { if (__DEV__) console.warn('[crewAlbum] jump', e?.message); }
  };

  // ── 동작 ── (카드(PostCard)에 넘기는 콜백은 useCallback으로 안정화 — memo 카드가 UI상태 변화에 헛 리렌더되지 않게)
  const openProfile = useCallback((person) => {
    const uid = person?.authorUid || person?.id;
    if (uid && uid !== currentUid) setProfileFor({ ...person, uid });
  }, [currentUid]);
  // 좋아요 토글 — 실시간 구독(로컬 즉시반영)이라 별도 낙관 상태 불필요. 헛쓰기 방지로 현재 상태 반대만.
  const toggleLike = useCallback((p) => {
    if (!currentUid || !crewId) return;
    togglePostLike(crewId, p.id, currentUid, !p.liked)
      .catch((e) => { if (__DEV__) console.warn('[crewAlbum] like', e?.code, e?.message); });
  }, [currentUid, crewId]);
  // 사진 더블탭 — 항상 '좋아요'(취소 아님, 멱등). 가운데 큰 하트 잠깐 표시.
  const likeOnDouble = useCallback((p) => {
    if (!currentUid || !crewId) return;
    setBurstId(p.id);
    if (burstTimer.current) clearTimeout(burstTimer.current);
    burstTimer.current = setTimeout(() => setBurstId(null), 650);
    if (!p.liked) togglePostLike(crewId, p.id, currentUid, true)
      .catch((e) => { if (__DEV__) console.warn('[crewAlbum] like2', e?.code, e?.message); });
  }, [currentUid, crewId]);
  // 좋아요 누른 사람 목록 — likedBy uid를 별명/아바타로 resolve(이미 받아둔 display + 폴백)
  const openLikers = useCallback((p) => {
    if (!p.likeCount) return;
    const list = (p.likedBy || []).map((u) => {
      const d = display[u] || {};
      const name = d.name || namesFallback[u] || '친구';
      return { id: u, name, n: name.charAt(0), c: colorOf(u), uri: d.avatarUri || null };
    });
    setLikersFor({ count: p.likeCount, members: list });
  }, [display, namesSig]); // eslint-disable-line react-hooks/exhaustive-deps
  const openPostAction = useCallback((p) => setActionFor({ kind: 'post', id: p.id, authorUid: p.author.id, name: p.author.name, text: p.text, post: p }), []);
  const openViewerAt = useCallback((media, index) => setViewer({ media, index }), []);
  const openComment = useCallback((p) => setCommentPost(p), []);
  // 갤러리 타일 onOpen — tiles 바뀔 때만 갱신(사진 추가 등, 드묾). 평소엔 안정 → GalleryTile memo 유지.
  const openTile = useCallback((i) => setViewer({ media: tiles, index: i, gallery: true }), [tiles]);
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
  // ★댓글은 early-return으로 앨범을 갈아치우지 않고 '오버레이'로 띄운다(아래 메인 return 끝).
  //   갈아치우면 앨범 FlatList가 언마운트돼, 댓글에서 뒤로가기 시 스크롤이 리셋돼 '첫 리스트'로 돌아가던 버그.
  //   오버레이는 FlatList를 살려둬 닫으면(안드 뒤로가기·iOS ← 포함) 보던 게시글 위치 그대로 복귀.

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
          {/* 작성자 역할 — 크루장/운영진 누가 올린 공지인지(둘 다 작성 가능) */}
          {noticeRole && (
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(10.5), color: 'rgba(120,95,40,0.85)', marginTop: 5 }}>
              {noticeRole}{noticeAuthorName ? ` · ${noticeAuthorName}` : ''}
            </Text>
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

  // 게시글 카드 — memo PostCard로(콜백 안정화). 댓글은 탭하면 게시글별 댓글 화면.
  const renderFeedItem = ({ item: p }) => (
    <PostCard p={p} burst={burstId === p.id} width={winW - 54}
      onOpenProfile={openProfile} onAction={openPostAction} onOpenViewer={openViewerAt}
      onDoubleLike={likeOnDouble} onToggleLike={toggleLike} onOpenLikers={openLikers} onComment={openComment} />
  );

  // 갤러리 타일 — memo GalleryTile(부모 churn에 헛 리렌더 X). onOpen=안정 콜백. 간격은 columnWrapperStyle gap이 처리.
  const renderTile = ({ item: t, index: i }) => (
    <GalleryTile m={t} cell={cell} index={i} onOpen={openTile} />
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
        {/* 별명(나만 보기) 우선 — 목록서 넘어온 crew.name=별명∥서버명. 서버 name은 불변이라 live crewDoc보다 우선 안전. 성격은 아래 줄.
            flexShrink+minWidth:0 — 성격이 길어도 컬럼이 줄며 '잘림'(numberOfLines 1) → 멤버·초대를 밀지 않음. 멤버는 이름 옆 유지. */}
        {/* 이름·성격 — 좌측 컬럼(성격은 이름 아래, 길면 잘림). */}
        <View style={{ flexShrink: 1, minWidth: 0, marginLeft: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flexShrink: 1, fontFamily: F.sysB, fontSize: fs(17), color: INK }}
              numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>{crew?.name || crewDoc?.name || '크루'}</Text>
            {/* 인원 — 이름 옆 간단 표시(상세·관리·음소거는 우측 설정). 이모지 대신 커스텀 아이콘(렌더 일관) */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 7, flexShrink: 0 }}>
              <Icon name="crew" size={fs(13)} color={SUB} strokeWidth={2} />
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: SUB, marginLeft: 2 }}>{members.length}</Text>
            </View>
          </View>
          {crewDoc?.description ? (
            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: SUB, marginTop: 1 }} numberOfLines={1}>{crewDoc.description}</Text>
          ) : null}
        </View>
        <View style={{ flex: 1 }} />
        {/* 설정 — 멤버 목록·초대·알림 음소거·편집·나가기 진입. 인원은 이름 옆에 표시하므로 여기선 톱니만 */}
        <TouchableOpacity onPress={() => setMembersOpen(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{ flexShrink: 0 }}>
          <Icon name="gear" size={fs(23)} color={INK} strokeWidth={1.9} />
        </TouchableOpacity>
        {/* 초대는 멤버 화면(멤버 N명 › 탭)에서 — 헤더 중복 제거 */}
      </View>

      {/* 게시글/갤러리 — 밴드식 밑줄 텍스트탭(가운데 2등분). 고정 바(ScrollView 밖) */}
      <View style={{ backgroundColor: BG, flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: LINE }}>
        {[['feed', '게시글'], ['photos', '갤러리']].map(([t, label]) => {
          const on = tab === t;
          return (
            <TouchableOpacity key={t} onPress={() => setTab(t)} activeOpacity={0.7} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              style={{ flex: 1, alignItems: 'center', paddingTop: Platform.OS === 'android' ? 11 : 13, paddingBottom: 0 }}>
              <Text style={{ fontFamily: on ? F.sysB : F.sysM, fontSize: fs(14.5), color: on ? INK : SUB }}>{label}</Text>
              {/* 활성 밑줄 — 탭 전체 폭(alignSelf stretch). 비활성은 투명이라 레이아웃 점프 없음 */}
              <View style={{ marginTop: Platform.OS === 'android' ? 8 : 10, height: 3, alignSelf: 'stretch', backgroundColor: on ? SAGE_DEEP : 'transparent' }} />
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 내 글에 새 댓글 — 상단 배너(피드 탭). '보기'=그 글로 바로 스크롤(옛날 글이라 안 내려가도 됨). ✕=세션 닫기 */}
      {tab === 'feed' && !bannerDismissed && newMineIdx.length > 0 && (
        <TouchableOpacity onPress={jumpToNewComment} activeOpacity={0.85}
          style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginTop: 10,
            backgroundColor: '#F7E9EC', borderRadius: 12, borderWidth: 0.5, borderColor: 'rgba(107,30,42,0.25)', paddingHorizontal: 12, paddingVertical: 10 }}>
          <Icon name="heartFilled" size={fs(16)} color={NEWMARK} />
          <Text style={{ flex: 1, fontFamily: F.sysSb, fontSize: fs(13), color: NEWMARK, marginLeft: 8 }}>내 글에 새 댓글 {newMineIdx.length}개</Text>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(12.5), color: NEWMARK }}>보기 ›</Text>
          <TouchableOpacity onPress={() => setBannerDismissed(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ marginLeft: 12 }}>
            <Text style={{ fontSize: fs(15), color: 'rgba(107,30,42,0.5)' }}>✕</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      )}

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
        extraData={burstId}
        columnWrapperStyle={tab === 'photos' ? { paddingHorizontal: PAD, gap: GAP } : undefined}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={{ paddingTop: 10, paddingBottom: 90, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={tab === 'feed' ? 4 : 12}
        maxToRenderPerBatch={tab === 'feed' ? 4 : 12}
        windowSize={7}
        // 카드 높이가 가변이라 미렌더 인덱스로 점프 시 실패할 수 있음 — 대략 위치로 먼저 이동 후 재시도(배너 '보기'용)
        onScrollToIndexFailed={(info) => {
          scrollRef.current?.scrollToOffset({ offset: (info.averageItemLength || 320) * info.index, animated: true });
          setTimeout(() => { try { scrollRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.12 }); } catch (e) {} }, 320);
        }}
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

      {/* 풀스크린 줌 뷰어 — 사진/영상 가운데 확대만(캡션 없음), 저장 허용.
          갤러리에서 연 경우 '게시글 보기'로 원글(글·댓글)로 점프(타일의 postId로 해당 글 찾기). */}
      {viewer && (
        <PhotoViewer photos={viewer.media} startIndex={viewer.index} allowSave onClose={() => setViewer(null)}
          onGoToPost={viewer.gallery ? (item) => {
            const p = posts.find((pp) => pp.id === item?.postId);
            setViewer(null);
            if (p) setCommentPost(p);
          } : undefined} />
      )}

      {/* 신고 — 작성자 대상 + 본문 인용 근거 prefill */}
      <ReportModal visible={!!reportTarget}
        presetTarget={reportTarget ? { id: reportTarget.id, name: reportTarget.name } : null}
        prefillEvidence={reportTarget?.evidence || ''}
        onClose={() => setReportTarget(null)} />

      {/* 크루 모달 위 alert 자체 호스트(삭제 확인 등) */}
      <AppAlertHost />

      {/* 게시글 댓글 — 오버레이로 띄움(앨범 FlatList를 살려둠). early-return으로 갈아치우면 FlatList가
          언마운트→복귀 시 첫 리스트로 갔음(2026-06-26 수정). 닫기(뒤로가기 포함)는 CrewCommentScreen이 자체 back 핸들러로 onClose. */}
      {commentPost && (
        <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, elevation: 30 }}
          entering={SlideInRight.duration(230)}>
          <CrewCommentScreen crew={crew} post={commentPost} names={crewDoc?.names || {}}
            onClose={() => setCommentPost(null)} onOpenDM={onOpenDM} />
        </Animated.View>
      )}
    </SafeAreaView>
    </SafeAreaProvider>
  );
}
