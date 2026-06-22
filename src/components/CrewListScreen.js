import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, TextInput } from 'react-native';
import { SafeAreaView, SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { F, fs } from '../constants/colors';
import { Icon } from './common/Icon';
import { useAndroidBack } from '../hooks/useAndroidBack';
import { CrewAlbumScreen } from './CrewAlbumScreen';
import { CrewCreateScreen } from './CrewCreateScreen';

// 크루(친구 소수 그룹) 공유 앨범 — 진입 첫 화면 = 내가 속한 크루 리스트 (docs/crew-space-design.md §3.0).
//  ★목록은 DM(다크룸)과 다르게 — 친구화면 톤(페일스카이) 라이트 테마.
//  상호작용: 탭=앨범 입장 / 길게누르기=메뉴(이름 변경·즐겨찾기) — 탭과 안 엇갈리게.
//  ※ Phase 1 — mock 데이터로 화면 디자인 단계. 데이터(crews)·앨범·만들기는 이어서 연결.
const BG    = '#C8D9E6';                 // 페일스카이 배경 (친구화면 액센트색)
const INK   = '#1A3D52';                 // 본문(네이비)
const SUB   = 'rgba(26,61,82,0.55)';     // 보조 텍스트
const CARD  = '#FFFFFF';                 // 박스(초대·메뉴)
const SAGE  = '#8FB06B';                 // 크루 아이덴티티(홈 진입 아이콘과 동색)
const SAGE_DEEP = '#5E7E42';             // 헤더 화살표·크루 아이콘 — 페일스카이에서 또렷하게(진한 세이지)
const LINE  = 'rgba(26,61,82,0.12)';     // 헤어라인(카드 테두리 등)
const ROW_LINE = 'rgba(26,61,82,0.25)';  // 크루 목록 행 구분선 — 더 또렷하게

// ── mock 데이터 (디자인 확인용) ──
const MOCK_INVITES = [
  { id: 'i1', name: '주말 골퍼', inviter: '민수', members: 9,
    avatars: [{ n: '민', c: '#5B86A8' }, { n: '수', c: '#C98B7F' }, { n: '영', c: '#8FB06B' }, { n: '준', c: '#9B7FB0' }] },
  { id: 'i2', name: '가족 라운딩', inviter: '영지', members: 4,
    avatars: [{ n: '영', c: '#8FB06B' }, { n: '엄', c: '#C98B7F' }] },
];
const INIT_CREWS = [
  { id: 'c1', name: '수요일저녁라운딩모임', members: 5, last: '방금', newCount: 3, fav: false },
  { id: 'c2', name: '수요회', members: 4, last: '2일 전', newCount: 0, fav: true },
  { id: 'c3', name: '가족 라운딩', members: 3, last: '1주 전', newCount: 0, fav: false },
];

function MiniAvatar({ n, c, i, uri }) {
  const base = { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: '#fff', marginLeft: i === 0 ? 0 : -10 };
  if (uri) return <Image source={{ uri }} style={base} contentFit="cover" />;
  return (
    <View style={{ ...base, backgroundColor: c, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: F.sysB, fontSize: fs(12.5), color: '#fff' }}>{n}</Text>
    </View>
  );
}

// 아바타 스택 — 최대 max개만 겹쳐 표시, 나머지는 +N (20명이어도 4개+N). total=실제 인원.
function AvatarStack({ avatars, total, max = 4 }) {
  const shown = (avatars || []).slice(0, max);
  const extra = (total || (avatars || []).length) - shown.length;
  return (
    <View style={{ flexDirection: 'row' }}>
      {shown.map((a, i) => <MiniAvatar key={i} n={a.n} c={a.c} uri={a.uri} i={i} />)}
      {extra > 0 && (
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(26,61,82,0.45)', borderWidth: 1.5, borderColor: '#fff',
          alignItems: 'center', justifyContent: 'center', marginLeft: -10 }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(11), color: '#fff' }}>+{extra}</Text>
        </View>
      )}
    </View>
  );
}

export function CrewListScreen({ onClose }) {
  useAndroidBack(true, onClose);

  const [crews, setCrews] = useState(INIT_CREWS);
  const invites = MOCK_INVITES;
  const [editingId, setEditingId] = useState(null);   // 이름변경 중인 크루
  const [draft, setDraft] = useState('');
  const [menuFor, setMenuFor] = useState(null);        // 길게누르기 메뉴 대상 크루
  const [openCrew, setOpenCrew] = useState(null);      // 앨범(상세) 열린 크루
  const [createOpen, setCreateOpen] = useState(false); // 크루 만들기

  const handleCreate = ({ name, members }) => {
    setCrews((prev) => [{ id: `c_new_${prev.length}`, name, members, last: '방금', newCount: 0, fav: false }, ...prev]);
    setCreateOpen(false);
  };

  const startEdit = (c) => { setEditingId(c.id); setDraft(c.name); };
  const saveEdit = () => {
    setCrews((prev) => prev.map((c) => (c.id === editingId ? { ...c, name: draft.trim() || c.name } : c)));
    setEditingId(null);
  };
  const toggleFav = () => {
    setCrews((prev) => prev.map((c) => (c.id === menuFor.id ? { ...c, fav: !c.fav } : c)));
    setMenuFor(null);
  };

  // 즐겨찾기 위로 정렬(안정 정렬)
  const ordered = [...crews].sort((a, b) => (b.fav === true) - (a.fav === true));
  const isEmpty = invites.length === 0 && crews.length === 0;

  // 앨범(상세) 열림 — 같은 Modal 안에서 리스트↔앨범 전환(DM 목록↔대화방과 동일)
  if (openCrew) return <CrewAlbumScreen crew={openCrew} onClose={() => setOpenCrew(null)} />;
  if (createOpen) return <CrewCreateScreen onClose={() => setCreateOpen(false)} onCreate={handleCreate} />;

  return (
    // RN Modal 안에선 루트 SafeAreaProvider가 안 닿아 top inset이 0 → 헤더(뒤로가기)가 노치 밑으로 올라가 안 눌림.
    //   DMListScreen과 동일 처리: 자체 Provider로 재측정([[dm-design]] iOS safe-area 버그).
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      {/* 헤더 — ← 닫기 · 제목 · ＋ 만들기 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12,
        borderBottomWidth: 0.5, borderBottomColor: LINE }}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ padding: 4 }}>
          <Text style={{ fontSize: fs(26), color: SAGE_DEEP, fontWeight: '600' }}>←</Text>
        </TouchableOpacity>
        {/* 타이틀 = 홈 진입점과 동일한 크루 아이콘(진한 세이지, 키움) */}
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Icon name="crew" size={fs(34)} color={SAGE_DEEP} strokeWidth={1.8} />
        </View>
        <TouchableOpacity onPress={() => setCreateOpen(true)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ padding: 4 }}>
          <Icon name="personAdd" size={fs(24)} color={INK} strokeWidth={1.8} />
        </TouchableOpacity>
      </View>

      {isEmpty ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, borderWidth: 1.5, borderColor: 'rgba(143,176,107,0.6)',
            alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
            <Icon name="crew" size={fs(38)} color={SAGE} strokeWidth={1.6} />
          </View>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: INK, marginBottom: 6 }}>아직 크루가 없어요</Text>
          <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: SUB, textAlign: 'center', lineHeight: fs(19) }}>
            친한 친구들과 사진·영상을 함께 모으는{'\n'}프라이빗 공간을 만들어보세요.
          </Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
          {/* 초대됨 — "초대됨 N" 헤더 + 컴팩트 행(여러 개여도 안 밀림) */}
          {invites.length > 0 && (
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: SAGE_DEEP, letterSpacing: 1, marginBottom: 8 }}>초대됨 {invites.length}</Text>
              <View style={{ backgroundColor: CARD, borderRadius: 14, borderWidth: 0.5, borderColor: LINE, overflow: 'hidden' }}>
                {invites.map((iv, i) => (
                  <View key={iv.id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 11,
                    borderTopWidth: i === 0 ? 0 : 0.5, borderTopColor: LINE }}>
                    <AvatarStack avatars={iv.avatars} total={iv.members} max={3} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(14.5), color: INK }} numberOfLines={1}>{iv.name}</Text>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: SUB, marginTop: 2 }} numberOfLines={1}>{iv.inviter}님 초대 · {iv.members}명</Text>
                    </View>
                    <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }} style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: SUB }}>거절</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={{ backgroundColor: SAGE_DEEP, borderRadius: 8, paddingHorizontal: 13, paddingVertical: 6, marginLeft: 2 }}>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(12.5), color: '#fff' }}>수락</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* 내 크루 — 아바타 없이 리스트. 탭=앨범 입장 / 길게=메뉴. 즐겨찾기 위로. */}
          {ordered.map((c) => editingId === c.id ? (
            <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13,
              borderBottomWidth: 1, borderBottomColor: ROW_LINE }}>
              <TextInput value={draft} onChangeText={setDraft} autoFocus maxLength={10}
                allowFontScaling={false} onSubmitEditing={saveEdit} returnKeyType="done"
                placeholder="크루 이름" placeholderTextColor={SUB}
                style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(15), color: INK, paddingVertical: 4,
                  borderBottomWidth: 1.5, borderBottomColor: SAGE, marginRight: 10 }} />
              <TouchableOpacity onPress={saveEdit} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 9, backgroundColor: SAGE }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: '#fff' }}>저장</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity key={c.id} activeOpacity={0.6}
              onPress={() => setOpenCrew(c)}
              onLongPress={() => setMenuFor(c)} delayLongPress={280}
              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13,
                borderBottomWidth: 1, borderBottomColor: ROW_LINE }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(15.5), color: INK }}>{c.name}</Text>
                  {/* 즐겨찾기 = 이름 우측 하트(♥). 깃발·점으로 교체 가능 */}
                  {c.fav && <View style={{ marginLeft: 6 }}><Icon name="heartFilled" size={fs(13)} /></View>}
                </View>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: SUB, marginTop: 3 }}>{c.members}명 · {c.last}</Text>
              </View>
              {/* 새 댓글·사진 = N 숫자 */}
              {c.newCount > 0 && (
                <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 7, backgroundColor: SAGE,
                  alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: '#fff' }}>{c.newCount > 99 ? '99+' : c.newCount}</Text>
                </View>
              )}
              <Text style={{ fontSize: fs(22), color: 'rgba(26,61,82,0.3)' }}>›</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* 길게누르기 메뉴 — 이름 변경 · 즐겨찾기 (중첩 Modal 회피 위해 화면 내 오버레이) */}
      {menuFor && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <TouchableOpacity activeOpacity={1} onPress={() => setMenuFor(null)}
            style={{ flex: 1, backgroundColor: 'rgba(26,61,82,0.35)' }} />
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: CARD,
            borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 8, paddingBottom: 30 }}>
            <View style={{ alignItems: 'center', paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: LINE }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: INK }}>{menuFor.name}</Text>
            </View>
            <TouchableOpacity onPress={toggleFav}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16 }}>
              <View style={{ width: 28 }}><Icon name={menuFor.fav ? 'heart' : 'heartFilled'} size={fs(18)} color={INK} /></View>
              <Text style={{ fontFamily: F.sysM, fontSize: fs(14.5), color: INK }}>{menuFor.fav ? '즐겨찾기 해제' : '즐겨찾기'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { startEdit(menuFor); setMenuFor(null); }}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16 }}>
              <View style={{ width: 28 }}><Icon name="pen" size={fs(18)} color={INK} strokeWidth={1.7} /></View>
              <Text style={{ fontFamily: F.sysM, fontSize: fs(14.5), color: INK }}>이름 변경</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
    </SafeAreaProvider>
  );
}
