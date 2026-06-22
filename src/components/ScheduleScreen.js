import React, { useState, useEffect, useContext, useRef } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, Platform } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { C, F, fs } from '../constants/colors';
import { ROUTES } from '../constants/routes';
import { SchedulesContext } from '../contexts/SchedulesContext';
import { DiariesContext } from '../contexts/DiariesContext';
import { MyScheduleTab } from './MyScheduleTab';
import { AppAlertHost } from './AppAlert';

// asModal={true} + visible/onClose 모드로도 사용 가능 (홈에서 풀스크린 모달로 띄울 때).
// asModal=false면 기존 탭 화면처럼 동작 (navigation 필수).
export function ScheduleScreen({ navigation, asModal = false, visible: modalVisible = false, onClose }) {
  // ⚠️ DiariesContext 사용 — 이전엔 자체 useState + storage.load로 분리된 데이터였음.
  // DiaryScreen은 DiariesContext 사용하므로 diary.id 매칭 실패 → 다이어리 상세 안 열림 버그.
  // Context로 단일 소스화. (2026-05-26 데이터 불일치 fix)
  const { diaries } = useContext(DiariesContext);
  const { schedules } = useContext(SchedulesContext);
  const [upcoming, setUpcoming] = useState({ visible: false, y: 0 });
  const [jumpDate, setJumpDate] = useState(null);
  const [infoModal, setInfoModal] = useState(false); // ! 버튼 안내 — AppAlert 대신 ScheduleScreen 내부 Modal (3중 중첩 z-index 충돌 회피)
  const plusRef = useRef(null);

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
      <View style={{ backgroundColor: C.paleSky, paddingHorizontal: 16, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>
          {/* 윗줄(eyebrow) — 친구·라운지 헤더와 동일 컨벤션. 큰 글자만 덜렁 있어 단조롭던 것 보강(2026-06-15 사용자) */}
          <Text style={{ fontFamily: F.sysM, fontSize: fs(10), color: 'rgba(26,61,82,0.72)', letterSpacing: 2, marginBottom: Platform.OS === 'android' ? 2 : 4 }}>나의 라운딩 일정</Text>
          <TouchableOpacity
            ref={plusRef}
            onPress={openUpcoming}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 14 }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontFamily: F.serifKR, fontSize: fs(Platform.OS === 'android' ? 24 : 28), color: C.navy }}>골프 일정</Text>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(20), color: C.navy, marginTop: 3 }}>›</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={() => setInfoModal(true)}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{
            width: 24, height: 24, borderRadius: 12,
            borderWidth: 1.5, borderColor: C.navy,
            alignItems: 'center', justifyContent: 'center',
          }}>
          <Text style={{ fontFamily: F.en, fontSize: fs(14), color: C.navy, lineHeight: 17 }}>!</Text>
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
        onCloseSchedule={asModal ? onClose : undefined}
        onRequestAddDiary={(seed) => {
          if (asModal) { onClose?.(); }
          // 지난 라운딩에 기록 추가 시 구장명·코스ID·일정ID 함께 전달
          // scheduleId는 같은 날 일정 N건 매칭 시 1:1 보장의 핵심 ([[home-multi-schedule-same-day]])
          // returnToSchedule=true → DiaryAddModal 닫을 때 일정 화면 자동 재오픈
          navigation?.navigate?.(ROUTES.MY, {
            openAddModal: true,
            addDate: seed?.date,
            addCourse: seed?.course,
            addCourseId: seed?.courseId || seed?.courseLogId,
            addScheduleId: seed?.id || null,
            returnToSchedule: asModal === true ? true : undefined,
          });
        }}
        onRequestOpenDiary={(diary) => {
          // 기록 있는 일정 카드 탭 → 다이어리 상세 화면 직접 진입 (시트 우회).
          // returnToSchedule=true → 상세 닫을 때(안드 뒤로가기·iOS 좌상단 버튼) 일정 캘린더 자동 재오픈 ([[modal-navigation-pattern]]).
          if (asModal) { onClose?.(); }
          navigation?.navigate?.(ROUTES.MY, { openDiaryId: diary.id, returnToSchedule: asModal === true ? true : undefined });
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

      {/* ! 버튼 안내 — ScheduleScreen 내부 Modal로 표시. AppAlert는 ScheduleScreen이 asModal일 때 3중 중첩(MyPageModal > ScheduleScreen > AppAlert)에서 부모 뒤로 깔리는 RN 이슈. 자체 Modal은 부모와 같은 컨테이너에 있어 정상 노출. */}
      <Modal visible={infoModal} transparent animationType="fade" onRequestClose={() => setInfoModal(false)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setInfoModal(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}
            style={{ backgroundColor: C.bgPrimary, borderRadius: 18, paddingTop: 24, paddingHorizontal: 22, paddingBottom: 16, width: '100%', maxWidth: 360 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(17), color: C.charcoal, textAlign: 'center', marginBottom: 12 }}>
              라운딩 카드 안내
            </Text>
            <Text style={{ fontFamily: F.sysM, fontSize: fs(13), color: C.charcoal, lineHeight: 21, marginBottom: 22 }}>
              예정 라운딩 카드를 탭하면 시트가 열려요.{'\n'}일정 수정·삭제, 날씨·교통 확인을 할 수 있어요.{'\n\n'}지난 라운딩은 기록이 있으면 탭할 때 기록 상세로, 기록이 없으면 기록 추가로 이어져요.{'\n\n'}지난 라운딩의 수정·삭제는 MY 탭에서 해주세요.
            </Text>
            <TouchableOpacity activeOpacity={0.85}
              onPress={() => setInfoModal(false)}
              style={{ paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: C.charcoal }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.butter }}>확인</Text>
            </TouchableOpacity>
          </TouchableOpacity>
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
        {/* 이 모달 안의 AppAlert 호스트 — 삭제 확인 등 showAppAlert가 이 풀스크린 모달 위에
            정상 노출되도록(루트 호스트는 iOS에서 모달 뒤로 깔림). 모달 닫히면 자동으로 루트 호스트 복귀. */}
        <AppAlertHost />
      </GestureHandlerRootView>
    </Modal>
  );
}
