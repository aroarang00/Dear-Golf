import React, { useState, useEffect } from 'react';
import { Modal, ScrollView, View, Text, TouchableOpacity, Linking, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C } from '../constants/colors';
import { wxS } from '../styles/wxS';
import { trS } from '../styles/trS';
import { TripleStripe } from './common/TripleStripe';

export function WeatherTransportPopup({ visible, initialTab, onClose, schedule }) {
  const [popupTab, setPopupTab] = useState(initialTab || 'wx');

  useEffect(() => {
    if (visible) {
      setPopupTab(initialTab || 'wx');
    }
  }, [visible, initialTab]);

  if (!schedule) return null;

  const golfScore = 78;
  const pm10 = 23;

  const DEPARTURE_TIMES = [
    { time: '05:30', duration: '1시간 10분', traffic: '원활' },
    { time: '06:00', duration: '1시간 20분', traffic: '원활' },
    { time: '06:30', duration: '1시간 35분', traffic: '보통' },
    { time: '07:00', duration: '2시간 05분', traffic: '혼잡' },
    { time: '07:30', duration: '2시간 30분', traffic: '혼잡' },
  ];

  const FORECAST = [
    { day: '오늘', dateStr: schedule.date.slice(5), icon: '☀️', sky: '맑음',     wind: '남 3m/s',   prob: 10, tmin: 12, tmax: 22 },
    { day: '내일', dateStr: '',                     icon: '🌤️', sky: '구름조금', wind: '동 2m/s',   prob: 20, tmin: 13, tmax: 21 },
    { day: '모레', dateStr: '',                     icon: '☀️', sky: '맑음',     wind: '남 2m/s',   prob: 10, tmin: 14, tmax: 22 },
    { day: '목',   dateStr: '',                     icon: '☁️', sky: '흐림',     wind: '서 4m/s',   prob: 40, tmin: 14, tmax: 19 },
    { day: '금',   dateStr: '',                     icon: '🌧️', sky: '비',       wind: '북서 5m/s', prob: 80, tmin: 13, tmax: 17 },
    { day: '토',   dateStr: '',                     icon: '🌦️', sky: '소나기',   wind: '서 3m/s',   prob: 60, tmin: 12, tmax: 18 },
    { day: '일',   dateStr: '',                     icon: '⛅',  sky: '구름많음', wind: '남서 2m/s', prob: 20, tmin: 13, tmax: 20 },
    { day: '월',   dateStr: '',                     icon: '☀️', sky: '맑음',     wind: '동 1m/s',   prob: 0,  tmin: 14, tmax: 23 },
    { day: '화',   dateStr: '',                     icon: '☀️', sky: '맑음',     wind: '동 2m/s',   prob: 0,  tmin: 15, tmax: 24 },
    { day: '수',   dateStr: '',                     icon: '🌤️', sky: '구름조금', wind: '남 2m/s',   prob: 10, tmin: 14, tmax: 22 },
  ];
  const roundIdx = Math.min(Math.max(0, schedule.dDay || 0), FORECAST.length - 1);

  const HOURLY24 = [
    11, 10, 10, 9, 9, 9, 10, 12, 15, 17, 19, 21,
    22, 22, 22, 21, 20, 18, 16, 14, 13, 12, 11, 11,
  ].map((t, i) => ({ h: i, t }));

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: popupTab === 'wx' ? C.charcoal : C.bgPrimary }}>
        <TripleStripe height={3} />

        <View style={[wxS.shellRow, popupTab === 'wx' ? wxS.shellRowDark : wxS.shellRowLight]}>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
            <Text style={popupTab === 'wx' ? wxS.closeLight : wxS.closeDark}>← 닫기</Text>
          </TouchableOpacity>
          <View style={wxS.pillTabs}>
            <TouchableOpacity onPress={() => setPopupTab('wx')} activeOpacity={0.7}
              style={[wxS.pillTab, popupTab === 'wx' && wxS.pillTabOn]}>
              <Text style={
                popupTab === 'wx' ? wxS.pillTxtOn
                : (popupTab === 'wx' ? wxS.pillTxtLight : wxS.pillTxtDark)
              }>날씨</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPopupTab('tr')} activeOpacity={0.7}
              style={[wxS.pillTab, popupTab === 'tr' && wxS.pillTabOn]}>
              <Text style={
                popupTab === 'tr' ? wxS.pillTxtOn
                : (popupTab === 'wx' ? wxS.pillTxtLight : wxS.pillTxtDark)
              }>교통</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          style={{ flex: 1, backgroundColor: popupTab === 'wx' ? C.charcoal : C.bgPrimary }}
          contentContainerStyle={{ paddingBottom: 0 }}
          showsVerticalScrollIndicator={false}>

          {popupTab === 'wx' && (
            <>
              <View style={wxS.wxHeader}>
                <Text style={wxS.wxCourse}>{schedule.course}</Text>
                <Text style={wxS.wxDate}>{schedule.date} · D-{schedule.dDay}</Text>
              </View>

              <View style={wxS.tempRow}>
                <Text style={wxS.tempEmoji}>☀️</Text>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={wxS.tempBig}>18°</Text>
                  <Text style={wxS.tempSky}>맑음 · 어제보다 +2°</Text>
                  <Text style={wxS.tempSub}>체감 17° · 최저 12° / 최고 22°</Text>
                </View>
              </View>

              <View style={wxS.gridWrap}>
                <View style={[wxS.gridCell, { borderRightWidth: 0.5, borderBottomWidth: 0.5, borderColor: C.hairline }]}>
                  <Text style={wxS.gridLabel}>바람</Text>
                  <Text style={wxS.gridValue}>2.2m/s</Text>
                  <Text style={wxS.gridSubOK}>라운딩 최적</Text>
                </View>
                <View style={[wxS.gridCell, { borderBottomWidth: 0.5, borderColor: C.hairline }]}>
                  <Text style={wxS.gridLabel}>습도</Text>
                  <Text style={wxS.gridValue}>30%</Text>
                  <Text style={wxS.gridSubOK}>건조함</Text>
                </View>
                <View style={[wxS.gridCell, { borderRightWidth: 0.5, borderColor: C.hairline }]}>
                  <Text style={wxS.gridLabel}>미세먼지</Text>
                  <Text style={wxS.gridValue}>좋음</Text>
                  <Text style={wxS.gridSubOK}>PM10 {pm10}㎍/㎥</Text>
                </View>
                <View style={wxS.gridCell}>
                  <Text style={wxS.gridLabel}>자외선</Text>
                  <Text style={wxS.gridValue}>보통</Text>
                  <Text style={wxS.gridSubWarn}>차단제 권장</Text>
                </View>
              </View>

              <View style={wxS.chartCard}>
                <Text style={wxS.cardLabel}>시간별 기온 · 24시간</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={wxS.barRow}>
                    {HOURLY24.map((x, i) => {
                      const bh = 20 + ((x.t - 8) / 18) * 70;
                      const isWarm = x.t >= 18;
                      return (
                        <View key={i} style={wxS.barCol}>
                          <Text style={wxS.barTemp}>{x.t}°</Text>
                          <View style={[wxS.bar, { height: bh, backgroundColor: isWarm ? '#C9A84C' : C.burgundy, opacity: 0.7 }]} />
                          <Text style={wxS.barHour}>{x.h}</Text>
                        </View>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>

              <View style={wxS.gIdxCard}>
                <Text style={wxS.cardLabel}>골프 지수</Text>
                <Text style={wxS.gIdxBig}>Good</Text>
                <Text style={wxS.gIdxScore}>{golfScore} / 100</Text>
                <View style={wxS.gIdxBar}>
                  <View style={[wxS.gIdxBarFill, { width: `${golfScore}%` }]} />
                </View>
                <View style={wxS.badgeRow}>
                  <View style={[wxS.badge, { backgroundColor: '#C8D9E6' }]}>
                    <Text style={[wxS.badgeTxt, { color: '#1A3D52' }]}>바람 약함</Text>
                  </View>
                  <View style={[wxS.badge, { backgroundColor: C.charcoal }]}>
                    <Text style={[wxS.badgeTxt, { color: C.butter }]}>강수 없음</Text>
                  </View>
                  <View style={[wxS.badge, { backgroundColor: C.burgundy }]}>
                    <Text style={[wxS.badgeTxt, { color: C.butter }]}>기온 적정</Text>
                  </View>
                </View>
              </View>

              <View style={wxS.fcCard}>
                <Text style={wxS.cardLabel}>10일 예보</Text>
                {FORECAST.map((w, i) => {
                  const isRound = i === roundIdx;
                  return (
                    <View key={i} style={[wxS.fcRow, i < FORECAST.length - 1 && wxS.fcRowBorder, isRound && wxS.fcRowRound]}>
                      <View style={{ width: 56 }}>
                        <Text style={wxS.fcDay}>{w.day}</Text>
                        {!!w.dateStr && <Text style={wxS.fcDate}>{w.dateStr}</Text>}
                      </View>
                      <Text style={wxS.fcIcon}>{w.icon}</Text>
                      <View style={{ flex: 1, marginLeft: 6 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                          <Text style={[wxS.fcSky, isRound && wxS.fcSkyRound]}>{w.sky}</Text>
                          {isRound && (
                            <View style={wxS.roundBadge}>
                              <Text style={wxS.roundBadgeTxt}>라운딩</Text>
                            </View>
                          )}
                        </View>
                        <Text style={wxS.fcSub}>{w.wind} · 강수 {w.prob}%</Text>
                      </View>
                      <Text style={wxS.fcTemp}>{w.tmin}° / <Text style={{ color: C.charcoal }}>{w.tmax}°</Text></Text>
                    </View>
                  );
                })}
              </View>

              <TouchableOpacity style={wxS.kmaBtn}
                onPress={() => Linking.openURL('https://www.kma.go.kr/')}
                activeOpacity={0.7}>
                <Text style={wxS.kmaBtnTxt}>기상청에서 더 자세히 보기</Text>
              </TouchableOpacity>
            </>
          )}

          {popupTab === 'tr' && (() => {
            const [teeH, teeM] = schedule.time.split(':').map(Number);
            const teeMin = teeH * 60 + teeM;
            const toHHMM = (m) => {
              m = (m + 24 * 60) % (24 * 60);
              return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
            };
            const recoDriveMin = 80;
            const recommended = toHHMM(teeMin - 30 - recoDriveMin);
            const baseTen = Math.floor((teeMin - 30 - recoDriveMin) / 10) * 10;
            const rows = [-30, -20, -10, 0, 10].map((off, i) => {
              const t = toHHMM(baseTen + off);
              const dMin = recoDriveMin + [-8, -4, -2, 0, 6][i];
              const dStr = `${Math.floor(dMin / 60)}시간 ${dMin % 60}분`;
              const cong = i <= 1 ? '원활' : i === 2 ? '보통' : '혼잡';
              return { t, dStr, cong, isReco: off === 0 };
            });

            const handleShareDaeri = () => {
              const msg = `[ Dear Golf ] 같이 대리 부르실 분?\n\n${schedule.course}\n${schedule.date} ${schedule.day}요일 라운딩\n티오프 ${schedule.time}\n\n카카오T 대리: https://www.kakaomobility.com/\n티맵 대리: https://tmap.life\n아이대리: https://www.idaeri.co.kr`;
              Share.share({ message: msg });
            };

            return (
              <>
                <View style={trS.creamSection}>
                  <Text style={trS.trCourse}>{schedule.course}</Text>
                  <Text style={trS.trDate}>{schedule.date} · 티오프 {schedule.time}</Text>

                  <View style={trS.recoBox}>
                    <Text style={trS.recoLabel}>추천 출발</Text>
                    <Text style={trS.recoTime}>{recommended}</Text>
                    <Text style={trS.recoSub}>티오프 {schedule.time} · 여유 30분 포함</Text>
                  </View>

                  <View style={trS.tblCard}>
                    <View style={trS.tblHdr}>
                      <Text style={[trS.tblHdrCell, { flex: 1 }]}>출발</Text>
                      <Text style={[trS.tblHdrCell, { flex: 1.2, textAlign: 'center' }]}>소요</Text>
                      <Text style={[trS.tblHdrCell, { flex: 1, textAlign: 'center' }]}>상태</Text>
                      <Text style={[trS.tblHdrCell, { flex: 0.8, textAlign: 'right' }]}>추천</Text>
                    </View>
                    {rows.map((r, i) => {
                      const congColors = r.cong === '원활' ? { bg: '#C8D9E6', txt: '#1A3D52' }
                        : r.cong === '보통' ? { bg: '#F5E6A8', txt: '#5A4500' }
                        : { bg: '#6B1E2A', txt: '#fff' };
                      return (
                        <View key={i} style={[trS.tblRow, i === rows.length - 1 && { borderBottomWidth: 0 }]}>
                          <Text style={[trS.tblTime, { flex: 1 }]}>{r.t}</Text>
                          <Text style={[trS.tblDur, { flex: 1.2, textAlign: 'center' }]}>{r.dStr}</Text>
                          <View style={{ flex: 1, alignItems: 'center' }}>
                            <View style={[trS.congBadge, { backgroundColor: congColors.bg }]}>
                              <Text style={[trS.congBadgeTxt, { color: congColors.txt }]}>{r.cong}</Text>
                            </View>
                          </View>
                          <View style={{ flex: 0.8, alignItems: 'flex-end' }}>
                            {r.isReco && (
                              <View style={trS.recoTagBadge}>
                                <Text style={trS.recoTagTxt}>추천</Text>
                              </View>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>

                  <View style={trS.routeCard}>
                    <View style={trS.routeFlow}>
                      <Text style={trS.routeOrigin}>서울 강남구</Text>
                      <Text style={trS.routeArrow}>→</Text>
                      <Text style={trS.routeDest} numberOfLines={1}>{schedule.course}</Text>
                    </View>
                    <Text style={trS.routeMidTxt}>약 78.4km · 경부고속도로</Text>
                    <View style={trS.routeBtnRow}>
                      <TouchableOpacity style={[trS.routeBtn, { backgroundColor: '#03C75A' }]}
                        onPress={() => Linking.openURL(`nmap://route/car?dlat=37.0&dlon=127.0&dname=${encodeURIComponent(schedule.course)}&appname=deargolf`)
                          .catch(() => Linking.openURL('https://map.naver.com/'))}
                        activeOpacity={0.85}>
                        <Text style={[trS.routeBtnTxt, { color: '#fff' }]}>네이버 경로</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[trS.routeBtn, { backgroundColor: C.charcoal }]}
                        onPress={() => Linking.openURL(`tmap://route?goalname=${encodeURIComponent(schedule.course)}`)
                          .catch(() => Linking.openURL('https://tmap.life'))}
                        activeOpacity={0.85}>
                        <Text style={[trS.routeBtnTxt, { color: C.butter }]}>티맵 경로</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                <View style={trS.charcoalSection}>
                  <Text style={trS.darkLabel}>대리운전</Text>
                  <View style={trS.daeriRow}>
                    <TouchableOpacity style={[trS.daeriBtn, { backgroundColor: '#FEE500' }]}
                      onPress={() => Linking.openURL('kakaotalk://chauffeur').catch(() => Linking.openURL('https://www.kakaomobility.com/'))}
                      activeOpacity={0.85}>
                      <Text style={[trS.daeriBtnTxt, { color: '#3A2000' }]}>카카오T</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[trS.daeriBtn, { backgroundColor: '#C8D9E6' }]}
                      onPress={() => Linking.openURL('tmap://daeri').catch(() => Linking.openURL('https://tmap.life'))}
                      activeOpacity={0.85}>
                      <Text style={[trS.daeriBtnTxt, { color: '#1A3D52' }]}>티맵대리</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[trS.daeriBtn, { backgroundColor: '#8B8680' }]}
                      onPress={() => Linking.openURL('idaeri://').catch(() => Linking.openURL('https://www.idaeri.co.kr/'))}
                      activeOpacity={0.85}>
                      <Text style={[trS.daeriBtnTxt, { color: '#fff' }]}>아이대리</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity style={trS.shareBtn} onPress={handleShareDaeri} activeOpacity={0.85}>
                    <Text style={trS.shareBtnTxt}>동반자에게 공유</Text>
                  </TouchableOpacity>
                </View>
              </>
            );
          })()}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
