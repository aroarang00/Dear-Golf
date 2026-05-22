import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { getAvailableCalendars, getCalendarChoice, setCalendarChoice } from '../utils/deviceCalendar';

// 라운딩 일정을 동기화할 캘린더 선택 (구글/애플/삼성). 네이버는 API 미지원이라 제외.
export function CalendarPickerModal({ visible, onClose }) {
  const insets = useSafeAreaInsets();
  const [cals, setCals] = useState(null); // null = 로딩 중
  const [chosen, setChosen] = useState(null);

  useEffect(() => {
    if (!visible) return;
    setCals(null);
    (async () => {
      const [list, choice] = await Promise.all([getAvailableCalendars(), getCalendarChoice()]);
      setCals(list);
      setChosen(choice);
    })();
  }, [visible]);

  const pick = async (id) => {
    await setCalendarChoice(id);
    onClose?.();
  };

  // 한 번 연 뒤엔 다시 자동으로 안 묻도록 — 미선택 시 '자동'으로 확정
  const handleClose = async () => {
    const cur = await getCalendarChoice();
    if (!cur) await setCalendarChoice('__auto__');
    onClose?.();
  };

  const rows = [
    { id: '__auto__', title: '기본 캘린더 (자동 선택)', account: '앱이 알아서 골라요', color: C.warmGray },
    ...(cals || []),
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={handleClose} />
        <View style={{ backgroundColor: C.bgPrimary, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 22, paddingTop: 14, paddingBottom: 28 + insets.bottom }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: C.hairline, alignSelf: 'center', marginBottom: 16 }} />
          <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal, marginBottom: 4 }}>캘린더 연동</Text>
          <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGrayLight, marginBottom: 14 }}>
            라운딩 일정을 어느 캘린더에 추가할지 선택하세요
          </Text>
          {cals === null ? (
            <View style={{ paddingVertical: 34, alignItems: 'center' }}>
              <ActivityIndicator color={C.burgundy} />
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 340 }}>
              {rows.map(c => {
                const on = (chosen || '__auto__') === c.id;
                return (
                  <TouchableOpacity key={c.id} onPress={() => pick(c.id)} activeOpacity={0.7}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: c.color || C.warmGray, marginRight: 12 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.charcoal }}>{c.title}</Text>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGrayLight, marginTop: 2 }}>{c.account}</Text>
                    </View>
                    {on && <Text style={{ fontSize: fs(16), color: C.burgundy, fontWeight: '700' }}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
              {cals.length === 0 && (
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, paddingVertical: 18, textAlign: 'center', lineHeight: 18 }}>
                  연동 가능한 캘린더가 없어요.{'\n'}휴대폰 설정에서 캘린더 권한을 확인해주세요.
                </Text>
              )}
            </ScrollView>
          )}
          <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGrayLight, marginTop: 14, textAlign: 'center', lineHeight: 16 }}>
            구글·애플·삼성 캘린더 지원 · 네이버 캘린더는 미지원
          </Text>
        </View>
      </View>
    </Modal>
  );
}
