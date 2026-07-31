import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { SIDE_PAD } from '../styles/homeS';   // 홈 배너 좌우 여백을 형제 인박스와 맞춤
import { Icon } from './common/Icon';   // 커스텀 SVG 아이콘(유니코드 이모지 금지 — 커스텀 드로잉만)
import { useCurrentUid } from '../contexts/CurrentUidContext';
import {
  subscribeIncomingScoreShares, buildDerivedRound, acceptScoreShare, declineScoreShare,
} from '../utils/roundScoreShares';
import { showAppAlert } from './AppAlert';   // 실패 안내(prod 무음 방지) — 모달 닫고 띄워 iOS에서 뒤로 안 깔리게

// 동반자 스코어 공유 수신 — 기록 화면 피드 상단 배너 + 본인 행 선택 모달 (Phase C ③④, [[companion-design]] §11).
//  uid는 useCurrentUid(단일 소스)로 — 재설치·계정전환(uid 변경) 시 자동 재구독.
//  파생은 본인 rounds에 멱등 setDoc(util) → onDerived로 DiariesContext 갱신.
export function ScoreShareInbox({ nickname, onDerived, variant = 'feed', onActiveChange }) {
  const onHome = variant === 'home';   // 홈(진한 네이비 배경)=반투명 흰 카드+금테, 기록화면(밝은 배경)=네이비 카드
  const uid = useCurrentUid();
  const insets = useSafeAreaInsets();   // 모달 하단 버튼이 안드 네비게이션바에 가리지 않게
  const [shares, setShares] = useState([]);
  const [modalOpen, setModalOpen] = useState(false); // 시트 열림(목록·행선택을 같은 모달 안에서 전환)
  const [active, setActive] = useState(null);   // 응답 중인 공유(null이면 '누가 보냈나' 목록 화면)
  const [selIdx, setSelIdx] = useState(null);    // 선택한 행 idx
  const [busy, setBusy] = useState(false);
  const glow = useRef(new Animated.Value(0)).current;       // 테두리 밝기 맥동(색이라 JS 드라이버)
  const scalePulse = useRef(new Animated.Value(0)).current; // scale 맥동(★네이티브 드라이버 — iOS 테두리 떨림 방지)

  useEffect(() => {
    if (!uid) { setShares([]); return; }
    const unsub = subscribeIncomingScoreShares(uid, setShares);
    return unsub;
  }, [uid]);

  // 받은 공유가 있을 때만 은은하게 맥동. ★scale은 네이티브 드라이버(GPU)로 분리 — JS scale은 iOS에서
  //   매 프레임 둥근 테두리를 재렌더해 '찌글찌글'(가장자리 떨림)했음. GPU scale은 텍스처 변환이라 부드러움.
  //   테두리 색(glow)은 색 보간이라 네이티브 드라이버 불가 → JS, 단 기하 변화가 없어 떨림 없음.
  useEffect(() => {
    if (!shares.length) { glow.setValue(0); scalePulse.setValue(0); return; }
    const mkLoop = (val, native) => Animated.loop(Animated.sequence([
      Animated.timing(val, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: native }),
      Animated.timing(val, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: native }),
    ]));
    const lBorder = mkLoop(glow, false);     // 테두리 색
    const lScale = mkLoop(scalePulse, true); // scale(네이티브)
    lBorder.start(); lScale.start();
    return () => { lBorder.stop(); lScale.stop(); };
  }, [shares.length]);

  // 배너 표시 여부를 부모(홈)에 알림 — 홈이 아래 한줄메모/코멘트 카드를 숨겨 좁은 화면에서 겹침을 막는다
  //   (일정초대·라운지초대 배너와 동일 처리, [[project_home_collection_split]]). 배너 없으면 메모 복원.
  useEffect(() => { onActiveChange && onActiveChange(shares.length > 0); }, [shares.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { onActiveChange && onActiveChange(false); }, []);   // 언마운트(홈 이탈) 시 복원

  // 배너 탭 — 1건이면 바로 행 선택으로, 2건 이상이면 '누가 보냈는지' 목록부터.
  //   ★같은 Modal 안에서 화면만 바꾼다. 모달을 하나 더 띄우면 iOS에서 중첩돼 터치가 죽는다([[ios-modal-stacking]]).
  const openInbox = () => {
    setSelIdx(null);
    setActive(shares.length === 1 ? shares[0] : null);
    setModalOpen(true);
  };
  const open = (s) => { setActive(s); setSelIdx(null); };
  // ★busy여도 닫을 수 있어야 한다 — 예전엔 `if (!busy)` 가드 때문에 처리 중이면 바깥 탭도,
  //   안드 뒤로가기(onRequestClose)도 전부 막혔다. Firestore 쓰기는 오프라인이면 서버 응답이
  //   올 때까지 resolve되지 않아 busy가 영영 안 풀린다 → 모달이 잠겨 앱이 먹통처럼 보인다.
  //   진행 중인 쓰기는 setDoc(결정적 ID)이라 멱등이므로 닫아도 안전하다.
  const close = () => { setModalOpen(false); setActive(null); setSelIdx(null); };

  // 안전망 — 목록 화면인데 남은 공유가 0건이면 빈 시트가 뜬다(다른 기기에서 처리한 경우 등). 그냥 닫는다.
  useEffect(() => {
    if (modalOpen && !active && shares.length === 0) close();
  }, [modalOpen, active, shares.length]);   // eslint-disable-line react-hooks/exhaustive-deps

  // 처리 중 상태가 영영 안 풀리는 것 방지 — 응답이 안 오면 15초 뒤 풀고 안내한다(무한 '추가 중…' 차단).
  useEffect(() => {
    if (!busy) return;
    const t = setTimeout(() => {
      setBusy(false);
      setActive(null); setSelIdx(null);
      showAppAlert('응답이 지연되고 있어요', '네트워크 상태를 확인해 주세요.\n이미 처리됐다면 잠시 후 목록에서 사라져요.');
    }, 15000);
    return () => clearTimeout(t);
  }, [busy]);

  // 한 건 처리 후 — 남은 게 있으면 목록으로 되돌리고, 없으면 시트를 닫는다.
  //   (구독 갱신을 기다리지 않고 방금 처리한 id를 빼서 판단 — 스냅샷은 몇백 ms 늦게 온다)
  const doneWith = (id) => {
    const rest = shares.filter(s => s.id !== id);
    setSelIdx(null);
    if (rest.length) setActive(null); else close();
  };

  const accept = async () => {
    if (selIdx == null || !active || busy || !uid) return;
    setBusy(true);
    try {
      const row = active.rows.find(r => r.idx === selIdx) || active.rows[selIdx];
      const derived = buildDerivedRound(active, row, { uid, nickname });
      await acceptScoreShare(active, uid, derived);
      doneWith(active.id);        // 남은 게 있으면 목록으로, 없으면 시트 닫기
      onDerived && onDerived();   // 내 기록 새로고침(파생 round 반영)
    } catch (e) {
      if (__DEV__) console.warn('[scoreShare] accept fail', e?.message);
      setActive(null); setSelIdx(null);   // 모달 닫고(루트 알럿이 모달 뒤로 안 깔리게) 안내
      showAppAlert('스코어 추가 실패', '잠시 후 다시 시도해 주세요.');
    }
    finally { setBusy(false); }
  };

  const decline = async () => {
    if (!active || busy || !uid) return;
    setBusy(true);
    try { const id = active.id; await declineScoreShare(id, uid); doneWith(id); }
    catch (e) {
      if (__DEV__) console.warn('[scoreShare] decline fail', e?.message);
      setActive(null); setSelIdx(null);
      showAppAlert('처리 실패', '잠시 후 다시 시도해 주세요.');
    }
    finally { setBusy(false); }
  };

  // ★예전엔 (!shares.length && !active)이면 통째로 return null 했는데, 응답 직후 이 조건이 참이 되면
  //   '닫히는 중'인 RN Modal이 강제로 언마운트된다. 그러면 네이티브 오버레이가 화면에 남아 터치를
  //   전부 삼켜 앱이 먹통이 된다(사용자 제보 2026-07-31). Modal은 항상 마운트해 두고 visible로만 여닫는다.
  //   ([[ios-modal-stacking]]와 같은 계열의 문제 — 모달은 스스로 닫히게 두고 부모가 걷어내지 않는다.)
  if (!uid) return null;
  const first = shares[0];

  return (
    <>
      {/* 배너 — 받은 공유 있을 때 (피드 상단). ★플랫폼 분기:
          - iOS: 정적 버터 테두리만(맥동·스케일·후광 전부 X) — 골드 shadow가 주변까지 노랗게 번지던 문제 회피.
          - 안드: 버터 테두리 + 맥동(테두리 밝기·스케일). 사용자 2026-06-19. */}
      {first && (
        <Animated.View style={{
          marginHorizontal: onHome ? SIDE_PAD : 16, marginTop: onHome ? 12 : 14, marginBottom: 4, borderRadius: 16,
          transform: [{ scale: scalePulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] }) }],   // GPU scale(네이티브) — 부드러움
        }}>
          <Animated.View style={{
            borderRadius: 16, borderWidth: 2,
            // 테두리 밝기 맥동 — 그림자가 아니라 테두리 선 자체 밝기라 '빛번짐(후광)' 없음. iOS·안드 공통.
            borderColor: glow.interpolate({ inputRange: [0, 1], outputRange: ['rgba(245,230,168,0.78)', 'rgba(245,230,168,1)'] }),
          }}>
            {/* ★2건 이상이면 '외 N건'을 곁들이지 않고 건수를 제목으로 올린다 — 하나를 처리하면 다음 카드가
                예고 없이 또 뜨는 게 "왜 자꾸 뜨지?"로 느껴졌다(사용자 제보 2026-07-31).
                몇 건이 밀려 있는지 먼저 보이고, 탭하면 누가 보냈는지 목록에서 골라 처리한다. */}
            <TouchableOpacity onPress={openInbox} activeOpacity={0.85}
              style={{ backgroundColor: onHome ? 'rgba(255,255,255,0.12)' : C.navy, borderRadius: 13.5, padding: 14,
                flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Icon name="clipboard" size={fs(22)} color={C.butter} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(13.5), color: '#fff' }} numberOfLines={1}>
                  {shares.length > 1
                    ? `스코어 공유 ${shares.length}건이 왔어요`
                    : `${first.authorName || '동반자'}님이 스코어를 공유했어요`}
                </Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: 'rgba(255,255,255,0.75)', marginTop: 2 }} numberOfLines={1}>
                  {shares.length > 1
                    ? `${shares.map(s => s.authorName || '동반자').join(' · ')} · 눌러서 하나씩 처리`
                    : `${first.course}${first.date ? ` · ${first.date}` : ''} · 내 점수 추가하기`}
                </Text>
              </View>
              <Text style={{ fontSize: fs(18), color: C.butter }}>›</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      )}

      {/* 본인 행 선택 모달 */}
      <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={close}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={close} />
          <View style={{ backgroundColor: C.bgPrimary, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: Math.max(28, insets.bottom + 14) }}>
            {/* ── 여러 건이면 먼저 '누가 보냈나' 목록 ── */}
            {!active && (
              <View style={{ padding: 18 }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal }}>스코어 공유 {shares.length}건</Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.warmGray, marginTop: 5 }}>
                  하나씩 골라 내 점수를 추가하세요.
                </Text>
                <ScrollView style={{ marginTop: 12, maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                  {shares.map((s) => (
                    <TouchableOpacity key={s.id} onPress={() => open(s)} activeOpacity={0.8}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12,
                        marginBottom: 8, backgroundColor: C.bgSecondary }}>
                      <Icon name="clipboard" size={fs(20)} color={C.burgundy} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.charcoal }} numberOfLines={1}>
                          {s.authorName || '동반자'}님
                        </Text>
                        <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: C.warmGray, marginTop: 2 }} numberOfLines={1}>
                          {s.course}{s.date ? ` · ${s.date}` : ''}
                        </Text>
                      </View>
                      <Text style={{ fontSize: fs(18), color: C.warmGray }}>›</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
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
                  {/* 여러 건이면 목록으로 돌아갈 길을 남긴다(잘못 눌렀을 때 갇히지 않게) */}
                  {shares.length > 1 && (
                    <TouchableOpacity onPress={() => { setActive(null); setSelIdx(null); }} disabled={busy} activeOpacity={0.85}
                      style={{ paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: C.hairline, alignItems: 'center', opacity: busy ? 0.5 : 1 }}>
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.warmGray }}>목록</Text>
                    </TouchableOpacity>
                  )}
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
