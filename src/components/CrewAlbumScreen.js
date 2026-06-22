import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, useWindowDimensions } from 'react-native';
import { SafeAreaView, SafeAreaProvider, useSafeAreaInsets, initialWindowMetrics } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { F, fs } from '../constants/colors';
import { Icon } from './common/Icon';
import { useAndroidBack } from '../hooks/useAndroidBack';
import { CrewPostScreen } from './CrewPostScreen';
import { CrewComposeScreen } from './CrewComposeScreen';
import { CrewMembersScreen } from './CrewMembersScreen';

// 크루 앨범 — 리스트에서 크루 탭 시 진입 (docs/crew-space-design.md §3.1).
//  ★피드 + 사진 토글: 피드=글·사진·영상 섞인 카드(글만 가능), 사진=미디어만 그리드. 댓글은 게시물별(B안).
//  페일스카이 라이트 테마. ※ Phase 1 — mock 데이터.
const BG    = '#C8D9E6';
const INK   = '#1A3D52';
const SUB   = 'rgba(26,61,82,0.55)';
const CARD  = '#FFFFFF';
const SAGE  = '#8FB06B';
const SAGE_DEEP = '#5E7E42';
const LINE  = 'rgba(26,61,82,0.12)';

const MOCK_MEMBERS = [
  { n: '나', c: '#5E7E42' }, { n: '민', c: '#5B86A8' }, { n: '수', c: '#C98B7F' },
  { n: '영', c: '#8FB06B' }, { n: '준', c: '#9B7FB0' }, { n: '태', c: '#C9A24B' },
  { n: '지', c: '#5B86A8' }, { n: '현', c: '#C98B7F' },
];
const MOCK_NOTICE = '이번 주 토요일 오전 7시 클럽하우스 앞 집결입니다! 주차는 지하 2층에 하시고, 라운딩 후 근처 식당에서 점심 같이 해요. 못 오시는 분은 미리 댓글 남겨주세요 🙏';

// 게시물 = 글(옵션) + 미디어(옵션, 0장이면 글만) + 댓글
const MOCK_POSTS = [
  { id: 'p0', author: { n: '영', c: '#8FB06B', name: '영지' }, time: '방금',
    text: '토요일 라운딩 ⛳ 날씨 최고였다', media: [{ type: 'image', tint: '#A9C2D6' }], comments: 2 },
  { id: 'p1', author: { n: '민', c: '#5B86A8', name: '민수' }, time: '1시간 전',
    text: '다음 주 어디로 갈까요? 추천 받아요 🙌', media: [], comments: 5 },               // 글만
  { id: 'p2', author: { n: '나', c: '#5E7E42', name: '나' }, time: '어제',
    text: '', media: [{ type: 'video', tint: '#B0C99A' }, { type: 'image', tint: '#D6BBA9' }], comments: 1 }, // 미디어만
  { id: 'p3', author: { n: '준', c: '#9B7FB0', name: '준호' }, time: '2일 전',
    text: '베스트 스코어 갱신!! 🎉', media: [{ type: 'image', tint: '#C7A9C2' }], comments: 3 },
  { id: 'p4', author: { n: '수', c: '#C98B7F', name: '수진' }, time: '3일 전',
    text: '단체 사진 ☺️', media: [{ type: 'image', tint: '#A9B8D6' }, { type: 'image', tint: '#C9B7A0' }, { type: 'image', tint: '#B0C99A' }], comments: 0 },
];

function MiniAvatar({ n, c, i, size = 30, uri }) {
  const base = { width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor: '#fff', marginLeft: i === 0 ? 0 : -(size * 0.3) };
  if (uri) return <Image source={{ uri }} style={base} contentFit="cover" />;
  return (
    <View style={{ ...base, backgroundColor: c, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: F.sysB, fontSize: fs(size * 0.38), color: '#fff' }}>{n}</Text>
    </View>
  );
}

export function CrewAlbumScreen({ crew, onClose }) {
  useAndroidBack(true, onClose);
  const { width: winW } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('feed');         // 'feed' | 'photos'
  const [openPost, setOpenPost] = useState(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);

  const members = MOCK_MEMBERS;
  const [posts, setPosts] = useState(MOCK_POSTS);
  const [notice, setNotice] = useState(MOCK_NOTICE);
  const [noticeExpanded, setNoticeExpanded] = useState(false);

  // 게시 — 공지면 핀 교체(최신 대체), 아니면 피드 맨 위에 추가
  const handleSubmit = ({ isNotice, text, media }) => {
    if (isNotice) setNotice(text);
    else setPosts((prev) => [{ id: `new_${prev.length}`, author: { n: '나', c: SAGE_DEEP, name: '나' }, time: '방금', text, media, comments: 0 }, ...prev]);
    setComposeOpen(false);
  };

  if (openPost) return <CrewPostScreen post={openPost} crew={crew} onClose={() => setOpenPost(null)} />;
  if (composeOpen) return <CrewComposeScreen crew={crew} onClose={() => setComposeOpen(false)} onSubmit={handleSubmit} />;
  if (membersOpen) return <CrewMembersScreen crew={crew} onClose={() => setMembersOpen(false)} onLeave={() => { setMembersOpen(false); onClose(); }} />;

  // 사진 탭 — 모든 게시물의 미디어를 펼친 그리드
  const PAD = 12, GAP = 4, COLS = 3;
  const cell = Math.floor((winW - PAD * 2 - GAP * (COLS - 1)) / COLS);
  const tiles = posts.flatMap((p) => (p.media || []).map((m, mi) => ({ ...m, postId: p.id, key: `${p.id}_${mi}`, comments: p.comments })));

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
          numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>{crew?.name || '크루'}</Text>
        {/* 이름 옆 아바타(+N) + 리스트 → 멤버 화면 */}
        <TouchableOpacity onPress={() => setMembersOpen(true)} hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
          style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 10 }}>
          {members.slice(0, 3).map((m, i) => <MiniAvatar key={i} n={m.n} c={m.c} uri={m.uri} i={i} size={24} />)}
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

      {/* 공지 핀 — 길면 더보기/접기 (멤버 아바타는 헤더로 합침) */}
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

      {/* 피드 / 사진 토글 — 활성=세이지 채움(또렷하게) */}
      <View style={{ flexDirection: 'row', marginHorizontal: 14, marginTop: 12, marginBottom: 2,
        backgroundColor: 'rgba(26,61,82,0.08)', borderRadius: 11, padding: 3 }}>
        {[['feed', '피드'], ['photos', '사진']].map(([t, label]) => (
          <TouchableOpacity key={t} onPress={() => setTab(t)} activeOpacity={0.8}
            style={{ flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center', backgroundColor: tab === t ? SAGE_DEEP : 'transparent' }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: tab === t ? '#fff' : SUB }}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 10, paddingBottom: 90 }} showsVerticalScrollIndicator={false}>
        {tab === 'feed' ? (
          // ── 피드: 글·사진·영상 카드 ──
          posts.map((p) => (
            <TouchableOpacity key={p.id} activeOpacity={0.9} onPress={() => setOpenPost(p)}
              style={{ backgroundColor: CARD, borderRadius: 16, marginHorizontal: 14, marginBottom: 12, padding: 13,
                shadowColor: '#1A3D52', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 }}>
              {/* 작성자 */}
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <MiniAvatar n={p.author.n} c={p.author.c} uri={p.author.uri} i={0} size={32} />
                <View style={{ marginLeft: 10 }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(14.5), color: INK }}>{p.author.name}</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: SUB, marginTop: 1 }}>{p.time}</Text>
                </View>
              </View>
              {/* 글 */}
              {!!p.text && (
                <Text style={{ fontFamily: F.sys, fontSize: fs(15), color: INK, marginTop: 10, lineHeight: fs(22) }}>{p.text}</Text>
              )}
              {/* 미디어 (있을 때) — 1장 크게 / 여러장 가로 스크롤 */}
              {p.media.length > 0 && (
                <View style={{ marginTop: 11 }}>
                  {p.media.length === 1 ? (
                    <View style={{ width: '100%', aspectRatio: 1.3, borderRadius: 12, backgroundColor: p.media[0].tint,
                      alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      <Icon name="image" size={fs(34)} color="rgba(255,255,255,0.85)" strokeWidth={1.4} />
                      {p.media[0].type === 'video' && (
                        <View style={{ position: 'absolute', width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: fs(18), color: '#fff', marginLeft: 2 }}>▶</Text>
                        </View>
                      )}
                    </View>
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {p.media.map((m, mi) => (
                        <View key={mi} style={{ width: winW * 0.42, height: winW * 0.42, borderRadius: 12, marginRight: 6,
                          backgroundColor: m.tint, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                          <Icon name="image" size={fs(28)} color="rgba(255,255,255,0.85)" strokeWidth={1.4} />
                          {m.type === 'video' && (
                            <View style={{ position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ fontSize: fs(10), color: '#fff', marginLeft: 1 }}>▶</Text>
                            </View>
                          )}
                        </View>
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
                style={{ width: cell, height: cell, marginRight: i % COLS === COLS - 1 ? 0 : GAP, marginBottom: GAP,
                  borderRadius: 8, backgroundColor: t.tint, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <Icon name="image" size={fs(26)} color="rgba(255,255,255,0.85)" strokeWidth={1.5} />
                {t.type === 'video' && (
                  <View style={{ position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: fs(10), color: '#fff', marginLeft: 1 }}>▶</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
            {tiles.length === 0 && (
              <View style={{ width: '100%', alignItems: 'center', paddingTop: 50 }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: SUB }}>아직 사진·영상이 없어요.</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

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
