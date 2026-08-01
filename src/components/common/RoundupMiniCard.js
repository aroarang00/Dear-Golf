import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { C, F, fs } from '../../constants/colors';
import { Icon } from './Icon';
import { loadRoundup } from '../../utils/roundup';

// 크루 게시물에 첨부된 '모집' 미니카드 — 구장·날짜·정원·상태 요약. 탭하면 라운지 모집 상세로([[crew-roundup-share-plan]] B).
//   모집 doc은 1회 조회(피드 다건이라 구독 X). 삭제·주최자취소면 '종료' 안내, 권한 없으면(비-audience) 조회 실패→종료로 graceful.
// preloaded가 { __denied:true }면 = 상위에서 권한없음(비친구·미지정 audience)으로 판정 → '친구만 볼 수 있음' 카드.
const stateOf = (p) => (p ? (p.__denied ? 'denied' : (p.cancelledByHost ? 'gone' : 'ok')) : 'loading');
// tile — 0이면 기존 가로 한 줄 바(카드 안에 끼우는 용도), 숫자면 그 폭의 정사각 타일(크루 게시글 그리드 한 칸).
//   데이터 조회·상태 판정(loading/ok/gone/denied)은 완전히 같고 배치만 다르다. 두 벌로 나누면 규칙이 갈라진다.
export function RoundupMiniCard({ roundupId, post: preloaded = null, onPress, shared = false, isHost = false, hostIsFriend = false, onLongPress = null, tile = 0 }) {
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
    // 핀(크루서 만든 모집)=라운지 네이비 / 피드 링크공유 모집(shared)=세이지 그린 — '크루에 공유' 버튼색과 짝, 한눈에 구분.
    backgroundColor: shared ? '#5E7E42' : C.navy, paddingHorizontal: 12, paddingVertical: 9,
  };

  // 타일 모드는 로딩 중에도 자리를 지켜야 한다 — null을 주면 그리드 한 칸이 비어 격자가 흔들린다.
  if (state === 'loading') return tile ? <View style={{ width: tile, height: tile, borderRadius: 14, backgroundColor: 'rgba(26,61,82,0.06)' }} /> : null;
  // 티오프+5h 지난 모집 — 라운지 노출 윈도우(RoundupTab.isInVisibleWindow)와 동일 산식.
  //   doc은 남아 있어서(라운지는 클라 필터로만 감춤) 크루 카드만 '확정 대기'로 남아
  //   탭하면 지난 모집 상세가 열리던 것(2026-07-03) → 아래 '종료' 카드로 합류. 오픈형(date 미정)은 제외.
  const pastWindow = (() => {
    if (!post?.date) return false;
    const [y, m, d] = post.date.split('.').map(Number);
    const [hh, mm] = (post.time || '07:00').split(':').map(Number);
    const teeOff = new Date(y, m - 1, d, hh, mm).getTime();
    return !Number.isNaN(teeOff) && Date.now() > teeOff + 5 * 3600 * 1000;
  })();
  // 삭제된 모집은 없는 doc 읽기가 permission-denied로 떨어져 denied가 됨(친추 아님). 친추 안내는 '공유 카드(shared, friends)
  //   + 보는 이가 주최자 아님 + 주최자가 내 친구도 아님'일 때만 의미 — 주최자 본인이 못 읽음=삭제됨이고, 핀(select)은 친추로 권한 안 생김.
  //   ★주최자가 내 친구인데 denied면 '비친구'가 아니라 삭제·지정제외 → 친구인데 '친구만 볼 수 있음' 오표시되던 것 방지(삭제된 공유 모집).
  const ended = state === 'gone' || pastWindow || (state === 'denied' && (!shared || isHost || hostIsFriend));

  // ── 정사각 타일(그리드) ── 같은 상태, 배치만 다름. 위=모집 라벨 / 가운데=구장·날짜 / 아래=상태·인원.
  if (tile) {
    const tbox = { width: tile, height: tile, borderRadius: 14, padding: 13, justifyContent: 'space-between',
      backgroundColor: shared ? '#5E7E42' : C.navy };
    if (ended) {
      return (
        <View style={[tbox, { justifyContent: 'center', alignItems: 'center' }]}>
          <Icon name="flag" size={fs(22)} color="rgba(255,255,255,0.45)" strokeWidth={1.8} />
          <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: 'rgba(255,255,255,0.7)', marginTop: 9, textAlign: 'center' }}>
            종료됐거나 볼 수 없는 모집이에요
          </Text>
        </View>
      );
    }
    if (state === 'denied') {
      return (
        <TouchableOpacity activeOpacity={0.85} style={[tbox, { justifyContent: 'center', alignItems: 'center' }]}
          onPress={() => onPress?.(roundupId)} onLongPress={onLongPress || undefined} delayLongPress={350}>
          <Icon name="lock" size={fs(20)} color="rgba(255,255,255,0.75)" strokeWidth={1.8} />
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: 'rgba(255,255,255,0.85)', marginTop: 9, textAlign: 'center' }}>
            친구만 볼 수 있는 모집이에요
          </Text>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(11.5), color: C.butter, marginTop: 7 }}>친구 맺기 ›</Text>
        </TouchableOpacity>
      );
    }
    const tIsTeam = (post.teams || 1) > 1;
    const tCap = post.capacity || (tIsTeam ? post.teams * 4 : 4);
    const tTotal = (post.joined || 0) + (tIsTeam ? 0 : (post.companions?.length || 0));
    const tFull = tTotal >= tCap;
    const tStatus = post.closed ? '확정' : (tFull ? (post.type === 'open' ? '날짜 정하기' : '확정 대기') : '모집중');
    return (
      <TouchableOpacity activeOpacity={0.85} style={[tbox, post.closed && { opacity: 0.62 }]}
        onPress={() => onPress?.(roundupId)} onLongPress={onLongPress || undefined} delayLongPress={350}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Icon name="flag" size={fs(13)} color={C.butter} strokeWidth={1.9} />
          <Text style={{ fontFamily: F.sysB, fontSize: fs(11), color: C.butter, letterSpacing: 0.3 }}>라운딩 모집</Text>
        </View>
        <View>
          <Text numberOfLines={2} style={{ fontFamily: F.sysB, fontSize: fs(15), color: '#fff', lineHeight: fs(20) }}>
            {post.type === 'fixed' ? (post.course || '라운딩') : '장소 · 날짜 미정'}
          </Text>
          {post.type === 'fixed' && !!post.date && (
            <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: 'rgba(255,255,255,0.75)', marginTop: 3 }}>{post.date}</Text>
          )}
        </View>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: C.butter }}>{tStatus} · {tTotal}/{tCap}</Text>
      </TouchableOpacity>
    );
  }

  if (ended) {
    return (
      <View style={[box, { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: fs(20) }]}>
        <Icon name="flag" size={fs(13)} color="rgba(255,255,255,0.6)" strokeWidth={1.8} />
        <Text style={{ fontFamily: F.sysM, fontSize: fs(11.5), color: 'rgba(255,255,255,0.7)' }}>종료됐거나 볼 수 없는 모집이에요</Text>
      </View>
    );
  }
  // 비친구(친구공개 모집을 공유받았는데 주최자와 친구 아님) — 탭하면 라운지로 보내 '주최자와 친구 맺기' 안내(기존 동선 재사용).
  if (state === 'denied') {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={() => onPress?.(roundupId)} onLongPress={onLongPress || undefined} delayLongPress={350}
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
    <TouchableOpacity activeOpacity={0.85} onPress={() => onPress?.(roundupId)} onLongPress={onLongPress || undefined} delayLongPress={350}
      style={[box, post.closed && { opacity: 0.55 }]}>{/* 확정=빛바램(라운지 모집처럼), 글은 남고 티오프 후/삭제 시 사라짐 */}
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
