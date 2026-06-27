import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { C, F, fs } from '../../constants/colors';
import { Icon } from './Icon';
import { loadRoundup } from '../../utils/roundup';

// 크루 게시물에 첨부된 '모집' 미니카드 — 구장·날짜·정원·상태 요약. 탭하면 라운지 모집 상세로([[crew-roundup-share-plan]] B).
//   모집 doc은 1회 조회(피드 다건이라 구독 X). 삭제·주최자취소면 '종료' 안내, 권한 없으면(비-audience) 조회 실패→종료로 graceful.
// preloaded가 { __denied:true }면 = 상위에서 권한없음(비친구·미지정 audience)으로 판정 → '친구만 볼 수 있음' 카드.
const stateOf = (p) => (p ? (p.__denied ? 'denied' : (p.cancelledByHost ? 'gone' : 'ok')) : 'loading');
export function RoundupMiniCard({ roundupId, post: preloaded = null, onPress }) {
  const [post, setPost] = useState(preloaded);
  const [state, setState] = useState(stateOf(preloaded)); // loading | ok | gone | denied

  useEffect(() => {
    // 상위가 모집 doc을 이미 들고 있으면(상단 핀) 그대로 사용 — 중복 조회 회피.
    if (preloaded) { setPost(preloaded); setState(stateOf(preloaded)); return; }
    if (!roundupId) { setState('gone'); return; }
    let alive = true;
    loadRoundup(roundupId)
      .then((p) => { if (!alive) return; if (p && !p.cancelledByHost) { setPost(p); setState('ok'); } else setState('gone'); })
      .catch((e) => { if (alive) setState(e?.code === 'permission-denied' ? 'denied' : 'gone'); }); // 비친구는 읽기 거부됨
    return () => { alive = false; };
  }, [roundupId, preloaded]);

  const box = {
    marginTop: 8, borderRadius: 10,
    backgroundColor: C.navy, paddingHorizontal: 12, paddingVertical: 9,   // 라운지 네이비 색채움 — 컴팩트
  };

  if (state === 'loading') return null;
  if (state === 'gone') {
    return (
      <View style={[box, { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: fs(20) }]}>
        <Icon name="flag" size={fs(13)} color="rgba(255,255,255,0.6)" strokeWidth={1.8} />
        <Text style={{ fontFamily: F.sysM, fontSize: fs(11.5), color: 'rgba(255,255,255,0.7)' }}>종료됐거나 볼 수 없는 모집이에요</Text>
      </View>
    );
  }
  // 비친구(미지정 audience)라 모집을 못 읽음 — 탭하면 라운지로 보내 '주최자와 친구 맺기' 안내(기존 동선 재사용).
  if (state === 'denied') {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={() => onPress?.(roundupId)}
        style={[box, { flexDirection: 'row', alignItems: 'center', minHeight: fs(20) }]}>
        <Text style={{ fontSize: fs(11.5) }}>🔒</Text>
        <Text style={{ fontFamily: F.sysSb, fontSize: fs(11.5), color: 'rgba(255,255,255,0.85)', marginLeft: 7, flexShrink: 1 }} numberOfLines={1}>친구만 볼 수 있는 모집이에요</Text>
        <Text style={{ fontFamily: F.sysM, fontSize: fs(10.5), color: C.butter, marginLeft: 'auto' }}>친구 맺기</Text>
        <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.butter, marginLeft: 5 }}>›</Text>
      </TouchableOpacity>
    );
  }

  const isTeam = (post.teams || 1) > 1;
  const cap = post.capacity || (isTeam ? post.teams * 4 : 4);
  const total = (post.joined || 0) + (isTeam ? 0 : (post.companions?.length || 0));
  const allFull = total >= cap;
  const statusTxt = post.closed ? '확정'
    : (allFull ? (post.type === 'open' ? '날짜 정하기' : '확정 대기') : '모집중');
  const title = post.type === 'fixed' ? (post.course || '라운딩') : '장소 · 날짜 미정';
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={() => onPress?.(roundupId)} style={box}>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: fs(20) }}>
        <Icon name="flag" size={fs(13)} color={C.butter} strokeWidth={1.9} />
        <Text style={{ fontFamily: F.sysB, fontSize: fs(12.5), color: '#fff', marginLeft: 6, flexShrink: 1 }} numberOfLines={1}>{title}</Text>
        {post.type === 'fixed' && !!post.date && (
          <Text style={{ fontFamily: F.sysM, fontSize: fs(11), color: 'rgba(255,255,255,0.6)', marginLeft: 6 }} numberOfLines={1}>{post.date}</Text>
        )}
        <Text style={{ fontFamily: F.sysSb, fontSize: fs(10.5), color: C.butter, marginLeft: 'auto' }}>{statusTxt} · {total}/{cap}</Text>
        <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.butter, marginLeft: 5 }}>›</Text>
      </View>
    </TouchableOpacity>
  );
}
