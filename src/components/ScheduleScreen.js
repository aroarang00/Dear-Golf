import React, { useState, useEffect, useContext, useRef } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { showAppAlert } from './AppAlert';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { C, F, fs } from '../constants/colors';
import { DIARY_DATA } from '../constants/data';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { SchedulesContext } from '../contexts/SchedulesContext';
import { MyScheduleTab } from './MyScheduleTab';

// asModal={true} + visible/onClose 모드로도 사용 가능 (홈에서 풀스크린 모달로 띄울 때).
// asModal=false면 기존 탭 화면처럼 동작 (navigation 필수).
export function ScheduleScreen({ navigation, asModal = false, visible: modalVisible = false, onClose }) {
  const [diaries, setDiaries] = useState(DIARY_DATA);
  const { schedules } = useContext(SchedulesContext);
  const [upcoming, setUpcoming] = useState({ visible: false, y: 0 });
  const [jumpDate, setJumpDate] = useState(null);
  const plusRef = useRef(null);

  // 다이어리(라운딩 기록)는 캘린더 완료 표시에만 쓰임
  // asModal: 모달이 열릴 때마다 / 탭 모드: navigation focus 시점
  useEffect(() => {
    const load = async () => {
      const d = await storage.load(STORAGE_KEYS.diaries, DIARY_DATA);
      setDiaries(d);
    };
    if (asModal) {
      if (modalVisible) load();
      return;
    }
    load();
    const unsubscribe = navigation?.addListener?.('focus', load);
    return unsubscribe;
  }, [navigation, asModal, modalVisible]);

  // 오늘 이후 예정 라운딩 — 월 무관 전체 (캘린더는 한 달만 보이므로 다음 달까지 한눈에)
  const now0 = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); })();
  const parseDate = (s) => {
    const [y, m, d] = (s?.date || '').split('.').map(Number);
    return new Date(y || 1970, (m || 1) - 1, d || 1).getTime();
  };
  const upcomingSchedules = schedules
    .filter(s => s.date && parseDate(s) >= now0)
    .sort((a, b) => parseDate(a) - parseDate(b));
  const freshDDay = (s) => Math.max(0, Math.round((parseDate(s) - now0) / 86400000));

  const openUpcoming = () => {
    plusRef.current?.measureInWindow((x, y) => setUpcoming({ visible: true, y }));
  };
  const closeUpcoming = () => setUpcoming({ visible: false, y: 0 });
  // 목록에서 항목 선택 → 해당 라운딩이 있는 달로 캘린더 이동
  const handlePickUpcoming = (s) => {
    const [y, m] = s.date.split('.').map(Number);
    closeUpcoming();
    setJumpDate({ y, m: m - 1, n: Date.now() });
  };

  const content = (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={asModal ? ['top', 'bottom', 'left', 'right'] : ['top', 'left', 'right']}>
      <View style={{ backgroundColor: C.paleSky, paddingHorizontal: 20, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <TouchableOpacity
            ref={plusRef}
            onPress={openUpcoming}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 14 }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontFamily: F.serifKR, fontSize: fs(28), color: C.navy }}>일정</Text>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(22), color: C.navy, marginTop: 3 }}>›</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={() => showAppAlert(
            '일정 삭제 안내',
            '지난 일정을 삭제하려면\n일정 카드를 길게 누르세요.\n\n다이어리 기록이 있는 일정은\n다이어리 탭에서 삭제할 수 있어요.',
            [{ text: '확인' }],
          )}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{
            width: 24, height: 24, borderRadius: 12,
            borderWidth: 1.5, borderColor: C.navy,
            alignItems: 'center', justifyContent: 'center',
          }}>
          <Text style={{ fontFamily: F.en, fontSize: fs(14), color: C.navy, fontWeight: '700', lineHeight: 17 }}>!</Text>
        </TouchableOpacity>
        {asModal && (
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ paddingHorizontal: 13, paddingVertical: 6, borderRadius: 14, backgroundColor: C.bgSecondary }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.navy }}>닫기</Text>
          </TouchableOpacity>
        )}
      </View>
      <MyScheduleTab
        diaries={diaries}
        navigation={navigation}
        jumpDate={jumpDate}
        onRequestAddDiary={(seed) => {
          if (asModal) { onClose?.(); }
          // 지난 라운딩에 기록 추가 시 구장명·코스ID도 함께 전달해 DiaryAddModal에 자동 채워지게
          navigation?.navigate?.('MY', {
            openAddModal: true,
            addDate: seed?.date,
            addCourse: seed?.course,
            addCourseId: seed?.courseId || seed?.courseLogId,
          });
        }}
      />

      {/* 예정 라운딩 전체 목록 — '캘린더' 헤더 아래 드롭다운 (월별 그룹) */}
      <Modal visible={upcoming.visible} transparent animationType="fade" onRequestClose={closeUpcoming}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeUpcoming}>
          <View style={{
            position: 'absolute', top: upcoming.y + 32, left: 16, right: 16,
            backgroundColor: C.bgPrimary, borderRadius: 14, paddingVertical: 6, maxHeight: 400,
            shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.28, shadowRadius: 28, elevation: 20,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingHorizontal: 16, paddingTop: 9, paddingBottom: 7 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal }}>예정 라운딩</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray }}>{upcomingSchedules.length}건</Text>
            </View>
            {upcomingSchedules.length === 0 ? (
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, paddingHorizontal: 16, paddingVertical: 18, textAlign: 'center' }}>
                예정된 라운딩이 없어요
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
                {upcomingSchedules.map((s, i) => {
                  const dd = freshDDay(s);
                  const m = Number(s.date.split('.')[1]);
                  const prevM = i > 0 ? Number(upcomingSchedules[i - 1].date.split('.')[1]) : null;
                  const showMonth = m !== prevM;
                  return (
                    <View key={s.id}>
                      {showMonth && (
                        <Text style={{ fontFamily: F.sysB, fontSize: fs(11), color: C.burgundy, letterSpacing: 1, paddingHorizontal: 16, paddingTop: i === 0 ? 2 : 10, paddingBottom: 4 }}>
                          {m}월
                        </Text>
                      )}
                      <TouchableOpacity
                        activeOpacity={0.6}
                        onPress={() => handlePickUpcoming(s)}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 10,
                          paddingVertical: 9, paddingHorizontal: 16,
                          borderTopWidth: showMonth ? 0 : 0.5, borderColor: C.hairline,
                        }}>
                        <View style={{
                          minWidth: 46, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 7, alignItems: 'center',
                          backgroundColor: dd === 0 ? C.burgundy : C.bgSecondary,
                        }}>
                          <Text style={{ fontFamily: F.sysB, fontSize: fs(11), color: dd === 0 ? C.butter : C.charcoal }}>
                            {dd === 0 ? 'D-DAY' : `D-${dd}`}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal }} numberOfLines={1}>{s.course}</Text>
                          <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 2 }}>{s.date} {s.day} · {s.time}</Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );

  if (!asModal) return content;
  return (
    <Modal visible={modalVisible} animationType="slide" onRequestClose={onClose}>
      {/* 안드로이드에서 Modal은 별도 윈도우 — 앱 루트의 GestureHandlerRootView 밖이라
          내부 제스처(캘린더 월 스와이프)가 동작하려면 여기서 다시 감싸야 함 */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>{content}</SafeAreaProvider>
      </GestureHandlerRootView>
    </Modal>
  );
}
