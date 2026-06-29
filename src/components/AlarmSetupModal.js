import React, { useState, useEffect, useContext } from 'react';
import { Modal, View, Text, TouchableOpacity, Linking, ScrollView } from 'react-native';
import { showAppAlert } from './AppAlert';
import { C, F, fs } from '../constants/colors';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { UserContext } from '../contexts/UserContext';
import {
  ALARM_DEFS, ALARM_TYPES, ALARM_DEFAULTS_FALLBACK, shouldOfferWake, defaultOriginKey,
  alarmTriggers, computeRoundTimeline, fmtClock, requestNotificationPermission, scheduleRoundAlarms,
} from '../utils/notifications';
import { getScheduleDriveMin } from '../utils/scheduleWx';
import { getCurrentLocation } from '../utils/location';

// 준비시간(집에서 나갈 때까지)·도착여유(구장 도착~티오프) 칩 선택지(분).
//   기본값을 강요하지 않되, 처음엔 무난한 30분에서 시작 — 사람마다 칩으로 조정(여성 화장 1시간 ↔ 남성 5분).
const PREP_OPTS = [5, 15, 30, 60];
const ARRIVE_OPTS = [0, 30, 60];
const arriveLabel = (m) => (m === 0 ? '바로' : `${m}분`);
const DEFAULT_PREP = 30;
const DEFAULT_ARRIVE = 30;

// 일정 추가 직후 뜨는 알람 설정 팝업.
// stage 'ask'(예/아니오) → stage 'select'(시점 체크박스) → 예약
export function AlarmSetupModal({ visible, schedule, onClose }) {
  const { userProfile, setUserProfile } = useContext(UserContext);
  const [stage, setStage] = useState('ask');
  const [picked, setPicked] = useState(ALARM_DEFAULTS_FALLBACK);
  const [dontAsk, setDontAsk] = useState(false);
  const [saving, setSaving] = useState(false);

  // 기상·출발(동적 알람) 상태 — 이동시간 역산 기반
  const [driveMin, setDriveMin] = useState(null);          // 집→구장 이동(분). null=미조회/불가
  const [driveLoading, setDriveLoading] = useState(false);
  const [prepMin, setPrepMin] = useState(DEFAULT_PREP);     // 집에서 나갈 준비시간
  const [arriveBufferMin, setArriveBufferMin] = useState(DEFAULT_ARRIVE); // 구장 도착여유
  const [wakeOn, setWakeOn] = useState(false);
  const [departOn, setDepartOn] = useState(false);
  const [originKey, setOriginKey] = useState('home'); // 'home'|'work'|'current' — 출발지(부별 기본)

  // 저장된 출발지(집·회사)
  const homeCoord = userProfile?.departureCoord;
  const workCoord = userProfile?.workCoord;
  const hasHome = !!(homeCoord && typeof homeCoord.x === 'number' && typeof homeCoord.y === 'number');
  const hasWork = !!(workCoord && typeof workCoord.x === 'number' && typeof workCoord.y === 'number');
  const hasAnyOrigin = hasHome || hasWork;

  // 이미 지난 시점은 예약 불가 — 체크박스 비활성 처리용
  const triggers = schedule ? alarmTriggers(schedule, { driveMin, prepMin, arriveBufferMin }) : {};
  const now = Date.now();
  const isPast = (t) => !triggers[t] || triggers[t].getTime() <= now;

  // 역산 타임라인 — 이동시간 확보 시 기상·출발·티오프 시각 계산
  const timeline = (driveMin != null && schedule)
    ? computeRoundTimeline(schedule, { driveMin, prepMin, arriveBufferMin }) : null;
  // 기상 알림은 '오전티(1부)'일 때만 권함 — 티오프<9시거나 역산 기상이<7시(낮티라도 먼거리). 낮·야간은 숨김.
  const isMorningWake = shouldOfferWake(timeline);
  const departPast = isPast('depart');
  const wakePast = isPast('wake');

  useEffect(() => {
    if (visible) {
      setStage('ask');
      setSaving(false);
      setDontAsk(false);
      const base = userProfile.alarmDefaults || ALARM_DEFAULTS_FALLBACK;
      // 기본값에서 시작하되 이미 지난 시점은 꺼둠
      setPicked({
        d3: !!base.d3 && !isPast('d3'),
        d1: !!base.d1 && !isPast('d1'),
        teeoff: !!base.teeoff && !isPast('teeoff'),
      });
      // 개인설정은 저장값 우선(기억된 습관), 없으면 기본
      setPrepMin(Number.isFinite(userProfile.prepMin) ? userProfile.prepMin : DEFAULT_PREP);
      setArriveBufferMin(Number.isFinite(userProfile.arriveBufferMin) ? userProfile.arriveBufferMin : DEFAULT_ARRIVE);
      setWakeOn(false);
      setDepartOn(false);
      setDriveMin(null);
      // 출발지 기본값 — 부(部)별: 1부=집 / 2·3부=회사. 기본 좌표 없으면 가능한 것으로 폴백.
      let k = defaultOriginKey(schedule, userProfile);
      if (k === 'home' && !hasHome) k = hasWork ? 'work' : 'current';
      setOriginKey(k);
    }
  }, [visible, schedule]);

  // 출발지(originKey)별 이동시간 조회 — 출발지 바뀌면 재계산. 'current'는 GPS 1회(미리 예약이라 지금 위치 기준).
  useEffect(() => {
    if (!visible || !schedule) return;
    let alive = true;
    setDriveMin(null);
    (async () => {
      let coord = null;
      if (originKey === 'work') coord = hasWork ? workCoord : null;
      else if (originKey === 'current') {
        const loc = await getCurrentLocation();
        if (loc) coord = { x: loc.lng, y: loc.lat };
      } else coord = hasHome ? homeCoord : null; // home
      if (!coord) { if (alive) setDriveLoading(false); return; }
      if (alive) setDriveLoading(true);
      try {
        const m = await getScheduleDriveMin(schedule, coord);
        if (alive && Number.isFinite(m)) setDriveMin(m);
      } catch {}
      if (alive) setDriveLoading(false);
    })();
    return () => { alive = false; };
  }, [visible, schedule, originKey]);

  // 이동시간 확보 시 동적 알람 기본 ON(요청 많던 기능) — 출발은 항상, 기상은 새벽 티만
  useEffect(() => {
    if (driveMin == null) return;
    setDepartOn(!departPast);
    setWakeOn(isMorningWake && !wakePast);
  }, [driveMin]);

  if (!schedule) return null;

  // 개인설정 변경 시 프로필에 저장 — 다음 라운드부터 자동 적용(습관 기억)
  const persistProfile = (patch) => {
    const updated = { ...userProfile, ...patch };
    setUserProfile({ ...updated });
    storage.save(STORAGE_KEYS.profile, updated);
  };
  const pickPrep = (m) => { setPrepMin(m); persistProfile({ prepMin: m }); };
  const pickArrive = (m) => { setArriveBufferMin(m); persistProfile({ arriveBufferMin: m }); };

  const anyPicked = ALARM_TYPES.some(t => picked[t]) || (departOn && !departPast) || (wakeOn && !wakePast);

  // 닫을 때 '다시 묻지 않기'가 켜져 있으면 프로필에 기록
  const close = () => {
    if (dontAsk && !userProfile.alarmPromptDisabled) {
      const updated = { ...userProfile, alarmPromptDisabled: true };
      setUserProfile({ ...updated });
      storage.save(STORAGE_KEYS.profile, updated);
    }
    onClose && onClose();
  };

  const handleConfirm = async () => {
    if (saving) return;
    if (!anyPicked) { close(); return; }
    setSaving(true);
    const granted = await requestNotificationPermission();
    if (!granted) {
      setSaving(false);
      showAppAlert(
        '알림 권한이 필요해요',
        '라운딩 알람을 받으려면 알림 권한을 허용해주세요.',
        [
          { text: '나중에', style: 'cancel', onPress: () => close() },
          { text: '설정 열기', onPress: () => { Linking.openSettings(); close(); } },
        ],
      );
      return;
    }
    const types = ALARM_TYPES.filter(t => picked[t]);
    if (departOn && !departPast) types.push('depart');
    if (wakeOn && !wakePast) types.push('wake');
    // 동적 알람(기상·출발) 켜졌으면 역산 근거(이동시간·개인설정)를 함께 넘김
    const opts = (departOn || wakeOn) ? { driveMin, prepMin, arriveBufferMin } : undefined;
    await scheduleRoundAlarms(schedule, types, opts);
    setSaving(false);
    close();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <View style={{ width: '100%', maxWidth: 360, backgroundColor: C.bgPrimary, borderRadius: 20, maxHeight: '100%' }}>
          {/* 확대 시 옵션 많은 'select' 단계가 카드를 넘쳐 하단 버튼 잘리던 것 방지 — 스크롤(패딩은 contentContainer로) */}
          <ScrollView contentContainerStyle={{ padding: 24 }} bounces={false} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {stage === 'ask' ? (
            <>
              <Text style={{ fontSize: fs(34), textAlign: 'center', marginBottom: 10 }}>🔔</Text>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(18), color: C.charcoal, textAlign: 'center' }}>
                라운딩 알람을 설정할까요?
              </Text>
              <View style={{ backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline, borderRadius: 12, padding: 14, marginTop: 16 }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.charcoal }} numberOfLines={1}>
                  {schedule.course}
                </Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 4 }}>
                  {schedule.date} {schedule.day} · {schedule.time}
                </Text>
              </View>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, textAlign: 'center', marginTop: 14, lineHeight: 18 }}>
                라운딩 전에 잊지 않도록{'\n'}미리 알림을 보내드릴 수 있어요.
              </Text>

              {/* 다시 묻지 않기 */}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setDontAsk(v => !v)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16 }}>
                <View style={{
                  width: 18, height: 18, borderRadius: 5, marginRight: 8,
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 1.5, borderColor: dontAsk ? C.burgundy : C.warmGrayLight,
                  backgroundColor: dontAsk ? C.burgundy : 'transparent',
                }}>
                  {dontAsk && <Text style={{ color: C.butter, fontSize: fs(11), fontWeight: '700' }}>✓</Text>}
                </View>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray }}>
                  다시 묻지 않기 (기본 설정대로 자동 적용)
                </Text>
              </TouchableOpacity>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={close}
                  style={{ flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: C.hairline, backgroundColor: C.bgSecondary }}>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: C.warmGray }}>나중에</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setStage('select')}
                  style={{ flex: 1.4, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: C.burgundy }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.butter }}>네, 설정할게요</Text>
                </TouchableOpacity>
              </View>
              {dontAsk && (
                <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGray, textAlign: 'center', marginTop: 10, lineHeight: 15 }}>
                  다음부터는 이 팝업 없이 마이페이지 기본 설정대로 적용돼요.{'\n'}마이페이지에서 다시 켤 수 있어요.
                </Text>
              )}
            </>
          ) : (
            <>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(17), color: C.charcoal }}>
                알람 받을 시점
              </Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 6, marginBottom: 14 }}>
                원하는 시점을 선택해주세요.
              </Text>

              {/* ── 기상·출발 (이동시간 역산) ── */}
              {hasAnyOrigin ? (
                <View style={{ backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline, borderRadius: 12, padding: 14, marginBottom: 14 }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal }}>골프 가는 길</Text>
                  {/* 출발지 선택 — 부별 기본(1부 집·2/3부 회사), 탭해서 변경 */}
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                    {[
                      hasHome && { key: 'home', label: '🏠 집' },
                      hasWork && { key: 'work', label: '🏢 회사' },
                      { key: 'current', label: '📍 현재위치' },
                    ].filter(Boolean).map(o => {
                      const on = originKey === o.key;
                      return (
                        <TouchableOpacity key={o.key} activeOpacity={0.8} onPress={() => setOriginKey(o.key)}
                          style={{ flex: 1, paddingVertical: 7, borderRadius: 9, alignItems: 'center', borderWidth: 1, borderColor: on ? C.burgundy : C.hairline, backgroundColor: on ? '#F5EAEC' : C.bgPrimary }}>
                          <Text style={{ fontFamily: on ? F.sysSb : F.sys, fontSize: fs(11), color: on ? C.burgundy : C.warmGray }}>{o.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {originKey === 'current' && (
                    <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGrayLight, marginTop: 4 }}>지금 위치 기준으로 계산해요 (오후·야간 라운드)</Text>
                  )}
                  {driveLoading && !timeline?.depart ? (
                    <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 8 }}>이동시간 계산 중…</Text>
                  ) : timeline?.depart ? (
                    <>
                      {/* 역산 타임라인 요약 */}
                      <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 8, lineHeight: 20 }}>
                        🏌️ 티오프 {fmtClock(timeline.teeoff)}   ·   🚗 출발 {fmtClock(timeline.depart)}
                        {isMorningWake ? `   ·   🔔 기상 ${fmtClock(timeline.wake)}` : ''}
                      </Text>

                      {/* 준비시간 칩 — 기상 알림이 의미있는 새벽 티에만 */}
                      {isMorningWake && (
                        <>
                          <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 12 }}>집에서 나갈 준비 시간</Text>
                          <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                            {PREP_OPTS.map(m => {
                              const on = prepMin === m;
                              return (
                                <TouchableOpacity key={m} activeOpacity={0.8} onPress={() => pickPrep(m)}
                                  style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: on ? C.burgundy : C.hairline, backgroundColor: on ? '#F5EAEC' : C.bgPrimary }}>
                                  <Text style={{ fontFamily: on ? F.sysSb : F.sys, fontSize: fs(12), color: on ? C.burgundy : C.warmGray }}>{m}분</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </>
                      )}

                      {/* 도착여유 칩 */}
                      <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 12 }}>구장 도착여유 (티오프 전)</Text>
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                        {ARRIVE_OPTS.map(m => {
                          const on = arriveBufferMin === m;
                          return (
                            <TouchableOpacity key={m} activeOpacity={0.8} onPress={() => pickArrive(m)}
                              style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: on ? C.burgundy : C.hairline, backgroundColor: on ? '#F5EAEC' : C.bgPrimary }}>
                              <Text style={{ fontFamily: on ? F.sysSb : F.sys, fontSize: fs(12), color: on ? C.burgundy : C.warmGray }}>{arriveLabel(m)}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      {/* 출발 알림 토글 */}
                      <TouchableOpacity activeOpacity={departPast ? 1 : 0.7} disabled={departPast} onPress={() => setDepartOn(v => !v)}
                        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 11, marginTop: 12, borderRadius: 12, borderWidth: 1, borderColor: departOn ? C.burgundy : C.hairline, backgroundColor: departOn ? '#F5EAEC' : C.bgPrimary, opacity: departPast ? 0.45 : 1 }}>
                        <View style={{ width: 22, height: 22, borderRadius: 6, marginRight: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: departOn ? C.burgundy : C.warmGrayLight, backgroundColor: departOn ? C.burgundy : 'transparent' }}>
                          {departOn && <Text style={{ color: C.butter, fontSize: fs(13), fontWeight: '700' }}>✓</Text>}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.charcoal }}>🚗 출발 알림</Text>
                          <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 2 }}>
                            {departPast ? '이미 지난 시각이에요' : `${fmtClock(timeline.depart)}에 알려드려요`}
                          </Text>
                        </View>
                      </TouchableOpacity>

                      {/* 기상 알림 토글 — 새벽 티에만 */}
                      {isMorningWake && (
                        <TouchableOpacity activeOpacity={wakePast ? 1 : 0.7} disabled={wakePast} onPress={() => setWakeOn(v => !v)}
                          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 11, marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: wakeOn ? C.burgundy : C.hairline, backgroundColor: wakeOn ? '#F5EAEC' : C.bgPrimary, opacity: wakePast ? 0.45 : 1 }}>
                          <View style={{ width: 22, height: 22, borderRadius: 6, marginRight: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: wakeOn ? C.burgundy : C.warmGrayLight, backgroundColor: wakeOn ? C.burgundy : 'transparent' }}>
                            {wakeOn && <Text style={{ color: C.butter, fontSize: fs(13), fontWeight: '700' }}>✓</Text>}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.charcoal }}>🔔 기상 알림</Text>
                            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 2 }}>
                              {wakePast ? '이미 지난 시각이에요' : `${fmtClock(timeline.wake)}에 깨워드려요`}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      )}
                    </>
                  ) : (
                    <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 8, lineHeight: 18 }}>
                      구장 위치를 못 찾아 이동시간을 계산할 수 없어요. 일정의 구장명을 확인해주세요.
                    </Text>
                  )}
                </View>
              ) : (
                <View style={{ backgroundColor: '#FBF6EE', borderWidth: 0.5, borderColor: C.hairline, borderRadius: 12, padding: 14, marginBottom: 14 }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal }}>🚗 출발·기상 알림</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 6, lineHeight: 17 }}>
                    마이페이지에서 자주 가는 출발지를 저장하면, 이동시간을 계산해{'\n'}출발·기상 시각을 자동으로 알려드려요.
                  </Text>
                </View>
              )}

              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGrayLight, marginBottom: 8 }}>그 밖의 알림</Text>

              {ALARM_TYPES.map(t => {
                const def = ALARM_DEFS[t];
                const past = isPast(t);
                const on = picked[t];
                return (
                  <TouchableOpacity
                    key={t}
                    activeOpacity={past ? 1 : 0.7}
                    disabled={past}
                    onPress={() => setPicked(p => ({ ...p, [t]: !p[t] }))}
                    style={{
                      flexDirection: 'row', alignItems: 'center',
                      paddingVertical: 12, paddingHorizontal: 12, marginBottom: 8,
                      borderRadius: 12, borderWidth: 1,
                      borderColor: on ? C.burgundy : C.hairline,
                      backgroundColor: on ? '#F5EAEC' : C.bgSecondary,
                      opacity: past ? 0.45 : 1,
                    }}>
                    <View style={{
                      width: 22, height: 22, borderRadius: 6, marginRight: 12,
                      alignItems: 'center', justifyContent: 'center',
                      borderWidth: 1.5, borderColor: on ? C.burgundy : C.warmGrayLight,
                      backgroundColor: on ? C.burgundy : 'transparent',
                    }}>
                      {on && <Text style={{ color: C.butter, fontSize: fs(13), fontWeight: '700' }}>✓</Text>}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.charcoal }}>
                        {def.label}
                      </Text>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 2 }}>
                        {past ? '이미 지난 시점이에요' : def.title}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={close}
                  style={{ flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: C.hairline, backgroundColor: C.bgSecondary }}>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: C.warmGray }}>건너뛰기</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  disabled={saving}
                  onPress={handleConfirm}
                  style={{ flex: 1.4, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: anyPicked ? C.burgundy : C.warmGrayLight }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.butter }}>
                    {saving ? '설정 중…' : anyPicked ? '알람 설정' : '선택 안 함'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
