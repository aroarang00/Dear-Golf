import React, { useState, useEffect, useContext, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, Easing } from 'react-native';
import { C, F, fs } from '../constants/colors';
import { useCurrentUid } from '../contexts/CurrentUidContext';
import { SchedulesContext } from '../contexts/SchedulesContext';
import {
  subscribeIncomingScheduleInvites, buildDerivedSchedule,
  derivedScheduleId, joinScheduleGroup, declineScheduleInvite,
} from '../utils/scheduleShares';
import { normalizeCourseName } from '../utils/top100';
import { showAppAlert } from './AppAlert';
import { Icon } from './common/Icon';   // 커스텀 SVG 아이콘(유니코드 이모지 금지 — 커스텀 드로잉만)

// 일정 전파 수신 — 홈 상단 배너([[schedule-propagation-spec]] Stage 3). 친구가 보낸 일정 초대를 수락하면
//  내 일정에 자기파생(캘린더 동기화). cross-user 쓰기 0. uid=useCurrentUid(단일 소스, 재설치·계정전환 시 재구독).
export function ScheduleInviteInbox({ onActiveChange }) {
  const uid = useCurrentUid();
  const { schedules, addSharedSchedule, editSchedule } = useContext(SchedulesContext);
  const [invites, setInvites] = useState([]);
  const [busy, setBusy] = useState(false);
  const glow = useRef(new Animated.Value(0)).current;   // 배너 골드 글로우 맥동(초대 있을 때만)

  useEffect(() => {
    if (!uid) { setInvites([]); return; }
    const unsub = subscribeIncomingScheduleInvites(uid, setInvites);
    return unsub;
  }, [uid]);

  // 받은 초대가 있을 때만 은은하게 반짝이는 루프 — shadow/border 애니라 useNativeDriver:false.
  useEffect(() => {
    if (!invites.length) { glow.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      Animated.timing(glow, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [invites.length]);

  // 초대 배너 표시 여부를 부모(홈)에 통지 — 배너가 떠 있는 동안 홈은 아래 한줄메모/코멘트 카드를 숨겨
  //   좁은 화면에서 겹치지 않게 한다(수락/거절하면 다시 노출). 사용자 지정 2026-06-18.
  const active = !!uid && invites.length > 0;
  useEffect(() => { onActiveChange && onActiveChange(active); }, [active]);

  // 같은 라운딩(course+date) 일정을 이미 보유하면 중복 생성 대신 groupId 스탬프만(중복 방지, [[schedule-propagation-spec]] §4).
  //   ★매칭 키는 계정 독립 식별자만 — courseId/courseLogId는 per-user라 발신자↔수신자가 절대 안 맞음(같은 구장도 별도 생성 버그).
  //   kakaoId(둘 다 있으면) 우선, 없으면 정규화 이름 비교([[course-matching-unification]], [[schedule-propagation-spec]] 전파 함정).
  const findExisting = (inv) => (schedules || []).find(s =>
    s.date === inv.date && (
      (s.courseKakaoId && inv.courseKakaoId)
        ? String(s.courseKakaoId) === String(inv.courseKakaoId)
        : normalizeCourseName(s.course) === normalizeCourseName(inv.course)
    ),
  );

  // 시간 충돌 = 내 기존 일정과 동반자 초대가 '둘 다 시간이 있고 서로 다른' 경우만(통합안).
  //   같으면(또는 한쪽이 미정이면) 충돌 아님 → 조용히 편입. 다르면 3지선다 프롬프트.
  //   같은 날·같은 구장이라도 시간이 다르면 36홀/오전·오후 더블헤더처럼 별개 일정일 수 있어 사용자가 결정.
  const normTime = (t) => (t || '').trim();
  const timesConflict = (s, inv) => {
    const a = normTime(s.time), b = normTime(inv.time);
    return !!a && !!b && a !== b;
  };

  // 낙관적 닫기 — 누르는 즉시 로컬에서 그 초대를 제거해 배너를 닫는다(다음 건이 있으면 올라옴).
  //   onSnapshot 재발화(서버 왕복 2회)만 기다리면 iOS에서 지연·플리커로 "안 닫힌 것처럼" 보이고,
  //   중간 쓰기가 조용히 실패하면 영영 안 닫히던 문제 방지. 실패 시 restore()로 복원(스냅샷이 최종 정합).
  const dismissLocal = (id) => setInvites(prev => prev.filter(i => i.id !== id));
  const restoreLocal = (inv) => setInvites(prev => (prev.some(i => i.id === inv.id) ? prev : [inv, ...prev]));

  // 수락 공통 실행기 — busy 가드 + 낙관적 닫기 + 실패 복원. work()에 분기별 쓰기만 담는다.
  const runAccept = async (inv, work) => {
    if (busy || !uid) return;
    setBusy(true);
    dismissLocal(inv.id);
    try { await work(); }
    catch (e) { if (__DEV__) console.warn('[scheduleInvite] accept fail', e?.message); restoreLocal(inv); }
    finally { setBusy(false); }
  };

  // 분기별 쓰기 — 셋 다 마지막에 그룹 합류(joinScheduleGroup)로 멤버 등록.
  const mergeKeepMine = (inv, existing) => runAccept(inv, async () => {       // ① 내 일정 유지(시간 안 바꿈)
    if (!existing.groupId) await editSchedule(existing.id, { groupId: inv.id, sourceScheduleId: inv.sourceScheduleId || null });
    await joinScheduleGroup(inv.id, uid);
  });
  const adoptCompanionTime = (inv, existing) => runAccept(inv, async () => {  // ② 동반자 시간으로 갱신(캘린더까지 동기화)
    await editSchedule(existing.id, { groupId: inv.id, sourceScheduleId: inv.sourceScheduleId || null, time: inv.time || '' });
    await joinScheduleGroup(inv.id, uid);
  });
  const addSeparate = (inv) => runAccept(inv, async () => {                   // ③ 별도 일정으로 추가(새 파생 + 캘린더)
    const derived = buildDerivedSchedule(inv, uid);
    await addSharedSchedule(derivedScheduleId(inv.id, uid), derived); // 멱등 setDoc + 캘린더 동기화 + 로컬 반영
    await joinScheduleGroup(inv.id, uid);
  });

  const accept = (inv) => {
    if (busy || !uid) return;
    const existing = findExisting(inv);
    // 같은 날·구장 일정이 있고 시간이 서로 다르면 → 사용자에게 3지선다(통합안: B 안에 C가 선택지로).
    if (existing && timesConflict(existing, inv)) {
      const myT = normTime(existing.time) || '미정';
      const coT = normTime(inv.time) || '미정';
      // 앱 커스텀 알럿(AppAlert) — OS 기본 다이얼로그 대신 앱 디자인. 버튼 3개라 세로 배치됨.
      showAppAlert(
        '같은 날, 다른 시간',
        `이미 같은 날 · 같은 구장 일정이 있어요.\n티오프 시간이 달라요.\n\n내 일정    ${myT}\n동반자    ${coT}`,
        [
          // 색을 셋 다 다르게 — 골드(동반자 시간) / 다크(별도 추가) / 연한색(내 일정 유지)로 선택지 구분.
          { text: '동반자 시간으로 갱신', bg: C.butter, fg: C.charcoal, onPress: () => adoptCompanionTime(inv, existing) },
          { text: '별도 일정으로 추가', bg: C.charcoal, fg: C.butter, onPress: () => addSeparate(inv) },
          { text: '내 일정 유지', style: 'cancel', onPress: () => mergeKeepMine(inv, existing) },
        ],
      );
      return;
    }
    // 충돌 없음(시간 같음·한쪽 미정·기존 없음) → 현행대로 조용히 편입/생성.
    runAccept(inv, async () => {
      if (existing) {
        if (!existing.groupId) await editSchedule(existing.id, { groupId: inv.id, sourceScheduleId: inv.sourceScheduleId || null });
      } else {
        const derived = buildDerivedSchedule(inv, uid);
        await addSharedSchedule(derivedScheduleId(inv.id, uid), derived);
      }
      await joinScheduleGroup(inv.id, uid);
    });
  };

  const decline = async (inv) => {
    if (busy || !uid) return;
    setBusy(true);
    dismissLocal(inv.id);
    try { await declineScheduleInvite(inv.id, uid); }
    catch (e) { if (__DEV__) console.warn('[scheduleInvite] decline fail', e?.message); restoreLocal(inv); }
    finally { setBusy(false); }
  };

  if (!uid || !invites.length) return null;
  const inv = invites[0];   // 가장 최근 1건씩 — 처리하면 다음 것이 올라옴

  return (
    <Animated.View style={{
      marginHorizontal: 20, marginTop: 12, borderRadius: 16,
      // elevation 미사용 — 안드로이드는 elevation 그림자가 색을 무시하고 검게 렌더되므로(shadowColor는 iOS 전용).
      //   안드에선 버터 테두리 반짝임 + 스케일로 빛나게, iOS는 골드 그림자 후광.
      shadowColor: '#D9AF3C', shadowOffset: { width: 0, height: 0 },
      shadowOpacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }),
      shadowRadius: glow.interpolate({ inputRange: [0, 1], outputRange: [16, 34] }),
      transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }],
    }}>
    <Animated.View style={{ backgroundColor: 'rgba(255,255,255,0.12)',
      borderRadius: 16, borderWidth: 2,
      borderColor: glow.interpolate({ inputRange: [0, 1], outputRange: ['rgba(245,230,168,0.7)', 'rgba(245,230,168,1)'] }),
      paddingHorizontal: 14, paddingVertical: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 }}>
        <Icon name="calendar" size={fs(18)} color={C.butter} />
        <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(13.5), color: '#fff' }} numberOfLines={1}>
          {inv.initiatorName || '친구'}님이 일정에 초대했어요{invites.length > 1 ? ` 외 ${invites.length - 1}건` : ''}
        </Text>
      </View>
      <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: 'rgba(255,255,255,0.78)', marginBottom: 9 }} numberOfLines={1}>
        {inv.course}{inv.date ? ` · ${inv.date}` : ''}{inv.time ? ` · ${inv.time}` : ''}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity onPress={() => decline(inv)} disabled={busy} activeOpacity={0.85}
          style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center',
            borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.3)', opacity: busy ? 0.5 : 1 }}>
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: 'rgba(255,255,255,0.85)' }}>거절</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => accept(inv)} disabled={busy} activeOpacity={0.85}
          style={{ flex: 1.6, paddingVertical: 9, borderRadius: 10, alignItems: 'center',
            backgroundColor: C.butter, opacity: busy ? 0.6 : 1 }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.charcoal }}>{busy ? '처리 중…' : '내 일정에 추가'}</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
    </Animated.View>
  );
}
