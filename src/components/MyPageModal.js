import React, { useState, useEffect, useRef } from 'react';
import {
  Modal, View, ScrollView, Text, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, Alert, Linking,
} from 'react-native';
import { C, F } from '../constants/colors';
import { DIARY_DATA } from '../constants/data';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { myS } from '../styles/myS';
import { UserContext } from '../contexts/UserContext';
import { SchedulesContext } from '../contexts/SchedulesContext';
import { TripleStripe } from './common/TripleStripe';
import { searchPlaces } from '../utils/kakao';
import { requestNotificationPermission, syncAlarmTypeAcrossSchedules } from '../utils/notifications';

export function MyPageModal({ visible, onClose }) {
  const { userProfile, setUserProfile } = React.useContext(UserContext);
  const { schedules } = React.useContext(SchedulesContext);
  const scrollRef = useRef(null);
  const [nickname, setNickname] = useState(userProfile.nickname);
  const [editingNick, setEditingNick] = useState(false);
  const [departure, setDeparture] = useState(userProfile.departure || '');
  const [departureCoord, setDepartureCoord] = useState(userProfile.departureCoord || null);
  const [depResults, setDepResults] = useState([]);
  const [depSearching, setDepSearching] = useState(false);
  const depTimerRef = useRef(null);
  const [phone, setPhone] = useState(userProfile.phone || '');
  const [editingInfo, setEditingInfo] = useState(false);
  const [editingStats, setEditingStats] = useState(false);
  const [avgScore, setAvgScore] = useState(String(userProfile.avgScore || ''));
  const [lifeBest, setLifeBest] = useState(String(userProfile.lifeBest || ''));
  const [totalRounds, setTotalRounds] = useState(String(userProfile.totalRounds || ''));
  const [alarmDefaults, setAlarmDefaults] = useState(userProfile.alarmDefaults || { d3: true, d1: true, teeoff: true });

  // 라운딩 알람 시점 토글 — 즉시 저장 + 예정된 모든 일정에 바로 반영.
  const toggleAlarmDefault = async (key) => {
    const value = !alarmDefaults[key];
    const next = { ...alarmDefaults, [key]: value };
    setAlarmDefaults(next);
    const updated = { ...userProfile, alarmDefaults: next };
    setUserProfile({ ...updated });
    storage.save(STORAGE_KEYS.profile, updated);
    // 켜는 경우 알림 권한 확인
    if (value) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        Alert.alert('알림 권한이 필요해요', '알람을 받으려면 알림 권한을 허용해주세요.', [
          { text: '확인', style: 'cancel' },
          { text: '설정 열기', onPress: () => Linking.openSettings() },
        ]);
      }
    }
    // 예정된 모든 일정에 즉시 반영
    syncAlarmTypeAcrossSchedules(schedules, key, value);
  };

  // 일정 추가 시 알람 팝업 표시 여부 토글. 즉시 저장.
  const toggleAlarmPrompt = () => {
    const updated = { ...userProfile, alarmPromptDisabled: !userProfile.alarmPromptDisabled };
    setUserProfile({ ...updated });
    storage.save(STORAGE_KEYS.profile, updated);
  };

  const handleSaveStats = () => {
    const updated = {
      ...userProfile,
      avgScore: Number(avgScore) || 0,
      lifeBest: Number(lifeBest) || 0,
      totalRounds: Number(totalRounds) || 0,
    };
    setUserProfile({ ...updated });
    storage.save(STORAGE_KEYS.profile, updated);
    setEditingStats(false);
    Alert.alert('완료', '통계가 저장되었어요 ✓');
  };

  useEffect(() => {
    if (visible) {
      setNickname(userProfile.nickname);
      setDeparture(userProfile.departure || '');
      setDepartureCoord(userProfile.departureCoord || null);
      setDepResults([]);
      setDepSearching(false);
      setPhone(userProfile.phone || '');
      setEditingInfo(false);
      setAlarmDefaults(userProfile.alarmDefaults || { d3: true, d1: true, teeoff: true });
    }
  }, [visible]);

  // 디바운스 타이머 정리
  useEffect(() => () => { if (depTimerRef.current) clearTimeout(depTimerRef.current); }, []);

  const handleSaveInfo = () => {
    const updated = { ...userProfile, departure, departureCoord, phone };
    setUserProfile({ ...updated });
    storage.save(STORAGE_KEYS.profile, updated);
    setDepResults([]);
    setDepSearching(false);
    setEditingInfo(false);
    Alert.alert('완료', '내 정보가 저장되었어요 ✓');
  };

  const handleCancelInfo = () => {
    setDeparture(userProfile.departure || '');
    setDepartureCoord(userProfile.departureCoord || null);
    setDepResults([]);
    setDepSearching(false);
    setPhone(userProfile.phone || '');
    setEditingInfo(false);
  };

  // 출발지 입력 — 350ms 디바운스 후 카카오 검색
  const handleDepartureChange = (t) => {
    setDeparture(t);
    setDepartureCoord(null); // 직접 수정하면 이전 좌표 무효화
    if (depTimerRef.current) clearTimeout(depTimerRef.current);
    const q = t.trim();
    if (q.length < 2) { setDepResults([]); setDepSearching(false); return; }
    setDepSearching(true);
    depTimerRef.current = setTimeout(async () => {
      const results = await searchPlaces(q);
      setDepResults(results);
      setDepSearching(false);
    }, 350);
  };

  // 검색 결과 선택 — 라벨 + 정확 좌표 저장
  const handleSelectDeparture = (r) => {
    if (depTimerRef.current) clearTimeout(depTimerRef.current);
    setDeparture(r.name);
    setDepartureCoord({ x: r.x, y: r.y });
    setDepResults([]);
    setDepSearching(false);
  };

  const formatPhone = (t) => {
    const numbers = (t || '').replace(/[^0-9]/g, '');
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 7) return numbers.slice(0, 3) + '-' + numbers.slice(3);
    return numbers.slice(0, 3) + '-' + numbers.slice(3, 7) + '-' + numbers.slice(7, 11);
  };

  const handleSaveNickname = () => {
    const trimmed = (nickname || '').trim();
    if (!trimmed) {
      setNickname(userProfile.nickname);
      setEditingNick(false);
      return;
    }
    if (trimmed === userProfile.nickname) {
      setEditingNick(false);
      return;
    }
    const updated = { ...userProfile, nickname: trimmed };
    setUserProfile({ ...updated });
    setNickname(trimmed);
    setEditingNick(false);
    Alert.alert('완료', '닉네임이 변경되었어요');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={myS.mask}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
          <View style={myS.sheet}>
            <View style={myS.handle} />
            <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false}>
              <View style={myS.profileArea}>
                <View style={myS.avatar}>
                  <Text style={myS.avatarTxt}>{nickname.charAt(0)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  {editingNick ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TextInput
                        style={[myS.nickInput, { flex: 1 }]}
                        value={nickname} onChangeText={setNickname}
                        onSubmitEditing={handleSaveNickname}
                        returnKeyType="done"
                        autoFocus maxLength={10}
                        autoCapitalize="none" autoCorrect={false} keyboardType="default" />
                      <TouchableOpacity onPress={handleSaveNickname}
                        style={{ backgroundColor: C.burgundy, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 }}
                        activeOpacity={0.7}>
                        <Text style={{ fontFamily: F.sys, color: C.butter, fontSize: 13 }}>저장</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => {
                        setNickname(userProfile.nickname);
                        setEditingNick(false);
                      }} activeOpacity={0.6}>
                        <Text style={{ fontFamily: F.sys, color: C.warmGray, fontSize: 13 }}>취소</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text style={myS.nickname}>{nickname}</Text>
                  )}
                  <Text style={myS.realName}>{userProfile.realName}</Text>
                </View>
              </View>
              <TripleStripe height={1.5} />
              <View style={myS.section}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={myS.sectionLabel}>나의 통계</Text>
                  <View style={{ flex: 1 }} />
                  {editingStats ? (
                    <>
                      <TouchableOpacity onPress={() => {
                        setAvgScore(String(userProfile.avgScore || ''));
                        setLifeBest(String(userProfile.lifeBest || ''));
                        setTotalRounds(String(userProfile.totalRounds || ''));
                        setEditingStats(false);
                      }}>
                        <Text style={{ color: '#8B8680', marginRight: 12, fontSize: 13 }}>취소</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleSaveStats}
                        style={{ backgroundColor: '#6B1E2A', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6 }}>
                        <Text style={{ color: '#F5E6A8', fontSize: 13 }}>저장</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity onPress={() => setEditingStats(true)}>
                      <Text style={{ color: '#6B1E2A', fontSize: 13 }}>수정</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {editingStats ? (
                  <View>
                    {[
                      { label: '평균 타수', value: avgScore, set: setAvgScore, ph: '92' },
                      { label: '베스트 스코어', value: lifeBest, set: setLifeBest, ph: '78' },
                      { label: '총 라운딩 수', value: totalRounds, set: setTotalRounds, ph: '0' },
                    ].map((field, i) => (
                      <View key={i} style={{ marginBottom: 10 }}>
                        <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginBottom: 4 }}>
                          {field.label}
                        </Text>
                        <TextInput
                          style={{ backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline,
                            borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
                            fontFamily: F.sys, fontSize: 14, color: C.textPrimary }}
                          value={field.value}
                          onChangeText={field.set}
                          keyboardType="numeric"
                          placeholder={field.ph}
                          placeholderTextColor={C.warmGrayLight}
                          maxLength={4}
                        />
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={myS.statsRow}>
                    {[
                      { label: '총 라운딩', value: userProfile.totalRounds || DIARY_DATA.length },
                      { label: '평균타', value: userProfile.avgScore || Math.round(DIARY_DATA.reduce((s,d) => s+d.score, 0) / DIARY_DATA.length) },
                      { label: '베스트', value: userProfile.lifeBest || Math.min(...DIARY_DATA.map(d => d.score)) },
                    ].map((st, i) => (
                      <View key={i} style={myS.statBox}>
                        <Text style={myS.statVal}>{st.value}</Text>
                        <Text style={myS.statLabel}>{st.label}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
              <View style={myS.divider} />
              <View style={myS.section}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <Text style={myS.sectionLabel}>내 정보</Text>
                  <View style={{ flex: 1 }} />
                  {editingInfo ? (
                    <>
                      <TouchableOpacity onPress={handleCancelInfo}>
                        <Text style={{ fontFamily: F.sys, color: C.warmGray, marginRight: 12, fontSize: 13 }}>취소</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleSaveInfo}
                        style={{ backgroundColor: C.burgundy, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6 }}>
                        <Text style={{ fontFamily: F.sys, color: C.butter, fontSize: 13 }}>저장</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity onPress={() => setEditingInfo(true)}>
                      <Text style={{ fontFamily: F.sys, color: C.burgundy, fontSize: 13 }}>수정</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={myS.menuRow}>
                  <Text style={myS.menuIcon}>📍</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={myS.menuLabel}>자주 가는 출발지</Text>
                    {editingInfo ? (
                      <>
                        <TextInput style={{ fontFamily: F.sys, fontSize: 12, color: C.burgundy, borderBottomWidth: 1, borderBottomColor: C.burgundy, paddingBottom: 2, marginTop: 2 }}
                          value={departure} onChangeText={handleDepartureChange} autoFocus
                          autoCapitalize="none" autoCorrect={false}
                          placeholder="동·아파트·건물명으로 검색" placeholderTextColor={C.warmGrayLight} />
                        {depSearching && (
                          <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginTop: 6 }}>검색 중…</Text>
                        )}
                        {!depSearching && depResults.length > 0 && (
                          <View style={{ marginTop: 6, borderWidth: 0.5, borderColor: C.hairline, borderRadius: 8, overflow: 'hidden' }}>
                            {depResults.map((r, i) => (
                              <TouchableOpacity key={r.kakaoId} activeOpacity={0.7}
                                onPress={() => handleSelectDeparture(r)}
                                style={{ paddingVertical: 8, paddingHorizontal: 10, borderTopWidth: i === 0 ? 0 : 0.5, borderTopColor: C.hairline }}>
                                <Text style={{ fontFamily: F.sys, fontSize: 12, color: C.charcoal }} numberOfLines={1}>{r.name}</Text>
                                {!!r.loc && <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGray, marginTop: 1 }} numberOfLines={1}>{r.loc}</Text>}
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                        <Text style={{ fontFamily: F.sys, fontSize: 10, color: departureCoord ? '#3C7D4F' : C.warmGrayLight, marginTop: 6, lineHeight: 15 }}>
                          {departureCoord
                            ? '✓ 정확한 위치가 저장돼 교통 소요시간이 정확해져요'
                            : '검색 결과에서 선택해야 위치가 정확히 저장돼요'}
                        </Text>
                      </>
                    ) : (
                      <Text style={{ fontFamily: F.sys, fontSize: 12, color: departure ? C.burgundy : C.warmGrayLight, marginTop: 2 }}>
                        {departure || '입력하기 →'}
                      </Text>
                    )}
                  </View>
                </View>
                <View style={myS.menuRow}>
                  <Text style={myS.menuIcon}>📱</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={myS.menuLabel}>전화번호 (선택)</Text>
                    {editingInfo ? (
                      <TextInput style={{ fontFamily: F.sys, fontSize: 12, color: C.burgundy, borderBottomWidth: 1, borderBottomColor: C.burgundy, paddingBottom: 2, marginTop: 2 }}
                        value={phone} onChangeText={(t) => setPhone(formatPhone(t))} maxLength={13}
                        placeholder="010-0000-0000" placeholderTextColor={C.warmGrayLight} keyboardType="phone-pad" />
                    ) : (
                      <Text style={{ fontFamily: F.sys, fontSize: 12, color: phone ? C.burgundy : C.warmGrayLight, marginTop: 2 }}>
                        {phone || '입력하기 →'}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
              <View style={myS.divider} />
              <View style={myS.section}>
                <Text style={myS.sectionLabel}>라운딩 알람</Text>
                <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginTop: -4, marginBottom: 6, lineHeight: 16 }}>
                  예정된 모든 라운딩에 함께 적용돼요. 끄면 즉시 해제돼요.
                </Text>
                {[
                  { key: 'd3', label: 'D-3 알람', sub: '3일 전 오전 10시' },
                  { key: 'd1', label: 'D-1 알람', sub: '전날 오후 6시' },
                  { key: 'teeoff', label: '당일 알람', sub: '티오프 2시간 전' },
                ].map((item) => {
                  const on = !!alarmDefaults[item.key];
                  return (
                    <View key={item.key} style={myS.menuRow}>
                      <Text style={myS.menuIcon}>{on ? '🔔' : '🔕'}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={myS.menuLabel}>{item.label}</Text>
                        <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginTop: 2 }}>{item.sub}</Text>
                      </View>
                      <TouchableOpacity onPress={() => toggleAlarmDefault(item.key)} activeOpacity={0.8}
                        style={{ width: 46, height: 27, borderRadius: 14, padding: 3, justifyContent: 'center',
                          backgroundColor: on ? C.burgundy : C.hairline }}>
                        <View style={{ width: 21, height: 21, borderRadius: 11, backgroundColor: '#fff',
                          alignSelf: on ? 'flex-end' : 'flex-start' }} />
                      </TouchableOpacity>
                    </View>
                  );
                })}
                {(() => {
                  const on = !userProfile.alarmPromptDisabled;
                  return (
                    <View style={[myS.menuRow, { borderBottomWidth: 0, marginTop: 4 }]}>
                      <Text style={myS.menuIcon}>💬</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={myS.menuLabel}>일정 추가 시 알람 팝업 표시</Text>
                        <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight, marginTop: 2 }}>
                          {on ? '추가할 때마다 알람 설정을 물어봐요' : '팝업 없이 위 기본 설정대로 자동 적용돼요'}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={toggleAlarmPrompt} activeOpacity={0.8}
                        style={{ width: 46, height: 27, borderRadius: 14, padding: 3, justifyContent: 'center',
                          backgroundColor: on ? C.burgundy : C.hairline }}>
                        <View style={{ width: 21, height: 21, borderRadius: 11, backgroundColor: '#fff',
                          alignSelf: on ? 'flex-end' : 'flex-start' }} />
                      </TouchableOpacity>
                    </View>
                  );
                })()}
              </View>
              <View style={myS.divider} />
              <View style={myS.section}>
                <Text style={myS.sectionLabel}>설정</Text>
                {[
                  {
                    icon: '✏️', label: '닉네임 변경',
                    onPress: () => {
                      scrollRef.current?.scrollTo({ y: 0, animated: true });
                      setEditingNick(true);
                    },
                  },
                  { icon: '🔔', label: '알림 설정', onPress: () => Linking.openSettings() },
                  { icon: '📷', label: '앱 권한 (사진·위치)', onPress: () => Linking.openSettings() },
                ].map((item, i) => (
                  <TouchableOpacity key={i} style={myS.menuRow} activeOpacity={0.7} onPress={item.onPress}>
                    <Text style={myS.menuIcon}>{item.icon}</Text>
                    <Text style={myS.menuLabel}>{item.label}</Text>
                    <Text style={myS.menuValue}>›</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={myS.divider} />
              <View style={myS.section}>
                <Text style={myS.sectionLabel}>정보</Text>
                {[{ icon: '⭐', label: '앱 평가하기' }, { icon: '📋', label: 'v1.0.0' }].map((item, i) => (
                  <TouchableOpacity key={i} style={myS.menuRow} activeOpacity={0.7}>
                    <Text style={myS.menuIcon}>{item.icon}</Text>
                    <Text style={myS.menuLabel}>{item.label}</Text>
                    <Text style={myS.menuValue}>›</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <Text style={{ fontFamily: F.sys, fontSize: 11, color: C.warmGrayLight }}>Dear Golf v1.0.0</Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
