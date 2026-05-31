import React, { useState, useEffect } from 'react';
import { Modal, View, Text, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { getTrustGrade } from '../constants/trustGrade';
import { getMannerGrade } from '../constants/mannerGrade';
import { OverlayAlert } from './common/OverlayAlert';
import { FRIEND_REQUEST_DAILY_LIMIT } from '../utils/friendRequestLimit';
import { searchUsersByNickname } from '../utils/friends';

// 아바타 색상 — 이름 글자 기준 순환
const AVATARS = [
  { bg: '#C8D9E6', fg: '#1A3D52' },
  { bg: '#F5E6A8', fg: '#5A4500' },
  { bg: '#6B1E2A', fg: '#F5E6A8' },
  { bg: '#6B8B5E', fg: '#fff' },
];
const paletteFor = (id) => AVATARS[(id.charCodeAt(id.length - 1) || 0) % AVATARS.length];

// 카카오 친구 매칭은 카카오 비즈니스 검수 후 활성화 ([[kakao-friend-api-design]]) — 현재 빈 배열.
const KAKAO_CANDIDATES = [];

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
        <Text style={{ fontFamily: F.sysB, fontSize: fs(18), color: palette.fg }}>{person.name.charAt(0)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal }}>{person.name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>핸디 {person.avg ?? '—'}</Text>
          <Text style={{ fontSize: fs(12) }}>{grade.emoji}</Text>
          <Text style={{ fontSize: fs(12) }}>{manner.emoji}</Text>
        </View>
      </View>
      {right}
    </View>
  );
}

// 친구 신청 버튼 — 신청 전/신청함(누르면 취소) 토글
function RequestButton({ sent, onPress, onCancel }) {
  if (sent) {
    return (
      <TouchableOpacity onPress={onCancel} activeOpacity={0.8}
        style={{ borderRadius: 14, paddingHorizontal: 14, paddingVertical: 7,
          backgroundColor: C.bgPrimary, borderWidth: 0.5, borderColor: C.warmGrayLight }}>
        <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.warmGray }}>신청함 · 취소</Text>
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}
      style={{ borderRadius: 14, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: C.burgundy }}>
      <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: C.butter }}>친구 신청</Text>
    </TouchableOpacity>
  );
}

// 빈 상태 한 줄
function EmptyHint({ text }) {
  return (
    <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, textAlign: 'center', paddingVertical: 40 }}>
      {text}
    </Text>
  );
}

// 친구 찾기 — 카카오 친구 / 닉네임 검색 / 받은 신청
export function FriendFinder({
  visible, onClose, initialTab = 'kakao',
  sentIds = [], onSend, onCancelSend,
  friendIds = [], received = [], onAccept, onIgnore,
}) {
  const [tab, setTab] = useState(initialTab);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [alert, setAlert] = useState(null);   // Modal 내부 OverlayAlert — 글로벌 showAppAlert가 Modal 뒤로 가려지는 이슈 회피

  // 안드로이드 뒤로가기 — 확인창이 떠 있으면 그것만 취소로 닫고, 아니면 모달을 닫는다.
  const handleRequestClose = () => {
    if (alert) { setAlert(null); return; }
    onClose();
  };

  useEffect(() => {
    if (visible) { setTab(initialTab); setQuery(''); setSearchResults([]); setAlert(null); }
  }, [visible, initialTab]);

  // 이미 친구이거나 신청한 사람은 후보에서 제외하지 않고 상태로만 표시
  const isFriend = (id) => friendIds.includes(id);
  const isSent = (id) => sentIds.includes(id);

  const q = query.trim();

  // 닉네임 검색 — TextInput에서 "검색" 키(returnKeyType) 누를 때만 Firestore 호출 (글자마다 X)
  const runSearch = async () => {
    if (!q) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const users = await searchUsersByNickname(q);
      // FriendFinder UI는 옛 더미 객체 형태 기대 — uid/nickname을 매핑
      setSearchResults(users.map(u => ({
        id: u.uid, name: u.nickname,
        hostedCount: 0, attendedCount: 0, mannerScore: 0, avg: null,
      })));
    } catch (e) {
      if (__DEV__) console.warn('[FriendFinder] search failed', e?.message);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

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
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.warmGray }}>친구</Text>
        </View>
      );
    }
    return (
      <RequestButton sent={isSent(person.id)}
        onPress={async () => {
          if (!onSend) return;
          const result = await onSend(person);
          if (result && result.ok === false && result.reason === 'limit') {
            setAlert({
              title: '오늘 친구 신청 한도를 초과했어요',
              message: `친구 신청은 하루 ${FRIEND_REQUEST_DAILY_LIMIT}건으로 제한되어 있어요.\n내일 다시 시도해주세요.`,
              buttons: [{ text: '확인' }],
            });
          }
        }}
        onCancel={() => onCancelSend && onCancelSend(person)} />
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleRequestClose}>
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'bottom', 'left', 'right']}>
          {/* 헤더 */}
          <View style={{ backgroundColor: C.navy, paddingHorizontal: 20, paddingVertical: 13,
            flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: fs(22), color: C.bgPrimary }}>←</Text>
            </TouchableOpacity>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.bgPrimary }}>친구 찾기</Text>
          </View>

          {/* 탭 */}
          <View style={{ flexDirection: 'row', backgroundColor: C.bgPrimary, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
            {TABS.map(t => {
              const on = tab === t.key;
              return (
                <TouchableOpacity key={t.key} onPress={() => setTab(t.key)} activeOpacity={0.7}
                  style={{ flex: 1, alignItems: 'center', paddingVertical: 13,
                    borderBottomWidth: 2, borderBottomColor: on ? C.burgundy : 'transparent' }}>
                  <Text style={{ fontFamily: on ? F.sysB : F.sysM, fontSize: fs(13),
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
                <Text style={{ fontSize: fs(13) }}>🔍</Text>
                <TextInput
                  style={{ flex: 1, fontFamily: F.sys, fontSize: fs(13), color: C.textPrimary, padding: 0 }}
                  placeholder="닉네임으로 검색"
                  placeholderTextColor={C.warmGrayLight}
                  value={query}
                  onChangeText={(t) => { setQuery(t); if (!t.trim()) setSearchResults([]); }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  onSubmitEditing={runSearch}
                />
              </View>
            </View>
          )}

          <ScrollView showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled">

            {/* 카카오 친구 — Dear Golf 가입자만 노출 (카카오 친구 전체 X, 개인정보 보호)
                안내 멘트는 친구 N명 표시될 때만 목록 아래에 — 빈 상태에선 EmptyHint로 충분 */}
            {tab === 'kakao' && (
              <>
                {KAKAO_CANDIDATES.length === 0 ? (
                  <EmptyHint text="카카오톡 친구 중 Dear Golf에 가입한 사람이 아직 없어요" />
                ) : (
                  <>
                    {KAKAO_CANDIDATES.map(p => (
                      <PersonRow key={p.id} person={p} right={candidateRight(p)} />
                    ))}
                    <View style={{ backgroundColor: C.bgSecondary, borderRadius: 10, borderWidth: 0.5, borderColor: C.hairline,
                      paddingHorizontal: 12, paddingVertical: 10, marginTop: 8 }}>
                      <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: C.charcoal, lineHeight: 18 }}>
                        💡 카카오톡 친구 중 <Text style={{ fontFamily: F.sysB, color: C.burgundy }}>Dear Golf에 가입한 사람만</Text> 보여요
                      </Text>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 4, lineHeight: 15 }}>
                        다른 친구가 가입하면 자동으로 여기에 표시돼요.
                      </Text>
                    </View>
                  </>
                )}
              </>
            )}

            {/* 닉네임 검색 — Dear Golf에 설정한 닉네임으로만 검색 (카카오톡 이름 ≠ Dear Golf 닉네임 가능) */}
            {tab === 'search' && (
              q
                ? (searchResults.length === 0
                    ? (
                      <>
                        <EmptyHint text="검색 결과가 없어요" />
                        <View style={{ backgroundColor: C.bgSecondary, borderRadius: 10, borderWidth: 0.5, borderColor: C.hairline,
                          paddingHorizontal: 12, paddingVertical: 10, marginTop: 8 }}>
                          <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: C.charcoal, lineHeight: 18 }}>
                            💡 <Text style={{ fontFamily: F.sysB, color: C.burgundy }}>Dear Golf에 설정한 닉네임</Text>으로만 검색돼요
                          </Text>
                          <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 4, lineHeight: 15 }}>
                            카카오톡 이름과 다를 수 있어요. 친구에게 Dear Golf 닉네임을 물어보세요.
                          </Text>
                        </View>
                      </>
                    )
                    : searchResults.map(p => (
                        <PersonRow key={p.id} person={p} right={candidateRight(p)} />
                      )))
                : (
                  <>
                    <EmptyHint text="닉네임을 입력해 친구를 찾아보세요" />
                    <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, textAlign: 'center', marginTop: 6, lineHeight: 16 }}>
                      Dear Golf에 설정한 닉네임으로 검색돼요
                    </Text>
                  </>
                )
            )}

            {/* 받은 신청 — 60일 만료·무시 시 상대방 통보 X 정책 [[friend-add-feature]] */}
            {tab === 'received' && (
              received.length === 0
                ? <EmptyHint text="받은 친구 신청이 없어요" />
                : (
                  <>
                    {received.map(p => (
                      <PersonRow key={p.id} person={p} right={
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <TouchableOpacity onPress={() => onAccept && onAccept(p)} activeOpacity={0.8}
                            style={{ borderRadius: 14, paddingHorizontal: 13, paddingVertical: 7, backgroundColor: C.burgundy }}>
                            <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: C.butter }}>수락</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => onIgnore && onIgnore(p.id)} activeOpacity={0.8}
                            style={{ borderRadius: 14, paddingHorizontal: 13, paddingVertical: 7,
                            backgroundColor: C.bgPrimary, borderWidth: 0.5, borderColor: C.hairline }}>
                          <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.warmGray }}>무시</Text>
                        </TouchableOpacity>
                      </View>
                    } />
                    ))}
                    <View style={{ backgroundColor: C.bgSecondary, borderRadius: 10, borderWidth: 0.5, borderColor: C.hairline,
                      paddingHorizontal: 12, paddingVertical: 10, marginTop: 8 }}>
                      <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: C.charcoal, lineHeight: 18 }}>
                        💡 친구 신청은 <Text style={{ fontFamily: F.sysB, color: C.burgundy }}>60일간 보관</Text>돼요
                      </Text>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 4, lineHeight: 15 }}>
                        무시해도 상대방에게 알리지 않으니 부담 갖지 마세요.
                      </Text>
                    </View>
                  </>
                )
            )}
          </ScrollView>
          <OverlayAlert data={alert} onClose={() => setAlert(null)} />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
