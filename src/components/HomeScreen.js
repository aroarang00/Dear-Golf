import React, { useState, useEffect, useRef } from 'react';
import {
  StatusBar, View, Text, TouchableOpacity, ScrollView,
  PanResponder, Share, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F } from '../constants/colors';
import { SCHEDULES_INIT, MEMO_MAP, COURSE_LOG, DIARY_DATA } from '../constants/data';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { normalizeSchedules } from '../utils/helpers';
import { homeS } from '../styles/homeS';
import { UserContext } from '../contexts/UserContext';
import { HomeBgSlider } from './common/HomeBgSlider';
import { TripleStripe } from './common/TripleStripe';
import { WeatherMiniBar } from './WeatherMiniBar';
import { ScheduleSheetModal } from './ScheduleSheetModal';
import { ScheduleModal } from './ScheduleModal';
import { WeatherTransportPopup } from './WeatherTransportPopup';

export function HomeScreen({ navigation }) {
  const { userProfile } = React.useContext(UserContext);
  const [showAddModal, setShowAddModal] = useState(false);
  const [schedules, setSchedules] = useState(SCHEDULES_INIT);
  const [schedulesHydrated, setSchedulesHydrated] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showWeatherFull, setShowWeatherFull] = useState(false);
  const [showTrafficFull, setShowTrafficFull] = useState(false);
  const [editSchedule, setEditSchedule] = useState(null);
  const [cardIndex, setCardIndex] = useState(0);

  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10,
    onPanResponderRelease: (_, g) => {
      if (g.dx < -40) setCardIndex(1);
      else if (g.dx > 40) setCardIndex(0);
    },
  })).current;

  useEffect(() => {
    (async () => {
      const loaded = await storage.load(STORAGE_KEYS.schedules, SCHEDULES_INIT);
      setSchedules(normalizeSchedules(loaded));
      setSchedulesHydrated(true);
    })();
  }, []);

  useEffect(() => {
    if (!schedulesHydrated) return;
    storage.save(STORAGE_KEYS.schedules, schedules);
  }, [schedules, schedulesHydrated]);

  const next = schedules.length > 0 ? schedules[0] : null;

  const memoEntry = next ? Object.values(MEMO_MAP).find(m => {
    const course = COURSE_LOG.find(c => c.id === m.courseId);
    return course && course.name === next.course;
  }) : null;

  const handleMemoPress = () => {
    if (!memoEntry) return;
    const diaryItem = DIARY_DATA.find(d => d.course === next.course);
    if (diaryItem) navigation.navigate('다이어리', { openDiaryId: diaryItem.id });
  };

  const handleCardCoursePress = (schedule) => {
    if (schedule.courseLogId) {
      navigation.navigate('가이드', { openCourseId: schedule.courseLogId });
    }
  };

  const openScheduleSheet = (schedule) => {
    setSelectedSchedule(schedule);
    setShowScheduleModal(true);
  };

  const openCurrentWeather = () => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}.${String(today.getMonth()+1).padStart(2,'0')}.${String(today.getDate()).padStart(2,'0')}`;
    const target = next || {
      course: '내 위치', date: dateStr, day: '', time: '--:--',
      members: 0, dDay: 0, weather: '맑음 18°', wind: '', duration: '',
    };
    setSelectedSchedule(target);
    setShowWeatherFull(true);
  };

  const handleShareSchedule = (s) => {
    if (!s) return;
    const msg = `[ Dear Golf ]\n\n${s.course}\n${s.date} ${s.day}요일  ${s.time}\n${s.members}명 동반 · D-${s.dDay}\n\n예상 날씨  ${s.weather}\n권장 출발  ${s.duration} 전 출발\n         (티오프 30분 전 도착 기준)\n\n나만의 골프 캐디, Dear Golf와\n함께하는 라운딩입니다\n\ndeargolf.app`;
    Share.share({ message: msg });
  };

  const handleEditSchedule = (s) => {
    setShowScheduleModal(false);
    setEditSchedule(s);
  };

  const handleDeleteSchedule = (s) => {
    if (!s) return;
    Alert.alert(
      '일정 삭제',
      `${s.course}\n${s.date} ${s.day} · ${s.time}\n\n이 일정을 삭제할까요?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => {
            setSchedules(prev => prev.filter(x => x.id !== s.id));
            setShowScheduleModal(false);
            setSelectedSchedule(null);
          },
        },
      ],
    );
  };

  const handleScheduleSave = (type, data) => {
    if (type === 'schedule') {
      const newS = {
        id: String(Date.now()),
        course: data.course, date: data.date, day: data.day || '토',
        time: data.time || '08:00', members: data.members || 4,
        dDay: data.dDay || 30, weather: '맑음 20°', wind: '남 2m/s',
        duration: '1시간 30분', courseLogId: null,
      };
      setSchedules(prev => normalizeSchedules([...prev, newS]));
    } else if (type === 'schedule-edit') {
      setSchedules(prev => normalizeSchedules(prev.map(s => s.id === data.id
        ? { ...s, course: data.course, date: data.date, day: data.day,
            time: data.time, members: data.members, dDay: data.dDay }
        : s)));
    }
  };

  if (!next) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a1e10' }}>
        <StatusBar barStyle="light-content" />
        <HomeBgSlider />
        <SafeAreaView style={{ flex: 1 }}>
          <TripleStripe />
          <View style={homeS.hdr}>
            <Text style={homeS.hdrSub}>나만의 골프 캐디</Text>
            <Text style={homeS.hdrTitle}>Dear Golf</Text>
            <Text style={homeS.hdrGreeting}>
              안녕하세요, <Text style={homeS.hdrGreetingName}>{userProfile.nickname}</Text>님
            </Text>
            <View style={{ alignSelf: 'flex-start', marginTop: 8 }}>
              <WeatherMiniBar onPress={openCurrentWeather} />
            </View>
          </View>
          <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: 40 }}>
            <View style={{ marginHorizontal: 20, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 16, padding: 24 }}>
              <Text style={{ fontFamily: F.sys, fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.6)', letterSpacing: 2, marginBottom: 12 }}>예정 라운딩</Text>
              <Text style={{ fontFamily: F.en, fontSize: 22, color: '#fff', fontStyle: 'italic', marginBottom: 8, lineHeight: 30 }}>
                Dear Golf에서{'\n'}첫 라운딩을 시작해보세요
              </Text>
              <Text style={{ fontFamily: F.sys, fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 18, marginBottom: 20 }}>
                날씨 · 교통 · 코스 정보를{'\n'}한눈에 확인할 수 있어요
              </Text>
              <TouchableOpacity
                style={{ backgroundColor: C.butter, borderRadius: 12, paddingVertical: 13, alignItems: 'center' }}
                activeOpacity={0.8}
                onPress={() => setShowAddModal(true)}>
                <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.charcoal, letterSpacing: 0.5 }}>+ 라운딩 추가하기</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
        <ScheduleModal visible={showAddModal} onClose={() => setShowAddModal(false)} onSave={handleScheduleSave} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#0a1e10' }}>
      <StatusBar barStyle="light-content" />
      <HomeBgSlider />
      <SafeAreaView style={{ flex: 1 }}>
        <TripleStripe />
        <View style={homeS.hdr}>
          <Text style={homeS.hdrSub}>나만의 골프 캐디</Text>
          <Text style={homeS.hdrTitle}>Dear Golf</Text>
          <Text style={homeS.hdrGreeting}>
            안녕하세요, <Text style={homeS.hdrGreetingName}>{userProfile.nickname}</Text>님
          </Text>
          <View style={{ alignSelf: 'flex-start', marginTop: 8 }}>
            <WeatherMiniBar onPress={openCurrentWeather} />
          </View>
        </View>
        <View style={{ flex: 1 }} />
        <View style={homeS.bottomArea}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 22, marginBottom: 8 }}>
            <Text style={[homeS.secLabel, { paddingHorizontal: 0, marginBottom: 0 }]}>예정 라운딩</Text>
            {schedules.length < 10 && (
              <TouchableOpacity onPress={() => setShowAddModal(true)} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ fontFamily: F.sys, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>+ 추가</Text>
              </TouchableOpacity>
            )}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
            <TouchableOpacity
              style={homeS.mainCard}
              activeOpacity={0.85}
              onPress={() => openScheduleSheet(next)}
              onLongPress={() => openScheduleSheet(next)}
              delayLongPress={350}>
              <TouchableOpacity
                onPress={() => next.courseLogId ? handleCardCoursePress(next) : openScheduleSheet(next)}
                activeOpacity={next.courseLogId ? 0.7 : 0.85}
                style={{ marginBottom: 4 }}>
                <Text style={homeS.cardCourse}>{next.course}
                  {next.courseLogId ? <Text style={{ fontSize: 11, color: 'rgba(200,217,230,0.6)' }}> ›</Text> : null}
                </Text>
                <Text style={homeS.cardDate}>{next.date} {next.day} · {next.time} · {next.members}명</Text>
              </TouchableOpacity>
              <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                <Text style={homeS.cardDDay}>D-{next.dDay}</Text>
                <Text style={{ fontSize: 26, marginBottom: 6 }}>☀️  🚗</Text>
                <Text style={{ fontFamily: F.sys, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>탭하여 확인하기 →</Text>
              </View>
            </TouchableOpacity>

            {schedules.slice(1, 5).map(s => (
              <TouchableOpacity key={s.id} style={homeS.subCard}
                activeOpacity={0.85}
                onPress={() => openScheduleSheet(s)}
                onLongPress={() => openScheduleSheet(s)}
                delayLongPress={350}>
                <TouchableOpacity
                  onPress={() => s.courseLogId ? handleCardCoursePress(s) : openScheduleSheet(s)}
                  activeOpacity={s.courseLogId ? 0.7 : 0.85}>
                  <Text style={homeS.subCourse} numberOfLines={2}>{s.course}
                    {s.courseLogId ? <Text style={{ fontSize: 8, color: 'rgba(200,217,230,0.55)' }}> ›</Text> : null}
                  </Text>
                  <Text style={homeS.subDate}>{s.date.slice(5)} {s.day}</Text>
                </TouchableOpacity>
                <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                  <Text style={homeS.subDDay}>D-{s.dDay}</Text>
                  <Text style={homeS.subDDayLabel}>일</Text>
                </View>
              </TouchableOpacity>
            ))}

          </ScrollView>

          <View style={{ marginHorizontal: 20, marginVertical: 12 }}>
            <TripleStripe height={1.5} />
          </View>

          {(() => {
            const visitCount = COURSE_LOG.find(c => c.name === next?.course)?.visits || 0;
            const courseComment = {
              txt: '그린이 정말 빠릅니다. 퍼팅 연습 충분히 하고 가세요',
              who: 'J***',
            };
            return (
              <View {...panResponder.panHandlers}>
                {cardIndex === 0 ? (
                  visitCount === 0 ? (
                    <View style={[homeS.memoCard, homeS.memoCardFirst]}>
                      <View style={homeS.memoCardTop}>
                        <View style={homeS.memoBadgeFirst}>
                          <Text style={homeS.memoBadgeTxt}>첫 방문</Text>
                        </View>
                        <Text style={homeS.memoCardCourse}>{next?.course}</Text>
                      </View>
                      <View style={homeS.memoCardBottom}>
                        <Text style={homeS.memoMain}>처음 가는 코스예요</Text>
                        <Text style={homeS.memoSub}>오늘이 첫 기록이 될 거예요</Text>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity style={homeS.memoCard} onPress={handleMemoPress} activeOpacity={0.8}>
                      <View style={homeS.memoCardTop}>
                        <View style={homeS.memoBadgeVisit}>
                          <Text style={homeS.memoBadgeTxt}>{visitCount + 1}번째 방문</Text>
                        </View>
                        <Text style={homeS.memoCardCourse}>{next?.course}</Text>
                      </View>
                      <View style={homeS.memoCardBottom}>
                        <Text style={homeS.memoScore}>
                          지난 방문 · 베스트 {COURSE_LOG.find(c => c.name === next?.course)?.best}타
                        </Text>
                        <Text style={homeS.memoTxt}>"{memoEntry?.text || '메모가 없어요'}"</Text>
                      </View>
                    </TouchableOpacity>
                  )
                ) : (
                  <View style={homeS.commentCard}>
                    <View style={homeS.memoCardTop}>
                      <View style={homeS.memoBadgeComment}>
                        <Text style={[homeS.memoBadgeTxt, { color: '#C8D9E6' }]}>코스 한마디</Text>
                      </View>
                      <Text style={[homeS.memoCardCourse, { color: 'rgba(255,255,255,0.6)' }]}>{next?.course}</Text>
                    </View>
                    <View style={homeS.memoCardBottom}>
                      <Text style={homeS.commentTxt}>"{courseComment.txt}"</Text>
                      <Text style={homeS.commentWho}>{courseComment.who}</Text>
                    </View>
                  </View>
                )}
                <View style={{ flexDirection: 'row', gap: 4, justifyContent: 'center', marginTop: 8 }}>
                  {[0, 1].map(i => (
                    <View key={i} style={{
                      width: cardIndex === i ? 14 : 5,
                      height: 5, borderRadius: 3,
                      backgroundColor: cardIndex === i ? (i === 0 ? '#F5E6A8' : '#C8D9E6') : 'rgba(255,255,255,0.15)',
                    }} />
                  ))}
                </View>
              </View>
            );
          })()}
          <View style={{ height: 20 }} />
        </View>
      </SafeAreaView>

      <ScheduleSheetModal
        visible={showScheduleModal}
        schedule={selectedSchedule}
        onClose={() => setShowScheduleModal(false)}
        onCourseTap={() => {
          setShowScheduleModal(false);
          if (selectedSchedule?.courseLogId) {
            navigation.navigate('가이드', { openCourseId: selectedSchedule.courseLogId });
          }
        }}
        onWeather={() => { setShowScheduleModal(false); setShowWeatherFull(true); }}
        onTraffic={() => { setShowScheduleModal(false); setShowTrafficFull(true); }}
        onShare={() => handleShareSchedule(selectedSchedule)}
        onEdit={() => handleEditSchedule(selectedSchedule)}
        onDelete={() => handleDeleteSchedule(selectedSchedule)}
      />

      <WeatherTransportPopup
        visible={showWeatherFull || showTrafficFull}
        initialTab={showWeatherFull ? 'wx' : 'tr'}
        schedule={selectedSchedule || next}
        onClose={() => { setShowWeatherFull(false); setShowTrafficFull(false); }}
      />

      <ScheduleModal visible={showAddModal} onClose={() => setShowAddModal(false)} onSave={handleScheduleSave} />
      <ScheduleModal
        visible={!!editSchedule}
        initial={editSchedule}
        onClose={() => setEditSchedule(null)}
        onSave={handleScheduleSave}
      />
    </View>
  );
}
