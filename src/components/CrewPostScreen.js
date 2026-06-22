import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, TextInput, KeyboardAvoidingView, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaView, SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { F, fs } from '../constants/colors';
import { Icon } from './common/Icon';
import { useAndroidBack } from '../hooks/useAndroidBack';
import { containsProfanity, PROFANITY_BLOCK_MESSAGE } from '../utils/profanityFilter';

// 크루 게시물 상세 — 피드/그리드에서 게시물 탭 시 진입 (docs/crew-space-design.md §3.2).
//  글(옵션) + 미디어(옵션, 글만 가능) + 그 게시물의 댓글(B안). 페일스카이 라이트 테마.
//  ※ Phase 1 — mock 댓글. 실제 미디어·업로드·삭제·실댓글은 이어서.
const BG    = '#C8D9E6';
const INK   = '#1A3D52';
const SUB   = 'rgba(26,61,82,0.55)';
const CARD  = '#FFFFFF';
const SAGE_DEEP = '#5E7E42';
const LINE  = 'rgba(26,61,82,0.12)';

const INIT_COMMENTS = [
  { id: 'm1', n: '민', c: '#5B86A8', name: '민수', body: '스윙 좋다 👍', time: '2일 전' },
  { id: 'm2', n: '영', c: '#8FB06B', name: '영지', body: '여기 어디야? 코스 예쁘다', time: '1일 전' },
];

function Avatar({ n, c, size = 32, onPress }) {
  const inner = (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: F.sysB, fontSize: fs(size * 0.4), color: '#fff' }}>{n}</Text>
    </View>
  );
  return onPress ? <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{inner}</TouchableOpacity> : inner;
}

export function CrewPostScreen({ post, crew, onClose }) {
  useAndroidBack(true, onClose);
  const { width: winW } = useWindowDimensions();
  const [comments, setComments] = useState(post?.comments > 0 ? INIT_COMMENTS : []);
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState('');                  // 비속어 안내
  const [profileFor, setProfileFor] = useState(null);  // 프로필 탭 → DM 시트 대상

  const author = post?.author || { n: '나', c: SAGE_DEEP, name: '나' };
  const media = post?.media || [];
  const caption = post?.text || '';
  const time = post?.time || '';

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    if (containsProfanity(body)) { setErr(PROFANITY_BLOCK_MESSAGE); return; }   // 기존 필터 재사용
    setComments((prev) => [...prev, { id: `me${prev.length}`, n: '나', c: SAGE_DEEP, name: '나', body, time: '방금' }]);
    setDraft(''); setErr('');
  };

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      {/* 헤더 — ← · 크루명 · ⋯ */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12,
        borderBottomWidth: 0.5, borderBottomColor: LINE }}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ padding: 4 }}>
          <Text style={{ fontSize: fs(26), color: SAGE_DEEP, fontWeight: '600' }}>←</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, fontFamily: F.sysM, fontSize: fs(14), color: SUB, marginLeft: 6 }} numberOfLines={1}>{crew?.name || '크루'}</Text>
        <TouchableOpacity hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ padding: 4 }}>
          <Text style={{ fontSize: fs(20), color: INK }}>⋯</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* 작성자 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14 }}>
            <Avatar n={author.n} c={author.c} size={34} onPress={() => setProfileFor(author)} />
            <View style={{ marginLeft: 10 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: INK }}>{author.name}</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: SUB, marginTop: 1 }}>{time}</Text>
            </View>
          </View>

          {/* 글 */}
          {!!caption && (
            <Text style={{ fontFamily: F.sys, fontSize: fs(14.5), color: INK, marginTop: 12, marginHorizontal: 16, lineHeight: fs(22) }}>{caption}</Text>
          )}

          {/* 미디어 — 있을 때만(글만이면 생략). 여러장 가로 페이저 */}
          {media.length > 0 && (
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ marginTop: 14 }}>
              {media.map((m, mi) => (
                <View key={mi} style={{ width: winW, height: winW, backgroundColor: m.tint, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="image" size={fs(48)} color="rgba(255,255,255,0.85)" strokeWidth={1.3} />
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
                  {/* 저장 — 남이 올린 사진·영상 내 기기에 저장(expo-media-library 연결 예정) */}
                  <TouchableOpacity onPress={() => { /* TODO 저장 */ }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ position: 'absolute', bottom: 14, right: 14, width: 40, height: 40, borderRadius: 20,
                      backgroundColor: 'rgba(0,0,0,0.42)', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="download" size={fs(20)} color="#fff" strokeWidth={1.9} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}

          <View style={{ height: 0.5, backgroundColor: LINE, marginVertical: 16, marginHorizontal: 16 }} />

          {/* 댓글 */}
          <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: SUB, marginBottom: 14 }}>댓글 {comments.length}</Text>
            {comments.length === 0 && (
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: SUB, marginBottom: 8 }}>첫 댓글을 남겨보세요.</Text>
            )}
            {comments.map((cm) => (
              <View key={cm.id} style={{ flexDirection: 'row', marginBottom: 16 }}>
                <Avatar n={cm.n} c={cm.c} size={30} onPress={() => setProfileFor(cm)} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: INK }}>{cm.name}</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: SUB, marginLeft: 8 }}>{cm.time}</Text>
                  </View>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(13.5), color: INK, marginTop: 3, lineHeight: fs(19) }}>{cm.body}</Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>

        {/* 비속어 안내 */}
        {!!err && <Text style={{ color: '#B23B3B', fontFamily: F.sys, fontSize: fs(11.5), paddingHorizontal: 16, paddingBottom: 2 }}>{err}</Text>}
        {/* 댓글 입력 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8,
          borderTopWidth: 0.5, borderTopColor: LINE, backgroundColor: BG }}>
          <TextInput value={draft} onChangeText={(t) => { setDraft(t); if (err) setErr(''); }} placeholder="댓글 달기…" placeholderTextColor={SUB}
            style={{ flex: 1, backgroundColor: CARD, borderRadius: 20, paddingHorizontal: 16, paddingVertical: Platform.OS === 'ios' ? 10 : 6,
              fontFamily: F.sys, fontSize: fs(13.5), color: INK, marginRight: 8 }}
            returnKeyType="send" onSubmitEditing={send} />
          {/* 전송 = 종이비행기(원 없이, DM 버튼과 구분) */}
          <TouchableOpacity onPress={send} disabled={!draft.trim()} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }} style={{ padding: 7 }}>
            <Icon name="paperPlane" size={fs(24)} color={draft.trim() ? SAGE_DEEP : 'rgba(94,126,66,0.4)'} strokeWidth={1.8} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* 프로필 탭 → 메시지(DM) 시트 — 크루는 어차피 친구라 바로 DM 가능 (실제 DM 라우팅 연결 예정) */}
      {profileFor && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <TouchableOpacity activeOpacity={1} onPress={() => setProfileFor(null)} style={{ flex: 1, backgroundColor: 'rgba(26,61,82,0.35)' }} />
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: CARD, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 8, paddingBottom: 30 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: LINE }}>
              <Avatar n={profileFor.n} c={profileFor.c} size={36} />
              <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: INK, marginLeft: 12 }}>{profileFor.name}</Text>
            </View>
            <TouchableOpacity onPress={() => { /* TODO DM 라우팅 */ setProfileFor(null); }}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, paddingVertical: 16 }}>
              <View style={{ width: 28 }}><Icon name="paperPlane" size={fs(18)} color={SAGE_DEEP} strokeWidth={1.7} /></View>
              <Text style={{ fontFamily: F.sysM, fontSize: fs(14.5), color: INK }}>메시지 보내기</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
    </SafeAreaProvider>
  );
}
