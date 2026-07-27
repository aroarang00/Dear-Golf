import React, { useState, useEffect } from 'react';
import { Modal, View, Text, ScrollView, TextInput, TouchableOpacity, RefreshControl } from 'react-native';
import AppTextInput from './common/AppTextInput';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { OverlayAlert } from './common/OverlayAlert';
import { Icon } from './common/Icon'; // 🔍 검색 커스텀 아이콘(이모지 통일)
import { searchUsersByNickname, findKakaoFriendUsers } from '../utils/friends';
import { maskKoreanName } from '../utils/maskName';
import { requestKakaoFriendsConsent } from '../utils/kakaoAuth';

// 아바타 색상 — 이름 글자 기준 순환
const AVATARS = [
  { bg: '#C8D9E6', fg: '#1A3D52' },
  { bg: '#F5E6A8', fg: '#5A4500' },
  { bg: '#6B1E2A', fg: '#F5E6A8' },
  { bg: '#6B8B5E', fg: '#fff' },
];
const paletteFor = (id) => AVATARS[(id.charCodeAt(id.length - 1) || 0) % AVATARS.length];

// 사람 한 줄 — 아바타 + 이름·핸디·등급 + 우측 액션 슬롯
function PersonRow({ person, right }) {
  const palette = paletteFor(person.id);
  // 친구 찾기 단계에선 핸디·신뢰등급·매너등급 비노출 (처음 보는 사람 평가 부담 방지 [[friend-card-avatar-design]])
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: C.bgSecondary, borderRadius: 14,
      paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10 }}>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: palette.bg,
        alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(18), color: palette.fg }}>{person.name.charAt(0)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal }}>{person.name}</Text>
        {/* 본명 입력자만 마스킹 본명(홍*동) — 동명이인 구분 단서. 안 넣었으면 표시 안 됨, 사용자가 알아서 검증 ([[realname-policy]]) */}
        {maskKoreanName(person.realName) ? (
          <Text style={{ fontFamily: F.sysM, fontSize: fs(11), color: C.warmGray, marginTop: 1 }}>{maskKoreanName(person.realName)}</Text>
        ) : null}
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
          backgroundColor: C.bgPrimary }}>
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

// 친구 찾기 — 카카오 친구 / 닉네임 검색 / 받은 신청 / 보낸 신청
export function FriendFinder({
  visible, onClose, initialTab = 'kakao',
  sentIds = [], sent = [], onSend, onCancelSend,
  friendIds = [], blockedIds = [], received = [], onAccept, onIgnore,
  hideKakao = false,   // Apple 로그인 유저 — 카카오 세션이 없어 카카오 친구 탭이 무의미(팝업만 뜸) → 탭 자체를 숨김
}) {
  const [tab, setTab] = useState(initialTab);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  // 카카오 친구 — 'idle'|'loading'|'ok'|'empty'|'no-consent'|'error'
  const [kakaoState, setKakaoState] = useState('idle');
  const [kakaoUsers, setKakaoUsers] = useState([]);  // [{ id: uid, name: nickname }]
  const [refreshing, setRefreshing] = useState(false); // 카카오 탭 당겨서 새로고침 스피너
  const [alert, setAlert] = useState(null);   // Modal 내부 OverlayAlert — 글로벌 showAppAlert가 Modal 뒤로 가려지는 이슈 회피

  // 안드로이드 뒤로가기 — 확인창이 떠 있으면 그것만 취소로 닫고, 아니면 모달을 닫는다.
  const handleRequestClose = () => {
    if (alert) { setAlert(null); return; }
    onClose();
  };

  useEffect(() => {
    if (visible) {
      // 카카오 탭이 숨겨진 상태(Apple 유저)에서 기본 진입 탭이 kakao면 닉네임 검색으로 대체
      setTab(hideKakao && initialTab === 'kakao' ? 'search' : initialTab);
      setQuery(''); setSearchResults([]); setAlert(null); setKakaoState('idle'); setKakaoUsers([]);
    }
  }, [visible, initialTab, hideKakao]);

  // 카카오 친구 중 Dear Golf 가입자 로드 — 카카오 탭 진입 시 1회. (friends scope 선택동의 + 팀멤버 조건)
  const loadKakao = async ({ silent = false } = {}) => {
    if (!silent) setKakaoState('loading'); // 당겨서 새로고침 땐 기존 목록 유지(상단 스피너만)
    try {
      const res = await findKakaoFriendUsers();
      if (res.status === 'ok') {
        // 차단한 사람은 내 화면에서 숨김 (카카오톡 차단친구 모델 — [[block-nickname]])
        const visible = res.users.filter(u => !blockedIds.includes(u.uid));
        setKakaoUsers(visible.map(u => ({ id: u.uid, name: u.nickname || '디어골프 친구' })));
        setKakaoState(visible.length ? 'ok' : 'empty');
      } else {
        setKakaoState(res.status); // 'no-consent' | 'error'
      }
    } catch (e) {
      if (__DEV__) console.warn('[FriendFinder] loadKakao 실패', e?.message);
      setKakaoState('error');
    }
  };
  useEffect(() => {
    if (visible && tab === 'kakao' && kakaoState === 'idle') loadKakao();
  }, [visible, tab, kakaoState]);
  // 당겨서 새로고침 — 방금 카카오 연동한 친구가 전파 지연으로 안 뜰 때 재조회 ([[kakao-friend-api-design]])
  const onRefreshKakao = async () => {
    setRefreshing(true);
    await loadKakao({ silent: true });
    setRefreshing(false);
  };

  // 신청중인 사람은 후보에 남겨 상태(신청함)로 표시
  const isFriend = (id) => friendIds.includes(id);
  const isSent = (id) => sentIds.includes(id);
  // 카카오 친구 목록 — 이미 친구 맺은 사람은 숨김(불필요·번잡). 신청중은 유지(취소 동선) ([[kakao-friend-api-design]])
  const kakaoCandidates = kakaoUsers.filter(p => !isFriend(p.id));

  const q = query.trim();

  // 닉네임 검색 — TextInput에서 "검색" 키(returnKeyType) 누를 때만 Firestore 호출 (글자마다 X)
  const runSearch = async () => {
    if (!q) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const users = await searchUsersByNickname(q);
      // 차단한 사람은 검색결과에서 숨김 (카카오톡 차단친구 모델 — [[block-nickname]])
      // FriendFinder UI는 옛 더미 객체 형태 기대 — uid/nickname을 매핑
      setSearchResults(users
        .filter(u => !blockedIds.includes(u.uid))
        .map(u => ({
          id: u.uid, name: u.nickname, realName: u.realName,
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
    ...(hideKakao ? [] : [{ key: 'kakao', label: '카카오 친구' }]),
    { key: 'search', label: '닉네임 검색' },
    { key: 'received', label: `받은 신청${received.length ? ` ${received.length}` : ''}` },
    { key: 'sent', label: `보낸 신청${sent.length ? ` ${sent.length}` : ''}` },
  ];

  // 후보 카드 우측 액션 — 친구/신청함/신청 가능
  const candidateRight = (person) => {
    if (isFriend(person.id)) {
      return (
        <View style={{ borderRadius: 14, paddingHorizontal: 14, paddingVertical: 7,
          backgroundColor: C.bgPrimary }}>
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.warmGray }}>친구</Text>
        </View>
      );
    }
    return (
      <RequestButton sent={isSent(person.id)}
        onPress={async () => {
          if (!onSend) return;
          const result = await onSend(person);
          if (result && result.ok === false) {
            const r = result.reason;
            if (r === 'incoming') setAlert({
              title: '이미 받은 신청이 있어요',
              message: `${person.name}님이 먼저 친구 신청을 보냈어요.\n'받은 신청'에서 수락하면 바로 친구가 돼요.`,
              buttons: [{ text: '확인' }],
            });
            else if (r === 'already_friends') setAlert({ title: '이미 친구예요', message: `${person.name}님과는 이미 친구예요.`, buttons: [{ text: '확인' }] });
            else if (r === 'already_requested') setAlert({ title: '이미 신청했어요', message: '상대가 수락하면 친구가 돼요.', buttons: [{ text: '확인' }] });
            else setAlert({ title: '친구 신청 실패', message: '잠시 후 다시 시도해 주세요.', buttons: [{ text: '확인' }] });
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
                borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 }}>
                <Icon name="search" size={fs(15)} color={C.warmGray} />
                <AppTextInput
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
            keyboardShouldPersistTaps="handled"
            refreshControl={tab === 'kakao'
              ? <RefreshControl refreshing={refreshing} onRefresh={onRefreshKakao} tintColor={C.warmGray} colors={[C.burgundy]} />
              : undefined}>

            {/* 카카오 친구 — Dear Golf 가입자만 노출 (카카오 친구 전체 X, 개인정보 보호)
                안내 멘트는 친구 N명 표시될 때만 목록 아래에 — 빈 상태에선 EmptyHint로 충분 */}
            {tab === 'kakao' && (
              <>
                {kakaoState === 'loading' && <EmptyHint text="카카오 친구를 불러오는 중…" />}

                {kakaoState === 'no-consent' && (
                  <View style={{ paddingTop: 24, alignItems: 'center' }}>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, textAlign: 'center', lineHeight: 19, marginBottom: 16 }}>
                      카카오 친구 중 Dear Golf 가입자를 찾으려면{'\n'}'카카오 친구 목록' 제공 동의가 필요해요.
                    </Text>
                    <TouchableOpacity onPress={async () => { try { await requestKakaoFriendsConsent(); } catch (e) {} setKakaoState('idle'); }}
                      activeOpacity={0.85} style={{ borderRadius: 12, paddingHorizontal: 20, paddingVertical: 11, backgroundColor: C.burgundy }}>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.butter }}>동의하고 친구 찾기</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {kakaoState === 'error' && (
                  <View style={{ paddingTop: 24, alignItems: 'center' }}>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, marginBottom: 16 }}>카카오 친구를 불러오지 못했어요</Text>
                    <TouchableOpacity onPress={() => setKakaoState('idle')}
                      activeOpacity={0.85} style={{ borderRadius: 12, paddingHorizontal: 20, paddingVertical: 11, backgroundColor: C.bgSecondary }}>
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal }}>다시 시도</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {kakaoState === 'empty' && (
                  <View style={{ paddingTop: 8 }}>
                    <EmptyHint text="카카오톡 친구 중 Dear Golf에 가입한 사람이 아직 없어요" />
                    <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, textAlign: 'center', marginTop: 8, lineHeight: 17 }}>
                      친구가 방금 가입했다면{'\n'}아래로 당겨 새로고침해보세요 ↓
                    </Text>
                  </View>
                )}

                {kakaoState === 'ok' && (
                  <>
                    {/* 이미 친구인 사람을 빼고 나니 후보가 없음 = 카카오 가입친구 전원 이미 친구 */}
                    {kakaoCandidates.length === 0 ? (
                      <View style={{ paddingTop: 8 }}>
                        <EmptyHint text="카카오 친구 중 Dear Golf 가입자와 이미 모두 친구예요" />
                        <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, textAlign: 'center', marginTop: 8, lineHeight: 17 }}>
                          새로 가입한 친구가 있다면{'\n'}아래로 당겨 새로고침해보세요 ↓
                        </Text>
                      </View>
                    ) : kakaoCandidates.map(p => (
                      <PersonRow key={p.id} person={p} right={candidateRight(p)} />
                    ))}
                    <View style={{ backgroundColor: C.bgSecondary, borderRadius: 10,
                      paddingHorizontal: 12, paddingVertical: 10, marginTop: 8 }}>
                      <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: C.charcoal, lineHeight: 18 }}>
                        💡 카카오톡 친구 중 <Text style={{ fontFamily: F.sysB, color: C.burgundy }}>Dear Golf에 가입한 사람만</Text> 보여요
                      </Text>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 4, lineHeight: 15 }}>
                        새로 가입한 친구는 아래로 당겨 새로고침하면 보여요.
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
                        <View style={{ backgroundColor: C.bgSecondary, borderRadius: 10,
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
                            backgroundColor: C.bgPrimary }}>
                          <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.warmGray }}>무시</Text>
                        </TouchableOpacity>
                      </View>
                    } />
                    ))}
                    <View style={{ backgroundColor: C.bgSecondary, borderRadius: 10,
                      paddingHorizontal: 12, paddingVertical: 10, marginTop: 8 }}>
                      <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: C.charcoal, lineHeight: 18 }}>
                        💡 받은 친구 신청은 <Text style={{ fontFamily: F.sysB, color: C.burgundy }}>계속 보관</Text>돼요
                      </Text>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 4, lineHeight: 15 }}>
                        무시해도 상대방에게 알리지 않으니 부담 갖지 마세요.
                      </Text>
                    </View>
                  </>
                )
            )}

            {/* 보낸 신청 — 상대가 수락하면 친구. 취소해도 상대에게 통보 X */}
            {tab === 'sent' && (
              sent.length === 0
                ? <EmptyHint text="보낸 친구 신청이 없어요" />
                : (
                  <>
                    {sent.map(p => (
                      <PersonRow key={p.id} person={p} right={
                        <TouchableOpacity onPress={() => onCancelSend && onCancelSend(p)} activeOpacity={0.8}
                          style={{ borderRadius: 14, paddingHorizontal: 14, paddingVertical: 7,
                            backgroundColor: C.bgPrimary }}>
                          <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.warmGray }}>신청 취소</Text>
                        </TouchableOpacity>
                      } />
                    ))}
                    <View style={{ backgroundColor: C.bgSecondary, borderRadius: 10,
                      paddingHorizontal: 12, paddingVertical: 10, marginTop: 8 }}>
                      <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: C.charcoal, lineHeight: 18 }}>
                        💡 상대가 <Text style={{ fontFamily: F.sysB, color: C.burgundy }}>수락하면 바로 친구</Text>가 돼요
                      </Text>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 4, lineHeight: 15 }}>
                        취소해도 상대방에게 알리지 않아요.
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
