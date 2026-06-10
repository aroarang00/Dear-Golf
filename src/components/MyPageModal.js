import React, { useState, useEffect, useRef } from 'react';
import {
  Modal, View, Text, TouchableOpacity, TextInput, ScrollView,
  Alert, Linking,
} from 'react-native';
import { OverlayAlert } from './common/OverlayAlert';
import { C, F, fs } from '../constants/colors';
import { DIARY_DATA } from '../constants/data';
import { ROUNDUP_PUBLIC_ENABLED } from '../constants/roundup';
import { DiariesContext } from '../contexts/DiariesContext';
import { SchedulesContext } from '../contexts/SchedulesContext';
import { calcHandicap } from '../utils/handicap';
import { countCompletedRounds, displayTotalRounds } from '../utils/roundStats';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { RoundEvaluationModal } from './RoundEvaluationModal';
import { myS } from '../styles/myS';
import { UserContext } from '../contexts/UserContext';
import { TripleStripe } from './common/TripleStripe';
import { searchPlaces } from '../utils/kakao';
import { deleteAccount } from '../utils/account';
import { CalendarPickerModal } from './CalendarPickerModal';
import { BlockManageScreen } from './BlockManageScreen';
import { FriendGroupManageModal } from './FriendGroupManageModal';
import { ReportModal } from './ReportModal';
import { MyRoundupActivityScreen } from './MyRoundupActivityScreen';
import { nicknameChangeStatus, formatNextDate } from '../utils/nickname';
import { clearRecentCourses } from '../utils/recentCourses';
import { TermsViewerModal } from './TermsViewerModal';
import { getReportRemainingThisMonth, isReportLimitReached, REPORT_MONTH_LIMIT } from '../utils/reportLimit';
import {
  TERMS_OF_SERVICE,
  PRIVACY_POLICY,
  COMMUNITY_GUIDELINES,
  PENALTY_CONSENT,
  LOCATION_BASED_SERVICE_TERMS,
} from '../constants/legalTexts';

export function MyPageModal({ visible, onClose }) {
  const { userProfile, setUserProfile, onAccountDeleted, previewOnboarding } = React.useContext(UserContext);
  const { diaries } = React.useContext(DiariesContext);
  const { schedules } = React.useContext(SchedulesContext);
  // 핸디 — 베스트 5개 평균(기록 5개 미만 시 입력 평균타 우선). DiaryScreen·DiaryCard와 동일 정책.
  const handicap = calcHandicap(diaries, userProfile.avgScore);
  // 총 라운딩 — 자동 완료 라운딩 + 마이페이지 입력 기준값(입력 이후 증가분만 가산). DiaryScreen과 동일 헬퍼.
  const completedRounds = countCompletedRounds(diaries, schedules);
  const effectiveTotalRounds = displayTotalRounds(userProfile, completedRounds);
  const scrollRef = useRef(null);
  const [calPickerOpen, setCalPickerOpen] = useState(false);
  const [evalOpen, setEvalOpen] = useState(false);   // 라운딩 평가 모달 미리보기 (개발용)
  const [blockManageOpen, setBlockManageOpen] = useState(false);  // 차단 관리
  const [groupManageOpen, setGroupManageOpen] = useState(false);  // 친구 그룹 관리 ([[friend_groups]])
  const [reportOpen, setReportOpen] = useState(false);             // 신고하기
  const [roundupActivityOpen, setRoundupActivityOpen] = useState(false); // 내 라운지 활동
  const [termsViewer, setTermsViewer] = useState({ visible: false, title: '', body: '', externalUrl: null }); // 약관·정책 본문 뷰어
  const [reportRemaining, setReportRemaining] = useState(REPORT_MONTH_LIMIT); // 이번 달 신고 가능 잔여 (월 1건 한도)

  // 마이페이지 진입 시 신고 잔여 카운트 조회 (월 바뀌면 자동 초기화 — reportLimit.js)
  useEffect(() => {
    if (!visible) return;
    getReportRemainingThisMonth().then(setReportRemaining);
  }, [visible]);
  const [alertData, setAlertData] = useState(null);  // 오버레이 알럿 (모달 위 안전 표시)
  // 안드로이드 뒤로가기 — 확인창이 떠 있으면 그것만 취소로 닫고, 아니면 모달을 닫는다.
  const handleRequestClose = () => {
    if (alertData) { setAlertData(null); return; }
    onClose();
  };
  const [nickname, setNickname] = useState(userProfile.nickname);
  const [editingNick, setEditingNick] = useState(false);
  const [departure, setDeparture] = useState(userProfile.departure || '');
  const [departureCoord, setDepartureCoord] = useState(userProfile.departureCoord || null);
  const [depResults, setDepResults] = useState([]);
  const [depSearching, setDepSearching] = useState(false);
  const depTimerRef = useRef(null);
  const [phone, setPhone] = useState(userProfile.phone || '');
  const [realName, setRealName] = useState(userProfile.realName || ''); // 본명(선택) — 친구·동반자 매칭용, 검색 표시는 마스킹 ([[realname-policy]])
  const [statusMessage, setStatusMessage] = useState(userProfile.statusMessage || ''); // 프로필 멘트(명함 표시)
  const [editingInfo, setEditingInfo] = useState(false);
  const [editingStats, setEditingStats] = useState(false);
  const [editingStatus, setEditingStatus] = useState(false); // 한마디 — 프로필(닉네임 아래)에서 인라인 편집
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
      totalRoundsBaseCount: completedRounds, // 입력 순간의 자동 완료 라운딩 스냅샷 — 이후 증가분만 가산
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
      setRealName(userProfile.realName || '');
      setStatusMessage(userProfile.statusMessage || '');
      setEditingInfo(false);
      setEditingStatus(false);
    }
  }, [visible]);

  // 디바운스 타이머 정리
  useEffect(() => () => { if (depTimerRef.current) clearTimeout(depTimerRef.current); }, []);

  const handleSaveInfo = () => {
    const updated = { ...userProfile, departure, departureCoord, phone, realName: realName.trim(), statusMessage: statusMessage.trim() };
    setUserProfile({ ...updated });
    storage.save(STORAGE_KEYS.profile, updated);
    setDepResults([]);
    setDepSearching(false);
    setEditingInfo(false);
  };

  // 한마디 — 프로필에서 인라인으로 바로 저장 (내 정보 그룹 저장과 분리)
  const handleSaveStatus = () => {
    const updated = { ...userProfile, statusMessage: statusMessage.trim() };
    setUserProfile({ ...updated });
    storage.save(STORAGE_KEYS.profile, updated);
    setEditingStatus(false);
  };

  const handleCancelInfo = () => {
    setDeparture(userProfile.departure || '');
    setDepartureCoord(userProfile.departureCoord || null);
    setDepResults([]);
    setDepSearching(false);
    setPhone(userProfile.phone || '');
    setRealName(userProfile.realName || '');
    setStatusMessage(userProfile.statusMessage || '');
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleRequestClose}>
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
                        value={nickname} onChangeText={(t) => setNickname(t.slice(0, 10))}
                        onSubmitEditing={handleSaveNickname}
                        returnKeyType="done"
                        autoFocus
                        autoCapitalize="none" autoCorrect={false} keyboardType="default" />{/* maxLength 금지 — 한글 조합 충돌 [[project_textinput_maxlength_hangul_bug]] */}
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
                    (() => {
                      // 닉네임 변경은 상단에서 바로 — 쿨다운 중엔 버튼 숨기고 다음 변경일만 안내
                      const st = nicknameChangeStatus(userProfile);
                      return (
                        <>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={myS.nickname}>{nickname}</Text>
                            {st.canChange && (
                              <TouchableOpacity onPress={() => setEditingNick(true)} activeOpacity={0.7}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 3 }}>
                                <Text style={{ fontSize: fs(11) }}>✏️</Text>
                                <Text style={{ fontFamily: F.sys, color: C.burgundy, fontSize: fs(12) }}>수정</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                          {st.canChange ? (
                            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 2 }}>
                              닉네임 변경 가능 · {st.cooldownDays}일에 1번
                            </Text>
                          ) : (
                            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: '#8B6914', marginTop: 2 }}>
                              다음 변경일 {formatNextDate(st.nextDate)} ({st.daysLeft}일 후)
                            </Text>
                          )}
                        </>
                      );
                    })()
                  )}
                  <Text style={myS.realName}>{userProfile.realName}</Text>
                  {/* 한마디(명함 멘트) — 닉네임 아래에서 바로 인라인 편집 */}
                  {editingStatus ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <TextInput
                        style={{ flex: 1, fontFamily: F.sys, fontSize: fs(12), color: C.burgundy, borderBottomWidth: 1, borderBottomColor: C.burgundy, paddingBottom: 2 }}
                        value={statusMessage} onChangeText={(t) => setStatusMessage(t.slice(0, 15))} autoFocus
                        onSubmitEditing={handleSaveStatus} returnKeyType="done"
                        placeholder="프로필에 보일 한마디 (최대 15자)" placeholderTextColor={C.warmGrayLight} />
                      <TouchableOpacity onPress={handleSaveStatus} activeOpacity={0.7}
                        style={{ backgroundColor: C.burgundy, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 }}>
                        <Text style={{ fontFamily: F.sys, color: C.butter, fontSize: fs(13) }}>저장</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => { setStatusMessage(userProfile.statusMessage || ''); setEditingStatus(false); }} activeOpacity={0.6}>
                        <Text style={{ fontFamily: F.sys, color: C.warmGray, fontSize: fs(13) }}>취소</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity onPress={() => setEditingStatus(true)} activeOpacity={0.6}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: statusMessage ? C.charcoal : C.warmGrayLight, flexShrink: 1 }} numberOfLines={2}>
                        {statusMessage || '한마디 입력하기'}
                      </Text>
                      <Text style={{ fontSize: fs(11) }}>✏️</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              <TripleStripe height={1.5} />
              <View style={myS.section}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={myS.sectionLabel}>나의 통계</Text>
                  <View style={{ flex: 1 }} />
                  {!editingStats && (
                    <TouchableOpacity onPress={() => {
                      // 수정 진입 시 입력칸을 '현재 표시 총 라운딩'으로 채움 → 저장 시 그 시점이 기준점
                      setAvgScore(String(userProfile.avgScore || ''));
                      setLifeBest(String(userProfile.lifeBest || ''));
                      setTotalRounds(String(effectiveTotalRounds || ''));
                      setEditingStats(true);
                    }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 4 }}>
                      <Text style={{ fontSize: fs(12) }}>✏️</Text>
                      <Text style={{ fontFamily: F.sys, color: C.burgundy, fontSize: fs(13) }}>수정</Text>
                    </TouchableOpacity>
                  )}
                  {editingStats && (
                    <>
                      <TouchableOpacity onPress={() => {
                        setAvgScore(String(userProfile.avgScore || ''));
                        setLifeBest(String(userProfile.lifeBest || ''));
                        setTotalRounds(String(effectiveTotalRounds || ''));
                        setEditingStats(false);
                      }}>
                        <Text style={{ color: '#8B8680', marginRight: 12, fontSize: fs(13) }}>취소</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleSaveStats}
                        style={{ backgroundColor: '#6B1E2A', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6 }}>
                        <Text style={{ color: '#F5E6A8', fontSize: fs(13) }}>저장</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
                {editingStats ? (
                  <View>
                    {/* 핸디 자동 계산 안내 — 수동 입력값은 기록 전 시작값 */}
                    <View style={{ backgroundColor: '#FBF3D3', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 }}>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, lineHeight: 17 }}>
                        💡 라운딩 기록이 6개부터 핸디가 자동으로 계산돼요.{'\n'}그 전까지는 아래 입력값을 사용해요.
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
                      { label: '총 라운딩', value: effectiveTotalRounds },
                      { label: '핸디', value: handicap ?? '-' },
                      { label: '베스트', value: userProfile.lifeBest || Math.min(...DIARY_DATA.map(d => d.score)) },
                    ].map((st, i) => (
                      <View key={i} style={myS.statBox}>
                        <Text style={myS.statVal}>{String(st.value)}</Text>
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
                  {!editingInfo && (
                    <TouchableOpacity onPress={() => setEditingInfo(true)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 4 }}>
                      <Text style={{ fontSize: fs(12) }}>✏️</Text>
                      <Text style={{ fontFamily: F.sys, color: C.burgundy, fontSize: fs(13) }}>수정</Text>
                    </TouchableOpacity>
                  )}
                  {editingInfo && (
                    <>
                      <TouchableOpacity onPress={handleCancelInfo}>
                        <Text style={{ fontFamily: F.sys, color: C.warmGray, marginRight: 12, fontSize: fs(13) }}>취소</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleSaveInfo}
                        style={{ backgroundColor: C.burgundy, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6 }}>
                        <Text style={{ fontFamily: F.sys, color: C.butter, fontSize: fs(13) }}>저장</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
                {/* 각 행을 탭해도 편집 진입 — 작은 '수정'을 못 찾는 사용자 대응(B안) */}
                <TouchableOpacity activeOpacity={editingInfo ? 1 : 0.7} onPress={() => { if (!editingInfo) setEditingInfo(true); }}>
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
                  <Text style={myS.menuIcon}>🪪</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={myS.menuLabel}>본명 (선택)</Text>
                    {editingInfo ? (
                      <>
                        <TextInput style={{ fontFamily: F.sys, fontSize: fs(12), color: C.burgundy, borderBottomWidth: 1, borderBottomColor: C.burgundy, paddingBottom: 2, marginTop: 2 }}
                          value={realName} onChangeText={(t) => setRealName(t.slice(0, 20))}
                          placeholder="김골프" placeholderTextColor={C.warmGrayLight} />
                        <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 4, lineHeight: 16 }}>
                          친구·동반자 찾기가 정확해져요. 검색엔 이름 일부만 가려 보여요 (예: 김*프)
                        </Text>
                      </>
                    ) : (
                      <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: realName ? C.burgundy : C.warmGrayLight, marginTop: 2 }}>
                        {realName || '입력하기 →'}
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
                </TouchableOpacity>
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
                {/* 추가 알림 — 친구 신청. 푸시 발송은 서버(onNotificationCreated) 연동 후 동작 */}
                {/* 라운지(모집) 알림은 라운지 알림창 우상단 ⚙️에서 관리 ([[roundup-comments-policy]] §4 컨텍스트 분리 원칙).
                    여기엔 라운지 외 카테고리만 둠 — 중복·혼란 방지.
                    기록 리마인더는 폐기 — 라운딩 기록은 본인 자발적 추억이라 푸시 강요 부담.
                    홈 라운딩 종료 카드의 "기록 남기기 →" 버튼이 자연스러운 유도 경로 ([[softer-tone-guideline]]). */}
                {[
                  { key: 'friendRequest', icon: '🤝', label: '친구 신청', sub: '친구 신청을 받으면 알려드려요' },
                  { key: 'dm', icon: '💬', label: '메시지 (DM)', sub: '친구가 보낸 메시지를 알려드려요' },
                  // 라운딩 평가 요청 토글 제거 — 전체공개 비활성으로 매너 평가 시스템 휴면 ([[project_roundup_public_disabled]])
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
                {/* 중요 알림(신고·패널티 등)은 사용자 권리 보호를 위해 항상 발송 ([[notification-policy]] §72-74) */}
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGrayLight,
                  marginTop: 8, lineHeight: 16 }}>
                  신고 결과·패널티 적용 같은 중요 알림은 항상 발송돼요
                </Text>
              </View>
              <View style={myS.divider} />
              <View style={myS.section}>
                <Text style={myS.sectionLabel}>설정</Text>
                {[
                  // 닉네임 변경은 상단 프로필의 닉네임 옆 ✏️수정으로 이동(설정 중복 제거)
                  { icon: '🔔', label: '알림 설정', onPress: () => Linking.openSettings() },
                  { icon: '📷', label: '앱 권한 (사진·위치)', onPress: () => Linking.openSettings() },
                  { icon: '📅', label: '캘린더 연동', onPress: () => setCalPickerOpen(true) },
                  // 내 라운지 활동 — 매너·신뢰 등급, 패널티 이력, 진행 중 신고 통합 진입점 ([[my-roundup-activity]]).
                  //   전체공개 OFF 동안 메뉴 통째로 숨김 — 매너·신뢰는 낯선사람 신뢰용이라 친구 전용 모드에선 의미 약함 ([[roundup-public-disabled]]).
                  ...(ROUNDUP_PUBLIC_ENABLED ? [{ icon: '📋', label: '내 라운지 활동',
                    onPress: () => setRoundupActivityOpen(true) }] : []),
                  { icon: '👥', label: '친구 그룹 관리',
                    onPress: () => setGroupManageOpen(true) },
                  { icon: '🚫', label: '차단 관리', value: (userProfile.blockedUsers?.length || 0) + '명',
                    onPress: () => setBlockManageOpen(true) },
                  // 신고하기 — 라운지 등 다른 화면에서 직접 진입하지 않고 마이페이지로 일원화 ([[report-block-policy]] §5-1)
                  // Firestore reports 컬렉션 등록·이메일 발송·검토 결과 통보는 Phase 2 Cloud Functions
                  { icon: '🚨', label: '신고하기',
                    // 월 1건 한도. "1/1" 분수는 다 쓴 것처럼 헷갈려 "N건 남음"으로 명확히.
                    value: reportRemaining > 0 ? `이번 달 ${reportRemaining}건 남음` : '이번 달 한도 도달',
                    onPress: () => setReportOpen(true) },
                  ...(userProfile.kakaoLinked
                    ? [{ icon: '💛', label: '카카오 연동됨', value: '연결됨', onPress: () => {} }]
                    : [{ icon: '💛', label: '카카오 로그인 연동',
                        onPress: () => setAlertData({
                          title: '카카오 로그인 연동',
                          message: '카카오 로그인을 연동하면 닉네임 변경 주기가 30일 → 15일로 단축돼요.\n(연동 화면은 추후 추가될 예정)',
                          buttons: [{ text: '확인' }],
                        }) }]),
                  // 약관 및 정책 — 앱 내 본문 뷰어 + 외부 웹 옵션 (deargolf.app)
                  { icon: '📄', label: '이용약관',
                    onPress: () => setTermsViewer({
                      visible: true, title: '이용약관', body: TERMS_OF_SERVICE,
                      externalUrl: 'https://deargolf.app/legal#terms',
                    }) },
                  { icon: '🔒', label: '개인정보처리방침',
                    onPress: () => setTermsViewer({
                      visible: true, title: '개인정보처리방침', body: PRIVACY_POLICY,
                      externalUrl: 'https://deargolf.app/legal#privacy',
                    }) },
                  { icon: '📍', label: '위치기반서비스 약관',
                    onPress: () => setTermsViewer({
                      visible: true, title: '위치기반서비스 약관', body: LOCATION_BASED_SERVICE_TERMS,
                      externalUrl: 'https://deargolf.app/legal#location',
                    }) },
                  { icon: '🤝', label: '커뮤니티 가이드라인',
                    onPress: () => setTermsViewer({
                      visible: true, title: '커뮤니티 가이드라인', body: COMMUNITY_GUIDELINES,
                      externalUrl: 'https://deargolf.app/legal#community',
                    }) },
                  { icon: '⚖️', label: '자동 패널티 시스템 동의서',
                    onPress: () => setTermsViewer({
                      visible: true, title: '자동 패널티 시스템 동의서', body: PENALTY_CONSENT,
                      externalUrl: 'https://deargolf.app/legal#penalty',
                    }) },
                  // 자동 결정 이의·설명요구 — PIPA 제37조의2 (변호사 권고 B-9)
                  { icon: '🧭', label: '자동 결정 이의 신청',
                    onPress: () => setTermsViewer({
                      visible: true,
                      title: '자동 결정에 대한 이의·설명 요구',
                      body: `Dear Golf는 매너 평가·신고 이력 누적 등 자동화된 시스템을 통해 신뢰등급 산정 및 서비스 이용 제한(자동 패널티)을 결정합니다.

회원은 자신의 권리·의무에 중대한 영향을 미치는 자동화된 결정에 대하여 거부하거나 설명을 요구할 수 있습니다.

▷ 이메일: deargolf.official@gmail.com
▷ 요청 내용에 포함할 정보
  · 본인 닉네임 / 카카오 ID
  · 이의를 제기하는 결정 종류 (노쇼 확정 / 영구 정지 / 모집 박탈 등)
  · 사유 및 증빙
▷ 회사는 정당한 사유가 없는 한 인적 재검토 절차를 안내합니다.

근거: 개인정보 보호법 제37조의2.`,
                    }) },
                  // 위치정보 권리 행사 — 위치정보법 제24조 (변호사 권고 C-3)
                  { icon: '📡', label: '위치정보 권리 행사',
                    onPress: () => setTermsViewer({
                      visible: true,
                      title: '위치정보 권리 행사',
                      body: `이용자는 위치정보법 제24조에 따라 다음 권리를 행사할 수 있습니다.

1. 동의 철회 — 앱 설정에서 위치 권한 해제로 즉시 처리됩니다.
2. 일시 중지 — 이메일 요청 시 즉시 처리됩니다.
3. 이용·제공사실 확인자료 열람 — 위치정보를 어떤 외부 서비스(기상청·카카오·OpenWeather 등)에 보낸 이력을 확인할 수 있습니다.
4. 개인위치정보가 제3자에게 제공된 이유 및 내용 고지 요구.
5. 정보 정정 요구.

▷ 이메일: deargolf.official@gmail.com
▷ 회사는 접수 후 10일 이내에 처리합니다.

위치정보 이용·제공사실 확인자료는 6개월간 자동 기록·보존됩니다. (위치정보법 제16조 제2항)`,
                    }) },
                  // 개인정보 권리 행사 — PIPA 제35조. 마이페이지에서 직접 처리 가능한 권리·이메일 요청 권리 통합 안내
                  { icon: '🔐', label: '개인정보 권리 행사',
                    onPress: () => setTermsViewer({
                      visible: true,
                      title: '개인정보 권리 행사',
                      body: `개인정보 보호법 제35조에 따라 회원은 다음 권리를 행사할 수 있습니다.

1. 열람 권리
본인의 개인정보 처리 현황을 마이페이지에서 직접 확인할 수 있어요.

2. 정정·삭제 권리 (앱에서 직접 처리 가능)
- 닉네임·프로필 사진·골프 정보: 마이페이지에서 수정
- 라운딩 기록: MY 탭에서 직접 삭제
- 친구·차단 목록: 친구 탭 / 차단 관리에서 직접 관리

3. 처리 정지 권리 (이메일 요청)
특정 데이터의 처리를 잠시 정지하길 원하는 경우 deargolf.official@gmail.com으로 다음 정보와 함께 요청해주세요.
- 회원 닉네임
- 정지 요청 데이터 종류 (예: 라운딩 기록·매너 평가)
- 정지 사유 (선택)
접수 후 10일 이내 처리됩니다. (개인정보 보호법 시행령 제43조)

4. 데이터 다운로드 권리 (이메일 요청)
본인의 모든 데이터를 한 번에 받고 싶은 경우 위 이메일로 요청해주세요. 접수 후 10일 이내 처리됩니다.

5. 회원 탈퇴 (전체 삭제)
마이페이지 하단 [계정 탈퇴]에서 모든 데이터를 한 번에 완전 삭제할 수 있어요.

권리 행사를 거부당했다고 판단되는 경우 한국인터넷진흥원 개인정보침해센터(국번없이 118)에 신고하실 수 있습니다.`,
                      externalUrl: null,
                    }) },
                  // 사업자 정보 — 전자상거래법 의무 명시. 출시 전 사업자 등록 후 정보 채움.
                  { icon: '🏢', label: '사업자 정보',
                    onPress: () => setTermsViewer({
                      visible: true,
                      title: '사업자 정보',
                      body: `Dear Golf 사업자 정보\n\nDear Golf는 노닐는나무가 운영하는 서비스입니다.\n\n상호: 노닐는나무\n대표자: 황지현\n사업자등록번호: 102-36-64293\n주소: 경기도 고양시 일산동구 강송로41 윈스턴파크 704호\n고객센터: deargolf.official@gmail.com\n\n전자상거래등에서의 소비자보호에 관한 법률에 따라 사업자 정보를 명시합니다.\n\n분쟁 발생 시 안내:\n- 한국소비자원 (1372 소비자상담센터)\n- 전자거래분쟁조정위원회 (www.ecmc.or.kr)\n- 콘텐츠분쟁조정위원회 (www.kcdrc.kr)`,
                      externalUrl: null,
                    }) },
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
                {/* 전체공개 전역 비활성화 시엔 항상 친구 모집만이라 토글 숨김 ([[roundup-public-disabled]]) */}
                {ROUNDUP_PUBLIC_ENABLED && (() => {
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
      <FriendGroupManageModal visible={groupManageOpen} onClose={() => setGroupManageOpen(false)} />
      <ReportModal visible={reportOpen}
        onClose={() => { setReportOpen(false); getReportRemainingThisMonth().then(setReportRemaining); }} />
      <MyRoundupActivityScreen visible={roundupActivityOpen}
        onClose={() => setRoundupActivityOpen(false)} />
      <TermsViewerModal
        visible={termsViewer.visible}
        onClose={() => setTermsViewer(v => ({ ...v, visible: false }))}
        title={termsViewer.title}
        body={termsViewer.body}
        externalUrl={termsViewer.externalUrl}
      />
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
