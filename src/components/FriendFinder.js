import React, { useState, useEffect } from 'react';
import { Modal, View, Text, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { C, F } from '../constants/colors';
import { getTrustGrade } from '../constants/trustGrade';
import { getMannerGrade } from '../constants/mannerGrade';

// 아바타 색상 — 이름 글자 기준 순환
const AVATARS = [
  { bg: '#C8D9E6', fg: '#1A3D52' },
  { bg: '#F5E6A8', fg: '#5A4500' },
  { bg: '#6B1E2A', fg: '#F5E6A8' },
  { bg: '#6B8B5E', fg: '#fff' },
];
const paletteFor = (id) => AVATARS[(id.charCodeAt(id.length - 1) || 0) % AVATARS.length];

// 카카오 친구 중 Dear Golf 유저 — 더미 (Phase 3에서 카카오 API 연동)
const KAKAO_CANDIDATES = [
  { id: 'k1', name: '정해인', hostedCount: 5, attendedCount: 9, mannerScore: 88, avg: 92 },
  { id: 'k2', name: '박서준', hostedCount: 31, attendedCount: 40, mannerScore: 91, avg: 85 },
  { id: 'k3', name: '손예진', hostedCount: 2, attendedCount: 5, mannerScore: 76, avg: 101 },
];

// 닉네임 검색 더미 풀 — Phase 3에서 Firestore 쿼리로 대체
const SEARCH_POOL = [
  { id: 's1', name: '김도윤', hostedCount: 12, attendedCount: 20, mannerScore: 84, avg: 89 },
  { id: 's2', name: '한지민', hostedCount: 8, attendedCount: 15, mannerScore: 90, avg: 95 },
  { id: 's3', name: '윤서아', hostedCount: 44, attendedCount: 30, mannerScore: 93, avg: 80 },
  { id: 's4', name: '강태오', hostedCount: 1, attendedCount: 3, mannerScore: 70, avg: 105 },
];

// 사람 한 줄 — 아바타 + 이름·핸디·등급 + 우측 액션 슬롯
function PersonRow({ person, right }) {
  const palette = paletteFor(person.id);
  const grade = getTrustGrade(person.hostedCount, person.mannerScore);
  const manner = getMannerGrade(person.mannerScore || 70);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: C.bgSecondary, borderRadius: 14, borderWidth: 0.5, borderColor: C.hairline,
      paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10 }}>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: palette.bg,
        alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: F.sys, fontSize: 18, color: palette.fg, fontWeight: '700' }}>{person.name.charAt(0)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.charcoal, fontWeight: '700' }}>{person.name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGray }}>핸디 {person.avg ?? '—'}</Text>
          <Text style={{ fontSize: 12 }}>{grade.emoji}</Text>
          <Text style={{ fontSize: 12 }}>{manner.emoji}</Text>
        </View>
      </View>
      {right}
    </View>
  );
}

// 친구 신청 버튼 — 신청 전/신청함 상태
function RequestButton({ sent, onPress }) {
  if (sent) {
    return (
      <View style={{ borderRadius: 14, paddingHorizontal: 14, paddingVertical: 7,
        backgroundColor: C.bgPrimary, borderWidth: 0.5, borderColor: C.hairline }}>
        <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGrayLight, fontWeight: '600' }}>신청함</Text>
      </View>
    );
  }
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}
      style={{ borderRadius: 14, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: C.burgundy }}>
      <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.butter, fontWeight: '700' }}>친구 신청</Text>
    </TouchableOpacity>
  );
}

// 빈 상태 한 줄
function EmptyHint({ text }) {
  return (
    <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGrayLight, textAlign: 'center', paddingVertical: 40 }}>
      {text}
    </Text>
  );
}

// 친구 찾기 — 카카오 친구 / 닉네임 검색 / 받은 신청
export function FriendFinder({
  visible, onClose, initialTab = 'kakao',
  sentIds = [], onSend,
  friendIds = [], received = [], onAccept, onIgnore,
}) {
  const [tab, setTab] = useState(initialTab);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (visible) { setTab(initialTab); setQuery(''); }
  }, [visible, initialTab]);

  // 이미 친구이거나 신청한 사람은 후보에서 제외하지 않고 상태로만 표시
  const isFriend = (id) => friendIds.includes(id);
  const isSent = (id) => sentIds.includes(id);

  const q = query.trim();
  const searchResults = q
    ? SEARCH_POOL.filter(p => p.name.includes(q))
    : [];

  const TABS = [
    { key: 'kakao', label: '카카오 친구' },
    { key: 'search', label: '닉네임 검색' },
    { key: 'received', label: `받은 신청${received.length ? ` ${received.length}` : ''}` },
  ];

  // 후보 카드 우측 액션 — 친구/신청함/신청 가능
  const candidateRight = (person) => {
    if (isFriend(person.id)) {
      return (
        <View style={{ borderRadius: 14, paddingHorizontal: 14, paddingVertical: 7,
          backgroundColor: C.bgPrimary, borderWidth: 0.5, borderColor: C.hairline }}>
          <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGrayLight, fontWeight: '600' }}>친구</Text>
        </View>
      );
    }
    return <RequestButton sent={isSent(person.id)} onPress={() => onSend && onSend(person)} />;
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'bottom', 'left', 'right']}>
          {/* 헤더 */}
          <View style={{ backgroundColor: C.navy, paddingHorizontal: 20, paddingVertical: 13,
            flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: 22, color: C.bgPrimary }}>←</Text>
            </TouchableOpacity>
            <Text style={{ fontFamily: F.sys, fontSize: 15, color: C.bgPrimary, fontWeight: '700' }}>친구 찾기</Text>
          </View>

          {/* 탭 */}
          <View style={{ flexDirection: 'row', backgroundColor: C.bgPrimary, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
            {TABS.map(t => {
              const on = tab === t.key;
              return (
                <TouchableOpacity key={t.key} onPress={() => setTab(t.key)} activeOpacity={0.7}
                  style={{ flex: 1, alignItems: 'center', paddingVertical: 13,
                    borderBottomWidth: 2, borderBottomColor: on ? C.burgundy : 'transparent' }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 13, fontWeight: on ? '700' : '500',
                    color: on ? C.burgundy : C.warmGray }}>{t.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 닉네임 검색 입력 */}
          {tab === 'search' && (
            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.bgSecondary,
                borderRadius: 10, borderWidth: 0.5, borderColor: C.hairline, paddingHorizontal: 14, paddingVertical: 10 }}>
                <Text style={{ fontSize: 13 }}>🔍</Text>
                <TextInput
                  style={{ flex: 1, fontFamily: F.sys, fontSize: 13, color: C.textPrimary, padding: 0 }}
                  placeholder="닉네임으로 검색"
                  placeholderTextColor={C.warmGrayLight}
                  value={query}
                  onChangeText={setQuery}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                />
              </View>
            </View>
          )}

          <ScrollView showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled">

            {/* 카카오 친구 */}
            {tab === 'kakao' && (
              <>
                <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginBottom: 10, lineHeight: 16 }}>
                  카카오 친구 중 Dear Golf를 쓰는 사람이에요
                </Text>
                {KAKAO_CANDIDATES.length === 0
                  ? <EmptyHint text="카카오 친구 중 Dear Golf 유저가 없어요" />
                  : KAKAO_CANDIDATES.map(p => (
                      <PersonRow key={p.id} person={p} right={candidateRight(p)} />
                    ))}
              </>
            )}

            {/* 닉네임 검색 */}
            {tab === 'search' && (
              q
                ? (searchResults.length === 0
                    ? <EmptyHint text="검색 결과가 없어요" />
                    : searchResults.map(p => (
                        <PersonRow key={p.id} person={p} right={candidateRight(p)} />
                      )))
                : <EmptyHint text="닉네임을 입력해 친구를 찾아보세요" />
            )}

            {/* 받은 신청 */}
            {tab === 'received' && (
              received.length === 0
                ? <EmptyHint text="받은 친구 신청이 없어요" />
                : received.map(p => (
                    <PersonRow key={p.id} person={p} right={
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <TouchableOpacity onPress={() => onAccept && onAccept(p)} activeOpacity={0.8}
                          style={{ borderRadius: 14, paddingHorizontal: 13, paddingVertical: 7, backgroundColor: C.burgundy }}>
                          <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.butter, fontWeight: '700' }}>수락</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => onIgnore && onIgnore(p.id)} activeOpacity={0.8}
                          style={{ borderRadius: 14, paddingHorizontal: 13, paddingVertical: 7,
                            backgroundColor: C.bgPrimary, borderWidth: 0.5, borderColor: C.hairline }}>
                          <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.warmGray, fontWeight: '600' }}>무시</Text>
                        </TouchableOpacity>
                      </View>
                    } />
                  ))
            )}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
