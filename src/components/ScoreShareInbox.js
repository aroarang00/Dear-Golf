import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, Animated, Easing } from 'react-native';
import { C, F, fs } from '../constants/colors';
import { useCurrentUid } from '../contexts/CurrentUidContext';
import {
  subscribeIncomingScoreShares, buildDerivedRound, acceptScoreShare, declineScoreShare,
} from '../utils/roundScoreShares';

// 동반자 스코어 공유 수신 — 기록 화면 피드 상단 배너 + 본인 행 선택 모달 (Phase C ③④, [[companion-design]] §11).
//  uid는 useCurrentUid(단일 소스)로 — 재설치·계정전환(uid 변경) 시 자동 재구독.
//  파생은 본인 rounds에 멱등 setDoc(util) → onDerived로 DiariesContext 갱신.
export function ScoreShareInbox({ nickname, onDerived }) {
  const uid = useCurrentUid();
  const [shares, setShares] = useState([]);
  const [active, setActive] = useState(null);   // 응답 중인 공유
  const [selIdx, setSelIdx] = useState(null);    // 선택한 행 idx
  const [busy, setBusy] = useState(false);
  const glow = useRef(new Animated.Value(0)).current;   // 배너 맥동 글로우(받은 공유 있을 때만)

  useEffect(() => {
    if (!uid) { setShares([]); return; }
    const unsub = subscribeIncomingScoreShares(uid, setShares);
    return unsub;
  }, [uid]);

  // 받은 공유가 있을 때만 은은하게 반짝이는 루프 — shadow/border 애니라 useNativeDriver:false.
  useEffect(() => {
    if (!shares.length) { glow.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      Animated.timing(glow, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [shares.length]);

  const open = (s) => { setActive(s); setSelIdx(null); };
  const close = () => { if (!busy) { setActive(null); setSelIdx(null); } };

  const accept = async () => {
    if (selIdx == null || !active || busy || !uid) return;
    setBusy(true);
    try {
      const row = active.rows.find(r => r.idx === selIdx) || active.rows[selIdx];
      const derived = buildDerivedRound(active, row, { uid, nickname });
      await acceptScoreShare(active, uid, derived);
      setActive(null); setSelIdx(null);
      onDerived && onDerived();   // 내 기록 새로고침(파생 round 반영)
    } catch (e) { if (__DEV__) console.warn('[scoreShare] accept fail', e?.message); }
    finally { setBusy(false); }
  };

  const decline = async () => {
    if (!active || busy || !uid) return;
    setBusy(true);
    try { await declineScoreShare(active.id, uid); setActive(null); setSelIdx(null); }
    catch (e) { if (__DEV__) console.warn('[scoreShare] decline fail', e?.message); }
    finally { setBusy(false); }
  };

  if (!uid || (!shares.length && !active)) return null;
  const first = shares[0];

  return (
    <>
      {/* 배너 — 받은 공유 있을 때 (피드 상단). 네이비 글로우 헤일로 + 버터 테두리 맥동 + 스케일로 강하게 '빛나게' */}
      {first && (
        <Animated.View style={{
          marginHorizontal: 16, marginTop: 14, marginBottom: 4, borderRadius: 16,
          shadowColor: '#D9AF3C', shadowOffset: { width: 0, height: 0 },
          shadowOpacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }),
          shadowRadius: glow.interpolate({ inputRange: [0, 1], outputRange: [16, 34] }),
          elevation: glow.interpolate({ inputRange: [0, 1], outputRange: [12, 26] }),
          transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }],
        }}>
          <Animated.View style={{
            borderRadius: 16, borderWidth: 3,
            borderColor: glow.interpolate({ inputRange: [0, 1], outputRange: ['rgba(245,230,168,0.7)', 'rgba(245,230,168,1)'] }),
          }}>
            <TouchableOpacity onPress={() => open(first)} activeOpacity={0.85}
              style={{ backgroundColor: C.navy, borderRadius: 13.5, padding: 14,
                flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: fs(20) }}>📋</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(13.5), color: '#fff' }} numberOfLines={1}>
                  {first.authorName || '동반자'}님이 스코어를 공유했어요
                </Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: 'rgba(255,255,255,0.75)', marginTop: 2 }} numberOfLines={1}>
                  {first.course}{first.date ? ` · ${first.date}` : ''} · 내 점수 추가하기{shares.length > 1 ? ` 외 ${shares.length - 1}건` : ''}
                </Text>
              </View>
              <Text style={{ fontSize: fs(18), color: C.butter }}>›</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      )}

      {/* 본인 행 선택 모달 */}
      <Modal visible={!!active} transparent animationType="slide" onRequestClose={close}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={close} />
          <View style={{ backgroundColor: C.bgPrimary, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 28 }}>
            {active && (
              <>
                <View style={{ padding: 18, paddingBottom: 10 }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal }}>스코어 공유</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.warmGray, marginTop: 5, lineHeight: 18 }}>
                    {active.authorName || '동반자'}님이 보낸 {active.course}{active.date ? ` (${active.date})` : ''} 스코어카드예요.{'\n'}
                    아래에서 <Text style={{ fontFamily: F.sysSb, color: C.burgundy }}>본인 점수</Text>를 골라 내 기록에 추가하세요.
                  </Text>
                </View>
                <ScrollView style={{ flexGrow: 0, paddingHorizontal: 18 }} contentContainerStyle={{ paddingBottom: 4 }} showsVerticalScrollIndicator={false}>
                  {(active.rows || []).map((r) => {
                    const on = selIdx === r.idx;
                    const holesN = Array.isArray(r.holes) ? r.holes.filter(h => Number.isFinite(h)).length : 0;
                    return (
                      <TouchableOpacity key={r.idx} onPress={() => setSelIdx(r.idx)} activeOpacity={0.8}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, marginBottom: 8,
                          borderWidth: 1.5, borderColor: on ? C.burgundy : C.hairline, backgroundColor: on ? (C.burgundy + '0E') : C.bgSecondary }}>
                        <Text style={{ fontSize: fs(16), color: on ? C.burgundy : C.warmGrayLight }}>{on ? '◉' : '○'}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.charcoal }} numberOfLines={1}>{r.label || '이름 미상'}</Text>
                          {holesN > 0 && <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 2 }}>홀별 {holesN}홀</Text>}
                        </View>
                        <Text style={{ fontFamily: F.sysB, fontSize: fs(17), color: on ? C.burgundy : C.charcoal }}>
                          {Number.isFinite(r.total) ? r.total : (r.total || '-')}<Text style={{ fontSize: fs(11), fontFamily: F.sys, color: C.warmGray }}> 타</Text>
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 18, paddingTop: 12 }}>
                  <TouchableOpacity onPress={decline} disabled={busy} activeOpacity={0.85}
                    style={{ flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: C.hairline, alignItems: 'center', opacity: busy ? 0.5 : 1 }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.warmGray }}>받지 않기</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={accept} disabled={busy || selIdx == null} activeOpacity={0.85}
                    style={{ flex: 1.5, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
                      backgroundColor: selIdx == null ? C.warmGrayLight : C.burgundy, opacity: busy ? 0.6 : 1 }}>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.butter }}>{busy ? '추가 중…' : '내 기록에 추가'}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}
