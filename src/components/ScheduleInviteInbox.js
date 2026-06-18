import React, { useState, useEffect, useContext } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { C, F, fs } from '../constants/colors';
import { useCurrentUid } from '../contexts/CurrentUidContext';
import { SchedulesContext } from '../contexts/SchedulesContext';
import {
  subscribeIncomingScheduleInvites, buildDerivedSchedule,
  derivedScheduleId, joinScheduleGroup, declineScheduleInvite,
} from '../utils/scheduleShares';

// 일정 전파 수신 — 홈 상단 배너([[schedule-propagation-spec]] Stage 3). 친구가 보낸 일정 초대를 수락하면
//  내 일정에 자기파생(캘린더 동기화). cross-user 쓰기 0. uid=useCurrentUid(단일 소스, 재설치·계정전환 시 재구독).
export function ScheduleInviteInbox({ onActiveChange }) {
  const uid = useCurrentUid();
  const { schedules, addSharedSchedule, editSchedule } = useContext(SchedulesContext);
  const [invites, setInvites] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!uid) { setInvites([]); return; }
    const unsub = subscribeIncomingScheduleInvites(uid, setInvites);
    return unsub;
  }, [uid]);

  // 초대 배너 표시 여부를 부모(홈)에 통지 — 배너가 떠 있는 동안 홈은 아래 한줄메모/코멘트 카드를 숨겨
  //   좁은 화면에서 겹치지 않게 한다(수락/거절하면 다시 노출). 사용자 지정 2026-06-18.
  const active = !!uid && invites.length > 0;
  useEffect(() => { onActiveChange && onActiveChange(active); }, [active]);

  // 같은 라운딩(course+date) 일정을 이미 보유하면 중복 생성 대신 groupId 스탬프만(중복 방지, [[schedule-propagation-spec]] §4).
  const findExisting = (inv) => (schedules || []).find(s =>
    s.date === inv.date && (
      (s.courseId && inv.courseId) ? s.courseId === inv.courseId : s.course === inv.course
    ),
  );

  // 낙관적 닫기 — 누르는 즉시 로컬에서 그 초대를 제거해 배너를 닫는다(다음 건이 있으면 올라옴).
  //   onSnapshot 재발화(서버 왕복 2회)만 기다리면 iOS에서 지연·플리커로 "안 닫힌 것처럼" 보이고,
  //   중간 쓰기가 조용히 실패하면 영영 안 닫히던 문제 방지. 실패 시 restore()로 복원(스냅샷이 최종 정합).
  const dismissLocal = (id) => setInvites(prev => prev.filter(i => i.id !== id));
  const restoreLocal = (inv) => setInvites(prev => (prev.some(i => i.id === inv.id) ? prev : [inv, ...prev]));

  const accept = async (inv) => {
    if (busy || !uid) return;
    setBusy(true);
    dismissLocal(inv.id);
    try {
      const existing = findExisting(inv);
      if (existing) {
        if (!existing.groupId) await editSchedule(existing.id, { groupId: inv.id, sourceScheduleId: inv.sourceScheduleId || null });
      } else {
        const derived = buildDerivedSchedule(inv, uid);
        await addSharedSchedule(derivedScheduleId(inv.id, uid), derived); // 멱등 setDoc + 캘린더 동기화 + 로컬 반영
      }
      await joinScheduleGroup(inv.id, uid);
    } catch (e) { if (__DEV__) console.warn('[scheduleInvite] accept fail', e?.message); restoreLocal(inv); }
    finally { setBusy(false); }
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
    <View style={{ marginHorizontal: 20, marginTop: 10, backgroundColor: 'rgba(255,255,255,0.12)',
      borderRadius: 14, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.22)', paddingHorizontal: 14, paddingVertical: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 }}>
        <Text style={{ fontSize: fs(16) }}>🗓️</Text>
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
    </View>
  );
}
