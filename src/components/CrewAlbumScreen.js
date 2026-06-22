import React, { useState, useRef, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, RefreshControl, useWindowDimensions, ActivityIndicator } from 'react-native';
import { SafeAreaView, SafeAreaProvider, useSafeAreaInsets, initialWindowMetrics } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { F, fs } from '../constants/colors';
import { Icon } from './common/Icon';
import { useAndroidBack } from '../hooks/useAndroidBack';
import { useCurrentUid } from '../contexts/CurrentUidContext';
import { subscribeCrew, subscribeCrewPosts } from '../utils/crews';
import { resolveMemberDisplay } from '../utils/friends';
import { CrewPostScreen } from './CrewPostScreen';
import { CrewComposeScreen } from './CrewComposeScreen';
import { CrewMembersScreen } from './CrewMembersScreen';

// 크루 앨범 — 리스트에서 크루 탭 시 진입 (docs/crew-space-design.md §3.1).
//  ★피드 + 사진 토글: 피드=글·사진·영상 섞인 카드(글만 가능), 사진=미디어만 그리드. 댓글은 게시물별(B안).
//  페일스카이 라이트. 게시물=subscribeCrewPosts 실시간, 작성=CrewComposeScreen 자체 업로드/쓰기.
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

function MiniAvatar({ n, c, i, size = 30, uri }) {
  const base = { width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor: '#fff', marginLeft: i === 0 ? 0 : -(size * 0.3) };
  if (uri) return <Image source={{ uri }} style={base} contentFit="cover" />;
  return (
    <View style={{ ...base, backgroundColor: c, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: F.sysB, fontSize: fs(size * 0.38), color: '#fff' }}>{n}</Text>
    </View>
  );
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

export function CrewAlbumScreen({ crew, onClose }) {
  useAndroidBack(true, onClose);
  const { width: winW } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const currentUid = useCurrentUid();
  const crewId = crew?.id;
  const [tab, setTab] = useState('feed');         // 'feed' | 'photos'
  const [openPost, setOpenPost] = useState(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);

  const [crewDoc, setCrewDoc] = useState(crew?._doc || null);
  const [postDocs, setPostDocs] = useState(null);   // null=로딩
  const [display, setDisplay] = useState({});       // uid→{name,avatarUri,self}
  const [noticeExpanded, setNoticeExpanded] = useState(false);
  const scrollRef = useRef(null);
  const [showTop, setShowTop] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = () => { setRefreshing(true); setTimeout(() => setRefreshing(false), 600); }; // 실시간 구독이라 표시만(당김 UX 유지)

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

  // 멤버 + 작성자 표시정보 resolve(보는 사람 별명 우선). 멤버 또는 게시물 작성자 바뀔 때만.
  const authorKey = useMemo(() => (postDocs || []).map((p) => p.authorUid).join(','), [postDocs]);
  useEffect(() => {
    const uids = [...new Set([...memberUids, ...(postDocs || []).map((p) => p.authorUid)].filter(Boolean))];
    if (!uids.length) { setDisplay({}); return; }
    let alive = true;
    resolveMemberDisplay(uids, { myUid: currentUid, namesFallback }).then((m) => { if (alive) setDisplay(m || {}); }).catch(() => {});
    return () => { alive = false; };
  }, [memberUids.join(','), authorKey, currentUid]);

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

  if (openPost) return <CrewPostScreen post={openPost} crew={crew} onClose={() => setOpenPost(null)} />;
  if (composeOpen) return <CrewComposeScreen crew={crew} onClose={() => setComposeOpen(false)} />;
  if (membersOpen) return <CrewMembersScreen crew={crew} onClose={() => setMembersOpen(false)} onLeave={() => { setMembersOpen(false); onClose(); }} />;

  // 사진 탭 — 모든 게시물의 미디어를 펼친 그리드
  const PAD = 12, GAP = 4, COLS = 3;
  const cell = Math.floor((winW - PAD * 2 - GAP * (COLS - 1)) / COLS);
  const tiles = posts.flatMap((p) => (p.media || []).map((m, mi) => ({ ...m, postId: p.id, key: `${p.id}_${mi}` })));
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
        {/* 긴 이름(최대 10자)은 잘리지 않게 자동 축소 — 짧으면 fs20 유지 */}
        <Text style={{ flexShrink: 1, fontFamily: F.sysB, fontSize: fs(18), color: INK, marginLeft: 6 }}
          numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>{crewDoc?.name || crew?.name || '크루'}</Text>
        {/* 이름 옆 아바타(+N) + 리스트 → 멤버 화면 */}
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
        {/* 친구 초대 → 멤버 관리(초대) — 진하게·크게 */}
        <TouchableOpacity onPress={() => setMembersOpen(true)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ padding: 4 }}>
          <Icon name="personAdd" size={fs(27)} color={SAGE_DEEP} strokeWidth={2.2} />
        </TouchableOpacity>
      </View>

      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 90 }} showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]} scrollEventThrottle={16}
        onScroll={(e) => setShowTop(e.nativeEvent.contentOffset.y > 320)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={SAGE_DEEP} colors={[SAGE_DEEP]} />}>

        {/* index 0 — 공지(스크롤로 흘러감, 길면 더보기) */}
        <View>
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
        </View>

        {/* index 1 — 피드/사진 토글(★sticky: 스크롤 내려도 상단 고정). BG 배경으로 아래 콘텐츠 가림 */}
        <View style={{ backgroundColor: BG, paddingTop: 12, paddingBottom: 2 }}>
          <View style={{ flexDirection: 'row', marginHorizontal: 14,
            backgroundColor: 'rgba(26,61,82,0.08)', borderRadius: 11, padding: 3 }}>
            {[['feed', '피드'], ['photos', '사진']].map(([t, label]) => (
              <TouchableOpacity key={t} onPress={() => setTab(t)} activeOpacity={0.8}
                style={{ flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center', backgroundColor: tab === t ? SAGE_DEEP : 'transparent' }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: tab === t ? '#fff' : SUB }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* index 2 — 콘텐츠 */}
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
          // ── 피드: 글·사진·영상 카드 ──
          posts.map((p) => (
            <TouchableOpacity key={p.id} activeOpacity={0.9} onPress={() => setOpenPost(p)}
              style={{ backgroundColor: CARD, borderRadius: 16, marginHorizontal: 14, marginBottom: 12, padding: 13,
                shadowColor: '#1A3D52', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 }}>
              {/* 작성자 */}
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <MiniAvatar n={p.author.n} c={p.author.c} uri={p.author.uri} i={0} size={32} />
                <View style={{ marginLeft: 10 }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: INK }}>{p.author.name}</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: SUB, marginTop: 1 }}>{p.time}</Text>
                </View>
              </View>
              {/* 글 */}
              {!!p.text && (
                <Text style={{ fontFamily: F.sysM, fontSize: fs(16), color: INK, marginTop: 10, lineHeight: fs(22) }}>{p.text}</Text>
              )}
              {/* 미디어 (있을 때) — 1장 크게 / 여러장 가로 스크롤 */}
              {p.media.length > 0 && (
                <View style={{ marginTop: 11 }}>
                  {p.media.length === 1 ? (
                    <MediaTile m={p.media[0]} style={{ width: '100%', aspectRatio: 1 }} playSize="lg" />
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {p.media.map((m, mi) => (
                        <MediaTile key={mi} m={m} style={{ width: winW * 0.42, height: winW * 0.42, marginRight: 6 }} playSize="sm" />
                      ))}
                    </ScrollView>
                  )}
                </View>
              )}
              {/* 댓글 수 */}
              <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: SUB, marginTop: 11 }}>
                💬 {p.comments > 0 ? `댓글 ${p.comments}` : '댓글 달기'}
              </Text>
            </TouchableOpacity>
          ))
        ) : (
          // ── 사진: 미디어만 그리드 ──
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: PAD }}>
            {tiles.map((t, i) => (
              <TouchableOpacity key={t.key} activeOpacity={0.8} onPress={() => setOpenPost(posts.find((p) => p.id === t.postId))}
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

      {/* 맨 위로 — 스크롤 내려갔을 때만 (좌하단) */}
      {showTop && (
        <TouchableOpacity activeOpacity={0.85} onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
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
    </SafeAreaView>
    </SafeAreaProvider>
  );
}
