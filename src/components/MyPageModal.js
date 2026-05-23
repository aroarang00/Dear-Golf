import React, { useState, useEffect, useRef } from 'react';
import {
  Modal, View, Text, TouchableOpacity, TextInput, ScrollView,
  Alert, Linking,
} from 'react-native';
import { OverlayAlert } from './common/OverlayAlert';
import { C, F, fs } from '../constants/colors';
import { DIARY_DATA } from '../constants/data';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { RoundEvaluationModal } from './RoundEvaluationModal';
import { myS } from '../styles/myS';
import { UserContext } from '../contexts/UserContext';
import { TripleStripe } from './common/TripleStripe';
import { searchPlaces } from '../utils/kakao';
import { deleteAccount } from '../utils/account';
import { CalendarPickerModal } from './CalendarPickerModal';
import { BlockManageScreen } from './BlockManageScreen';
import { nicknameChangeStatus, formatNextDate } from '../utils/nickname';
import { clearRecentCourses } from '../utils/recentCourses';

export function MyPageModal({ visible, onClose }) {
  const { userProfile, setUserProfile, onAccountDeleted, previewOnboarding } = React.useContext(UserContext);
  const scrollRef = useRef(null);
  const [calPickerOpen, setCalPickerOpen] = useState(false);
  const [evalOpen, setEvalOpen] = useState(false);   // 라운딩 평가 모달 미리보기 (개발용)
  const [blockManageOpen, setBlockManageOpen] = useState(false);  // 차단 관리
  const [alertData, setAlertData] = useState(null);  // 오버레이 알럿 (모달 위 안전 표시)
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
  // 일정 추가 시 알람 팝업 표시 여부 토글. 즉시 저장.
  const toggleAlarmPrompt = () => {
    const updated = { ...userProfile, alarmPromptDisabled: !userProfile.alarmPromptDisabled };
    setUserProfile({ ...updated });
    storage.save(STORAGE_KEYS.profile, updated);
  };

  // 알림 항목 토글 (친구·모집·평가·기록) — 기본 ON, 즉시 저장.
  // 실제 푸시 발송은 FCM 서버 연동 후 동작한다.
  const toggleNotifyPref = (key) => {
    const prefs = userProfile.notifyPrefs || {};
    const next = { ...userProfile, notifyPrefs: { ...prefs, [key]: prefs[key] === false } };
    setUserProfile({ ...next });
    storage.save(STORAGE_KEYS.profile, next);
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
    setAlertData({ title: '완료', message: '통계가 저장되었어요 ✓' });
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
    // 변경 제한 — 일반 30일/1회, 카카오 15일/1회
    const status = nicknameChangeStatus(userProfile);
    if (!status.canChange) {
      const buttons = [{ text: '확인' }];
      const baseMsg = `닉네임은 ${status.daysLeft}일 후에 변경할 수 있어요.`;
      const extra = userProfile?.kakaoLinked
        ? ''
        : '\n\n💡 카카오 로그인 연동 시 더 빠르게(15일) 변경할 수 있어요';
      setAlertData({ title: '변경 가능 시점이 아니에요', message: baseMsg + extra, buttons });
      setNickname(userProfile.nickname);
      setEditingNick(false);
      return;
    }
    const updated = {
      ...userProfile,
      nickname: trimmed,
      lastNicknameChange: new Date().toISOString(),
    };
    setUserProfile({ ...updated });
    setNickname(trimmed);
    setEditingNick(false);
    setAlertData({ title: '완료', message: '닉네임이 변경되었어요' });
  };

  // 계정 탈퇴 — 확인 후 Firebase 계정·Firestore 데이터·로컬 데이터를 모두 삭제하고 온보딩으로
  const handleDeleteAccount = () => {
    setAlertData({
      title: '정말 탈퇴하시겠어요?',
      message: '탈퇴하면 계정과 모든 기록(일정·다이어리·명예의 전당·골퍼 코멘트)이 삭제되며 복구할 수 없어요.',
      buttons: [
        { text: '취소', style: 'cancel' },
        {
          text: '탈퇴',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount();
            } catch (e) {
              console.warn('[account] 탈퇴 처리 오류', e?.message);
            }
            onClose();
            onAccountDeleted && onAccountDeleted();
          },
        },
      ],
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <View style={myS.mask}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
          <View style={myS.sheet}>
            <View style={myS.handle} />
            <ScrollView ref={scrollRef} style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
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
                        <Text style={{ fontFamily: F.sys, color: C.butter, fontSize: fs(13) }}>저장</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => {
                        setNickname(userProfile.nickname);
                        setEditingNick(false);
                      }} activeOpacity={0.6}>
                        <Text style={{ fontFamily: F.sys, color: C.warmGray, fontSize: fs(13) }}>취소</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <>
                      <Text style={myS.nickname}>{nickname}</Text>
                      {/* 닉네임 변경 가능 여부 — 다음 변경일 또는 가능 안내 */}
                      {(() => {
                        const st = nicknameChangeStatus(userProfile);
                        if (st.canChange) {
                          return (
                            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 2 }}>
                              닉네임 변경 가능 · {st.cooldownDays}일에 1번
                            </Text>
                          );
                        }
                        return (
                          <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: '#8B6914', marginTop: 2 }}>
                            다음 변경일 {formatNextDate(st.nextDate)} ({st.daysLeft}일 후)
                          </Text>
                        );
                      })()}
                    </>
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
                        <Text style={{ color: '#8B8680', marginRight: 12, fontSize: fs(13) }}>취소</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleSaveStats}
                        style={{ backgroundColor: '#6B1E2A', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6 }}>
                        <Text style={{ color: '#F5E6A8', fontSize: fs(13) }}>저장</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity onPress={() => setEditingStats(true)}>
                      <Text style={{ color: '#6B1E2A', fontSize: fs(13) }}>수정</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {editingStats ? (
                  <View>
                    {/* 핸디 자동 계산 안내 — 수동 입력값은 기록 전 시작값 */}
                    <View style={{ backgroundColor: '#FBF3D3', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 }}>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, lineHeight: 17 }}>
                        💡 라운딩 기록이 5개 모이면 핸디는 베스트 라운드 위주로 자동 계산돼요. 그 전까지는 아래 입력값을 사용해요.
                      </Text>
                    </View>
                    {[
                      { label: '평균 타수', value: avgScore, set: setAvgScore, ph: '92' },
                      { label: '베스트 스코어', value: lifeBest, set: setLifeBest, ph: '78' },
                      { label: '총 라운딩 수', value: totalRounds, set: setTotalRounds, ph: '0' },
                    ].map((field, i) => (
                      <View key={i} style={{ marginBottom: 10 }}>
                        <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginBottom: 4 }}>
                          {field.label}
                        </Text>
                        <TextInput
                          style={{ backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline,
                            borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
                            fontFamily: F.sys, fontSize: fs(14), color: C.textPrimary }}
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
                        <Text style={{ fontFamily: F.sys, color: C.warmGray, marginRight: 12, fontSize: fs(13) }}>취소</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleSaveInfo}
                        style={{ backgroundColor: C.burgundy, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6 }}>
                        <Text style={{ fontFamily: F.sys, color: C.butter, fontSize: fs(13) }}>저장</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity onPress={() => setEditingInfo(true)}>
                      <Text style={{ fontFamily: F.sys, color: C.burgundy, fontSize: fs(13) }}>수정</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={myS.menuRow}>
                  <Text style={myS.menuIcon}>📍</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={myS.menuLabel}>자주 가는 출발지</Text>
                    {editingInfo ? (
                      <>
                        <TextInput style={{ fontFamily: F.sys, fontSize: fs(12), color: C.burgundy, borderBottomWidth: 1, borderBottomColor: C.burgundy, paddingBottom: 2, marginTop: 2 }}
                          value={departure} onChangeText={handleDepartureChange} autoFocus
                          autoCapitalize="none" autoCorrect={false}
                          placeholder="동·아파트·건물명으로 검색" placeholderTextColor={C.warmGrayLight} />
                        {depSearching && (
                          <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 6 }}>검색 중…</Text>
                        )}
                        {!depSearching && depResults.length > 0 && (
                          <View style={{ marginTop: 6, borderWidth: 0.5, borderColor: C.hairline, borderRadius: 8, overflow: 'hidden' }}>
                            {depResults.map((r, i) => (
                              <TouchableOpacity key={r.kakaoId} activeOpacity={0.7}
                                onPress={() => handleSelectDeparture(r)}
                                style={{ paddingVertical: 8, paddingHorizontal: 10, borderTopWidth: i === 0 ? 0 : 0.5, borderTopColor: C.hairline }}>
                                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.charcoal }} numberOfLines={1}>{r.name}</Text>
                                {!!r.loc && <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 1 }} numberOfLines={1}>{r.loc}</Text>}
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                        <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: departureCoord ? '#3C7D4F' : C.warmGrayLight, marginTop: 6, lineHeight: 15 }}>
                          {departureCoord
                            ? '✓ 정확한 위치가 저장돼 교통 소요시간이 정확해져요'
                            : '검색 결과에서 선택해야 위치가 정확히 저장돼요'}
                        </Text>
                      </>
                    ) : (
                      <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: departure ? C.burgundy : C.warmGrayLight, marginTop: 2 }}>
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
                      <TextInput style={{ fontFamily: F.sys, fontSize: fs(12), color: C.burgundy, borderBottomWidth: 1, borderBottomColor: C.burgundy, paddingBottom: 2, marginTop: 2 }}
                        value={phone} onChangeText={(t) => setPhone(formatPhone(t))} maxLength={13}
                        placeholder="010-0000-0000" placeholderTextColor={C.warmGrayLight} keyboardType="phone-pad" />
                    ) : (
                      <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: phone ? C.burgundy : C.warmGrayLight, marginTop: 2 }}>
                        {phone || '입력하기 →'}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
              <View style={myS.divider} />
              <View style={myS.section}>
                <Text style={myS.sectionLabel}>알림</Text>
                {/* 일정 추가 시 알람 팝업 — D-3·D-1·당일 시점은 이 팝업에서 고른다 */}
                {(() => {
                  const on = !userProfile.alarmPromptDisabled;
                  return (
                    <View style={myS.menuRow}>
                      <Text style={myS.menuIcon}>💬</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={myS.menuLabel}>라운딩마다 알람 직접 설정</Text>
                        <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 2 }}>
                          {on ? '일정을 추가할 때마다 알람 설정을 물어봐요' : '팝업 없이 D-3·D-1·당일 알람이 자동 적용돼요'}
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
                {/* 추가 알림 — 친구·모집·평가·기록. 푸시 발송은 서버(FCM) 연동 후 동작 */}
                {[
                  { key: 'friendRequest', icon: '🤝', label: '친구 신청', sub: '친구 신청을 받으면 알려드려요' },
                  { key: 'roundup', icon: '📣', label: '모집 활동', sub: '내 모집 신청·참여, 대기 자리 알림' },
                  { key: 'evaluation', icon: '✍️', label: '라운딩 평가 요청', sub: '라운딩 후 동반자 매너 평가 안내' },
                  { key: 'diaryReminder', icon: '📔', label: '기록 리마인더', sub: '라운딩 후 기록을 안 남기면 알려드려요' },
                ].map((item, i, arr) => {
                  const prefs = userProfile.notifyPrefs || {};
                  const on = prefs[item.key] !== false;
                  return (
                    <View key={item.key} style={[myS.menuRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                      <Text style={myS.menuIcon}>{item.icon}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={myS.menuLabel}>{item.label}</Text>
                        <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 2 }}>{item.sub}</Text>
                      </View>
                      <TouchableOpacity onPress={() => toggleNotifyPref(item.key)} activeOpacity={0.8}
                        style={{ width: 46, height: 27, borderRadius: 14, padding: 3, justifyContent: 'center',
                          backgroundColor: on ? C.burgundy : C.hairline }}>
                        <View style={{ width: 21, height: 21, borderRadius: 11, backgroundColor: '#fff',
                          alignSelf: on ? 'flex-end' : 'flex-start' }} />
                      </TouchableOpacity>
                    </View>
                  );
                })}
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
                  { icon: '📅', label: '캘린더 연동', onPress: () => setCalPickerOpen(true) },
                  { icon: '🚫', label: '차단 관리', value: (userProfile.blockedUsers?.length || 0) + '명',
                    onPress: () => setBlockManageOpen(true) },
                  // 신고하기 — 라운지 등 다른 화면에서 직접 진입하지 않고 마이페이지로 일원화
                  // (정책 report-block-policy §5-1). Phase 2에 6단계 흐름 + 백엔드 구현.
                  { icon: '🚨', label: '신고하기',
                    onPress: () => setAlertData({
                      title: '신고하기 준비 중',
                      message: '신고 기능은 곧 추가될 예정이에요.\n급한 경우 deargolf.official@gmail.com으로 연락주세요.',
                      buttons: [{ text: '확인' }],
                    }) },
                  ...(userProfile.kakaoLinked
                    ? [{ icon: '💛', label: '카카오 연동됨', value: '연결됨', onPress: () => {} }]
                    : [{ icon: '💛', label: '카카오 로그인 연동',
                        onPress: () => setAlertData({
                          title: '카카오 로그인 연동',
                          message: '카카오 로그인을 연동하면 닉네임 변경 주기가 30일 → 15일로 단축돼요.\n(연동 화면은 추후 추가될 예정)',
                          buttons: [{ text: '확인' }],
                        }) }]),
                  { icon: '🔒', label: '개인정보 처리방침', onPress: () => Linking.openURL('https://dear-golf.web.app/privacy') },
                ].map((item, i) => (
                  <TouchableOpacity key={i} style={myS.menuRow} activeOpacity={0.7} onPress={item.onPress}>
                    <Text style={myS.menuIcon}>{item.icon}</Text>
                    <Text style={myS.menuLabel}>{item.label}</Text>
                    {item.value ? (
                      <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginRight: 4 }}>{item.value}</Text>
                    ) : null}
                    <Text style={myS.menuValue}>›</Text>
                  </TouchableOpacity>
                ))}
                {/* 라운지 — 모르는 사람 모집 숨기기 토글 (켜면 '전체' 탭 사라짐, 친구 모집만 보임) */}
                {(() => {
                  const on = !!userProfile.hideStrangerRoundups;
                  const toggle = () => {
                    const next = { ...userProfile, hideStrangerRoundups: !on };
                    setUserProfile(next);
                    storage.save(STORAGE_KEYS.profile, next);
                  };
                  return (
                    <View style={myS.menuRow}>
                      <Text style={myS.menuIcon}>🤝</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={myS.menuLabel}>친구 모집만 보기</Text>
                        <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 2 }}>
                          라운지에서 '전체' 탭을 숨기고 친구 모집만 표시
                        </Text>
                      </View>
                      <TouchableOpacity onPress={toggle} activeOpacity={0.8}
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
                <Text style={myS.sectionLabel}>정보</Text>
                {[{ icon: '⭐', label: '앱 평가하기' }, { icon: '📋', label: 'v1.0.0' }].map((item, i) => (
                  <TouchableOpacity key={i} style={myS.menuRow} activeOpacity={0.7}>
                    <Text style={myS.menuIcon}>{item.icon}</Text>
                    <Text style={myS.menuLabel}>{item.label}</Text>
                    <Text style={myS.menuValue}>›</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {__DEV__ && (
                <>
                  <View style={myS.divider} />
                  <View style={myS.section}>
                    <Text style={myS.sectionLabel}>개발용</Text>
                    <TouchableOpacity style={myS.menuRow} activeOpacity={0.7}
                      onPress={() => { onClose(); previewOnboarding && previewOnboarding(); }}>
                      <Text style={myS.menuIcon}>🧪</Text>
                      <Text style={myS.menuLabel}>온보딩 미리보기</Text>
                      <Text style={myS.menuValue}>›</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={myS.menuRow} activeOpacity={0.7}
                      onPress={() => setEvalOpen(true)}>
                      <Text style={myS.menuIcon}>🧪</Text>
                      <Text style={myS.menuLabel}>라운딩 평가 모달 미리보기</Text>
                      <Text style={myS.menuValue}>›</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={myS.menuRow} activeOpacity={0.7}
                      onPress={() => {
                        const v = !userProfile.mannerEvaluationPending;
                        const u = { ...userProfile, mannerEvaluationPending: v };
                        setUserProfile(u);
                        storage.save(STORAGE_KEYS.profile, u);
                      }}>
                      <Text style={myS.menuIcon}>🧪</Text>
                      <Text style={myS.menuLabel}>평가 대기 토글</Text>
                      <Text style={myS.menuValue}>{userProfile.mannerEvaluationPending ? 'ON' : 'OFF'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={myS.menuRow} activeOpacity={0.7}
                      onPress={() => {
                        const v = !userProfile.isRestricted;
                        const u = { ...userProfile, isRestricted: v };
                        setUserProfile(u);
                        storage.save(STORAGE_KEYS.profile, u);
                      }}>
                      <Text style={myS.menuIcon}>🧪</Text>
                      <Text style={myS.menuLabel}>이용 제한 토글</Text>
                      <Text style={myS.menuValue}>{userProfile.isRestricted ? 'ON' : 'OFF'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={myS.menuRow} activeOpacity={0.7}
                      onPress={async () => {
                        await storage.save(STORAGE_KEYS.friendCoachDone, false);
                        await storage.save(STORAGE_KEYS.roundupTipDone, false);
                        setAlertData({ title: '리셋 완료', message: '친구 탭 / 모집글 작성 화면을 다시 진입하면 안내가 표시돼요.' });
                      }}>
                      <Text style={myS.menuIcon}>🧪</Text>
                      <Text style={myS.menuLabel}>안내 툴팁 리셋</Text>
                      <Text style={myS.menuValue}>›</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[myS.menuRow, { borderBottomWidth: 0 }]} activeOpacity={0.7}
                      onPress={async () => {
                        await clearRecentCourses();
                        setAlertData({ title: '리셋 완료', message: '코스 탭 최근 검색이 비워졌어요.' });
                      }}>
                      <Text style={myS.menuIcon}>🧪</Text>
                      <Text style={myS.menuLabel}>최근 검색 리셋</Text>
                      <Text style={myS.menuValue}>›</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
              <View style={myS.divider} />
              <View style={myS.section}>
                <Text style={myS.sectionLabel}>계정</Text>
                <TouchableOpacity style={[myS.menuRow, { borderBottomWidth: 0 }]} activeOpacity={0.7} onPress={handleDeleteAccount}>
                  <Text style={myS.menuIcon}>⚠️</Text>
                  <Text style={[myS.menuLabel, { color: C.burgundy }]}>계정 탈퇴</Text>
                  <Text style={myS.menuValue}>›</Text>
                </TouchableOpacity>
              </View>
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>Dear Golf v1.0.0</Text>
              </View>
            </ScrollView>
          </View>
        </View>
      <CalendarPickerModal visible={calPickerOpen} onClose={() => setCalPickerOpen(false)} />
      <BlockManageScreen visible={blockManageOpen} onClose={() => setBlockManageOpen(false)} />
      {/* 라운딩 평가 미리보기 (개발용) */}
      <RoundEvaluationModal
        visible={evalOpen}
        round={{
          course: '제이드팰리스 GC',
          date: '2026.05.18 (일)',
          participants: [
            { id: 'p1', name: '오세훈', role: '주최자' },
            { id: 'p2', name: '김민준', role: '참석자' },
            { id: 'p3', name: '이수연', role: '참석자' },
          ],
        }}
        onClose={() => setEvalOpen(false)}
        onSubmit={() => {
          // 평가 제출 → 평가 대기 해제
          const u = { ...userProfile, mannerEvaluationPending: false };
          setUserProfile(u);
          storage.save(STORAGE_KEYS.profile, u);
        }} />
      {/* 모달 위에서도 안전하게 뜨는 오버레이 알럿 */}
      <OverlayAlert data={alertData} onClose={() => setAlertData(null)} />
    </Modal>
  );
}
