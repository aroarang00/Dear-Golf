import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { getUid } from '../utils/firebase';
import { subscribeConversations, otherUidOf } from '../utils/dm';
import { loadFriendData, friendDisplayName } from '../utils/friendGroups';
import { loadMyFriendsEnriched } from '../utils/friends';
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
  const [friendMeta, setFriendMeta] = useState({});
  useAndroidBack(true, onClose);

  useEffect(() => {
    let alive = true;
    let unsub = () => {};
    (async () => {
      const uid = await getUid();
      if (alive) setMyUid(uid);
      try {
        const [fd, friends] = await Promise.all([loadFriendData(), loadMyFriendsEnriched()]);
        if (alive) {
          setFriendMeta(fd.friendMeta || {});
          const m = {};
          (friends || []).forEach(f => { if (f.id) m[f.id] = f.nickname || f.name; });
          setNameMap(m);
        }
      } catch (e) { if (__DEV__) console.warn('[DMList] friends', e?.message); }
      unsub = subscribeConversations(uid, (list) => { if (alive) setConvs(list); });
    })();
    return () => { alive = false; unsub(); };
  }, []);

  const renderItem = ({ item }) => {
    const ouid = otherUidOf(item, myUid);
    const name = friendDisplayName(friendMeta, ouid, nameMap[ouid] || '친구');
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={() => onOpenChat?.(ouid, name)}
        style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, gap: 12 }}>
        <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: C.burgundy, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(18), color: C.butter }}>{(name || '?').charAt(0)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }} numberOfLines={1}>{name}</Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginLeft: 8 }}>{fmtTime(item.lastAt)}</Text>
          </View>
          <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, marginTop: 3 }} numberOfLines={1}>{item.lastMessage}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'bottom', 'left', 'right']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 0.5, borderBottomColor: C.hairline, gap: 12 }}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={{ fontSize: fs(22), color: C.charcoal }}>←</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(17), color: C.charcoal }}>메시지</Text>
        {/* 'DM 알림 받기' 전역 토글 자리 — 출시 후 실연결([[dm-design]] 알림 설정) */}
      </View>
      <FlatList
        data={convs || []}
        keyExtractor={(c) => c.id}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={{ height: 0.5, backgroundColor: C.hairline, marginLeft: 74 }} />}
        ListEmptyComponent={convs !== null ? (
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, textAlign: 'center', lineHeight: 20 }}>
              아직 주고받은 메시지가 없어요{'\n'}친구 프로필에서 대화를 시작해보세요
            </Text>
          </View>
        ) : null}
      />
    </SafeAreaView>
  );
}
