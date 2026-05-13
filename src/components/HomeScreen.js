import React, { useState, useEffect, useRef } from 'react';
import {
  StatusBar, View, Text, TouchableOpacity, ScrollView,
  Share, Alert, Modal, LayoutAnimation, Platform, UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F } from '../constants/colors';
import { SCHEDULES_INIT, COURSE_LOG, DIARY_DATA, COURSE_COMMENTS } from '../constants/data';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { normalizeSchedules } from '../utils/helpers';
import { homeS } from '../styles/homeS';
import { UserContext } from '../contexts/UserContext';
import { HomeBgSlider } from './common/HomeBgSlider';
import { TripleStripe } from './common/TripleStripe';
import { ScheduleSheetModal } from './ScheduleSheetModal';
import { ScheduleModal } from './ScheduleModal';
import { WeatherTransportPopup } from './WeatherTransportPopup';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export function HomeScreen({ navigation }) {
  const { userProfile } = React.useContext(UserContext);
  const [showAddModal, setShowAddModal] = useState(false);
  const [schedules, setSchedules] = useState(SCHEDULES_INIT);
  const [schedulesHydrated, setSchedulesHydrated] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showWeatherFull, setShowWeatherFull] = useState(false);
  const [showTrafficFull, setShowTrafficFull] = useState(false);
  const [showWeatherPopup, setShowWeatherPopup] = useState(false);
  const [editSchedule, setEditSchedule] = useState(null);
  const [cardSlide, setCardSlide] = useState(0);
  const [showDDayMenu, setShowDDayMenu] = useState(false);
  const [dDayPos, setDDayPos] = useState({ x: 0, y: 0 });
  const dDayRef = useRef(null);

  const openDDayMenu = () => {
    dDayRef.current?.measureInWindow((x, y) => {
      setDDayPos({ x, y });
      setShowDDayMenu(true);
    });
  };

  useEffect(() => {
    if (!navigation) return;
    const unsubscribe = navigation.addListener('tabPress', () => {
      setShowAddModal(false);
      setShowScheduleModal(false);
      setShowWeatherFull(false);
      setShowTrafficFull(false);
      setShowWeatherPopup(false);
      setShowDDayMenu(false);
      setEditSchedule(null);
      setSelectedSchedule(null);
    });
    return unsubscribe;
  }, [navigation]);

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

  const carouselActive = React.useMemo(() => {
    const course = next?.course;
    if (!course) return false;
    const courseRow = COURSE_LOG.find(c => c.name === course);
    if (!courseRow) return false;
    if ((courseRow.visits || 0) === 0) return false;
    const hasMyMemo = DIARY_DATA.some(d => d.course === course && d.memo);
    if (!hasMyMemo) return false;
    return COURSE_COMMENTS.some(c => c.courseId === courseRow.id);
  }, [next?.course]);

  useEffect(() => {
    if (!carouselActive) {
      setCardSlide(0);
      return;
    }
    const id = setInterval(() => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setCardSlide(prev => (prev === 0 ? 1 : 0));
    }, 5000);
    return () => clearInterval(id);
  }, [carouselActive]);

  const toggleCardSlide = () => {
    if (!carouselActive) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCardSlide(prev => (prev === 0 ? 1 : 0));
  };

  const handleCardCoursePress = (schedule) => {
    if (schedule.courseLogId) {
      navigation.navigate('코스', { openCourseId: schedule.courseLogId });
    }
  };

  const openScheduleSheet = (schedule) => {
    setSelectedSchedule(schedule);
    setShowScheduleModal(true);
  };

  const openCurrentWeather = () => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}.${String(today.getMonth()+1).padStart(2,'0')}.${String(today.getDate()).padStart(2,'0')}`;
    const currentLocationSchedule = {
      course: '현재 위치',
      date: dateStr,
      day: ['일','월','화','수','목','금','토'][today.getDay()],
      time: '--:--',
      members: 0,
      dDay: 0,
      weather: '맑음 18°',
      wind: '',
      duration: '',
    };
    setSelectedSchedule(currentLocationSchedule);
    setShowWeatherPopup(true);
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
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
          <TripleStripe />
          <View style={homeS.hdr}>
            <Text style={homeS.hdrSub}>나만의 골프 캐디</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={homeS.hdrTitle}>Dear Golf</Text>
              <TouchableOpacity onPress={openCurrentWeather} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ fontSize: 22, marginTop: 4 }}>☀️</Text>
              </TouchableOpacity>
            </View>
            <Text style={homeS.hdrGreeting}>
              안녕하세요, <Text style={homeS.hdrGreetingName}>{userProfile.nickname}</Text>님
            </Text>
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
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
        <TripleStripe />
        <View style={homeS.hdr}>
          <Text style={homeS.hdrSub}>나만의 골프 캐디</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={homeS.hdrTitle}>Dear Golf</Text>
            <TouchableOpacity onPress={openCurrentWeather} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: 22, marginTop: 4 }}>☀️</Text>
            </TouchableOpacity>
          </View>
          <Text style={homeS.hdrGreeting}>
            안녕하세요, <Text style={homeS.hdrGreetingName}>{userProfile.nickname}</Text>님
          </Text>
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
              onPress={() => { setSelectedSchedule(next); setShowWeatherFull(true); }}
              onLongPress={() => openScheduleSheet(next)}
              delayLongPress={350}>
              <TouchableOpacity
                onPress={() => handleCardCoursePress(next)}
                onLongPress={() => openScheduleSheet(next)}
                delayLongPress={350}
                activeOpacity={next.courseLogId ? 0.7 : 1}
                onStartShouldSetResponder={() => true}
                onTouchEnd={(e) => e.stopPropagation()}
                style={{ marginBottom: 4 }}>
                <Text style={homeS.cardCourse}>{next.course}
                  {next.courseLogId ? <Text style={{ fontSize: 11, color: 'rgba(200,217,230,0.6)' }}> ›</Text> : null}
                </Text>
                <Text style={homeS.cardDate}>{next.date} {next.day} · {next.time} · {next.members}명</Text>
              </TouchableOpacity>
              <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                <TouchableOpacity
                  ref={dDayRef}
                  onPress={openDDayMenu}
                  onLongPress={() => openScheduleSheet(next)}
                  delayLongPress={350}
                  activeOpacity={0.7}
                  style={{ alignSelf: 'flex-start' }}>
                  <Text style={homeS.cardDDay}>D-{next.dDay}</Text>
                </TouchableOpacity>
                <Text style={{ fontSize: 26, marginBottom: 6 }}>🌤  🚗</Text>
                <Text style={{ fontFamily: F.sys, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>탭하여 확인하기 →</Text>
              </View>
            </TouchableOpacity>

            {schedules.slice(1, 5).map((s, i) => {
              const opacity = [1, 0.85, 0.7, 0.55][i] ?? 0.55;
              return (
              <TouchableOpacity key={s.id} style={[homeS.subCard, { opacity }]}
                activeOpacity={0.85}
                onPress={() => openScheduleSheet(s)}
                onLongPress={() => openScheduleSheet(s)}
                delayLongPress={350}>
                <TouchableOpacity
                  onPress={() => { if (s.courseLogId) handleCardCoursePress(s); }}
                  onLongPress={() => openScheduleSheet(s)}
                  delayLongPress={350}
                  activeOpacity={s.courseLogId ? 0.7 : 1}
                  onStartShouldSetResponder={() => true}
                  onTouchEnd={(e) => e.stopPropagation()}>
                  <Text style={homeS.subCourse} numberOfLines={2}>{s.course}
                    {s.courseLogId ? <Text style={{ fontSize: 8, color: 'rgba(200,217,230,0.55)' }}> ›</Text> : null}
                  </Text>
                  <Text style={homeS.subDate}>{s.date.slice(5)} {s.day}</Text>
                </TouchableOpacity>
                <Text style={homeS.subDDay}>D-{s.dDay}</Text>
              </TouchableOpacity>
              );
            })}

          </ScrollView>

          <View style={{ marginHorizontal: 20, marginVertical: 12 }}>
            <TripleStripe height={1.5} />
          </View>

          {(() => {
            const courseRow = COURSE_LOG.find(c => c.name === next?.course);
            const visitCount = courseRow?.visits || 0;
            const isFirstVisit = visitCount === 0;
            const courseLabel = next?.course || '';

            const diaryEntries = DIARY_DATA.filter(d => d.course === next?.course);
            const myMemo = diaryEntries[0]?.memo;
            const topComment = courseRow
              ? [...COURSE_COMMENTS].filter(c => c.courseId === courseRow.id).sort((a, b) => b.likes - a.likes)[0]
              : null;
            const hasGolfer = !!topComment;

            const labelCourseTxt = (label) => (
              <Text style={[homeS.memoCardCourse, { fontSize: 11 }]} numberOfLines={1}>
                {label} · <Text style={{ color: 'rgba(255,255,255,0.55)' }}>{courseLabel}</Text>
              </Text>
            );

            // 케이스 3·4: 첫 방문
            if (isFirstVisit) {
              return (
                <View>
                  <View style={homeS.memoCard}>
                    <View style={homeS.memoCardTop}>
                      <View style={[homeS.memoBadgeFirst, { backgroundColor: '#C8D9E6' }]}>
                        <Text style={[homeS.memoBadgeTxt, { color: '#1A3D52' }]}>첫 방문</Text>
                      </View>
                      {labelCourseTxt('골퍼 코멘트')}
                    </View>
                    <View style={homeS.memoCardBottom}>
                      {hasGolfer ? (
                        <>
                          <Text style={homeS.commentTxt} numberOfLines={2} ellipsizeMode="tail">"{topComment.txt}"</Text>
                          <Text style={homeS.commentWho}>{topComment.who}</Text>
                        </>
                      ) : (
                        <>
                          <Text style={[homeS.memoTxt, { color: 'rgba(255,255,255,0.4)', borderLeftColor: 'rgba(255,255,255,0.2)' }]} numberOfLines={1}>아직 골퍼 코멘트가 없어요</Text>
                          <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => {
                              if (courseRow) navigation.navigate('코스', { openCourseId: courseRow.id, openComment: true });
                            }}
                            style={{ marginTop: 8, alignSelf: 'flex-start' }}>
                            <Text style={{ fontFamily: F.sys, fontSize: 11, color: '#F5E6A8' }}>첫 번째 코멘트의 주인공이 되어보세요 →</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  </View>
                </View>
              );
            }

            // 케이스 2: 방문 + 내 메모 없음
            if (!myMemo) {
              return (
                <View>
                  <View style={homeS.memoCard}>
                    <View style={homeS.memoCardTop}>
                      <View style={homeS.memoBadgeVisit}>
                        <Text style={homeS.memoBadgeTxt}>내 한줄 메모</Text>
                      </View>
                      <Text style={homeS.memoCardCourse} numberOfLines={1}>{courseLabel}</Text>
                    </View>
                    <View style={homeS.memoCardBottom}>
                      <Text style={[homeS.memoTxt, { color: 'rgba(255,255,255,0.4)', borderLeftColor: 'rgba(255,255,255,0.2)' }]} numberOfLines={1}>아직 메모가 없어요</Text>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => navigation.navigate('다이어리', { openAddModal: true })}
                        style={{ marginTop: 8, alignSelf: 'flex-start' }}>
                        <Text style={{ fontFamily: F.sys, fontSize: 11, color: '#F5E6A8' }}>메모 남기기 →</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            }

            // 케이스 1: 방문 + 내 메모 있음 (골퍼 코멘트 있으면 캐러셀)
            const showCardOne = cardSlide === 1 && hasGolfer;
            return (
              <View>
                <TouchableOpacity
                  activeOpacity={hasGolfer ? 0.9 : 1}
                  onPress={toggleCardSlide}
                  disabled={!hasGolfer}>
                  {!showCardOne ? (
                    <View style={homeS.memoCard}>
                      <View style={homeS.memoCardTop}>
                        <View style={homeS.memoBadgeVisit}>
                          <Text style={homeS.memoBadgeTxt}>내 한줄 메모</Text>
                        </View>
                        <Text style={homeS.memoCardCourse} numberOfLines={1}>{courseLabel}</Text>
                      </View>
                      <View style={homeS.memoCardBottom}>
                        <Text style={homeS.memoTxt} numberOfLines={1} ellipsizeMode="tail">"{myMemo}"</Text>
                      </View>
                    </View>
                  ) : (
                    <View style={homeS.commentCard}>
                      <View style={homeS.memoCardTop}>
                        <View style={homeS.memoBadgeComment}>
                          <Text style={[homeS.memoBadgeTxt, { color: '#C8D9E6' }]}>골퍼 코멘트</Text>
                        </View>
                        <Text style={[homeS.memoCardCourse, { color: 'rgba(255,255,255,0.6)' }]} numberOfLines={1}>{courseLabel}</Text>
                      </View>
                      <View style={homeS.memoCardBottom}>
                        <Text style={homeS.commentTxt} numberOfLines={2} ellipsizeMode="tail">"{topComment.txt}"</Text>
                        <Text style={homeS.commentWho}>{topComment.who}</Text>
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
                {hasGolfer && (
                  <View style={{ flexDirection: 'row', gap: 4, justifyContent: 'center', marginTop: 8 }}>
                    {[0, 1].map(i => (
                      <View key={i} style={{
                        width: cardSlide === i ? 14 : 5,
                        height: 5, borderRadius: 3,
                        backgroundColor: cardSlide === i ? (i === 0 ? '#F5E6A8' : '#C8D9E6') : 'rgba(255,255,255,0.15)',
                      }} />
                    ))}
                  </View>
                )}
              </View>
            );
          })()}
          <View style={{ height: 6 }} />
        </View>
      </SafeAreaView>

      <ScheduleSheetModal
        visible={showScheduleModal}
        schedule={selectedSchedule}
        onClose={() => setShowScheduleModal(false)}
        onCourseTap={() => {
          setShowScheduleModal(false);
          if (selectedSchedule?.courseLogId) {
            navigation.navigate('코스', { openCourseId: selectedSchedule.courseLogId });
          }
        }}
        onWeather={() => { setShowScheduleModal(false); setShowWeatherFull(true); }}
        onTraffic={() => { setShowScheduleModal(false); setShowTrafficFull(true); }}
        onShare={() => handleShareSchedule(selectedSchedule)}
        navigation={navigation}
      />

      <WeatherTransportPopup
        visible={showWeatherFull || showTrafficFull || showWeatherPopup}
        initialTab={showTrafficFull ? 'tr' : 'wx'}
        schedule={selectedSchedule || next}
        schedules={schedules}
        weatherOnly={showWeatherPopup}
        onClose={() => { setShowWeatherFull(false); setShowTrafficFull(false); setShowWeatherPopup(false); }}
      />

      <ScheduleModal visible={showAddModal} onClose={() => setShowAddModal(false)} onSave={handleScheduleSave} />
      <ScheduleModal
        visible={!!editSchedule}
        initial={editSchedule}
        onClose={() => setEditSchedule(null)}
        onSave={handleScheduleSave}
      />

      <Modal
        visible={showDDayMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDDayMenu(false)}>
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={() => setShowDDayMenu(false)}>
          <View style={{ position: 'absolute', left: dDayPos.x, top: dDayPos.y, width: 0, height: 0 }}>
            <View style={{
              position: 'absolute',
              bottom: 10,
              left: 0,
              backgroundColor: '#FAF6EC',
              borderRadius: 14,
              minWidth: 180,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.3,
              shadowRadius: 32,
              elevation: 20,
            }}>
              <TouchableOpacity
                activeOpacity={0.6}
                onPress={() => {
                  setShowDDayMenu(false);
                  setTimeout(() => {
                    if (!next) return;
                    Share.share({
                      message: `[ Dear Golf ]\n\n${next.course}\n${next.date} ${next.day}요일  ${next.time}\n${next.members}명 동반 · D-${next.dDay}\n\nDear Golf와 함께하는 라운딩입니다`,
                    });
                  }, 300);
                }}
                style={{ paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: 0.5, borderBottomColor: '#E8E2D0' }}>
                <Text style={{ fontFamily: F.sys, fontSize: 14, color: '#3D3935' }}>📩  일정 공유</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.6}
                onPress={() => { setShowDDayMenu(false); handleEditSchedule(next); }}
                style={{ paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: 0.5, borderBottomColor: '#E8E2D0' }}>
                <Text style={{ fontFamily: F.sys, fontSize: 14, color: '#3D3935' }}>✏️  일정 수정</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.6}
                onPress={() => { setShowDDayMenu(false); handleDeleteSchedule(next); }}
                style={{ paddingVertical: 13, paddingHorizontal: 16 }}>
                <Text style={{ fontFamily: F.sys, fontSize: 14, color: '#D32F2F' }}>🗑️  일정 삭제</Text>
              </TouchableOpacity>
              <View style={{
                position: 'absolute',
                top: '100%',
                left: 20,
                width: 0,
                height: 0,
                borderLeftWidth: 8,
                borderRightWidth: 8,
                borderTopWidth: 10,
                borderLeftColor: 'transparent',
                borderRightColor: 'transparent',
                borderTopColor: '#FAF6EC',
              }} />
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
