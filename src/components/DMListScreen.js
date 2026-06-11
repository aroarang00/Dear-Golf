import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, StatusBar } from 'react-native';
import { Image } from 'expo-image'; // 아바타 디스크캐시 ([[image-load-speed]])
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
import { subscribeConversations, otherUidOf } from '../utils/dm';
import { loadFriendData, friendDisplayName } from '../utils/friendGroups';
import { loadMyFriendsEnriched, loadMyBlockedUids } from '../utils/friends';
import { useAndroidBack } from '../hooks/useAndroidBack';

// 대화 목록 시각 — 오늘이면 오전/오후 h:mm, 아니면 월.일
function fmtTime(ts) {
  const ms = ts?.toMillis ? ts.toMillis() : 0;
  if (!ms) return '';
  const d = new Date(ms);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    const h = d.getHours(), m = d.getMinutes();
    return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${String(m).padStart(2, '0')}`;
  }
  return `${d.getMonth() + 1}.${d.getDate()}`;
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
  useAndroidBack(true, onClose);

  useEffect(() => {
    let alive = true;
    let unsub = () => {};
    (async () => {
      const uid = await getUid();
      if (alive) setMyUid(uid);
      let blocked = [];
      try {
        const [fd, friends, blockedArr] = await Promise.all([
          loadFriendData(), loadMyFriendsEnriched(), loadMyBlockedUids().catch(() => []),
        ]);
        blocked = blockedArr || [];
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
        }
      } catch (e) { if (__DEV__) console.warn('[DMList] friends', e?.message); }
      // 내가 차단한 상대와의 대화는 목록에서 숨김 — 검색·카카오 결과 차단자 숨김과 일관(카톡 모델)
      unsub = subscribeConversations(uid, (list) => {
        if (alive) setConvs(list.filter(c => !blocked.includes(otherUidOf(c, uid))));
      });
    })();
    return () => { alive = false; unsub(); };
  }, []);

  const renderItem = ({ item }) => {
    const ouid = otherUidOf(item, myUid);
    const name = friendDisplayName(friendMeta, ouid, nameMap[ouid] || '친구');
    const avatar = avatarMap[ouid];
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={() => onOpenChat?.(ouid, name, avatar || null)}
        style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, gap: 12 }}>
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
          <Text style={{ fontFamily: F.sys, fontSize: fs(15), color: DM_PALESKY, marginTop: 3 }} numberOfLines={1}>{item.lastMessage}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    // RN Modal(DiaryScreen) 안에선 루트 SafeAreaProvider가 안 닿아 inset이 0이 됨(헤더 상태바 겹침) → 자체 Provider로 재측정.
    //   DMChatScreen과 동일 처리([[dm-design]] iOS safe-area 버그). initialWindowMetrics로 첫 프레임 깜빡임 방지.
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
    <SafeAreaView style={{ flex: 1, backgroundColor: DM_CANVAS }} edges={['top', 'bottom', 'left', 'right']}>
      {/* 다크 룸이라 상태바 아이콘 밝게 — 언마운트 시 자동복원([[dm-design]] StatusBar 패턴) */}
      <StatusBar barStyle="light-content" />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 0.5, borderBottomColor: DM_LINE, backgroundColor: DM_SURFACE, gap: 12 }}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={{ fontSize: fs(24), color: DM_BUTTER }}>←</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(18), color: DM_BUTTER }}>메시지</Text>
        {/* 'DM 알림 받기' 전역 토글 자리 — 출시 후 실연결([[dm-design]] 알림 설정) */}
      </View>
      <FlatList
        data={convs || []}
        keyExtractor={(c) => c.id}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={{ height: 0.5, backgroundColor: DM_LINE, marginLeft: 74 }} />}
        ListEmptyComponent={convs !== null ? (
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: DM_PALESKY, textAlign: 'center', lineHeight: 22 }}>
              아직 주고받은 메시지가 없어요{'\n'}친구 프로필에서 대화를 시작해보세요
            </Text>
          </View>
        ) : null}
      />
    </SafeAreaView>
    </SafeAreaProvider>
  );
}
