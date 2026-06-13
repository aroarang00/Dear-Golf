import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StatusBar } from 'react-native';
import { Image } from 'expo-image'; // 아바타 디스크캐시 ([[image-load-speed]])
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler'; // 행 좌측밀기 삭제(친구카드와 동일 레거시 Swipeable). RN Modal 안이라 자체 RootView 필요
import { SafeAreaView, SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';

// DM 다크 룸 팔레트 — DMChatScreen과 동일(소스 오브 트루스는 거기, 같이 바꿀 것). 목록도 다크로 맞춰 방 전환 시 안 튀게.
const DM_CANVAS   = '#2A2622';                 // 리스트 배경
const DM_SURFACE  = '#211E1B';                 // 헤더·상태바 영역
const DM_BUTTER   = '#F5E6A8';                 // ←·제목·친구 이름 — 채팅 헤더와 통일(버터)
const DM_PALESKY  = '#C8D9E6';                 // 미리보기·시각 — 채팅 부제와 통일(페일스카이)
const DM_LINE     = 'rgba(255,255,255,0.08)';  // 다크용 헤어라인·구분선
const DM_AVATAR   = '#46403B';                 // 친구 아바타 이니셜 배경(대화방과 통일)
import { getUid } from '../utils/firebase';
import { subscribeConversations, otherUidOf, clearConversation } from '../utils/dm';
import { loadFriendData, friendDisplayName } from '../utils/friendGroups';
import { loadMyFriendsEnriched, loadMyBlockedUids } from '../utils/friends';
import { useAndroidBack } from '../hooks/useAndroidBack';
import { STORAGE_KEYS, storage } from '../utils/storage';

// 대화 목록 시각 — 오늘이면 오전/오후 h:mm, 아니면 월.일
// DM 목록 시각 — 인스타·카톡식 상대표현. 오늘=시간 / 어제 / N일 전(~6) / N주 전(~4) / 그 이상=날짜.
function fmtTime(ts) {
  const ms = ts?.toMillis ? ts.toMillis() : 0;
  if (!ms) return '';
  const d = new Date(ms);
  const now = new Date();
  // 오늘 → 시간
  if (d.toDateString() === now.toDateString()) {
    const h = d.getHours(), m = d.getMinutes();
    return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${String(m).padStart(2, '0')}`;
  }
  // 날짜 차이(자정 기준)로 상대표현
  const a = new Date(d); a.setHours(0, 0, 0, 0);
  const t = new Date(now); t.setHours(0, 0, 0, 0);
  const days = Math.round((t - a) / 86400000);
  if (days === 1) return '어제';
  if (days <= 6) return `${days}일 전`;
  if (days <= 34) return `${Math.floor(days / 7)}주 전`;
  // 그 이상 — 같은 해면 'M월 D일', 다른 해면 'YYYY. M. D'
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`;
}

// 친구 메시지 목록 — 인스타식 대화 리스트. 항목 탭 → 대화방 ([[dm-design]]).
//   열린 동안만 conversations 실시간 구독. 이름은 내 별명(customName) 우선 resolve([[friend_groups]]).
//   헤더에 'DM 알림 받기' 전역 토글 자리(출시 후 실연결).
export function DMListScreen({ onClose, onOpenChat }) {
  const [myUid, setMyUid] = useState(null);
  const [convs, setConvs] = useState(null);    // null = 로딩 중
  const [nameMap, setNameMap] = useState({});  // uid → nickname
  const [avatarMap, setAvatarMap] = useState({});  // uid → 원격 avatarUrl (사진 우선·이니셜 fallback, 친구리스트와 동일)
  const [friendMeta, setFriendMeta] = useState({});
  const [blocked, setBlocked] = useState([]);  // 차단 uid — 늦게 도착해도 렌더에서 필터(목록 즉시 표시 위해 구독과 분리)
  const [friendsList, setFriendsList] = useState([]);  // 전체 친구 — 상단 검색으로 누구든 골라 바로 대화 시작
  const [query, setQuery] = useState('');              // 상단 검색어 — 비면 대화목록, 입력하면 친구 검색결과(별도 화면 X, 뒤로가기 혼란 없음)
  useAndroidBack(true, onClose);

  // 상단 검색 — 입력 시 전체 친구를 이름(별명·닉네임·본명)으로 필터(차단 제외). 탭하면 바로 대화방(기존·신규 무관).
  const friendResults = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return friendsList.filter(f => f.id && !blocked.includes(f.id)).filter(f => {
      const dn = friendDisplayName(friendMeta, f.id, nameMap[f.id] || f.nickname || f.name || '');
      return dn?.includes(q) || f.nickname?.includes(q) || f.name?.includes(q) || f.realName?.includes(q);
    });
  }, [friendsList, query, blocked, friendMeta, nameMap]);

  // 캐시된 친구 이름·아바타 즉시 표시(다음 진입부터 N번 user 문서 읽기를 안 기다림) — fresh 로드 도착하면 갱신.
  useEffect(() => {
    storage.load(STORAGE_KEYS.dmFriendMeta, null).then(c => {
      if (!c) return;
      if (c.names) setNameMap(p => (Object.keys(p).length ? p : c.names));
      if (c.avatars) setAvatarMap(p => (Object.keys(p).length ? p : c.avatars));
      if (c.meta) setFriendMeta(p => (Object.keys(p).length ? p : c.meta));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    let unsub = () => {};
    (async () => {
      const uid = await getUid();
      if (!alive) return;
      setMyUid(uid);
      // 대화 목록을 즉시 구독 — 친구 메타(이름·아바타·차단) 로딩을 기다리지 않아 목록이 바로 뜸(느린 로딩 개선).
      //   이름·아바타는 친구 메타가 채워지면 리렌더로 hydrate, 차단 숨김은 blocked state 도착 후 렌더에서 적용.
      unsub = subscribeConversations(uid, (list) => { if (alive) setConvs(list); });
      // 친구 메타·차단은 병렬로 별도 로드(목록 표시를 막지 않음)
      try {
        const [fd, friends, blockedArr] = await Promise.all([
          loadFriendData(), loadMyFriendsEnriched(), loadMyBlockedUids().catch(() => []),
        ]);
        if (alive) {
          setFriendMeta(fd.friendMeta || {});
          const m = {}, av = {};
          (friends || []).forEach(f => {
            if (!f.id) return;
            m[f.id] = f.nickname || f.name;
            if (f.avatarUri) av[f.id] = f.avatarUri;
          });
          setNameMap(m);
          setAvatarMap(av);
          setFriendsList(friends || []);
          setBlocked(blockedArr || []);
          storage.save(STORAGE_KEYS.dmFriendMeta, { names: m, avatars: av, meta: fd.friendMeta || {} });
        }
      } catch (e) { if (__DEV__) console.warn('[DMList] friends', e?.message); }
    })();
    return () => { alive = false; unsub(); };
  }, []);

  // 차단 상대 대화 숨김 — blocked가 늦게 와도 렌더에서 적용(목록 표시를 막지 않음). 차단은 드물어 잠깐 보일 수 있으나 도착 즉시 필터.
  const visibleConvs = useMemo(
    () => (convs || []).filter(c => !blocked.includes(otherUidOf(c, myUid))),
    [convs, blocked, myUid]
  );

  // 좌측밀기 → 삭제(나만 목록에서 숨김). 상대·기록엔 영향 없음, 새 메시지 오면 다시 뜸([[dm-design]]).
  //   낙관적 제거(즉시 사라짐) + clearedAt 기록. 실패 시 구독 스냅샷이 되살림.
  const handleDelete = useCallback((conv) => {
    setConvs(prev => (prev || []).filter(c => c.id !== conv.id));
    clearConversation(conv.id).catch(e => { if (__DEV__) console.warn('[DMList] clear', e?.message); });
  }, []);
  const renderRightActions = (conv) => (
    <TouchableOpacity activeOpacity={0.8} onPress={() => handleDelete(conv)}
      style={{ width: 84, backgroundColor: '#B3261E', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: '#fff' }}>삭제</Text>
    </TouchableOpacity>
  );

  const renderItem = ({ item }) => {
    const ouid = otherUidOf(item, myUid);
    const name = friendDisplayName(friendMeta, ouid, nameMap[ouid] || '친구');
    const avatar = avatarMap[ouid];
    const unreadN = item.unread?.[myUid] || 0;  // 안읽은 메시지 수(목록 뱃지)
    return (
      <Swipeable renderRightActions={() => renderRightActions(item)} overshootRight={false} friction={2}>
      <TouchableOpacity activeOpacity={0.7} onPress={() => onOpenChat?.(ouid, name, avatar || null)}
        style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, gap: 12, backgroundColor: DM_CANVAS }}>
        {/* 사진 우선 + 이니셜 fallback — 대화방 아바타와 통일(다크 차콜 배경 + 버터골드 이니셜) */}
        <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: DM_AVATAR, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {avatar && /^https?:\/\//.test(avatar) ? (
            <Image source={{ uri: avatar }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory-disk" transition={100} />
          ) : (
            <Text style={{ fontFamily: F.sysB, fontSize: fs(18), color: C.butter }}>{(name || '?').charAt(0)}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            {/* 이름 fs(16)·미리보기 fs(15) — 옛 fs(15)/fs(13)은 BODY_BUMP(11~13만 보정) 탓에 미리보기가 이름보다 크게 렌더되는 역전이 있었음([[avoid-small-text]]) */}
            <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(17), color: DM_BUTTER }} numberOfLines={1}>{name}</Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: 'rgba(200,217,230,0.6)', marginLeft: 8 }}>{fmtTime(item.lastAt)}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
            {/* 안읽음이면 미리보기를 버터로 강조(카톡식) + 우측 빨간 카운트 뱃지 */}
            <Text style={{ flex: 1, fontFamily: unreadN > 0 ? F.sysSb : F.sys, fontSize: fs(15), color: unreadN > 0 ? DM_BUTTER : DM_PALESKY }} numberOfLines={1}>{item.lastMessage}</Text>
            {unreadN > 0 && (
              <View style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: '#E5484D', alignItems: 'center', justifyContent: 'center', marginLeft: 8 }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(11), color: '#fff' }}>{unreadN > 99 ? '99+' : unreadN}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
      </Swipeable>
    );
  };

  return (
    // RN Modal(DiaryScreen) 안에선 루트 SafeAreaProvider가 안 닿아 inset이 0이 됨(헤더 상태바 겹침) → 자체 Provider로 재측정.
    //   DMChatScreen과 동일 처리([[dm-design]] iOS safe-area 버그). initialWindowMetrics로 첫 프레임 깜빡임 방지.
    //   ★GestureHandlerRootView — RN Modal은 별도 윈도라 루트 RootView가 안 닿음. 행 스와이프(Swipeable) 제스처를 받으려면 모달 안에 자체 RootView 필요(안드 특히).
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
    <SafeAreaView style={{ flex: 1, backgroundColor: DM_CANVAS }} edges={['top', 'bottom', 'left', 'right']}>
      {/* 다크 룸이라 상태바 아이콘 밝게 — 언마운트 시 자동복원([[dm-design]] StatusBar 패턴) */}
      <StatusBar barStyle="light-content" />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 0.5, borderBottomColor: DM_LINE, backgroundColor: DM_SURFACE, gap: 12 }}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={{ fontSize: fs(24), color: DM_BUTTER }}>←</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(18), color: DM_BUTTER }}>메시지</Text>
      </View>
      {/* 상단 상시 검색창 — 입력하면 전체 친구 검색(대화 없던 친구도), 비우면 대화목록. 별도 화면 X(뒤로가기·이전목록 복귀 혼란 제거, 사용자 2026-06-13) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: DM_SURFACE, borderBottomWidth: 0.5, borderBottomColor: DM_LINE }}>
        <TextInput value={query} onChangeText={setQuery}
          placeholder="친구 검색 — 이름으로 찾아 대화 시작" placeholderTextColor={'rgba(200,217,230,0.4)'}
          style={{ flex: 1, fontFamily: F.sys, fontSize: fs(15), color: '#EDE9E1', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }} />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ fontSize: fs(18), color: DM_PALESKY }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
      {query.trim() ? (
        // 검색 결과 — 전체 친구 중 매칭. 탭하면 바로 대화방(기존·신규 무관, ensureConversation이 방 생성).
        <FlatList
          data={friendResults}
          keyExtractor={(f) => f.id}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={() => <View style={{ height: 0.5, backgroundColor: DM_LINE, marginLeft: 72 }} />}
          renderItem={({ item }) => {
            const dn = friendDisplayName(friendMeta, item.id, nameMap[item.id] || item.nickname || item.name || '친구');
            const av = avatarMap[item.id] || item.avatarUri;
            const hasPhoto = av && /^https?:\/\//.test(av);
            return (
              <TouchableOpacity activeOpacity={0.7}
                onPress={() => { setQuery(''); onOpenChat?.(item.id, dn, hasPhoto ? av : null); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: DM_AVATAR, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {hasPhoto
                    ? <Image source={{ uri: av }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="memory-disk" transition={100} />
                    : <Text style={{ fontFamily: F.sysB, fontSize: fs(17), color: C.butter }}>{(dn || '?').charAt(0)}</Text>}
                </View>
                <Text style={{ flex: 1, fontFamily: F.sysSb, fontSize: fs(16), color: DM_BUTTER }} numberOfLines={1}>{dn}</Text>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 50 }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: DM_PALESKY, textAlign: 'center', lineHeight: 22 }}>검색 결과가 없어요</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={visibleConvs}
          keyExtractor={(c) => c.id}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={{ height: 0.5, backgroundColor: DM_LINE, marginLeft: 74 }} />}
          ListEmptyComponent={convs !== null ? (
            <View style={{ alignItems: 'center', paddingVertical: 60 }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: DM_PALESKY, textAlign: 'center', lineHeight: 22 }}>
                아직 주고받은 메시지가 없어요{'\n'}위 검색창에서 친구를 찾아 먼저 말을 걸어보세요
              </Text>
            </View>
          ) : null}
        />
      )}
    </SafeAreaView>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
