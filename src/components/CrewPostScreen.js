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
import { subscribeCrewComments, addCrewComment } from '../utils/crews';
import { resolveMemberDisplay } from '../utils/friends';

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

export function CrewPostScreen({ post, crew, onClose }) {
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

  const author = post?.author || { n: '나', c: SAGE_DEEP, name: '나' };
  const media = post?.media || [];
  const caption = post?.text || '';
  const time = post?.time || '';

  // 댓글 실시간 구독
  useEffect(() => {
    if (!crewId || !postId) return;
    return subscribeCrewComments(crewId, postId, setCommentDocs);
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

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    if (containsProfanity(body)) { setErr(PROFANITY_BLOCK_MESSAGE); return; }   // 기존 필터 재사용
    if (!currentUid || !crewId || !postId) return;
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

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
    <KeyboardProvider>
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      {/* 헤더 — ← · 크루명 · ⋯ */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12,
        borderBottomWidth: 0.5, borderBottomColor: LINE }}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ padding: 4 }}>
          <Text style={{ fontSize: fs(26), color: SAGE_DEEP, fontWeight: '600' }}>←</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(16), color: INK, marginLeft: 6 }} numberOfLines={1}>{crew?.name || '크루'}</Text>
        <TouchableOpacity hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ padding: 4 }}>
          <Text style={{ fontSize: fs(20), color: INK }}>⋯</Text>
        </TouchableOpacity>
      </View>

        <ScrollView style={{ flex: 1, backgroundColor: CONTENT }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* 작성자 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14 }}>
            <Avatar n={author.n} c={author.c} uri={author.uri} size={34} onPress={() => setProfileFor(author)} />
            <View style={{ marginLeft: 10 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: INK }}>{author.name}</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: SUB, marginTop: 1 }}>{time}</Text>
            </View>
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
                <View key={mi} style={{ width: winW, height: winW, backgroundColor: 'rgba(26,61,82,0.06)', alignItems: 'center', justifyContent: 'center' }}>
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
                  {/* 저장은 인라인 X — 탭하면 확대(풀스크린 줌 뷰어)에서 저장(expo-media-library). 뷰어 연동은 후속 */}
                </View>
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
                  <Avatar n={cm.n} c={cm.c} uri={cm.uri} size={30} onPress={() => setProfileFor(cm)} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: INK }}>{cm.name}</Text>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: SUB, marginLeft: 8 }}>{cm.time}</Text>
                    </View>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(16), color: INK, marginTop: 3, lineHeight: fs(22) }}>{cm.body}</Text>
                    <TouchableOpacity onPress={() => setReplyTo({ id: cm.id, name: cm.name })} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} style={{ marginTop: 5, alignSelf: 'flex-start' }}>
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(11.5), color: SAGE_DEEP }}>답글</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                {/* 대댓글(들여쓰기) */}
                {(cm.replies || []).map((r) => (
                  <View key={r.id} style={{ flexDirection: 'row', marginLeft: 40, marginTop: 12 }}>
                    <Avatar n={r.n} c={r.c} uri={r.uri} size={26} onPress={() => setProfileFor(r)} />
                    <View style={{ flex: 1, marginLeft: 9 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={{ fontFamily: F.sysB, fontSize: fs(12.5), color: INK }}>{r.name}</Text>
                        <Text style={{ fontFamily: F.sys, fontSize: fs(10.5), color: SUB, marginLeft: 8 }}>{r.time}</Text>
                      </View>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(16), color: INK, marginTop: 2, lineHeight: fs(20) }}>{r.body}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>

        {/* 입력 영역 — kbPadStyle: 키보드 높이만큼 paddingBottom으로 들어올림(안드 RN Modal 대응) */}
        <Animated.View style={[{ backgroundColor: BG }, kbPadStyle]}>
          {/* 대댓글 대상 배너 */}
          {replyTo && (
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
              allowFontScaling={false} placeholder={replyTo ? `${replyTo.name}님에게 답글…` : '댓글 달기…'} placeholderTextColor={SUB}
              style={{ flex: 1, backgroundColor: CARD, borderRadius: 22, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11,
                fontFamily: F.sys, fontSize: fs(17), lineHeight: 23, color: INK, marginRight: 8, borderWidth: 0.5, borderColor: LINE }}
              returnKeyType="send" onSubmitEditing={send} />
            {/* 전송 = 종이비행기 */}
            <TouchableOpacity onPress={send} disabled={!draft.trim()} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }} style={{ padding: 6 }}>
              <Icon name="paperPlane" size={fs(30)} color={draft.trim() ? SAGE_DEEP : 'rgba(94,126,66,0.4)'} strokeWidth={1.9} />
            </TouchableOpacity>
          </View>
        </Animated.View>

      {/* 프로필 탭 → 메시지(DM) 시트 — 크루는 어차피 친구라 바로 DM 가능 (실제 DM 라우팅 연결 예정) */}
      {profileFor && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <TouchableOpacity activeOpacity={1} onPress={() => setProfileFor(null)} style={{ flex: 1, backgroundColor: 'rgba(26,61,82,0.35)' }} />
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: CARD, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 8, paddingBottom: 30 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: LINE }}>
              <Avatar n={profileFor.n} c={profileFor.c} uri={profileFor.uri} size={36} />
              <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: INK, marginLeft: 12 }}>{profileFor.name}</Text>
            </View>
            <TouchableOpacity onPress={() => { /* TODO DM 라우팅 */ setProfileFor(null); }}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, paddingVertical: 16 }}>
              <View style={{ width: 32 }}><Icon name="send" size={fs(22)} color={SAGE_DEEP} strokeWidth={1.7} /></View>
              <Text style={{ fontFamily: F.sysM, fontSize: fs(16), color: INK }}>메시지 보내기</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
    </KeyboardProvider>
    </SafeAreaProvider>
  );
}
