import React, { useState, useEffect, useContext } from 'react';
import { Modal, View, Text, TouchableOpacity, Alert, Linking, ScrollView } from 'react-native';
import { showAppAlert } from './AppAlert';
import { C, F, fs } from '../constants/colors';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { UserContext } from '../contexts/UserContext';
import {
  ALARM_DEFS, ALARM_TYPES, ALARM_DEFAULTS_FALLBACK,
  alarmTriggers, requestNotificationPermission, scheduleRoundAlarms,
} from '../utils/notifications';

// 일정 추가 직후 뜨는 알람 설정 팝업.
// stage 'ask'(예/아니오) → stage 'select'(시점 체크박스) → 예약
export function AlarmSetupModal({ visible, schedule, onClose }) {
  const { userProfile, setUserProfile } = useContext(UserContext);
  const [stage, setStage] = useState('ask');
  const [picked, setPicked] = useState(ALARM_DEFAULTS_FALLBACK);
  const [dontAsk, setDontAsk] = useState(false);
  const [saving, setSaving] = useState(false);

  // 이미 지난 시점은 예약 불가 — 체크박스 비활성 처리용
  const triggers = schedule ? alarmTriggers(schedule) : {};
  const now = Date.now();
  const isPast = (t) => !triggers[t] || triggers[t].getTime() <= now;

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
    }
  }, [visible, schedule]);

  if (!schedule) return null;

  const anyPicked = ALARM_TYPES.some(t => picked[t]);

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
    await scheduleRoundAlarms(schedule, types);
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
