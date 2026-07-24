import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StatusBar, View, Text, TouchableOpacity, ScrollView,
  Share, Modal, LayoutAnimation, Platform, UIManager, AppState, Animated, Easing, useWindowDimensions,
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'; // 확대 시 콘텐츠가 탭바 덮는 것 방지(하단 여백)
import * as Notifications from 'expo-notifications'; // DM 푸시 포그라운드 수신 → 안읽음 뱃지 즉시 갱신
import { Image as ExpoImage } from 'expo-image'; // 스토어 광고 카드 상품 사진(storeAds[].img)
import { loadStoreAds } from '../utils/storeConfig'; // 홈 캐러셀 광고 원격 로드(config/storeAds)
import { C, F, fs } from '../constants/colors';
import { ROUTES } from '../constants/routes';
import { COURSE_LOG, WEEKDAYS } from '../constants/data';
import { getUserCourses, syncUserCoursesFromFirestore } from '../utils/userCourses';
import { STORAGE_KEYS, storage } from '../utils/storage';
import { homeS, CARD_H, CARD_PAD, SIDE_PAD } from '../styles/homeS';
import { ModalBackContext } from '../hooks/useScreenBack'; // 크루 모달 내부 다단계 뒤로가기
import { UserContext } from '../contexts/UserContext';
import { SchedulesContext } from '../contexts/SchedulesContext';
import { DiariesContext } from '../contexts/DiariesContext';
import { HomeBgSlider, getCurrentWx } from './common/HomeBgSlider';
import { TripleStripe } from './common/TripleStripe';
import { Icon, WeatherGlyph, GreenFlag } from './common/Icon'; // 커스텀 라인 아이콘 — 이모지 대체(날짜 탭 캘린더 · 날씨 해 · 교통 자동차 · 당일 골프 깃발)
import { ScheduleSheetModal } from './ScheduleSheetModal';
import { RoundupTeamScreen } from './RoundupTeamScreen';
import { ShareMomentModal } from './ShareMomentModal';
import { ScheduleShareCard } from './ScheduleShareCard';   // 체크인 카드 전용(공유화면 없이 카드만) 뷰어용
import { AttentionMotion } from './common/AttentionMotion'; // 주목 유도 모션(맥동·nudge·부유) 공용 래퍼
import { ScheduleModal } from './ScheduleModal';
import { HomeIntroModal } from './HomeIntroModal';
import { ScheduleScreen } from './ScheduleScreen';
import { WeatherTransportPopup } from './WeatherTransportPopup';
import { HomeTooltip } from './HomeTooltip';
import { AlarmSetupModal, QuickMealPrompt } from './AlarmSetupModal';
import { scheduleRoundAlarms, getAlarmTypes, getAlarmConfig, applyDefaultAlarms, computeRoundTimeline } from '../utils/notifications';
import { getTopComment } from '../utils/courseComments';
import { isRoundDiary } from '../utils/diaryKind';
import { loadFriendData } from '../utils/friendGroups';
import { DMListScreen } from './DMListScreen';
import { DMChatScreen } from './DMChatScreen';
import { CrewListScreen } from './CrewListScreen'; // 크루(친구 소수그룹 공유앨범) — DM 형제 진입(docs/crew-space-design.md)
import { subscribeCrewInvites, subscribeMyCrews } from '../utils/crews';
import { loadUnreadTotal } from '../utils/dm';
import { useCurrentUid } from '../contexts/CurrentUidContext';
import { loadMyFriendsEnriched, loadMyFriends } from '../utils/friends';
import { shareScheduleToFriends, getScheduleGroup, notifyScheduleGroupMembers, leaveScheduleGroup, syncGroupContentByMember, pendingContentChange, isSyncingGroup, memoChangePreview } from '../utils/scheduleShares';
import { WEB_BASE } from '../utils/links';                 // 일정 공유 평문에 붙일 앱 랜딩/설치 링크
import { getScheduleWxSummary, getScheduleDriveMin } from '../utils/scheduleWx'; // 공유 카드 날씨 주입 + D-0 카드 우측 날씨·교통
import { formatDriveMin } from '../utils/directions'; // 교통 소요 '시간 분' 표시 — 카드·팝업 공용
import { loadRoundup } from '../utils/roundup';            // 고아 정리 — 모집 상태 직접 조회
import { loadMyNotifications, visibleNotifications } from '../utils/roundupNotifications'; // 홈 종 뱃지 — 라운지 알림함과 같은 필터
import { ROUNDUP_PUBLIC_ENABLED } from '../constants/roundup';
import { deleteMeal, leaveMealAudience } from '../utils/mealSuggestions';     // 고아 정리 + 일정 이탈 시 식사 audience 이탈
import { FriendSelectModal } from './FriendSelectModal';
import { ScheduleInviteInbox } from './ScheduleInviteInbox';
import { RoundupInviteInbox } from './RoundupInviteInbox';
import { ScoreShareInbox } from './ScoreShareInbox';   // 동반자 스코어 공유 수신 — 기록화면에서 홈으로 이동(안 쓰는 유저도 홈에서 바로 인지, 2026-07-23)
import { FriendBadgeContext } from '../contexts/FriendBadgeContext';
import { MealDecisionBar } from './MealDecisionBar';
import { showAppAlert } from './AppAlert';
import { showToast } from './AppToast'; // 순수 성공 알림('초대를 보냈어요')은 차단형 대신 토스트로

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// 우측 버튼 레일(메시지·크루 2개) — 절대좌표 top = RAIL_TOP + RAIL_STEP*n (간격 균일).
//   쇼핑·예약 등 커머스·유틸은 이 레일이 아니라 별도 가로 액션줄로 분리 예정([[home-shopping-reservation-buttons]]).
//   안드는 상태바와 안 붙게, iOS는 공간 여유라 더 내리고 버튼·간격을 크게. 한 곳만 고치면 둘이 같이 움직임.
const _railAnd = Platform.OS === 'android';
const RAIL_TOP = _railAnd ? 28 : 38;
const RAIL_STEP = _railAnd ? 80 : 88;
const RAIL_BTN = _railAnd ? 44 : 50;     // 버튼 원 지름
const RAIL_ICON = _railAnd ? 26 : 30;    // 크루 라인 아이콘
const RAIL_SEND = _railAnd ? 28 : 32;    // 메시지 종이비행기(살짝 큼)

// 디어골프 스토어(네이버 스마트스토어) — 이용안내 띠가 1회성이 되며 빈 인사말 아래 슬롯에 노출.
//   버튼은 상시 노출하되 STORE_URL이 비어있는 동안은 탭 시 '준비 중' 토스트(사용자 2026-07-03 — 디자인 보며 다듬는 중).
//   ★스마트스토어 심사 승인 나면 실제 주소만 넣으면 연결됨(2026-07-03 통신판매업 신고·심사 접수).
//   법무 결론([[home-shopping-reservation-buttons]]): 외부 브라우저로 열기(Linking) OK, 네이버 로고 미사용(우리 스타일 버튼).
const STORE_URL = ''; // 심사 승인 후 실제 스토어 주소 입력 (예: https://smartstore.naver.com/deargolf)
// 홈 하단(한줄메모/골퍼코멘트) 캐러셀 상품 광고 — Firestore `config/storeAds`에서 원격 로드(loadStoreAds).
//   콘솔에서 문서만 고치면 앱 업데이트 없이 광고 게시·교체·내림. 비어 있으면 캐러셀은 기존과 100% 동일.
//   광고 형식: { tag: '라운딩 준비물', title: '쿨토시 · 여름 필드 필수템', img: '이미지URL(풀블리드, 선택)', url: '상품URL(비면 STORE_URL)' }

// 홈 카드 표시용 구장명 축약 — 긴 이름(9자↑)만 끝의 유형어(골프앤스파리조트·컨트리클럽·CC 등)를 떼서
//   adjustsFontSizeToFit로 글씨가 너무 작아지는 것 방지(예 '유니아일랜드 골프앤스파리조트'→'유니아일랜드').
//   짧은 이름은 원문 유지(남촌CC 등 익숙한 표기 보존). 매칭용 normalizeCourseName(top100)과 별개 — 표시 전용.
//   ★'클럽'·'골프' 단독은 안 뗌 — 오너스클럽·골프존카운티류 브랜드명 오절단 방지.
//   ★떼다 3자 미만이 되면 직전에서 멈춤(예 'O2리조트 골프장'→'O2리조트', 'O2'까지 안 감).
//   ★끝을 다 떼고도 9자↑면 중간의 공백 분리 유형어도 뗌(예 '소노펠리체 컨트리클럽 비발디파크 웨스트'→'소노펠리체 비발디파크 웨스트').
const COURSE_TYPE_SUFFIX = /(?:\s|·)*(?:골프\s*[&앤]?\s*스파\s*리조트|골프\s*[&앤]?\s*리조트|골프\s*앤\s*스파|골프\s*클럽|골프\s*링크스|컨트리\s*클럽|골프장|리조트|c\.?c\.?|g\.?c\.?)\s*$/i;
const COURSE_TYPE_MID = /(^|\s)(?:골프[&앤]?스파리조트|골프[&앤]?리조트|골프클럽|골프\s클럽|골프장|컨트리클럽|컨트리\s클럽)(?=\s)/gi;
function displayCourseName(name) {
  const full = String(name || '').trim();
  if (full.length < 9) return full;
  let s = full;
  while (COURSE_TYPE_SUFFIX.test(s)) {
    const next = s.replace(COURSE_TYPE_SUFFIX, '').trim();
    if (next.length < 3) break;
    s = next;
  }
  if (s.length >= 9) s = s.replace(COURSE_TYPE_MID, '$1').replace(/\s+/g, ' ').trim();
  return s.length >= 3 ? s : full;
}

export function HomeScreen({ navigation, route }) {
  const { userProfile } = React.useContext(UserContext);
  const { refreshRoundupHidden } = React.useContext(FriendBadgeContext); // 라운지 초대 가리기 재로드(focus 시)
  const [roundupInviteActive, setRoundupInviteActive] = React.useState(false); // 라운지 초대 배너 표시 중 여부(아래 카드 겹침 방지)
  const [scoreShareActive, setScoreShareActive] = React.useState(false); // 스코어 공유 배너 표시 중 여부 — 초대 배너와 동일하게 아래 한줄메모 숨김(2026-07-23)
  const { schedules, hydrated, loadFailed, addSchedule, editSchedule, removeSchedule } = React.useContext(SchedulesContext);
  const currentUid = useCurrentUid();   // 일정 전파 초대 발신자 uid ([[uid-stabilization-plan]])
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();   // 확대 시 콘텐츠가 탭바 영역을 덮어 안드 탭바가 무반응이던 것 — 콘텐츠 하단에 탭바 높이만큼 여백(2026-06-24)
  const [showAddModal, setShowAddModal] = useState(false);
  const [userCoursesList, setUserCoursesList] = useState([]);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  // 동반자 별명(customName) 해석용 owner-only 메타 — 일정 시트에서 별명 표시 ([[friend_groups]])
  const [friendMeta, setFriendMeta] = useState({});
  useEffect(() => { loadFriendData().then(fd => setFriendMeta(fd.friendMeta || {})).catch(() => {}); }, []);
  // 빈 상태 '친구 추가' CTA 노출 판별 — 진짜 친구 수(accepted)로만. friendMeta는 별명·그룹 지정분만이라 0명 판별엔 부정확.
  //   null=미확정(로드 전엔 CTA 숨겨 깜빡임 방지), false=친구 0명일 때만 보조 CTA 노출.
  const [hasFriends, setHasFriends] = useState(null);
  useEffect(() => { loadMyFriends().then(fs => setHasFriends(fs.length > 0)).catch(() => {}); }, []);
  const [showHomeIntro, setShowHomeIntro] = useState(false);   // Dear Golf 이용 안내 모달
  const [homeIntroSeen, setHomeIntroSeen] = useState(true);    // 초기 true(뱃지 X), AsyncStorage 로드 후 갱신
  const [showWeatherFull, setShowWeatherFull] = useState(false);
  const [showTrafficFull, setShowTrafficFull] = useState(false);
  const [showWeatherPopup, setShowWeatherPopup] = useState(false);
  const [showScheduleScreen, setShowScheduleScreen] = useState(false); // 일정(캘린더) 풀스크린
  const [editScheduleTarget, setEditScheduleTarget] = useState(null);
  const [pendingScheduleChange, setPendingScheduleChange] = useState(null); // 전파 일정 변경 반영 대기 1건 { schedule, pc } — 홈 상단 맥동 배너
  const [groupSharedCounts, setGroupSharedCounts] = useState({});
  // 친구 일정에 초대(일정 전파) — 대상 일정 + 친구목록 + 모달 ([[schedule-propagation-spec]])
  const [inviteTarget, setInviteTarget] = useState(null);
  const [inviteFriends, setInviteFriends] = useState([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteMax, setInviteMax] = useState(7);   // 단체 정원(8) 내 이번에 더 고를 수 있는 친구 수(8 − 이미 합류·초대된 인원)
  const [teamScheduleRid, setTeamScheduleRid] = useState(null);     // 단체팀 화면 대상 roundupId(시트→단체팀)
  const [sheetMealSchedule, setSheetMealSchedule] = useState(null); // 일정 시트 '함께 식사' 대상(triggerless) — 세컨 카드 등 next 아닌 일정용
  const [sheetMealAutoOpen, setSheetMealAutoOpen] = useState(false);
  const [cardSlide, setCardSlide] = useState(0);
  const [storeAds, setStoreAds] = useState([]); // 홈 캐러셀 스토어 광고 — 원격(config/storeAds), 빈 배열=미노출
  useEffect(() => {
    let alive = true;
    loadStoreAds().then((ads) => { if (alive) setStoreAds(ads); });
    return () => { alive = false; };
  }, []);
  const [now, setNow] = useState(Date.now());
  // 다이어리는 DiariesContext에서 받음 (Firestore 단일 소스)
  //   loadFailed·hydrated도 받아 빈 상태 판정에 반영 — 기록 로드 실패를 '기록 없음'으로 위장하지 않게([[read-failure-disguise]]).
  const { diaries, reloadDiaries, loadFailed: diariesLoadFailed, hydrated: diariesHydrated } = React.useContext(DiariesContext);
  const [showTooltip, setShowTooltip] = useState(false);
  const [pendingAlarmSchedule, setPendingAlarmSchedule] = useState(null);
  const [pendingQuickAlarm, setPendingQuickAlarm] = useState(null); // '이대로 자동' 모드 — 식사시각만 묻는 가벼운 프롬프트
  const [alarmEditExisting, setAlarmEditExisting] = useState(null); // 일정 시트에서 알람 변경 시 기존 설정 프리필
  const [dismissedCards, setDismissedCards] = useState({}); // 홈 종료 카드 나가기 — {scheduleId: true} (홈에서만 숨김)
  useEffect(() => { storage.load(STORAGE_KEYS.dismissedRoundCards, {}).then(setDismissedCards); }, []);
  // 종료 카드 나가기 — 홈에서만 숨김(기록 여부 무관). 일정·내코스모아보기는 그대로.
  const handleDismissCard = (s) => {
    if (!s?.id) return;
    setDismissedCards(prev => {
      const next = { ...prev, [s.id]: true };
      storage.save(STORAGE_KEYS.dismissedRoundCards, next);
      return next;
    });
  };
  const [homeTopComment, setHomeTopComment] = useState(null);
  const [wxEmoji, setWxEmoji] = useState('☀️'); // 헤더 현재 날씨 이모지

  // DM(메시지) — 진입점을 홈 우상단 💬로 일원화(테스터 '친구 탭은 불편' 피드백, 2026-06-17. 옛 친구 탭 💬 제거).
  //   단일 Modal서 목록↔대화방 전환([[dm-design]]). 안읽음 N 뱃지는 열고/닫을 때 1회 로드(상시구독 X, 비용 절약).
  const [dmOpen, setDmOpen] = useState(false);
  const [dmChat, setDmChat] = useState(null);   // { uid, name, avatar } 선택 시 대화방
  const [crewOpen, setCrewOpen] = useState(false); // 크루(친구 소수그룹 공유앨범) — DM 아래 형제 진입
  const crewBack = useRef(null);   // 크루 모달 내부 가장 깊은 화면의 백 핸들러(다단계 뒤로가기)
  const [crewDmChat, setCrewDmChat] = useState(null); // 크루에서 연 DM { uid, name, avatar } — 닫으면 크루로 복귀(DM 목록 안 거침)
  // ★크루→DM 지연 마운트 — 홈의 DM은 이미 열린 Modal 안에서 목록↔대화방만 바꾸지만, 크루 DM은
  //   Modal 슬라이드와 DMChatScreen 마운트(SafeAreaProvider+KeyboardProvider+FlatList+구독 여럿)가
  //   동시에 일어나 안드에서 화면이 덜컥거리며 튄다. 다크 배경만 먼저 슬라이드시키고 본문은 그 뒤에 채운다
  //   ([[rn-modal-android-jank]]·[[rn-list-perf-patterns]] 진입 지연마운트 처방).
  const [crewDmReady, setCrewDmReady] = useState(false);
  useEffect(() => {
    if (!crewDmChat) { setCrewDmReady(false); return; }
    const t = setTimeout(() => setCrewDmReady(true), Platform.OS === 'android' ? 240 : 60);
    return () => clearTimeout(t);
  }, [!!crewDmChat]);
  const [crewReturnId, setCrewReturnId] = useState(null); // 라운지서 모집 닫고 복귀할 크루 id — CrewListScreen이 그 앨범 다시 열게
  const [crewModalAnim, setCrewModalAnim] = useState('slide'); // 크루 모달 등장 애니 — 복귀 땐 안드만 'fade'(슬라이드 펼쳐짐 대신 은은하게 떠오름, 무거운 마운트와 경합 줄임)
  // 크루서 연 모집을 라운지서 닫고 돌아오면(RoundupTab가 reopenCrew 실어 navigate) 크루 모달을 다시 연다 —
  //   크루는 홈 아이콘이라 복귀 동선이 길던 것 단축. 모달 숨김 시 openCrew(앨범)가 날아가므로 crewReturnId로 그 앨범 복원.
  //   ★복귀 크루 id는 '복귀 시점'에 여기서 세팅 — 카드 탭 때 미리 세팅하면 소비 effect가 모달 닫힘과 경합해 들쭉날쭉(목록/앨범).
  useEffect(() => {
    if (route?.params?.reopenCrew) {
      setCrewReturnId(route?.params?.reopenCrewId || null);
      setCrewModalAnim(Platform.OS === 'android' ? 'fade' : 'slide');
      setCrewOpen(true);
      navigation?.setParams?.({ reopenCrew: undefined, reopenCrewId: undefined });
    }
  }, [route?.params?.reopenCrew]); // eslint-disable-line react-hooks/exhaustive-deps
  const [dmUnread, setDmUnread] = useState(0);
  // DM 안읽음 있을 때 버튼 '전체'가 진동하듯 좌우로 떨림(2초마다 1회 buzz). 원은 회전대칭이라 rotate면 숫자만 도는 것처럼
  //   보여 translateX로 떨어야 동그라미 전체가 흔들림. 사용자 요청 2026-06-18.
  const dmShake = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!(dmUnread > 0)) { dmShake.setValue(0); return; }
    const buzz = (v) => Animated.timing(dmShake, { toValue: v, duration: 45, useNativeDriver: true });
    const loop = Animated.loop(Animated.sequence([
      buzz(1), buzz(-1), buzz(1), buzz(-1), buzz(1), buzz(-1), buzz(0),
      Animated.delay(2000),
    ]));
    loop.start();
    return () => { loop.stop(); dmShake.setValue(0); };
  }, [dmUnread]);
  const dmShift = dmShake.interpolate({ inputRange: [-1, 1], outputRange: [-4, 4] });
  // 안읽음 0(idle)일 때 DM 버튼이 너무 밋밋(그냥 표식)해 은은하게 숨쉬듯 맥동(호흡 스케일)만.
  //   안읽음(>0) 생기면 진동(buzz)에 양보 — 루프 정지 + 값 0(스케일1)이라 두 애니가 겹치지 않음.
  const dmBreathe = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (dmUnread > 0) { dmBreathe.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(dmBreathe, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(dmBreathe, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => { loop.stop(); dmBreathe.setValue(0); };
  }, [dmUnread]);
  // 맥동을 scale→opacity로 — iOS는 얇은 테두리(1.5·1.2px) 원을 scale하면 매 프레임 테두리를 재샘플링해
  //   가장자리가 찌글거림(native driver로도 못 막음, 사용자 2026-06-20). 기하학 변형 없는 opacity 브리드로 대체.
  const dmIdleOpacity = dmBreathe.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45] });
  useEffect(() => { if (!dmOpen) loadUnreadTotal(userProfile?.blockedUsers).then(setDmUnread).catch(() => {}); }, [dmOpen]);
  // 미확인 알림 수 — 홈 우측 레일 3번(크루 아래) 종 아이콘. 0이면 아이콘 자체를 숨긴다(사용자 2026-07-21).
  //   라운지 알림함이 읽음의 진짜 소스라 같은 쿼리·같은 필터(visibleNotifications)를 쓴다. 상시 구독 대신
  //   마운트·홈 복귀·푸시 수신 때만 1회 조회 — DM 뱃지와 동일한 비용 원칙([[lounge-realtime]]).
  //   실패는 조용히 무시(뱃지는 부가정보 — 홈 본문을 막지 않음). 안 뜨면 라운지 종에서 여전히 확인 가능.
  const [notiUnread, setNotiUnread] = useState(0);
  const refreshNotiUnread = useCallback(() => {
    loadMyNotifications(50)
      .then(list => setNotiUnread(visibleNotifications(list, ROUNDUP_PUBLIC_ENABLED).filter(n => !n.read).length))
      .catch(() => {});
  }, []);
  // 크루 — 초대 왔을 때만 강하게 끌어줌(라디오 핑 글로우 + 버건디 배지). DM 호흡보다 확실히 강함.
  //   ★얇은 테두리 원을 scale하면 iOS 찌글거림 → 글로우는 '채운 원'을 scale(테두리X)이라 안전.
  const [crewInvite, setCrewInvite] = useState(0); // 받은 크루 초대 수(audienceUids array-contains me) — 글로우 트리거
  // 초대 있을 때만 라디오 핑 글로우 — ★'채운 원'(테두리 없음)을 scale → iOS 찌글거림 없음(얇은 테두리 원만 문제).
  const crewPulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!(crewInvite > 0)) { crewPulse.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(crewPulse, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.delay(250),
    ]));
    loop.start();
    return () => { loop.stop(); crewPulse.setValue(0); };
  }, [crewInvite]);
  const crewHaloScale = crewPulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.7] });
  const crewHaloOpacity = crewPulse.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 0.5, 0] });
  // 받은 크루 초대 실시간 구독 → 글로우 on/off (수락·거절 시 자동 꺼짐)
  useEffect(() => {
    if (!currentUid) { setCrewInvite(0); return; }
    return subscribeCrewInvites(currentUid, (list) => setCrewInvite((list || []).length));
  }, [currentUid]);

  // 크루 새 글 점 — 안 음소거 + postCount>본 글수 + 내 글 아닌 크루가 하나라도 있으면 홈 크루 아이콘에 조용한 점.
  //   목록 '새 글 N' 배지와 동일 기준(글만; 댓글 디테일은 목록에). 점은 크루 열면 사라짐(crewSeen↑). ([[crew-new-signal]])
  const [crewDocs, setCrewDocs] = useState([]);        // 내 크루(실시간) — postCount·lastPostBy
  const [crewSeenMap, setCrewSeenMap] = useState({});  // {crewId: 마지막 본 글수} 로컬
  const [crewSeenLoaded, setCrewSeenLoaded] = useState(false); // crewSeen 로드 완료 — baseline 레이스 가드(로드 전 {}일 때 baseline 돌면 실제 seen을 덮어씀)
  const [crewMutedMap, setCrewMutedMap] = useState({}); // {crewId: true} 음소거 로컬
  useEffect(() => {
    if (!currentUid) { setCrewDocs([]); return; }
    return subscribeMyCrews(currentUid, (list) => setCrewDocs(Array.isArray(list) ? list : []));
  }, [currentUid]);
  const reloadCrewSignals = useCallback(async () => {
    try {
      const [seen, muted] = await Promise.all([
        storage.load(STORAGE_KEYS.crewSeen, {}),
        storage.load(STORAGE_KEYS.crewMuted, {}),
      ]);
      setCrewSeenMap(seen || {}); setCrewMutedMap(muted || {}); setCrewSeenLoaded(true);
    } catch (e) { if (__DEV__) console.warn('[home] crew signals load', e?.message); }
  }, []);
  useEffect(() => { reloadCrewSignals(); }, [reloadCrewSignals]);   // 마운트
  // 크루 모달 닫힐 때 재로드 — 안에서 글 봤거나(seen↑) 음소거했을 수 있어 점 즉시 정합
  useEffect(() => { if (!crewOpen) reloadCrewSignals(); }, [crewOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  // 첫 설치·재설치·새 크루 가입 시 NEW 도배 방지 — crewSeen에 기록 없는 크루는 '지금 글 수'를 본 것으로 baseline.
  //   앱 삭제 시 allowBackup:false로 로컬 읽음기록이 초기화돼 전부 NEW로 뜨던 것 억제(친구 피드 baseline과 동일 발상, [[crew-new-signal]]).
  //   ★seen 로드 완료 후에만 — 로드 전 {}일 때 돌면 실제 본 글수를 postCount로 덮어써 NEW가 영영 안 뜸.
  useEffect(() => {
    if (!crewSeenLoaded || !crewDocs.length) return;
    setCrewSeenMap(prev => {
      let changed = false; const next = { ...prev };
      crewDocs.forEach(c => { if (c?.id && next[c.id] === undefined) { next[c.id] = c.postCount || 0; changed = true; } });
      if (changed) storage.save(STORAGE_KEYS.crewSeen, next);
      return changed ? next : prev;
    });
  }, [crewDocs, crewSeenLoaded]);
  // 안 음소거 크루에 안 본 새 글이 있으면 원을 채우고 'NEW' 표시(DM 안읽음과 같은 맥락, 단 정확 카운트는
  //   음소거·seen 추적 때문에 못 믿어 이진 NEW로). 초대 글로우 땐 양보(초대 우선).
  //   seen 가드 + lastPostBy===me 억제는 CrewListScreen '새 글 N' 산식과 동일(목록↔홈 어긋남 방지).
  const crewHasNew = crewInvite === 0 && crewDocs.some(c => {
    if (!c || crewMutedMap[c.id]) return false;
    if (c.lastPostBy && c.lastPostBy === currentUid) return false;
    const raw = crewSeenMap[c.id];
    if (raw === undefined) return false; // 첫 관측(재설치·새 가입)=도배 방지(baseline effect가 '본 것'으로 저장 전까지)
    const seen = (typeof raw === 'number' && raw >= 0 && raw < 1e6) ? raw : 0;
    return (c.postCount || 0) > seen;
  });
  // 새 글 있으면 크루 버튼이 은은하게 숨쉬듯 맥동(주목 — 초대 글로우보다 약하게). 없으면/음소거면 정지.
  const crewNewPulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!crewHasNew) { crewNewPulse.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(crewNewPulse, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(crewNewPulse, { toValue: 0, duration: 850, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [crewHasNew]); // eslint-disable-line react-hooks/exhaustive-deps
  const crewNewScale = crewNewPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] });
  // 홈 탭 복귀(focus) 시 안읽음 카운트 재조회 — 마운트·DM모달 닫힘에만 갱신하면, 푸시로 다른 탭에서 DM을 읽었을 때
  //   홈의 dmUnread가 옛 값(>0)으로 남아 안읽음 없는데도 버튼이 흔들리던 버그 방지(+자리 비운 새 DM도 반영). 2026-06-18.
  useEffect(() => {
    if (!navigation?.addListener) return;
    const unsub = navigation.addListener('focus', () => {
      if (!dmOpen) loadUnreadTotal(userProfile?.blockedUsers).then(setDmUnread).catch(() => {});
      refreshNotiUnread();   // 라운지에서 읽고 홈으로 돌아오면 종이 사라져야 함
    });
    return unsub;
  }, [navigation, dmOpen, refreshNotiUnread]);
  // 알림 뱃지 최초 로드 + 앱 복귀(다른 앱 갔다 옴) 시 갱신. 홈 탭 전환은 위 focus가 담당.
  useEffect(() => {
    refreshNotiUnread();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refreshNotiUnread(); });
    return () => sub.remove();
  }, [refreshNotiUnread]);
  // DM 푸시를 포그라운드(앱 켜둔 상태)에서 받으면 안읽음 뱃지 즉시 갱신 — 상시 onSnapshot 없이 '받은 사람만, 받은 만큼'만 1회 조회([[lounge-realtime]] 비용 원칙).
  //   CF가 unread를 +1 한 뒤 푸시를 보내므로 이 시점엔 카운트가 이미 맞음. DM 모달 열려있으면(대화 보는 중) 생략 — 닫을 때 위 effect가 갱신. 2026-06-18.
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((noti) => {
      // DM 외 종류는 라운지 알림함 뱃지 갱신 — 앱 켜둔 채 푸시를 받으면 홈 종이 바로 뜬다.
      if (noti?.request?.content?.data?.type !== 'dm') { refreshNotiUnread(); return; }
      if (!dmOpen) loadUnreadTotal(userProfile?.blockedUsers).then(setDmUnread).catch(() => {});
    });
    return () => sub.remove();
  }, [dmOpen, refreshNotiUnread]);
  const cardsScrollRef = useRef(null);

  // 다이어리 추가 모달이 일정 모달에서 진입한 경우 → 닫을 때 일정 모달 자동 재오픈
  // ([[modal-navigation-pattern]] navigation 복귀 패턴, [[home-multi-schedule-same-day]])
  useEffect(() => {
    if (route?.params?.openSchedule) {
      setShowScheduleScreen(true);
      navigation.setParams({ openSchedule: undefined });
    }
  }, [route?.params?.openSchedule]);

  // 코스에서 '일정으로 복귀' / 푸시 탭 → 해당 일정 시트 자동 오픈.
  //   콜드스타트 시 schedules가 아직 빈 배열일 수 있어, hydrated 후 재시도.
  const [pendingSheetId, setPendingSheetId] = useState(null);
  const sheetIdOnMountRef = useRef(route?.params?.openScheduleSheetId);
  useEffect(() => {
    const sid = route?.params?.openScheduleSheetId;
    if (!sid) return;
    navigation.setParams({ openScheduleSheetId: undefined });
    if (sheetIdOnMountRef.current === sid) { sheetIdOnMountRef.current = null; return; }
    setPendingSheetId(sid);
  }, [route?.params?.openScheduleSheetId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!pendingSheetId || !hydrated) return;
    const s = (schedules || []).find((x) => x.id === pendingSheetId || x.groupId === pendingSheetId);
    if (s) { openScheduleSheet(s); setPendingSheetId(null); }
  }, [pendingSheetId, hydrated, schedules]); // eslint-disable-line react-hooks/exhaustive-deps

  // 뒤풀이 푸시 탭 → 홈 착지 + 뒤풀이 시트 자동 오픈(푸시→길찾기 한 동선). MealDecisionBar에 autoOpen 신호 전달.
  const [autoOpenMeal, setAutoOpenMeal] = useState(false);
  // ★콜드스타트 시 schedules가 아직 빈 배열이라, 바로 처리하면 대상 일정을 못 찾고 파라미터만 소비돼 유실됐다
  //   (ios에서 푸시 탭해도 원래 페이지에 떨어지고, 앱 재시작을 두어 번 해야 열리던 버그 — 사용자 2026-07-24).
  //   openScheduleSheetId(위)와 동일하게 pending으로 잡아두고 hydrated 후에 처리한다.
  const [pendingMeal, setPendingMeal] = useState(null);
  useEffect(() => {
    const om = route?.params?.openMeal;
    if (!om) return;
    navigation.setParams({ openMeal: undefined });   // 파라미터는 즉시 비우되, 값은 pending에 보존
    setPendingMeal(om);
  }, [route?.params?.openMeal]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!pendingMeal || !hydrated) return;            // 일정 로드 전엔 대기 → hydrated/schedules 바뀌면 재실행
    const om = pendingMeal;
    setPendingMeal(null);
    // 푸시가 mealId(meal_{key}[_2])를 실어 대상 식사를 특정한다. key=groupId|roundupId|schedule.id.
    //   ★홈 '다음 라운드'가 아닌 다른 일정의 식사면 그 일정의 식사 시트를 직접 연다 —
    //     예전엔 mealId를 버리고 항상 next의 홈 식사바만 열어 엉뚱한 라운드 식사가 열렸음(2026-07 푸시라우팅 감사).
    let targetSched = null;
    if (typeof om === 'string') {
      const key = om.replace(/^meal_/, '').replace(/_2$/, '');
      targetSched = (schedules || []).find(s => (s.groupId || s.roundupId || s.id) === key) || null;
    }
    if (targetSched && targetSched.id !== next?.id) {
      setSheetMealSchedule(targetSched);   // triggerless 식사 시트(임의 일정용) 재사용
      setSheetMealAutoOpen(true);
    } else {
      setAutoOpenMeal(true);   // 다음 라운드 = 홈 카드 식사바 (대상 못 찾으면 best-effort 폴백)
    }
  }, [pendingMeal, hydrated, schedules]); // eslint-disable-line react-hooks/exhaustive-deps

  // 크루 초대 푸시 탭 → 홈 착지 + 크루 화면 자동 오픈
  useEffect(() => {
    if (route?.params?.openCrew) {
      setCrewReturnId(null);   // 푸시로 여는 건 목록부터 — 남아있던 복귀 id로 엉뚱한 앨범 열리지 않게
      setCrewModalAnim('slide');
      setCrewOpen(true);
      navigation.setParams({ openCrew: undefined });
    }
  }, [route?.params?.openCrew]);

  // 1분마다 현재 시각 갱신 — 라운딩 종료(티오프+4h)/자정 전환 감지
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  // 헤더 날씨 이모지 — 날씨 상세탭과 동일한 소스(forecast.current.icon)를 공유 캐시로 받아 표시.
  // 앱 복귀(배경 톤과 동일 시점)·날씨 팝업 닫힘 때 갱신해 둘이 어긋나지 않게 한다.
  const refreshWxEmojiRef = useRef(() => {});
  useEffect(() => {
    let cancelled = false;
    const run = () => getCurrentWx().then(({ icon }) => { if (!cancelled) setWxEmoji(icon || '☀️'); });
    refreshWxEmojiRef.current = run;
    run();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') run(); });
    return () => { cancelled = true; sub.remove(); };
  }, []);

  // 홈 첫 진입 안내 툴팁 — 최초 1회만
  useEffect(() => {
    storage.load(STORAGE_KEYS.homeTooltipDone, false).then(done => {
      if (!done) setShowTooltip(true);
    });
  }, []);

  // Dear Golf 이용 안내 모달 — 미열람 시 헤더에 빨간 점 뱃지로 호기심 유도
  useEffect(() => {
    storage.load(STORAGE_KEYS.homeIntroSeen, false).then(seen => setHomeIntroSeen(!!seen));
  }, []);

  const openHomeIntro = () => {
    setShowHomeIntro(true);
    if (!homeIntroSeen) {
      setHomeIntroSeen(true);
      storage.save(STORAGE_KEYS.homeIntroSeen, true);
    }
  };

  useEffect(() => {
    if (!navigation) return;
    const unsubscribe = navigation.addListener('tabPress', () => {
      // 이미 홈에 있는 상태로 홈 탭 재탭 시 — focus는 안 뜨므로 여기서 D-day 카드를 첫 장(메인카드)으로 되돌림.
      //   (다른 탭→홈은 focus 핸들러가 처리. tabPress는 두 경우 다 발동하지만 x:0 중복은 무해)
      cardsScrollRef.current?.scrollTo({ x: 0, animated: true });
      setShowAddModal(false);
      setShowScheduleModal(false);
      setShowWeatherFull(false);
      setShowTrafficFull(false);
      setShowWeatherPopup(false);
      setEditScheduleTarget(null);
      setSelectedSchedule(null);
      setPendingAlarmSchedule(null);
      setShowScheduleScreen(false);
    });
    return unsubscribe;
  }, [navigation]);

  // 다른 탭에서 홈으로 돌아오면 D-day 카드 스크롤을 첫번째(메인카드)로 초기화
  useEffect(() => {
    if (!navigation) return;
    const unsubscribe = navigation.addListener('focus', () => {
      cardsScrollRef.current?.scrollTo({ x: 0, animated: false });
      // userCourses 최신화 — 코스명→id 매칭(resolveCourseLogId)이 최신 목록을 쓰도록
      getUserCourses().then(list => setUserCoursesList(list || []));
      // 라운지에서 친구지정 초대를 거절(로컬 가리기)했을 수 있으니 가리기 재로드 → 홈 배너·탭 뱃지 즉시 정합 ([[roundup-invitation]])
      refreshRoundupHidden();
      // 친구 데이터 최신화 — 친구 탭에서 수락·별명 변경 후 홈 복귀 시 stale 방지(빈 'CTA'·동반자 별명 옛값). 마운트 1회만 로드하던 것 보강(2026-06-26 감사)
      loadFriendData().then(fd => setFriendMeta(fd.friendMeta || {})).catch(() => {});
      loadMyFriends().then(fs => setHasFriends(fs.length > 0)).catch(() => {});
      // 다이어리는 DiariesContext가 단일 소스 — 별도 로드 불필요 (Firestore 동기화는 Context가 담당)
    });
    return unsubscribe;
  }, [navigation]);

  // 전파(공유) 일정 변경 반영 — 다른 멤버(전원 동등)가 시간·인원·예약자·세부코스를 바꾸면 그룹 내용이 내 일정과 달라짐.
  //   홈 상단에 '맥동 배너'로 띄움(초대처럼 눈에 띄게 — 중요) → '반영'이면 내 일정 적용, '나중에'면 같은 변경은 다시 안 띄움(새 변경이면 다시).
  //   한 번에 하나(처리하면 다음 것). 구장·날짜는 잠금이라 여기 안 옴(삭제+재생성 전용). ([[schedule-propagation-spec]])
  const autoAppliedRef = useRef(new Set()); // 이미 자동반영한 'groupId:sig' — schedules 갱신 레이스 중 중복 반영/알람 방지
  const checkSharedScheduleUpdates = useCallback(async () => {
    if (!currentUid) { setPendingScheduleChange(prev => (prev?.applied ? prev : null)); return; }
    const mine = (schedules || []).filter(s => s.groupId && !s.roundupId);
    if (!mine.length) { setPendingScheduleChange(prev => (prev?.applied ? prev : null)); return; }
    let firstApplied = null;
    for (const s of mine) {
      if (isSyncingGroup(s.groupId)) continue;   // 내가 방금 이 그룹에 쓰는 중 — 쓰기 완료 전 '되돌림' 반영 방지
      let group;
      try { group = await getScheduleGroup(s.groupId); } catch { continue; }
      if (!group) continue;
      const pc = pendingContentChange(group, s);
      if (!pc) continue;
      const key = `${s.groupId}:${pc.sig}`;
      if (autoAppliedRef.current.has(key)) continue;   // 같은 변경 이미 자동반영(상태 반영 전 재검사 중복 차단)
      autoAppliedRef.current.add(key);
      // ★자동 반영 — 공유 일정의 티타임/인원/예약자/세부코스는 '모두가 함께 치는 객관적 사실'이라, 멤버가 옛 값을
      //   간직할 이유가 없다. 즉시 내 일정 + 알람을 갱신해 무시해도 정보·알람이 항상 정확하게 한다(2026-07-24, 사용자 결정).
      //   배너는 '자동 반영됐어요' 확인용으로만. (구 방식은 '나중에' 미루면 옛 시간·옛 알람이 당일까지 남아
      //   잘못된 시간에 갈 위험이 있었다.) 구장·날짜는 잠금이라 여기 안 옴(삭제+재생성 전용, [[schedule-propagation-spec]]).
      try { await editSchedule(s.id, pc.patch); } catch (e) { if (__DEV__) console.warn('[home] auto-apply group change', e?.message); }
      getAlarmTypes(s.id).then(types => {
        if (types && types.length) scheduleRoundAlarms({ id: s.id, course: s.course, date: s.date, time: pc.patch.time }, types);
      });
      if (!firstApplied) firstApplied = { schedule: s, pc, applied: true };   // 확인용 배너는 첫 건으로(여러 건이어도 전부 반영됨)
    }
    if (firstApplied) { setPendingScheduleChange(firstApplied); return; }
    // 새 변경 없음 — 확인 안 한 '자동 반영됨' 배너는 유지(확인 눌러야 닫힘).
    setPendingScheduleChange(prev => (prev?.applied ? prev : null));
  }, [currentUid, schedules, editSchedule]);

  const dismissScheduleChange = useCallback(() => {
    setPendingScheduleChange(null);   // '확인' — 이미 자동 반영됐으므로 배너만 닫는다(미룸/저장 없음)
  }, []);

  useEffect(() => {
    if (!navigation?.addListener) return;
    const unsub = navigation.addListener('focus', () => { setTimeout(() => checkSharedScheduleUpdates(), 500); });
    return unsub;
  }, [navigation, checkSharedScheduleUpdates]);
  // 마운트·schedules 변동 시에도 점검 — 단 2s 지연. 내가 방금 편집한 경우 그룹 쓰기(async)가 끝나기 전 점검하면
  //   그룹(옛값) vs 내 일정(새값)이 달라 '되돌림' 배너가 편집자 본인에게 깜빡 뜸. 지연 두면 그룹==내 일정 → 안 뜸(남이 바꾼 건 정상).
  useEffect(() => {
    const t = setTimeout(() => checkSharedScheduleUpdates(), 2000);
    return () => clearTimeout(t);
  }, [checkSharedScheduleUpdates]);
  // 일정 변경 푸시를 포그라운드(앱 켜둔 상태)에서 받으면 반영 배너 즉시 점검 — 푸시와 배너 타이밍 일치.
  //   기존엔 focus/schedules변동 때만 점검해, 홈에 머물러 있으면 다른 탭 갔다 와야 떴음(지연). 백그라운드 수신은 focus 폴백이 커버.
  //   푸시는 그룹 문서 갱신(syncGroupContentByMember) 후 발송돼 이 시점엔 그룹이 최신 — 약간 버퍼 두고 재검사. ([[schedule-propagation-spec]])
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((noti) => {
      if (noti?.request?.content?.data?.type !== 'scheduleChanged') return;
      setTimeout(() => checkSharedScheduleUpdates(), 400);
    });
    return () => sub.remove();
  }, [checkSharedScheduleUpdates]);

  useEffect(() => {
    const shared = (schedules || []).filter(s => s.groupId);
    if (!shared.length) { setGroupSharedCounts({}); return; }
    let cancelled = false;
    (async () => {
      const counts = {};
      for (const s of shared) {
        try {
          const g = await getScheduleGroup(s.groupId);
          if (g?.memberUids) counts[s.groupId] = g.memberUids.length;
        } catch {}
      }
      if (!cancelled) setGroupSharedCounts(counts);
    })();
    return () => { cancelled = true; };
  }, [schedules]);

  // userCourses 사전 로드 — 코스명으로 user-added 코스 매칭하기 위함.
  //   Firestore에서 복원·머지(프레시 설치 시 코스 비어 코스이동·">"가 사라지던 문제 회복, [[data-migration]]).
  useEffect(() => {
    (async () => {
      const list = await syncUserCoursesFromFirestore();
      setUserCoursesList(list || []);
    })();
  }, []);

  // 홈 D-day 카드 — 날짜 기준(자정 넘어가면 자동 갱신) + 다이어리 기록 완료분 제외
  const now0 = React.useMemo(() => {
    const d = new Date(now);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }, [now]);
  // 다이어리 매칭 인덱스 — recordedDiary가 매 렌더 diaries.find를 2회(× 일정 수) 돌던 O(N×M) 제거.
  //   scheduleId 맵 + (scheduleId 없는 것만) course|date 맵. find 순서(첫 매칭) 보존 위해 has 가드.
  const diaryIndex = React.useMemo(() => {
    const bySched = new Map();
    const byCourseDate = new Map();
    for (const d of (diaries || [])) {
      if (d.scheduleId) { if (!bySched.has(d.scheduleId)) bySched.set(d.scheduleId, d); }
      else { const k = `${d.course}|${d.date}`; if (!byCourseDate.has(k)) byCourseDate.set(k, d); }
    }
    return { bySched, byCourseDate };
  }, [diaries]);
  const parseSchedDate = (s) => {
    const [y, m, d] = (s?.date || '').split('.').map(Number);
    return new Date(y || 1970, (m || 1) - 1, d || 1).getTime();
  };
  // 같은 날 일정 정렬 보조 키 — 시간 분 단위 (오전·오후 같은 날 2건 시간순 보장)
  // 빈 time(자동 등록 등)은 정렬 끝으로 — 시간 정보 있는 일정 우선
  const parseSchedTime = (s) => {
    if (!s?.time) return 24 * 60;
    const [hh, mm] = String(s.time).split(':').map(Number);
    return (hh || 0) * 60 + (mm || 0);
  };
  // 일정-다이어리 매칭 — scheduleId 우선, course+date fallback ([[home-multi-schedule-same-day]] 룰3)
  // 일정에 매칭된 다이어리 반환(isRecorded와 동일 규칙) — '기록 보기'에서 해당 상세로 직행하기 위함
  const recordedDiary = (s) => {
    if (!s) return null;
    if (s.id) { const m = diaryIndex.bySched.get(s.id); if (m) return m; }
    return diaryIndex.byCourseDate.get(`${s.course}|${s.date}`) || null;
  };
  const isRecorded = (s) => !!recordedDiary(s);

  // 모집 확정 해제·삭제 시 고아 일정·식사 정리 (옵션1) — 라운지 탭 의존 없이 홈에서 모집 상태를 '직접 조회'해 정리.
  //   기존엔 RoundupTab reconcile이 라운지 posts 로드 때만 돌아 '라운지 열어야 정리'되는 지연 갭이 있었음([[diary-schedule-orphan-fix]]).
  //   ★오삭제 방지: 모집 조회 성공 + 명확히 비확정/미참여(또는 모집 삭제=null)일 때만 삭제. 조회 throw(네트워크·권한)는 보존.
  //   기록 연결 일정(isRecorded)은 보존. 식사 문서(meal_{roundupId})는 작성자·주최자만 규칙상 삭제됨(아니면 무해).
  const reconcileRoundupOrphans = useCallback(async () => {
    if (!currentUid) return;
    const list = schedules || [];
    const rids = [...new Set(list.filter(s => s.roundupId).map(s => s.roundupId))];
    for (const rid of rids) {
      let post, gone = false;
      try { post = await loadRoundup(rid); if (!post) gone = true; }   // 미존재(삭제)=null
      catch (e) {
        // 삭제된 모집은 read 규칙이 resource.data(scope·participantUids 등)를 참조 → resource=null이라
        //   permission-denied로 막힘(not-found 포함). 확정+내가 참여 중이면 규칙상 '항상' read 가능하므로
        //   거부 = 모집 삭제 or 내가 빠짐 → 고아로 정리. 네트워크 등 일시 오류(unavailable 등)만 보존(오삭제 방지).
        const code = e?.code || '';
        if (code === 'permission-denied' || code === 'not-found') gone = true;
        else continue;
      }
      const valid = !gone && !!post && post.closed &&
        (post.authorUid === currentUid || (Array.isArray(post.participantUids) && post.participantUids.includes(currentUid)));
      if (valid) continue;                      // 확정 + 내가 속함 → 정상 유지
      const targets = list.filter(s => s.roundupId === rid && !isRecorded(s)); // 기록 연결 일정은 보존
      for (const s of targets) { await removeSchedule(s.id).catch(() => {}); }
      if (targets.length) { deleteMeal(rid, 1).catch(() => {}); deleteMeal(rid, 2).catch(() => {}); } // 식사 문서도 정리
    }
  }, [currentUid, schedules, diaries, removeSchedule]); // eslint-disable-line react-hooks/exhaustive-deps

  // 마운트·schedules/diaries 변화 시 + 홈 focus 시 정리(라운지 안 열어도 즉시 반영).
  useEffect(() => { if (hydrated) reconcileRoundupOrphans(); }, [hydrated, reconcileRoundupOrphans]);
  useEffect(() => {
    if (!navigation?.addListener) return;
    const unsub = navigation.addListener('focus', () => { reconcileRoundupOrphans(); });
    return unsub;
  }, [navigation, reconcileRoundupOrphans]);
  // 자정 기준 재계산 D-day / 라운딩 종료 판정(티오프 + 4시간 — 후반 막바지, 식사·기록 동선)
  // 매너평가 윈도우(티오프+5h)와 의도적으로 다름: 홈은 끝나갈 때 진입, 매너평가는 실제 종료 후
  const freshDDay = (s) => (s ? Math.max(0, Math.round((parseSchedDate(s) - now0) / 86400000)) : 0);
  const teeoffEndMs = (s) => {
    const [hh, mm] = (s?.time || '08:00').split(':').map(Number);
    return parseSchedDate(s) + (hh || 8) * 3600000 + (mm || 0) * 60000 + 4 * 3600000;
  };
  // 티오프 시각(ms) — 당일 체크인 카드 배너 노출 창 계산용
  const teeoffMs = (s) => {
    const [hh, mm] = (s?.time || '08:00').split(':').map(Number);
    return parseSchedDate(s) + (hh || 8) * 3600000 + (mm || 0) * 60000;
  };
  // 오늘 라운딩 종료(티오프+4h) 카드 — 기록해도 사라지지 않고 "기록 완료"로 유지(교통·맛집 동선), 나가기/자정까지.
  const isEndedToday = (s) => freshDDay(s) === 0 && now >= teeoffEndMs(s);
  const isDismissed = (s) => !!(s && s.id && dismissedCards[s.id]);
  const upcomingSchedules = schedules
    .filter(s => parseSchedDate(s) >= now0 && !isDismissed(s) && (!isRecorded(s) || isEndedToday(s)))
    .sort((a, b) => parseSchedDate(a) - parseSchedDate(b) || parseSchedTime(a) - parseSchedTime(b));
  const next = upcomingSchedules.length > 0 ? upcomingSchedules[0] : null;
  const roundEnded = !!next && isEndedToday(next);
  // D-0(당일) — 메인 카드를 전폭으로 키우고 서브카드를 숨김(정보 박스 3개가 다 들어가게, 사용자 2026-06-18)
  const isD0 = !!next && freshDDay(next) === 0;
  // 당일 체크인 카드 배너 — 티오프 2시간 전 ~ 티오프 30분 후 창에서만(프론트 체크인용), 종료(+4h) 전. 탭하면 공유 카드 전체화면 ([[schedule-booker]])
  //   ★자정부터 종일 띄우지 않음(오후·야간 티인데 하루종일 떠 있던 오버 노출 해소, 2026-07-02) → 그 창 밖 D-0엔 헤더 슬롯이
  //   이용안내(→향후 쇼핑)로 비워짐. now는 60초 틱(setInterval)으로 갱신돼 창 진입/이탈이 1분 내 자동 반영.
  const checkinActive = !!next && isD0 && !roundEnded
    && now >= teeoffMs(next) - 2 * 3600000
    && now < teeoffMs(next) + 30 * 60000;
  const { width: winW } = useWindowDimensions();
  // 확대(디스플레이 줌) 대응 배율 — winW가 360 이상이면 정확히 1(정상, 무변화), 좁아질수록(확대 ON) 비례 축소.
  //   헤더 타이틀·날씨이모지가 함께 줄어 DM과 안 겹치게. 정상/확대를 깔끔히 구분(정상은 절대 안 건드림).
  const zoomScale = Math.min(1, winW / 360);
  // 체크인 배너 맥동 — 활성일 때만 루프(은은한 scale + 골드 오버레이 opacity 펄스). MyScheduleTab 코스버튼과 동일 톤.
  //   ★LinearGradient를 Animated.View 안에 넣었더니 런타임 에러나서, 글로우는 단순 골드 오버레이 opacity 펄스로(안전).
  const checkinPulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!checkinActive) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(checkinPulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(checkinPulse, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [checkinActive]);
  const checkinScale = checkinPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] });
  const checkinGlow = checkinPulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.32] });

  // D-0 카드 우측 날씨·교통 채움 — 큰 이모지만 두면 휑해서 실제 정보로(사용자 2026-06-20).
  //   날씨=getScheduleWxSummary(캐시), 교통=getScheduleDriveMin(출발지 저장 시 경로 1회 조회). 당일 카드일 때만.
  const [d0Info, setD0Info] = useState({ wx: '', drive: null, icon: '', hi: null, lo: null, pop: null });
  useEffect(() => {
    if (!isD0 || !next) { setD0Info({ wx: '', drive: null, icon: '', hi: null, lo: null, pop: null }); return; }
    let alive = true;
    let gotWx = false;   // fresh 날씨 도착 후엔 캐시로 되돌리지 않음(레이스 방지)
    const cacheKey = STORAGE_KEYS.d0Info + next.id;
    setD0Info({ wx: '', drive: null, icon: '', hi: null, lo: null, pop: null });
    // 캐시 즉시 표시 — 콜드스타트에 빈 카드 뒤 날씨·준비물이 '툭' 뜨던 stagger 완화(같은 날짜·12h 이내만, fresh 전).
    storage.load(cacheKey, null).then(c => {
      if (alive && !gotWx && c?.v && c.date === next.date && Date.now() - (c.t || 0) < 12 * 3600 * 1000) setD0Info(c.v);
    }).catch(() => {});
    getScheduleWxSummary(next).then(w => { if (alive && w) { gotWx = true; setD0Info(p => ({ ...p, wx: w.summary, icon: w.icon || '', hi: w.hi ?? null, lo: w.lo ?? null, pop: w.pop ?? null })); } }).catch(() => {});
    const home = userProfile?.departureCoord;
    if (home && typeof home.x === 'number' && typeof home.y === 'number') {
      // 라운딩 종료(티오프+4h) 후엔 올 때(구장→집) 소요로 — 목적지 기본=마이페이지 저장 출발지.
      //   갈 때는 '도착 목표(티오프−도착여유)' 시각 기준 미래 교통 예측 — 교통화면과 동일 기준(불일치 방지).
      const arriveBufferMin = Number.isFinite(userProfile?.arriveBufferMin) ? userProfile.arriveBufferMin : 30;
      const tgt = roundEnded ? null : computeRoundTimeline(next, { arriveBufferMin });
      getScheduleDriveMin(next, home, { reverse: roundEnded, arrivalAt: tgt?.arrive || null }).then(m => { if (alive && m) setD0Info(p => ({ ...p, drive: m })); }).catch(() => {});
    }
    return () => { alive = false; };
  }, [isD0, roundEnded, next?.id, next?.course, userProfile?.departureCoord?.x, userProfile?.departureCoord?.y]);

  // d0Info(날씨·교통)가 채워지면 일정별로 캐시 저장 — 다음 앱 시작 시 즉시 표시용(위 stagger 완화)
  useEffect(() => {
    if (!isD0 || !next?.id || !d0Info.icon) return;
    storage.save(STORAGE_KEYS.d0Info + next.id, { t: Date.now(), date: next.date, v: d0Info });
  }, [isD0, next?.id, next?.date, d0Info]);

  // 캐러셀 슬라이드 수 — 기본(메모 1 + 골퍼코멘트 1) + 스토어 광고(storeAds 원격, 비면 0).
  //   메모 여부는 렌더와 동일하게 '첫 기록의 memo' 기준(diaryEntries[0]) — some()과 어긋나면 회전만 돌고 카드는 한 장인 불일치.
  const homeSlideCount = React.useMemo(() => {
    const course = next?.course;
    if (!course) return 1;
    const entries = diaries.filter(d => isRoundDiary(d) && d.course === course); // 일상(모멘트) 제외
    // 렌더(아래 IIFE 슬라이드 조립)와 반드시 동일해야 회전/탭 인덱스가 맞음:
    //   미기록(첫 방문)=안내메모+골퍼 2장 / 그 외=기본1+(내메모&골퍼 있으면 골퍼1) + 스토어광고
    const isFirstVisit = entries.length === 0;
    const base = isFirstVisit ? 2 : (1 + ((entries[0]?.memo && homeTopComment) ? 1 : 0));
    return base + Math.min(storeAds.length, 2);
  }, [next?.course, diaries, homeTopComment, storeAds]);
  const carouselActive = homeSlideCount > 1;

  useEffect(() => {
    if (!carouselActive) {
      setCardSlide(0);
      return;
    }
    const id = setInterval(() => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setCardSlide(prev => (prev + 1) % homeSlideCount);
    }, 5000);
    return () => clearInterval(id);
  }, [carouselActive, homeSlideCount]);

  const toggleCardSlide = () => {
    if (!carouselActive) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCardSlide(prev => (prev + 1) % homeSlideCount);
  };

  // 일정 → 코스 상세에 쓸 id (COURSE_LOG id 우선, 없으면 userCourses id).
  // GuideScreen이 둘 다 처리하므로 어느 쪽이든 OK.
  const resolveCourseLogId = (schedule) => {
    if (!schedule) return null;
    if (schedule.courseLogId) return schedule.courseLogId;
    const name = (schedule.course || '').toLowerCase().trim();
    if (name) {
      const exact = COURSE_LOG.find(c => c.name.toLowerCase() === name);
      if (exact) return exact.id;
      const fuzzy = COURSE_LOG.find(c => {
        const n = c.name.toLowerCase();
        return n.includes(name) || name.includes(n);
      });
      if (fuzzy) return fuzzy.id;
    }
    // userCourses fallback — 카카오 검색으로 추가한 코스(블루헤런 등)
    if (schedule.courseId) return schedule.courseId;
    // 코스명으로 userCourses 매칭 (사용자가 카카오 없이 타이핑만 한 케이스)
    if (name) {
      const userCourse = userCoursesList.find(c => c.name.toLowerCase() === name);
      if (userCourse) return userCourse.id;
    }
    return null;
  };

  // 다음 라운딩 코스 id — COURSE_LOG·userCourses 모두 해석.
  const nextCourseId = resolveCourseLogId(next);

  // 코멘트 조회 키 — 상세화면(GuideScreen.commentKeyFor)과 반드시 동일 체계여야 함.
  // 카카오로 등록된 코스는 'kakao:{kakaoId}'로 키 통일(상세에서 그 키로 저장하므로).
  // 이게 안 맞으면 코멘트가 있어도 홈에서 못 찾아 '골퍼 코멘트 없어요'로 표시됨.
  const nextCommentKey = (() => {
    if (!nextCourseId) return null;
    const d = COURSE_LOG.find(c => c.id === nextCourseId) || userCoursesList.find(c => c.id === nextCourseId);
    return d?.kakaoId ? `kakao:${d.kakaoId}` : nextCourseId;
  })();

  // 홈 골퍼 코멘트 — 다음 라운딩 코스의 좋아요 1위 코멘트 (Firestore 공유)
  useEffect(() => {
    if (!nextCommentKey) { setHomeTopComment(null); return; }
    let cancelled = false;
    setHomeTopComment(null); // 코스 바뀜 — 이전 코스 코멘트 잔상 방지
    getTopComment(nextCommentKey).then(c => { if (!cancelled) setHomeTopComment(c); });
    return () => { cancelled = true; };
  }, [nextCommentKey]);

  // 코스 탭으로 이동 — id로 해석되면 그 코스, 아니면 이름/kakaoId로 (GuideScreen이 카카오 검색해 연다).
  //   일정엔 코스 이름이 항상 있으므로 '코스 가기'는 항상 동작 (로컬 userCourses·courseId 유무와 무관, [[course-name-input]]).
  const handleCardCoursePress = (schedule, returnScheduleId = null) => {
    if (!schedule) return;
    const id = resolveCourseLogId(schedule);
    // 일정 시트에서 왔으면 그 시트로, 아니면(홈 카드 직접 탭) 홈으로 복귀
    const ret = returnScheduleId ? { returnToScheduleId: returnScheduleId } : { returnToHome: true };
    if (id) { navigation.navigate(ROUTES.COURSE, { openCourseId: id, ...ret }); return; }
    if (schedule.course) {
      navigation.navigate(ROUTES.COURSE, {
        openCourseName: schedule.course,
        openCourseKakaoId: schedule.courseKakaoId || null,
        ...ret,
      });
    }
  };
  // '코스 가기' 어포던스(›) 표시 여부 — 코스 이름만 있어도 열 수 있으므로 이름 유무로 판단.
  const canOpenCourse = (s) => !!(s && (resolveCourseLogId(s) || s.course));

  const openScheduleSheet = (schedule) => {
    // 일정 시트(ScheduleSheetModal)가 D-day를 표시하므로 항상 최신 D-day를 주입
    setSelectedSchedule(schedule ? { ...schedule, dDay: freshDDay(schedule) } : schedule);
    setShowScheduleModal(true);
  };

  // 친구 일정에 초대(일정 전파 발신) — 친구 선택 → 인앱 초대 발송 + 내 일정에 groupId 스탬프(전파 표식) ([[schedule-propagation-spec]])
  const handleInviteFriends = async (schedule) => {
    if (!schedule) return;
    setShowScheduleModal(false);
    setInviteTarget(schedule);
    // 단체 정원(8) 내 남은 자리 — 이미 합류(memberUids)·초대(audienceUids)된 인원 제외. 기존 그룹 없으면 나 1명 기준(7).
    let used = 1;
    if (schedule.groupId) {
      try {
        const g = await getScheduleGroup(schedule.groupId);
        if (g) used = new Set([...(g.memberUids || []), ...(g.audienceUids || [])]).size || 1;
      } catch (e) { if (__DEV__) console.warn('[home] invite remaining calc', e?.message); }
    }
    setInviteMax(Math.max(0, 8 - used));
    try { setInviteFriends(await loadMyFriendsEnriched()); } catch { setInviteFriends([]); }
    setInviteOpen(true);
  };
  // 초대 후 인원(members) 자동 증가 — 1(나) + 누적 초대자 수가 현재 인원보다 크면 올림 + 그룹 반영(다른 멤버에게도 인원 변경 반영).
  const bumpMembersAfterInvite = async (schedule, groupId) => {
    try {
      const group = await getScheduleGroup(groupId);
      const audCount = Array.isArray(group?.audienceUids) ? group.audienceUids.length : 0;
      const cur = Number(schedule?.members) || 0;
      const next = Math.max(cur, Math.min(8, 1 + audCount));   // 8 캡 — 단체 전파 지원(모달 칩 2~8). [[schedule-propagation-spec]]
      if (next !== cur && schedule?.id) {
        await editSchedule(schedule.id, { members: next });
        await syncGroupContentByMember(groupId, { ...schedule, members: next });
      }
    } catch (e) { if (__DEV__) console.warn('[home] members auto-bump', e?.message); }
  };

  const submitInviteFriends = async ({ selectedUids } = {}) => {
    setInviteOpen(false);
    const schedule = inviteTarget;
    const uids = (selectedUids || []).filter(Boolean);
    setInviteTarget(null);
    if (!schedule || !uids.length) return;
    if (!currentUid) { showAppAlert('잠시만요', '로그인 정보를 불러오는 중이에요. 잠시 후 다시 시도해주세요.'); return; }
    try {
      // 초대 친구 이름맵 — FriendSelectModal에 넘긴 친구목록(inviteFriends)에서 uid→이름 추출(그룹에 저장)
      const names = {};
      (inviteFriends || []).forEach(f => { const id = f.id || f.uid; if (id && uids.includes(id)) names[id] = f.customName || f.name || ''; });
      const groupId = await shareScheduleToFriends({
        schedule, initiatorUid: currentUid, initiatorName: userProfile?.nickname || '', friendUids: uids, names,
      });
      if (!groupId) { showAppAlert('초대 실패', '잠시 후 다시 시도해주세요.'); return; }
      if (!schedule.groupId) await editSchedule(schedule.id, { groupId }); // 전파 일정 표식
      await bumpMembersAfterInvite(schedule, groupId);                     // 인원 자동 증가
      showToast(`친구 ${uids.length}명에게 초대를 보냈어요`);
    } catch (e) {
      if (__DEV__) console.warn('[home] invite schedule', e?.message);
      showAppAlert('초대 실패', '잠시 후 다시 시도해주세요.');
    }
  };
  // 이미 선택한 동반자(친구)에게 일정 바로 발송 — 생성 직후 '보내기' 전용(친구 재선택 X). ([[schedule-propagation-spec]])
  const inviteCompanionsDirectly = async (schedule) => {
    const friendUids = [...new Set((schedule?.companions || []).map(c => c?.friendUid).filter(Boolean))];
    if (!friendUids.length) return;
    if (!currentUid) { showAppAlert('잠시만요', '로그인 정보를 불러오는 중이에요. 잠시 후 다시 시도해주세요.'); return; }
    try {
      // 동반자 이름맵 — schedule.companions(친구선택 시 이름 보유)에서 추출
      const names = {};
      (schedule?.companions || []).forEach(c => { if (c?.friendUid && c?.name) names[c.friendUid] = c.name; });
      const groupId = await shareScheduleToFriends({
        schedule, initiatorUid: currentUid, initiatorName: userProfile?.nickname || '', friendUids, names,
      });
      if (!groupId) { showAppAlert('초대 실패', '잠시 후 다시 시도해주세요.'); return; }
      if (!schedule.groupId) await editSchedule(schedule.id, { groupId });
      await bumpMembersAfterInvite(schedule, groupId);                     // 인원 자동 증가
      showToast(`동반자 ${friendUids.length}명에게 초대를 보냈어요`);
    } catch (e) {
      if (__DEV__) console.warn('[home] invite companions', e?.message);
      showAppAlert('초대 실패', '잠시 후 다시 시도해주세요.');
    }
  };
  // 일정 생성 직후 초대 제안 — 친구 동반자가 있을 때만. [보내기]=이미 고른 동반자에게 바로 발송(재선택 X). ([[schedule-propagation-spec]])
  //   onDone: 응답(보내기/나중에) 후 이어서 실행(알람 팝업). AppAlert 닫힘 후 살짝 지연해 모달 충돌 방지([[ios-modal-stacking]]).
  const offerInviteAfterCreate = (schedule, onDone) => {
    // 응답(보내기/나중에/안드 백버튼) 어느 경로로 닫히든 이어서 알람 — onDismiss(닫힘 공통 콜백)로.
    //   버튼 onPress에만 걸면 백버튼으로 닫을 때 알람이 스킵됨(리뷰 2026-07-06).
    showAppAlert('동반자에게 보낼까요?', '방금 선택한 동반자에게 이 일정을 보내면, 수락 시 그 친구 일정에도 등록돼요.', [
      { text: '나중에', style: 'cancel' },
      { text: '보내기', onPress: () => inviteCompanionsDirectly(schedule) },
    ], { onDismiss: () => { if (onDone) setTimeout(onDone, 250); } });
  };

  const openCurrentWeather = () => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}.${String(today.getMonth()+1).padStart(2,'0')}.${String(today.getDate()).padStart(2,'0')}`;
    const currentLocationSchedule = {
      course: '현재 위치',
      date: dateStr,
      day: WEEKDAYS[today.getDay()],
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

  const [scheduleShareTarget, setScheduleShareTarget] = useState(null); // 일정 공유 카드 모달 대상
  const [checkinCard, setCheckinCard] = useState(null); // 당일 체크인 — 공유화면 없이 카드만 깔끔히 띄우기
  // 체크인 카드 — 카드만 전체화면(프론트 체크인용). 해당일 날씨 비동기 주입(코스명 위).
  const openCheckinCard = (s) => {
    if (!s) return;
    const target = { ...s };
    setCheckinCard(target);
    if (!target.weather) {
      getScheduleWxSummary(target).then(w => {
        if (w) setCheckinCard(prev => (prev && prev.date === target.date && prev.course === target.course) ? { ...prev, weather: w.summary, weatherIcon: w.icon } : prev);
      }).catch(() => {});
    }
  };
  // 일정 공유 평문(설치 링크 동선) — 카드 모달의 '링크 공유' 옵션에서 사용
  const buildScheduleMsg = (s) => {
    const lines = [
      '[ Dear Golf ]', s.course, `${s.date} ${s.day}요일 ${s.time}`, `${s.members}명 동반 · D-${s.dDay}`,
    ];
    // 동반자 이름 — 있을 때만('(초대중)' 표기는 뗀다). 누가 오는지까지 카톡에 그대로 전해진다.
    const players = (Array.isArray(s.companionNames) ? s.companionNames : [])
      .map(n => String(n).replace(/\(초대중\)$/, '').trim()).filter(Boolean);
    if (players.length) lines.push(`동반: ${players.join(' · ')}`);
    if (s.weatherText) lines.push(`예상 날씨 ${s.weatherText}`); // 실제 예보(기온·강수확률) 있을 때만 — 없으면 생략(가짜 '맑음' 안 보냄)
    lines.push('티오프 30분 전 도착을 권장해요', '', '라운딩의 모든 순간을 더 특별하게', 'Dear Golf ⛳', WEB_BASE);
    return lines.join('\n');
  };
  const shareScheduleText = async (s) => {
    if (!s) return;
    try { await Share.share({ message: buildScheduleMsg(s) }); }
    catch (e) { console.warn('[share schedule]', e?.message); }
  };
  // D-day 카드 공유 → 카드 모달(이미지 바로공유/저장 + 링크). 시트 닫고 홈 레벨에서 열어 3중 Modal 회피.
  const handleShareSchedule = (s, companionNames) => {
    if (!s) return;
    setShowScheduleModal(false);
    // 시트가 해석한 동반자 이름을 카드·텍스트에 실어 보낸다(있을 때만 표시).
    setScheduleShareTarget({ ...s, companionNames: Array.isArray(companionNames) ? companionNames : (s.companionNames || []) });
    // 해당일 날씨를 비동기로 주입 — 카드는 즉시 뜨고, 예보가 오면 코스명 위에 표시(예보 범위 밖이면 그대로 없음).
    //   캡처 전에 도착하면 이미지에도 포함. 대상이 바뀌었으면(다른 일정) 덮어쓰지 않도록 date+course 일치 확인.
    if (!s.weather) {
      getScheduleWxSummary(s).then(w => {
        if (!w) return;
        setScheduleShareTarget(prev => (prev && prev.date === s.date && prev.course === s.course) ? { ...prev, weather: w.summary, weatherText: w.detail, weatherIcon: w.icon } : prev);
      }).catch(() => {});
    }
  };

  const handleEditSchedule = async (s) => {
    // 전파 일정 memo는 group.memo가 진실원 — 편집 프리필도 '최신 group.memo'로(파생 schedule.memo는 stale 가능,
    //   그걸로 저장하면 남의 최신 메모를 덮어씀. save-revert 방지 [[save-revert-bug-pattern]]).
    //   ★그룹 로드를 '먼저' 하고 그 다음 시트를 닫는다 — 시트를 먼저 닫으면 로드 대기 중 빈 화면이 뜸(리뷰 3차 2026-07-06).
    let target = s;
    if (s?.groupId && !s?.roundupId) {
      try { const g = await getScheduleGroup(s.groupId); if (g) target = { ...s, memo: g.memo ?? s.memo ?? '' }; }
      catch (e) { if (__DEV__) console.warn('[home] edit prefill group memo', e?.message); }
    }
    setShowScheduleModal(false);
    setEditScheduleTarget(target);
  };

  const handleScheduleSave = async (type, data) => {
    if (type === 'schedule') {
      let newS;
      try {
        newS = await addSchedule({
          course: data.course, date: data.date, day: data.day || '토',
          time: data.time || '08:00', members: data.members || 4,
          courseLogId: data.courseLogId || null,
          courseId: data.courseId || null,
          courseLoc: data.courseLoc || null, // 코스 주소 — 지역탭 분류용([[region-classification]])
          courseKakaoId: data.courseKakaoId || null, // 코스 가기(프레시설치) 매칭용
          companions: Array.isArray(data.companions) ? data.companions : [], // 동반자
          booker: data.booker || '',                 // 예약자(체크인 이름)
          subCourse: data.subCourse || '',           // 코스(세부코스 라벨)
          memo: data.memo || '',                     // 일정 메모(공지)
          calendarSourceId: data.calendarSourceId || null, // 캘린더 가져온 원본 이벤트 — 캘린더 중복 방지([[deviceCalendar]] adopt)
        });
      } catch (e) {
        console.warn('[home] schedule add failed:', e?.message);
        return false; // 모달이 열린 채 실패 안내 + 입력 보존 (ScheduleModal.handleSave)
      }
      // 새로 등록된 userCourse 반영 (코스명→id 매칭 최신화)
      getUserCourses().then(list => setUserCoursesList(list || []));
      // (캘린더 추가는 addSchedule이 일괄 처리)
      // 동반자(친구)를 골랐다는 건 '공유하겠다'는 신호 — 알람보다 '전파 제안'을 먼저 묻는다(사용자 2026-07-06 순서 반전).
      //   없으면 알람 바로. 알람 팝업은 '이대로 자동'이면 전체 대신 '식사시각만' 묻는 가벼운 프롬프트.
      const hasFriendCompanions = Array.isArray(data.companions) && data.companions.some(c => c?.friendUid);
      const openAlarm = () => {
        if (userProfile.alarmPromptDisabled) setPendingQuickAlarm(newS);
        else setPendingAlarmSchedule(newS);
      };
      if (hasFriendCompanions) {
        // ScheduleModal(RN Modal) 닫힘 뒤 전파 AppAlert를 띄우고(350), 응답 후 알람 모달로 이어짐 ([[ios-modal-stacking]]).
        setTimeout(() => offerInviteAfterCreate(newS, openAlarm), 350);
      } else {
        openAlarm();
      }
    } else if (type === 'schedule-edit') {
      try {
        await editSchedule(data.id, {
          course: data.course, date: data.date, day: data.day,
          time: data.time, members: data.members,
          courseId: data.courseId || null,
          courseLoc: data.courseLoc || null, // 코스 주소 — 지역탭 분류용([[region-classification]])
          courseKakaoId: data.courseKakaoId || null,
          companions: Array.isArray(data.companions) ? data.companions : [],
          booker: data.booker || '',                 // 예약자(체크인 이름)
          subCourse: data.subCourse || '',           // 코스(세부코스 라벨)
          memo: data.memo || '',                     // 일정 메모(공지)
          calendarSourceId: data.calendarSourceId || null, // 캘린더 원본 연결 유지 — 편집 때 새 이벤트로 중복되지 않게
        });
      } catch (e) {
        console.warn('[home] schedule edit failed:', e?.message);
        return false; // 모달이 열린 채 실패 안내 + 입력 보존 (ScheduleModal.handleSave)
      }
      getUserCourses().then(list => setUserCoursesList(list || []));
      // 전파 일정(groupId, 라운지 아님) 수정 → 그룹 내용 갱신(다른 멤버 반영의 소스) + 변경 알림. 편집자는 즉시 반영되고,
      //   다른 멤버는 자기 화면에서 '반영할까요?' 확인(전원 동등 모델). 구장·날짜는 잠금이라 time/members/booker/subCourse만 동기화. ([[schedule-propagation-spec]])
      const oldS = editScheduleTarget;
      if (oldS?.groupId && !oldS?.roundupId && currentUid) {
        const memoChanged = (oldS.memo || '') !== (data.memo || '');
        const coreChanged = (oldS.time !== data.time)
          || (Number(oldS.members) !== Number(data.members))
          || ((oldS.booker || '') !== (data.booker || ''))
          || ((oldS.subCourse || '') !== (data.subCourse || ''));
        const changed = coreChanged || memoChanged;
        if (changed) {
          // memo가 바뀐 편집이면 수정자(uid·닉네임) 전달 → 그룹에 'OO님 수정' 기록 (전파 메모 카드 표시용)
          syncGroupContentByMember(oldS.groupId, { ...oldS, ...data },
            memoChanged ? { uid: currentUid, name: userProfile?.nickname || '' } : null).then(async () => {
            try {
              const group = await getScheduleGroup(oldS.groupId);
              // 공지만 바뀐 편집은 전용 타입(scheduleMemo)+내용 미리보기 — '일정 변경' 푸시로 위장 안 하게(2026-07-10).
              //   시간·인원 등 핵심이 같이 바뀌면 '일정 변경'이 우선(더 중요한 신호).
              await notifyScheduleGroupMembers({ group, myUid: currentUid,
                type: coreChanged ? 'scheduleChanged' : 'scheduleMemo',
                actorName: userProfile?.nickname || '', course: data.course, date: data.date, time: data.time,
                memoPreview: !coreChanged ? memoChangePreview(oldS.memo, data.memo) : undefined });
            } catch (e) { if (__DEV__) console.warn('[home] notify changed', e?.message); }
          });
        }
      }
      // 알람이 설정된 일정이면 변경된 날짜·시간으로 재예약
      getAlarmTypes(data.id).then(types => {
        if (types && types.length) {
          scheduleRoundAlarms(
            { id: data.id, course: data.course, date: data.date, time: data.time },
            types,
          );
        }
      });
      // (캘린더 갱신은 editSchedule이 일괄 처리)
    }
  };

  // 일정초대 배너가 떠 있는 동안엔 아래 한줄메모/코멘트 카드를 숨겨 좁은 화면 겹침을 막는다(수락/거절 후 복원).
  const [scheduleInvitePending, setScheduleInvitePending] = useState(false);

  // 홈 상단 배너 큐 — 여러 개가 동시에 떠 세로로 쌓이면 좁아지므로 '한 번에 하나만' 노출(2026-07-23, 사용자 요청).
  //   우선순위(급한 순): 일정변경 → 일정초대 → 라운지초대 → 스코어공유. 최상위 하나만 펼치고 나머지는 높이 0으로 접는다
  //   (숨겨도 구독은 유지 → 위 배너를 처리하면 다음 게 자동으로 펼쳐지고, 다 처리하면 메모/카드가 복원된다).
  const topBanner = pendingScheduleChange ? 'change'
    : scheduleInvitePending ? 'schedInvite'
    : roundupInviteActive ? 'roundupInvite'
    : scoreShareActive ? 'scoreShare'
    : null;

  // 하단 캘린더 알약 라벨 — 오늘 날짜·요일 노출(진입 유도 + 정보 겸용). 렌더마다 계산이라 자정 넘어가도 갱신.
  const _today = new Date();
  const todayLabel = `${_today.getMonth() + 1}월 ${_today.getDate()}일 (${WEEKDAYS[_today.getDay()]})`;

  return (
    <View style={{ flex: 1, backgroundColor: '#0a1e10' }}>
      <StatusBar barStyle="light-content" />
      <HomeBgSlider />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
        {/* SafeArea top: iOS는 노치, Android는 status bar 자동 padding.
            ※ currentHeight 수동 패딩(b63920e) 롤백 — 안드 edge-to-edge에서 SafeArea와 이중 적용돼
            삼선바가 과하게 내려오는 부작용(흔들림도 못 고침). 흔들림은 dev로 insets 실측 후 재시도 ([[cross-platform-check]])
            하단은 SafeArea 안 함 — 탭바가 자체 처리하고 안드로이드 navigation bar는 bottomArea가 처리 */}
        {/* 확대(디스플레이 줌) 대응 — flexGrow:1로 정상 줌엔 화면을 꽉 채워 스크롤 안 생기고(레이아웃 100% 동일),
            확대로 내용이 넘칠 때만 세로 스크롤로 구제(하단 카드/골퍼코멘트 잘림 방지). 헤더·폰트는 손대지 않음. */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: winW < 360 ? tabBarHeight : 0 }}
          showsVerticalScrollIndicator={false}
          bounces={false}>
        <TripleStripe style={{ marginTop: Platform.OS === 'android' ? 8 : 0 }} />
        <View style={homeS.hdr}>
          <Text style={homeS.hdrSub}>라운딩의 모든 순간을 더 특별하게</Text>
          {/* 타이틀 줄 — Dear Golf + 날씨 + DM 💬. 💬는 날씨 아이콘 우상단에 살짝 띄워(브랜드가 말하는 말풍선 느낌),
              너무 붙지 않게 간격(marginLeft)·위로 올림(marginTop 음수). 사용자 위치 지정 2026-06-17. */}
          {/* 우측 버튼 레일(메시지·크루)은 절대좌표로 통일(RAIL_TOP/STEP) — 아래 hdr 마지막 자식들.
              타이틀 줄은 그 자리만 비워둠(paddingRight)으로 버튼과 안 겹치게. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingRight: RAIL_BTN + 12 }}>
            {/* flex:1+minWidth:0 — 확대로 폭 좁아질 때 좌측(타이틀+날씨)이 양보해 우측 버튼과 안 겹치게.
                타이틀 축소는 iOS만 — 안드는 Lora 브랜드폰트에서 adjustsFontSizeToFit이 축소 못 하고 박스만 줄어 'Golf' 잘림([[rn-platform-gotchas]]). */}
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
              <Text style={[homeS.hdrTitle, Platform.OS === 'android' && { fontSize: fs(43) * zoomScale, lineHeight: fs(58) * zoomScale }, Platform.OS === 'ios' && { flexShrink: 1, lineHeight: fs(56) }]} numberOfLines={1} allowFontScaling={false} adjustsFontSizeToFit={Platform.OS === 'ios'} minimumFontScale={0.7}>Dear Golf</Text>
              <TouchableOpacity onPress={openCurrentWeather} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: 12 }}>
                <View style={{ marginTop: 4 }}><WeatherGlyph icon={wxEmoji} size={(Platform.OS === 'android' ? fs(40) : fs(42)) * zoomScale} /></View>
              </TouchableOpacity>
            </View>
          </View>
          {/* 크루 버튼은 hdr 맨 마지막 자식으로 이동 — iOS서 그리팅/배너 위에 와야 터치를 받음(아래) */}
          <Text style={homeS.hdrGreeting}>
            안녕하세요, <Text style={homeS.hdrGreetingName}>{userProfile.nickname}</Text>님
          </Text>
          {/* 당일 체크인 카드 배너 — 박스가 많아 정신없어, 이용안내 띠 '자리'에 대신 노출(둘 다 안 띄움). 활성 아니면 이용안내 띠. */}
          {checkinActive ? (
            /* 그림자/elevation 제거 — 배경 없는 둥근 뷰에 elevation을 주면 안드서 그림자가 '네모난 짙은 박스'로
               채워져 보임(맥동 중 더 도드라짐, line 692와 동일 아티팩트, 사용자 2026-06-20). 테두리+글로우로 충분히 강조됨. */
            /* marginRight 88 — 우측에 DM 아래 들어갈 동그란 버튼(쇼핑 등, ≈44px) 자리 확보. 전폭이라 버튼을 가리던 것 방지(사용자 2026-06-20). */
            <Animated.View style={{ marginTop: Platform.OS === 'android' ? 13 : 15, marginRight: 88, borderRadius: 12, transform: [{ scale: checkinScale }] }}>
              <TouchableOpacity onPress={() => openCheckinCard(next)} activeOpacity={0.85}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 9, overflow: 'hidden',
                  backgroundColor: 'rgba(245,230,168,0.16)', borderWidth: 0.5, borderColor: 'rgba(245,230,168,0.5)',
                  borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
                {/* 안쪽 골드 글로우 — 맥동에 맞춰 opacity 펄스 */}
                <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: 'rgba(245,230,168,0.55)', opacity: checkinGlow }} />
                <Icon name="ticket" size={fs(26)} color={C.butter} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: '#fff' }}>오늘 라운딩 · 체크인 카드</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.78)', marginTop: 1 }} numberOfLines={1}>
                    {next.booker ? `예약자 ${next.booker} · 탭하면 전체화면` : '탭하면 전체화면으로 보여드려요'}
                  </Text>
                </View>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: C.butter }}>›</Text>
              </TouchableOpacity>
            </Animated.View>
          ) : !homeIntroSeen ? (
          /* Dear Golf 이용 안내 진입 — 첫 유저 1회성 띠(사용자 2026-07-03). 열어보면(=확인) 영구히 사라짐.
             기존 유저도 이미 열어봤으면 안 뜸. 재열람은 마이페이지 '이용 안내'에서. */
          <TouchableOpacity onPress={openHomeIntro} activeOpacity={0.85}
            style={{ flexDirection: 'row', alignItems: 'center', gap: Platform.OS === 'android' ? 6 : 8, marginTop: Platform.OS === 'android' ? 13 : 15,
              backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.22)',
              borderRadius: 10,
              paddingHorizontal: Platform.OS === 'android' ? 10 : 12,
              // ★스토어 띠와 동일 — 확대모드에서 우측 레일(크루)과 겹치지 않게 레일 폭 확보(2026-07-24).
              maxWidth: winW - SIDE_PAD * 2 - RAIL_BTN - 10,
              paddingVertical: Platform.OS === 'android' ? 5 : 7, alignSelf: 'flex-start' }}>
            <View>
              <Text style={{ fontSize: Platform.OS === 'android' ? fs(18) : fs(22) }}>💡</Text>
              <View style={{ position: 'absolute', top: -2, right: -4, width: 10, height: 10, borderRadius: 5,
                backgroundColor: '#FF3B30', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.95)' }} />
            </View>
            <View style={{ flexShrink: 1 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: '#fff', includeFontPadding: false }}>Dear Golf 이용 안내</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.7)', marginTop: 1, includeFontPadding: false }}>
                처음이신가요? 한 번 열어보세요
              </Text>
            </View>
            <Text style={{ fontFamily: F.sys, fontSize: fs(15), color: 'rgba(255,255,255,0.6)', marginLeft: 2 }}>›</Text>
          </TouchableOpacity>
          ) : (
          /* 디어골프 스토어 띠 — 커머스라 흰 반투명 띠와 구분되는 골드(버터) 톤으로 특색(체크인 배너 계열).
             아이콘=진한 블루 원 배지+흰 bag. URL 없는 동안 탭=준비 중 토스트, 승인 후 외부 브라우저로 스마트스토어. */
          <TouchableOpacity onPress={() => (STORE_URL ? Linking.openURL(STORE_URL).catch(() => {}) : showAppAlert('', (
            /* 준비 중 안내 — 하단 토스트는 위치가 낮고 커스텀 아이콘 불가 → 가운데 알럿에 스토어 띠와 같은 블루 배지+bag (사용자 2026-07-03) */
            <View style={{ alignItems: 'center', paddingTop: 6 }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#4E86B4', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <Icon name="bag" size={fs(28)} color="#fff" strokeWidth={2.1} />
              </View>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal }}>스토어 오픈 준비 중이에요</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, marginTop: 6, textAlign: 'center', lineHeight: 19 }}>
                센스 있는 골프 아이템으로{'\n'}곧 찾아올게요
              </Text>
            </View>
          ), [{ text: '기대할게요' }]))} activeOpacity={0.85}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: Platform.OS === 'android' ? 13 : 15,
              backgroundColor: 'rgba(245,230,168,0.16)', borderWidth: 0.5, borderColor: 'rgba(245,230,168,0.5)',
              borderRadius: 12,
              paddingHorizontal: Platform.OS === 'android' ? 10 : 12,
              // ★우측 레일(메시지·크루) 폭을 비워 확대모드에서 띠가 넓어져도 크루 버튼과 안 겹치게(사용자 2026-07-24).
              maxWidth: winW - SIDE_PAD * 2 - RAIL_BTN - 10,
              paddingVertical: Platform.OS === 'android' ? 6 : 8, alignSelf: 'flex-start' }}>
            <View style={{ width: Platform.OS === 'android' ? 32 : 36, height: Platform.OS === 'android' ? 32 : 36, borderRadius: 18,
              backgroundColor: '#4E86B4', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="bag" size={Platform.OS === 'android' ? fs(19) : fs(22)} color="#fff" strokeWidth={2.1} />
            </View>
            <View style={{ flexShrink: 1 }}>
              {/* 라벨은 이름 중립 '스토어' — '디어골프 스토어'는 28류 상표 충돌([[ip-protection-backlog]] 2026-07-04)
                  + 스토어명 미정. 앱 안이라 문맥 자명, 스토어 이름이 뭐가 되든 이 라벨은 유효(재빌드 불필요). */}
              <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.butter, includeFontPadding: false }}>스토어</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.8)', marginTop: 1.5, includeFontPadding: false }}>
                센스 있는 골프 아이템 구경하기
              </Text>
            </View>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: C.butter, marginLeft: 3 }}>›</Text>
          </TouchableOpacity>
          )}
          {/* ── 우측 버튼 레일: 메시지 → 크루. 둘 다 절대좌표 right:SIDE_PAD, top = RAIL_TOP + RAIL_STEP*n(간격 균일).
                hdr 마지막 자식들(그리팅·배너 위에 렌더) + zIndex/elevation 20으로 iOS·안드 모두 맨 위라 터치 받음. ── */}
          {/* 메시지(DM) — 레일 1번. 안읽음=버건디+숫자, 안읽음 시 좌우 진동. 평상시 은은한 호흡 펄스.
              ★드롭섀도 제거(2026-06-18): 반투명 배경 그림자 투과로 'DM 뒤 뿌연 팔각형' 아티팩트 → 깔끔함 우선 제거. */}
          <TouchableOpacity onPress={() => setDmOpen(true)} activeOpacity={0.8}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{ position: 'absolute', right: SIDE_PAD, top: RAIL_TOP, zIndex: 20, elevation: 20, alignItems: 'center' }}>
            <Animated.View style={{ width: RAIL_BTN, height: RAIL_BTN, borderRadius: RAIL_BTN / 2,
              alignItems: 'center', justifyContent: 'center',
              transform: [{ translateX: dmShift }] }}>
              <Animated.View style={{ opacity: dmIdleOpacity }}>
                <View style={{ width: RAIL_BTN, height: RAIL_BTN, borderRadius: RAIL_BTN / 2, borderWidth: 1.5, borderColor: C.butter,
                  backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ width: RAIL_BTN - 8, height: RAIL_BTN - 8, borderRadius: (RAIL_BTN - 8) / 2, borderWidth: 1.2, borderColor: C.butter,
                    backgroundColor: dmUnread > 0 ? C.burgundy : 'transparent',
                    alignItems: 'center', justifyContent: 'center' }}>
                    {dmUnread > 0 ? (
                      <Text style={{ fontFamily: F.sysB,
                        fontSize: fs(dmUnread > 99 ? 10 : 13), lineHeight: fs(13),
                        color: C.butter, letterSpacing: 0.3, includeFontPadding: false,
                        marginTop: Platform.OS === 'ios' ? 1 : 0 }}>
                        {dmUnread > 99 ? '99+' : dmUnread}
                      </Text>
                    ) : (
                      // 읽음 — 종이비행기(편지 날아가는) 드로잉
                      <Icon name="send" size={fs(RAIL_SEND)} color={C.butter} strokeWidth={1.7} />
                    )}
                  </View>
                </View>
              </Animated.View>
            </Animated.View>
            {/* 아이콘 아래 한글 라벨 — 이모지만으론 뭔지 모를 수 있어 명시(사용자 2026-06-25). 사진 배경 위 가독성 위해 그림자 */}
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.butter, marginTop: 2, includeFontPadding: false,
              textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }} allowFontScaling={false}>메시지</Text>
          </TouchableOpacity>

          {/* 크루 — 레일 2번. 초대 있을 때만 글로우(라디오 핑). */}
          <TouchableOpacity onPress={() => { setCrewReturnId(null); setCrewModalAnim('slide'); setCrewOpen(true); }} activeOpacity={0.8}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{ position: 'absolute', right: SIDE_PAD, top: RAIL_TOP + RAIL_STEP, zIndex: 20, elevation: 20, alignItems: 'center' }}>
            {/* 초대 글로우(라디오 핑) — 평상시 정적, 초대 있을 때만 울림 */}
            {crewInvite > 0 && (
              <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, width: RAIL_BTN, height: RAIL_BTN, borderRadius: RAIL_BTN / 2,
                backgroundColor: '#8FB06B', opacity: crewHaloOpacity, transform: [{ scale: crewHaloScale }] }} />
            )}
            {/* 어두운 반투명 스크림 — 밝은(낮) 배경서도 또렷 */}
            {/* 새 글이면 원을 세이지로 채우고 'NEW' + 은은한 맥동(DM 안읽음=원채움+숫자와 같은 맥락, 색·모션은 구분). 아니면 크루 아이콘 ([[crew-new-signal]]) */}
            <Animated.View style={{ transform: [{ scale: crewNewScale }] }}>
              <View style={{ width: RAIL_BTN, height: RAIL_BTN, borderRadius: RAIL_BTN / 2, borderWidth: 2, borderColor: '#8FB06B',
                backgroundColor: crewHasNew ? '#5E7E42' : 'rgba(26,61,82,0.34)', alignItems: 'center', justifyContent: 'center' }}>
                {crewHasNew ? (
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(10.5), lineHeight: fs(12), color: '#fff', letterSpacing: 0.3,
                    includeFontPadding: false, marginTop: Platform.OS === 'ios' ? 1 : 0 }}>NEW</Text>
                ) : (
                  <Icon name="crew" size={fs(RAIL_ICON)} color="#A8CC82" strokeWidth={2} />
                )}
              </View>
            </Animated.View>
            {/* 아이콘 아래 한글 라벨 — DM과 짝(사용자 2026-06-25). 사진 배경 위 가독성 위해 그림자 */}
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: '#A8CC82', marginTop: 2, includeFontPadding: false,
              textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }} allowFontScaling={false}>크루</Text>
          </TouchableOpacity>

          {/* 알림 — 레일 3번(크루 아래). ★미확인이 있을 때만 나타나고 다 읽으면 사라짐(사용자 2026-07-21).
              평상시 홈을 비워두고, 놓친 게 있을 때만 눈에 띄게 하는 게 목적. 다 읽은 뒤 지난 알림은
              라운지 종 아이콘에서 계속 볼 수 있다(진입점이 사라져도 알림함 자체는 그대로).
              절대좌표 슬롯이라 나타나고 사라져도 위의 메시지·크루 위치는 안 밀림. */}
          {notiUnread > 0 && (
            <TouchableOpacity onPress={() => navigation.navigate(ROUTES.LOUNGE, { openNoti: true })} activeOpacity={0.8}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={{ position: 'absolute', right: SIDE_PAD, top: RAIL_TOP + RAIL_STEP * 2, zIndex: 20, elevation: 20, alignItems: 'center' }}>
              <View style={{ width: RAIL_BTN, height: RAIL_BTN, borderRadius: RAIL_BTN / 2, borderWidth: 2, borderColor: '#E2C275',
                backgroundColor: 'rgba(26,61,82,0.34)', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="bell" size={fs(RAIL_ICON)} color="#E2C275" strokeWidth={2} />
              </View>
              {/* 개수 뱃지 — 라운지 알림함(버건디 원+흰 숫자)과 같은 신호 */}
              <View style={{ position: 'absolute', top: -4, right: -6, minWidth: 18, height: 18, borderRadius: 9,
                backgroundColor: C.burgundy, borderWidth: 1, borderColor: '#F5E6A8',
                alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(notiUnread > 99 ? 8 : 10), lineHeight: fs(12), color: '#fff',
                  includeFontPadding: false, marginTop: Platform.OS === 'ios' ? 1 : 0 }} allowFontScaling={false}>
                  {notiUnread > 99 ? '99+' : notiUnread}
                </Text>
              </View>
              {/* 라벨 — 메시지·크루와 짝 */}
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: '#E2C275', marginTop: 2, includeFontPadding: false,
                textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }} allowFontScaling={false}>알림</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 일정 전파 수신 — 친구가 보낸 일정 초대 배너(홈 상단). 수락 시 내 일정·캘린더에 자기파생 ([[schedule-propagation-spec]])
            큐: 최상위 배너일 때만 펼침. 아니면 높이 0으로 접되 마운트 유지(구독 살아 '다음 차례' 판단). */}
        <View style={topBanner === 'schedInvite' ? undefined : { height: 0, overflow: 'hidden' }}>
          <ScheduleInviteInbox onActiveChange={setScheduleInvitePending} />
        </View>

        {/* 라운지 친구지정 초대 수신 — 푸시 꺼도 홈에서 인지. 탭/「초대 보기」 → 라운지 내 참여(초대 카드)로 이동 ([[roundup-invitation]]) */}
        <View style={topBanner === 'roundupInvite' ? undefined : { height: 0, overflow: 'hidden' }}>
          <RoundupInviteInbox
            onActiveChange={setRoundupInviteActive}
            onOpen={() => navigation.navigate(ROUTES.LOUNGE, { openView: 'mine' })} />
        </View>

        {/* 동반자 스코어 공유 수신 — 기록화면에서 홈으로 이동(2026-07-23). 기록 잘 안 하는 유저도 홈에서 바로 인지.
            자체 구독·비었으면 null(자리 0). variant='home'=반투명 흰 카드+금테(네이비 배경서 안 묻힘).
            onDerived=reloadDiaries → 수락 시 DiariesContext 갱신(홈 최근기록·기록탭 공통 소스). */}
        <View style={topBanner === 'scoreShare' ? undefined : { height: 0, overflow: 'hidden' }}>
          <ScoreShareInbox variant="home"
            nickname={userProfile?.nickname || userProfile?.realName || ''}
            onDerived={reloadDiaries}
            onActiveChange={setScoreShareActive} />
        </View>

        {/* 전파 일정 변경 반영 — 다른 멤버가 바꾼 시간·인원·예약자·세부코스. 초대처럼 눈에 띄게 + 맥동(중요한 부분).
            큐 최우선순위 — 이게 떠 있으면 아래 3배너는 위에서 접힌다(topBanner). */}
        {topBanner === 'change' && (
          <AttentionMotion type="pulse" style={{ marginHorizontal: SIDE_PAD, marginTop: 12 }}>
            <View style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 16, borderWidth: 2, borderColor: 'rgba(245,230,168,0.9)', paddingHorizontal: 14, paddingVertical: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Icon name="refresh" size={fs(16)} color={C.butter} />
                <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(13.5), color: '#fff' }} numberOfLines={1}>함께하는 일정이 변경됐어요</Text>
              </View>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.butter, marginBottom: 3 }} numberOfLines={1}>{pendingScheduleChange.schedule.course || '라운딩'}</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: 'rgba(255,255,255,0.85)', marginBottom: 4, lineHeight: 18 }} numberOfLines={4}>{pendingScheduleChange.pc.diffs.join('\n')}</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.6)', marginBottom: 9 }}>내 일정과 알람에 자동으로 반영했어요</Text>
              <TouchableOpacity onPress={dismissScheduleChange} activeOpacity={0.85}
                style={{ paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: C.butter }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.charcoal }}>확인</Text>
              </TouchableOpacity>
            </View>
          </AttentionMotion>
        )}

        {/* 오프라인 배너 — 기존 일정이 표시돼도 '새로고침 못 함'을 알려줌(로드 실패+데이터 있음 조합) */}
        {loadFailed && next && (
          <View style={{ marginHorizontal: SIDE_PAD, marginBottom: 6, backgroundColor: 'rgba(255,200,80,0.12)', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: fs(14) }}>{"📡"}</Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: 'rgba(255,255,255,0.6)', flex: 1 }}>
              인터넷 연결이 불안정해요 · 연결되면 자동으로 갱신돼요
            </Text>
          </View>
        )}

        {next ? (
        <>
        <View style={{ flex: 1 }} />
        <View style={[homeS.bottomArea, { paddingBottom: insets.bottom + 62 }]}>
          {/* 날짜 알약 + 「+ 추가」를 왼쪽에 나란히 — 전엔 space-between이라 「+ 추가」가 오른쪽 끝에 붙었는데,
              그 자리가 우측 버튼 레일 3번(알림 종) 아래라 알림이 뜨면 '알림' 라벨과 정면으로 겹쳤다(2026-07-22 캡처 확인).
              레일은 상시 요소이므로 오른쪽 끝을 비워두는 게 안전하다. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: SIDE_PAD, marginBottom: 8 }}>
            <TouchableOpacity
              onPress={() => setShowScheduleScreen(true)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 5,
                backgroundColor: 'rgba(255,255,255,0.14)',
                borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.24)',
                paddingHorizontal: 12, paddingVertical: 6,
                borderRadius: 20,
              }}>
              {/* 캘린더 아이콘 살짝 흔들어 '탭하면 일정 캘린더 열림' 신호 강화 (사용자 2026-06-29)
                  ★맥동(pulse) 대체 실험 → 19px 아이콘에선 눈에 안 띄어 shake 유지 결정, 코랄 계열은 명도 부족 (2026-07-03) */}
              <AttentionMotion type="shake" distance={3}>
                <Icon name="calendar" size={fs(19)} color={C.butter} />
              </AttentionMotion>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(16), color: 'rgba(255,255,255,0.95)' }}>{todayLabel}</Text>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(17), color: '#fff' }}>›</Text>
            </TouchableOpacity>
            {upcomingSchedules.length < 10 && (
              <TouchableOpacity onPress={() => setShowAddModal(true)} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ fontFamily: F.sysM, fontSize: fs(17), color: 'rgba(255,255,255,0.9)' }}>+ 추가</Text>
              </TouchableOpacity>
            )}
          </View>
          {/* (체크인 배너는 헤더 '이용 안내' 자리로 이동 — 박스 중복 제거) */}
          <ScrollView ref={cardsScrollRef} horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: SIDE_PAD, gap: 10 }}>
            {/* D-0이면 첫 카드 전폭(이후 서브카드는 옆으로 스와이프해서 봄). 높이·패딩은 CARD_H/CARD_PAD 단일 소스로 D-N 카드와 항상 동일.
                ★카드 높이 항상 고정(height) — 내용이 많아도 카드가 높아지지 않게(세부코스·확대 등). 넘침은 overflow hidden으로
                  경계 유지하되, 잘림이 안 보이게 내용은 폰트 축소(adjustsFontSizeToFit)·간격(flex)으로 CARD_H 안에 조정. iOS·안드 공통(2026-06-24). */}
            <View style={isD0
              ? { width: winW - SIDE_PAD * 2, backgroundColor: 'rgba(255,255,255,0.09)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.18)', borderRadius: 16, padding: CARD_PAD, height: CARD_H, overflow: 'hidden' }
              : homeS.mainCard}>
              {(freshDDay(next) === 0) ? (
                <>
                  {/* D-0 카드(전폭) — 상단 좌(정보 박스)·우(날씨교통, 박스X 큰 이모지) + 우측하단 나가기 + 하단 함께식사 긴 박스.
                      티오프+4h는 좌측 박스 내용만 토글([[home-round-ended-threshold]] 2026-06-18 재정의) */}
                  <View style={{ flexDirection: 'row', gap: 10, flex: 1 }}>
                    {/* 좌 칼럼 — 정보(구장) 박스 + 함께식사 박스 세로 스택(같은 너비) */}
                    <View style={{ flex: 1.4 }}>
                    {/* 좌 — 정보 박스 (전: 구장+시간+D-0 / 후: 종료배지+구장+기록 안내) */}
                    {roundEnded ? (
                      // flexBasis:'auto' — flex:1(=basis 0)이면 내용 높이가 카드에 전달 안 돼 확대 시 잘림.
                      // flexGrow로 평소 바닥붙임은 유지하되 basis auto로 내용높이를 카드 minHeight에 반영(확대 시 카드 늘어남).
                      <View style={{ flexGrow: 1, flexBasis: 'auto', paddingTop: 2 }}>
                        {/* 종료/완료 = 그린(완료감) — 버터 대신 의미색 */}
                        <View style={{ backgroundColor: isRecorded(next) ? '#7E9D62' : '#BE6E5D', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, alignSelf: 'flex-start' }}>
                          <Text style={{ fontFamily: F.sysSb, fontSize: fs(10), color: isRecorded(next) ? '#F1F7EA' : '#F8EAE4', letterSpacing: 1 }}>{isRecorded(next) ? '기록 완료' : '라운딩 종료'}</Text>
                        </View>
                        {/* 안드 adjustsFontSizeToFit는 numberOfLines>1이면 축소 대신 줄바꿈됨 → 안드만 1줄 강제(축소 동작) ([[rn-platform-gotchas]]) */}
                        <Text style={[homeS.cardCourse, { marginTop: 8, marginBottom: 0, fontSize: fs(Platform.OS === 'android' ? 21 : 18), lineHeight: Platform.OS === 'android' ? 27 : 23 }]} numberOfLines={Platform.OS === 'android' ? 1 : 2} adjustsFontSizeToFit minimumFontScale={Platform.OS === 'android' ? 0.6 : 0.78}>{displayCourseName(next.course)}</Text>
                        <Text style={[homeS.cardDate, { marginTop: 4 }]}>{next.date.slice(5)} {next.day} · {next.time} · {next.members}명</Text>
                        {isRecorded(next) ? (
                          <TouchableOpacity activeOpacity={0.85} style={{ marginTop: 16 }}
                            onPress={() => { const d = recordedDiary(next); navigation.navigate(ROUTES.MY, d ? { openDiaryId: d.id, returnToHome: true } : {}); }}>
                            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.85)', marginBottom: 3 }}>기록 완료 ✓</Text>
                            <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.butter }}>기록 보기 →</Text>
                          </TouchableOpacity>
                        ) : (
                          // 종료·미기록 D-0 — 핵심 동선(기록) 유도로 화살표 콕콕 nudge (시간한정이라 노이즈 X) ([[attention-motion]])
                          <AttentionMotion type="nudge" distance={5} style={{ marginTop: 16, alignSelf: 'flex-start' }}>
                            <TouchableOpacity activeOpacity={0.85}
                              onPress={() => navigation.navigate(ROUTES.MY, {
                                openAddModal: true, addDate: next.date, addCourse: next.course,
                                addCourseId: next.courseLogId || next.courseId, addScheduleId: next.id || null,
                                addCompanions: Array.isArray(next.companions) ? next.companions : null,
                                // 티오프 시간 직접 전달 — 단체 모집(teams>1)은 조별로 달라 제외(null) ([[teeoff-time-optional]])
                                addTime: (next.roundupId && (next.teams || 1) > 1) ? null : (next.time || null),
                              })}>
                              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.85)', marginBottom: 3 }}>오늘 라운딩 어떠셨나요?</Text>
                              <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.butter }}>기록 남기기 →</Text>
                            </TouchableOpacity>
                          </AttentionMotion>
                        )}
                      </View>
                    ) : (
                      <View style={{ flex: 1, paddingTop: 2 }}>
                        {/* 구장+날짜 탭 → 코스 페이지 */}
                        <TouchableOpacity activeOpacity={canOpenCourse(next) ? 0.7 : 1} onPress={() => handleCardCoursePress(next)}>
                          <Text style={[homeS.cardCourse, { marginBottom: 0, fontSize: fs(Platform.OS === 'android' ? 21 : 18), lineHeight: Platform.OS === 'android' ? 27 : 23 }]} numberOfLines={Platform.OS === 'android' ? 1 : 2} adjustsFontSizeToFit minimumFontScale={Platform.OS === 'android' ? 0.6 : 0.78}>{displayCourseName(next.course)}
                            {canOpenCourse(next) ? <Text style={{ fontSize: fs(12), color: 'rgba(200,217,230,0.6)' }}> ›</Text> : null}
                          </Text>
                          <Text style={[homeS.cardDate, { marginTop: 4 }]}>{next.date.slice(5)} {next.day} · {next.time} · {next.members}명</Text>
                        </TouchableOpacity>
                        {/* 휑함 보완 — 코스(세부코스) 이름만 한 줄(이모지 X, 있을 때). marginTop 작게(3) 해서 카드 빈 공간에
                            흡수되게 — 9면 D-day와의 빈 공간을 넘겨 카드가 높아졌음(2026-06-24). */}
                        {!!(next.subCourse || '').trim() && (
                          <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: 'rgba(255,255,255,0.85)', marginTop: 3 }} numberOfLines={1}>
                            {next.subCourse.trim()}
                          </Text>
                        )}
                        {/* 날씨별 준비물(당일) — 이미 받아둔 예보 아이콘·기온으로 한 줄. 입력 의존 없이 항상 뜸. 비/눈>추움>더움·맑음>흐림 우선.
                            비 판정은 아이콘(정오 기준이라 오후 비 놓침) + 그날 최대 강수확률 60%↑ 병행(테스터 '오후 비인데 우비가 없다' 2026-07-05). */}
                        {!!d0Info.icon && (() => {
                          const s = String(d0Info.icon || '');
                          const rain = /🌧|🌨|❄|🌦|⛈|☔/u.test(s) || (Number.isFinite(d0Info.pop) && d0Info.pop >= 60);
                          const cold = (d0Info.hi != null && d0Info.hi < 10) || (d0Info.lo != null && d0Info.lo <= 0);
                          const hot = d0Info.hi != null && d0Info.hi >= 28;
                          const prep = rain ? (cold ? '우비·핫팩·여벌 양말' : '우비·여벌 양말·타월')
                            : cold ? '핫팩·방한 장갑·넥워머'
                            : hot ? '선크림·모자·물 넉넉히'
                            : (s.includes('☀') || s.includes('🌤')) ? '선크림·모자·선글라스'
                            : (s.includes('☁') || s.includes('⛅')) ? '선크림·가벼운 겉옷'
                            : '선크림·모자';
                          return (
                            <Text style={{ fontFamily: F.sysM, fontSize: fs(11.5), color: 'rgba(255,255,255,0.88)', marginTop: 3 }} numberOfLines={1}>
                              <Text style={{ color: C.butter, fontFamily: F.sysSb }}>준비물</Text>  {prep}
                            </Text>
                          );
                        })()}
                        {/* iOS는 marginTop:'auto'의 남는 세로공간으로 준비물↔'오늘 라운딩'이 벌어지지만, 안드는 구장명
                            폰트가 커(fs21) 그 공간을 다 먹어 붙어 보임 → 안드에만 한 줄 간격 확보(사용자 2026-07-02).
                            ★단 세부구장 줄이 있으면 고정높이(CARD_H) 카드가 넘쳐 '일정 보기'가 함께식사 밑으로 밀리므로
                              세부구장 있을 땐 이 간격을 뺌(그 줄이 이미 내용을 채움). */}
                        {Platform.OS === 'android' && !(next.subCourse || '').trim() && <View style={{ height: 14 }} />}
                        {/* 당일은 큰 'D-0' 숫자 대신 '오늘 라운딩' 강조 — 오늘인 게 한눈에 + 코랄 포인트 유지. 탭하면 일정 시트(기존 D-0 탭 대체). */}
                        <TouchableOpacity onPress={() => openScheduleSheet(next)} activeOpacity={0.7} style={{ marginTop: 'auto', marginBottom: Platform.OS === 'ios' ? 8 : ((next.subCourse || '').trim() ? 6 : 16), alignSelf: 'flex-start' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                            <Text style={{ fontFamily: F.sysB, fontSize: fs(21), lineHeight: fs(27), color: '#DD6E58' }}>오늘 라운딩</Text>
                            <GreenFlag size={fs(28)} />{/* ⛳ 이모지 → 우리 골프 깃발(코랄·그린, 텍스트색과 통일) */}
                          </View>
                          <Text style={{ fontFamily: F.sysSb, fontSize: fs(11.5), color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>일정 보기 ›</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {/* 함께 식사 — 구장 박스 아래(같은 너비). ★위 정보박스가 flex:1이라 marginTop은 흡수돼 무효 →
                        marginBottom으로 바닥에서 띄워 위로 올림(2슬롯+메모, [[afterround-meal-decision]]) */}
                    <View style={{ marginRight: 12, marginBottom: 6, marginTop: 12 }}>
                      <MealDecisionBar schedule={next} uid={currentUid} nickname={userProfile?.nickname} active block friendMeta={friendMeta}
                        autoOpen={autoOpenMeal} onAutoOpened={() => setAutoOpenMeal(false)} />
                    </View>
                    </View>

                    {/* 좌 칼럼과 날씨·교통 사이 세로 분리선 */}
                    <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.32)', marginVertical: 2 }} />

                    {/* 우 — 세로 칼럼: 위 나가기(종료 후) + 아래 날씨·교통(우측 중앙, 박스X 큰 이모지) */}
                    <View style={{ flex: 1 }}>
                      {roundEnded && (
                        <TouchableOpacity onPress={() => handleDismissCard(next)} activeOpacity={0.7}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ alignSelf: 'flex-end', marginBottom: 8 }}>
                          <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.6)' }}>나가기 ✕</Text>
                        </TouchableOpacity>
                      )}
                      {/* 우측 — 날씨/교통 각각 탭: 날씨 탭하면 날씨 상세, 교통 탭하면 교통 상세로 팝업 오픈(해당 탭). */}
                      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 }}>
                        <TouchableOpacity onPress={() => { setSelectedSchedule(next); setShowWeatherFull(true); }} activeOpacity={0.7} style={{ alignItems: 'center' }}>
                          <WeatherGlyph icon={d0Info.icon || '🌤️'} size={fs(41)} />
                          <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: '#fff', marginTop: 3 }} numberOfLines={1}>{d0Info.wx || '날씨'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => { setSelectedSchedule(next); setShowTrafficFull(true); }} activeOpacity={0.7} style={{ alignItems: 'center' }}>
                          <Icon name="car" size={fs(51)} color="#8FB06B" strokeWidth={1.8} />
                          <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: '#fff', marginTop: 3 }} numberOfLines={1}>{d0Info.drive ? `${roundEnded ? '올 때 ' : ''}약 ${formatDriveMin(d0Info.drive)}` : '교통'}</Text>
                        </TouchableOpacity>
                        <Text style={{ fontFamily: F.sysM, fontSize: fs(11), color: 'rgba(255,255,255,0.82)' }}>더보기 →</Text>
                      </View>
                    </View>
                  </View>
                </>
              ) : (
                <>
                  <TouchableOpacity
                    onPress={() => handleCardCoursePress(next)}
                    activeOpacity={canOpenCourse(next) ? 0.7 : 1}
                    style={{ marginBottom: 4 }}>
                    {/* 구장명 1줄 고정(길면 자동 축소) — 세부코스 줄이 들어가도 iOS 좁은 카드서 행 안 붙고 넘침 방지. */}
                    <Text style={homeS.cardCourse} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>{displayCourseName(next.course)}
                      {canOpenCourse(next) ? <Text style={{ fontSize: fs(11), color: 'rgba(200,217,230,0.6)' }}> ›</Text> : null}
                    </Text>
                    <Text style={homeS.cardDate}>{next.date} {next.day} · {next.time} · {next.members}명</Text>
                  </TouchableOpacity>
                  {/* 코스(세부코스) — 첫 카드면 D-day 무관하게 표시(D-0과 동일, 입력 시만). 사용자 2026-06-20 */}
                  {!!(next.subCourse || '').trim() && (
                    <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: 'rgba(255,255,255,0.85)', marginTop: 3 }} numberOfLines={1}>{next.subCourse.trim()}</Text>
                  )}
                  <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                    <TouchableOpacity
                      onPress={() => openScheduleSheet(next)}
                      activeOpacity={0.7}
                      style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={homeS.cardDDay}>D-{freshDDay(next)}</Text>
                      {/* 탭하면 일정 시트 열린다는 affordance(테스터 피드백 2026-06-26) */}
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(30), color: C.butter, marginLeft: 8, marginTop: 6 }}>›</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => { setSelectedSchedule(next); setShowWeatherFull(true); }}
                      activeOpacity={0.7}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: Platform.OS === 'android' ? 4 : 6 }}>
                        <WeatherGlyph icon="⛅" size={Platform.OS === 'android' ? fs(30) : fs(34)} />
                        <Icon name="car" size={Platform.OS === 'android' ? fs(40) : fs(44)} color="#8FB06B" strokeWidth={1.8} />
                      </View>
                      <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: 'rgba(255,255,255,0.85)' }}>탭하여 확인하기 →</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>

            {upcomingSchedules.slice(1, 5).map((s, i) => {
              const opacity = [1, 0.85, 0.7, 0.55][i] ?? 0.55;
              // 카드 전체 = 일정 시트 열기(탭 영역 넓힘 — 가운데·여백·D-n 어디를 찍어도 시트, 발견성↑ 2026-06-13).
              //   구장명만 안쪽 터치로 코스 연결(코스 연결 불가하면 구장명도 시트로 폴백).
              return (
              <TouchableOpacity key={s.id} style={[homeS.subCard, { opacity }]}
                onPress={() => openScheduleSheet(s)} activeOpacity={0.85}>
                <TouchableOpacity
                  onPress={() => (canOpenCourse(s) ? handleCardCoursePress(s) : openScheduleSheet(s))}
                  onLongPress={() => openScheduleSheet(s)}
                  delayLongPress={350}
                  activeOpacity={canOpenCourse(s) ? 0.7 : 0.85}>
                  <Text style={homeS.subCourse} numberOfLines={2}>{displayCourseName(s.course)}
                    {canOpenCourse(s) ? <Text style={{ fontSize: fs(8), color: 'rgba(200,217,230,0.55)' }}> ›</Text> : null}
                  </Text>
                  <Text style={homeS.subDate}>{s.date.slice(5)} {s.day}</Text>
                  {!!(s.groupId && groupSharedCounts[s.groupId] > 1) && (
                    <View style={{ alignSelf: 'flex-start', backgroundColor: 'rgba(245,230,168,0.15)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginTop: 3 }}>
                      <Text style={{ fontFamily: F.sysM, fontSize: fs(10), color: 'rgba(245,230,168,0.75)' }}>{groupSharedCounts[s.groupId]}명 공유중</Text>
                    </View>
                  )}
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={homeS.subDDay}>D-{freshDDay(s)}</Text>
                  {/* 탭하면 일정 시트 열린다는 affordance — '카드 탭하면 뭐 뜨는지 모르겠다' 테스터 피드백(2026-06-26) */}
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(22), color: 'rgba(245,230,168,0.7)', includeFontPadding: false }}>›</Text>
                </View>
              </TouchableOpacity>
              );
            })}

          </ScrollView>

          {/* 배너 큐가 하나라도 떠 있으면(topBanner) 아래 구분선+한줄메모/코멘트 카드를 숨김 — 좁은 화면 겹침 방지(다 처리하면 복원). 사용자 지정 2026-06-18, 큐로 통합 2026-07-23. */}
          {!topBanner && (<>
          <View style={{ marginHorizontal: SIDE_PAD, marginVertical: 12 }}>
            <TripleStripe height={1.5} />
          </View>

          {(() => {
            const courseLabel = next?.course || '';

            const diaryEntries = diaries.filter(d => isRoundDiary(d) && d.course === next?.course); // 일상(모멘트) 제외 — 방문 판정은 라운딩만
            const myMemo = diaryEntries[0]?.memo;
            // 방문 여부는 실제 라운딩 기록 기준 (COURSE_LOG 목업이 아님)
            const visitCount = diaryEntries.length;
            const isFirstVisit = visitCount === 0;
            const topComment = homeTopComment;
            const hasGolfer = !!topComment;

            // 캐러셀(슬라이드 2+)이면 카드 높이 완전 고정 — memoCard의 minHeight만으론 내용 많은 카드
            //   (광고·코멘트 2줄)에서 늘어나 위 디데이 카드까지 들썩임(사용자 2026-07-03). 케이스별
            //   자연 높이 기준 + fs() 비례(디스플레이 확대 시 클립 방지). 슬라이드 1장이면 종전 그대로.
            const withGolfer = !isFirstVisit && !!myMemo && hasGolfer;
            const adsCount = Math.min(storeAds.length, 2);
            const slideCount = (isFirstVisit ? 2 : 1 + (withGolfer ? 1 : 0)) + adsCount;
            const isAnd = Platform.OS === 'android';
            const SLIDE_FIX = slideCount > 1
              ? { height: Math.round(fs(isFirstVisit ? (isAnd ? 84 : 110) : (!myMemo ? (isAnd ? 78 : 94) : (isAnd ? 72 : 92)))), minHeight: 0 }
              : null;

            const labelCourseTxt = (label) => (
              <Text style={[homeS.memoCardCourse, { fontSize: fs(11) }]} numberOfLines={1}>
                {label} · <Text style={{ color: 'rgba(255,255,255,0.55)' }}>{courseLabel}</Text>
              </Text>
            );

            // 슬라이드 조립 — 기본 카드(케이스별 1장) + 골퍼코멘트(케이스1 한정) + 스토어 광고(storeAds 원격).
            //   storeAds가 비어 있으면 슬라이드 구성·동작 모두 종전과 동일.
            // 케이스 3·4: 첫 방문
            const firstVisitCard = (
              <View style={[homeS.memoCard, SLIDE_FIX]}>
                <View style={homeS.memoCardTop}>
                  <View style={[homeS.memoBadgeFirst, { backgroundColor: '#C8D9E6' }]}>
                    <Text style={[homeS.memoBadgeTxt, { color: C.navy }]}>첫 방문</Text>
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
                      <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: '#F5E6A8', marginTop: 8, alignSelf: 'flex-start' }}>첫 번째 코멘트의 주인공이 되어보세요</Text>
                    </>
                  )}
                </View>
              </View>
            );

            // 미기록(첫 방문) 안내 메모 카드 — 이동 없이 정보만. 항상 캐러셀 유지 + 기록 유도(사용자 2026-07-20)
            const firstVisitMemoCard = (
              <View style={[homeS.memoCard, SLIDE_FIX]}>
                <View style={homeS.memoCardTop}>
                  <View style={homeS.memoBadgeVisit}>
                    <Text style={homeS.memoBadgeTxt}>한줄 메모</Text>
                  </View>
                  <Text style={homeS.memoCardCourse} numberOfLines={1}>{courseLabel}</Text>
                </View>
                <View style={homeS.memoCardBottom}>
                  <Text style={[homeS.memoTxt, { color: 'rgba(255,255,255,0.4)', borderLeftColor: 'rgba(255,255,255,0.2)' }]} numberOfLines={1}>아직 미기록 구장이에요</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.55)', marginTop: 8, lineHeight: 16 }} numberOfLines={2}>기록하면 메모를 다음 방문에 보여드려요</Text>
                </View>
              </View>
            );

            // 케이스 2: 방문 + 내 메모 없음
            const noMemoCard = (
              <View style={[homeS.memoCard, SLIDE_FIX]}>
                <View style={homeS.memoCardTop}>
                  <View style={homeS.memoBadgeVisit}>
                    <Text style={homeS.memoBadgeTxt}>한줄 메모</Text>
                  </View>
                  <Text style={homeS.memoCardCourse} numberOfLines={1}>{courseLabel}</Text>
                </View>
                <View style={homeS.memoCardBottom}>
                  <Text style={[homeS.memoTxt, { color: 'rgba(255,255,255,0.4)', borderLeftColor: 'rgba(255,255,255,0.2)' }]} numberOfLines={1}>아직 메모가 없어요</Text>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => navigation.navigate(ROUTES.MY, {
                      openAddModal: true,
                      addDate: next?.date,
                      addCourse: next?.course,
                      addCourseId: next?.courseLogId || next?.courseId,
                      addScheduleId: next?.id || null,
                      // 동반자·티오프 직접 전달(scheduleId find 의존 제거). 단체 모집(teams>1)은 시간 제외(null).
                      addCompanions: Array.isArray(next?.companions) ? next.companions : null,
                      addTime: (next?.roundupId && (next?.teams || 1) > 1) ? null : (next?.time || null),
                    })}
                    style={{ marginTop: 8, alignSelf: 'flex-start' }}>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: '#F5E6A8' }}>메모 남기기 →</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );

            // 케이스 1: 방문 + 내 메모 있음 (+ 골퍼 코멘트 카드)
            const myMemoCard = (
              <View style={[homeS.memoCard, SLIDE_FIX]}>
                <View style={homeS.memoCardTop}>
                  <View style={homeS.memoBadgeVisit}>
                    <Text style={homeS.memoBadgeTxt}>한줄 메모</Text>
                  </View>
                  <Text style={homeS.memoCardCourse} numberOfLines={1}>{courseLabel}</Text>
                </View>
                <View style={homeS.memoCardBottom}>
                  <Text style={homeS.memoTxt} numberOfLines={1} ellipsizeMode="tail">"{myMemo}"</Text>
                </View>
              </View>
            );
            const golferCard = hasGolfer ? (
              <View style={[homeS.commentCard, SLIDE_FIX]}>
                <View style={homeS.memoCardTop}>
                  <View style={homeS.memoBadgeComment}>
                    <Text style={[homeS.memoBadgeTxt, { color: '#C8D9E6' }]}>골퍼 코멘트</Text>
                  </View>
                  <Text style={[homeS.memoCardCourse, { flex: 1 }]} numberOfLines={1}>{courseLabel}</Text>
                  {/* 닉네임을 top 우상단으로 — 하단 본문(2줄)이 한줄메모와 같은 minHeight 안에 들어와 캐러셀 높이 안 튐 */}
                  <Text style={homeS.commentWhoTop} numberOfLines={1}>{topComment.who}</Text>
                </View>
                <View style={homeS.memoCardBottom}>
                  <Text style={homeS.commentTxt} numberOfLines={2} ellipsizeMode="tail">"{topComment.txt}"</Text>
                </View>
              </View>
            ) : null;

            // 스토어 광고 카드 — '광고판' 룩(눈에 띄어야 함, 사용자 2026-07-03).
            //   ad.img 있으면 카드 전체를 사진이 꽉 채우고(풀블리드) 스크림 위에 텍스트, 없으면 버터골드 채움 폴백.
            //   memoCard의 overflow:hidden+borderRadius 덕에 풀블리드가 모서리까지 깔끔. 탭 전체는 캐러셀 넘김 — 이동은 '보러 가기 →'.
            const adCards = storeAds.slice(0, 2).map((ad, i) => {
              const hasImg = !!ad.img;
              // 사진 없을 땐 페일스카이 채움 — 홈에 버터가 많아 스카이로 차별화(사용자 2026-07-03)
              return (
                <View key={`storead${i}`} style={[homeS.memoCard, { backgroundColor: hasImg ? '#2A2622' : '#C8D9E6', borderColor: 'rgba(26,61,82,0.2)' }, SLIDE_FIX]}>
                  {hasImg && (
                    <>
                      <ExpoImage source={{ uri: ad.img }} contentFit="cover" transition={0}
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
                      {/* 스크림 — 사진 위 텍스트 가독성(하단으로 갈수록 진해짐) */}
                      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(18,14,10,0.30)' }} />
                    </>
                  )}
                  <View style={[homeS.memoCardTop, { borderBottomColor: hasImg ? 'rgba(255,255,255,0.18)' : 'rgba(26,61,82,0.15)' }]}>
                    <View style={[homeS.memoBadgeVisit, { backgroundColor: '#6B1E2A' }]}>
                      <Text style={homeS.memoBadgeTxt}>스토어</Text>
                    </View>
                    <Text style={[homeS.memoCardCourse, { color: hasImg ? 'rgba(255,255,255,0.85)' : 'rgba(26,61,82,0.65)' }]} numberOfLines={1}>{ad.tag || '라운딩 준비물'}</Text>
                  </View>
                  {/* 제목 1줄 + '보러 가기' 같은 줄 — 고정 높이(SLIDE_FIX) 안에서 클립 없이 들어가는 슬림 구성 */}
                  <View style={[homeS.memoCardBottom, { flex: 1, flexDirection: 'row', alignItems: 'center' }]}>
                    <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(13.5), lineHeight: fs(19),
                      color: hasImg ? '#fff' : C.navy,
                      textShadowColor: hasImg ? 'rgba(0,0,0,0.45)' : 'transparent', textShadowRadius: hasImg ? 4 : 0 }} numberOfLines={1}>{ad.title}</Text>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                      onPress={() => { const u = ad.url || STORE_URL; if (u) Linking.openURL(u).catch(() => {}); }}
                      style={{ marginLeft: 10 }}>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(11), color: hasImg ? '#F5E6A8' : '#6B1E2A',
                        textShadowColor: hasImg ? 'rgba(0,0,0,0.45)' : 'transparent', textShadowRadius: hasImg ? 4 : 0 }}>보러 가기 →</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            });

            // 미기록(첫 방문)도 항상 캐러셀 — 안내 메모 + 골퍼코멘트 2장(고정 시 빈 공간 해소 + 기록 유도, 사용자 2026-07-20)
            const slides = isFirstVisit
              ? [firstVisitMemoCard, firstVisitCard, ...adCards]
              : [(!myMemo ? noMemoCard : myMemoCard), ...(withGolfer ? [golferCard] : []), ...adCards];

            if (slides.length === 1) return <View>{slides[0]}</View>;

            const slideIdx = Math.min(cardSlide, slides.length - 1);
            // 점 색: 기본(버터) · 골퍼코멘트(하늘) · 스토어(골드)
            const dotColor = (i) => (i === 0 ? '#F5E6A8' : ((withGolfer || isFirstVisit) && i === 1 ? '#C8D9E6' : '#E8C97A'));
            // ★캐러셀 전체(카드+점)를 고정 높이 컨테이너로 잠금 — 카드별 SLIDE_FIX에 더한 이중 방어.
            //   내부에서 어떤 높이 변화가 생겨도 위(디데이 카드)로 전파 0, 넘치면 아래로만(사용자 2026-07-03).
            const DOTS_H = 5 + 8; // 점 높이 + marginTop
            return (
              <View style={{ height: SLIDE_FIX.height + DOTS_H }}>
                <TouchableOpacity activeOpacity={0.9} onPress={toggleCardSlide}>
                  {slides[slideIdx]}
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', gap: 4, justifyContent: 'center', marginTop: 8 }}>
                  {slides.map((_, i) => (
                    <View key={i} style={{
                      width: slideIdx === i ? 14 : 5,
                      height: 5, borderRadius: 3,
                      backgroundColor: slideIdx === i ? dotColor(i) : 'rgba(255,255,255,0.15)',
                    }} />
                  ))}
                </View>
              </View>
            );
          })()}
          </>)}
          {/* 하단 여백 22→8 — 캐러셀 점과 하단 탭 사이가 너무 벌어 보임(사용자 2026-07-03) */}
          <View style={{ height: 8 }} />
        </View>
        </>
        ) : (hydrated && diariesHydrated) ? (
        // 일정·기록 둘 다 로드 완료 후에만 빈 상태 노출 — 로드 전 깜빡임 방지 ([[home-empty-state-flash]])
        (loadFailed || diariesLoadFailed) ? (
        // 오프라인/로드 실패 — 빈 화면이 '데이터 날아감'으로 오해되던 것([[read-failure-disguise]]).
        //   다른 앱은 에러 메시지가 뜨니 네트워크 문제인 걸 알지만, 이름만 뜨고 나머지 빈 화면은 공포를 줌.
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: SIDE_PAD }}>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 16, padding: 28, alignItems: 'center' }}>
            <Text style={{ fontSize: fs(32), marginBottom: 14 }}>{"📡"}</Text>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(16), color: '#fff', marginBottom: 8, textAlign: 'center' }}>
              인터넷 연결을 확인해주세요
            </Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: 'rgba(255,255,255,0.5)', lineHeight: fs(19), textAlign: 'center' }}>
              내 기록·일정을 불러오지 못했어요{'\n'}데이터가 사라진 게 아니에요 — 연결되면 다시 나타나요
            </Text>
            {/* 자동 재시도(Context 백오프·포그라운드 복귀)만으론 '가만히 기다리는' 느낌이라, 직접 누를 수 있는 액션을 준다 */}
            <TouchableOpacity onPress={() => { reloadDiaries?.(); }} activeOpacity={0.8}
              style={{ marginTop: 18, borderWidth: 1.2, borderColor: C.butter, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 26 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.butter }}>다시 시도</Text>
            </TouchableOpacity>
          </View>
        </View>
        ) : (
        <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: tabBarHeight + 24 }}>
          {/* 배경(밝은 골프장 사진) 위에서 글씨가 묻히지 않게 어두운 네이비 스크림 박스 + 흰 글씨(2026-07-24) */}
          <View style={{ marginHorizontal: SIDE_PAD, backgroundColor: 'rgba(20,45,64,0.62)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.22)', borderRadius: 16, padding: 24 }}>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: 'rgba(255,255,255,0.75)', letterSpacing: 2, marginBottom: 12 }}>예정 라운딩</Text>
            {/* '첫'은 진짜 신규(라운딩 기록·일정 둘 다 없음)에게만 — 기존 사용자가 예정 없을 땐 '첫' 제외 (사용자 2026-06-22) */}
            <Text style={{ fontFamily: F.en, fontSize: fs(22), color: '#fff', marginBottom: 8, lineHeight: 30 }}>
              Dear Golf 에서{'\n'}{((diaries || []).some(isRoundDiary) || (schedules || []).length > 0) ? '다음 ' : '첫 '}라운딩을 시작해보세요
            </Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: 'rgba(255,255,255,0.7)', lineHeight: 18, marginBottom: 20 }}>
              날씨 · 교통 · 코스 정보를{'\n'}한눈에 확인할 수 있어요
            </Text>
            <TouchableOpacity
              style={{ backgroundColor: C.butter, borderRadius: 12, paddingVertical: 13, alignItems: 'center' }}
              activeOpacity={0.8}
              onPress={() => setShowAddModal(true)}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal, letterSpacing: 0.5 }}>+ 라운딩 추가하기</Text>
            </TouchableOpacity>
            {/* 친구 0명 신규에게만 '친구 추가' 보조 동선 — 이 앱의 핵심 가치(함께 모집·기록·공유)는 친구 연결로 열림.
                홈 빈 상태가 '라운딩 추가'(혼자)만 가리키던 빈틈 보강. 친구 생기면 자동으로 사라짐 ([[first-entry-friend-path]]) */}
            {hasFriends === false && (
              <TouchableOpacity onPress={() => navigation.navigate(ROUTES.FRIENDS, { openFinder: 'kakao' })} activeOpacity={0.85}
                style={{ marginTop: 10, borderWidth: 1.2, borderColor: C.butter, borderRadius: 12, paddingVertical: 12,
                  flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7 }}>
                <Icon name="personAdd" size={fs(18)} color={C.butter} />
                <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.butter, letterSpacing: 0.3 }}>골프 친구 추가하기</Text>
              </TouchableOpacity>
            )}
            {/* 일정 없어도 캘린더(과거 일정·기록) 진입 — 빈 상태에서도 접근 가능하게 */}
            <TouchableOpacity onPress={() => setShowScheduleScreen(true)} activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ marginTop: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
              <Icon name="calendar" size={fs(15)} color="rgba(255,255,255,0.7)" />
              <Text style={{ fontFamily: F.sysM, fontSize: fs(13), color: 'rgba(255,255,255,0.7)' }}>일정 캘린더 보기 ›</Text>
            </TouchableOpacity>
          </View>
        </View>
        )
        ) : (
        // 일정 로드 중 — 빈 CTA 대신 중립 여백(잘못된 빈 상태 깜빡임 차단)
        <View style={{ flex: 1 }} />
        )}
        </ScrollView>
      </SafeAreaView>

      <ScheduleSheetModal
        visible={showScheduleModal}
        friendMeta={friendMeta}
        schedule={selectedSchedule}
        onClose={() => setShowScheduleModal(false)}
        courseNavigable={canOpenCourse(selectedSchedule)}
        onCourseTap={() => {
          setShowScheduleModal(false);
          handleCardCoursePress(selectedSchedule, selectedSchedule?.id); // 일정 시트→코스: 닫을 때 이 일정으로 복귀
        }}
        onWeather={() => { setShowScheduleModal(false); setShowWeatherFull(true); }}
        onTraffic={() => { setShowScheduleModal(false); setShowTrafficFull(true); }}
        onShare={(names) => handleShareSchedule(selectedSchedule, names)}
        onInviteFriends={() => handleInviteFriends(selectedSchedule)}
        onMeal={() => { setShowScheduleModal(false); setSheetMealSchedule(selectedSchedule); setSheetMealAutoOpen(true); }}
        onTeam={() => { setShowScheduleModal(false); setTeamScheduleRid(selectedSchedule?.roundupId || null); }}
        onOpenRoundup={() => {
          // 모집 연동 예정 일정 — 일정수정이 막혀 원본 모집글(라운지 상세)로 직행해 관리 ([[roundup-schedule-delete-policy]])
          const rid = selectedSchedule?.roundupId;
          setShowScheduleModal(false);
          if (rid) navigation.navigate(ROUTES.LOUNGE, { openPostId: rid });
        }}
        onEdit={() => handleEditSchedule(selectedSchedule)}
        onAlarm={() => {
          // 일정 시트 → 알람 변경: 시트 닫고 기존 설정 불러와 알람 화면 열기(편집 프리필)
          const s = selectedSchedule;
          setShowScheduleModal(false);
          if (!s) return;
          getAlarmConfig(s.id).then(cfg => { setAlarmEditExisting(cfg); setPendingAlarmSchedule(s); }).catch(() => { setAlarmEditExisting(null); setPendingAlarmSchedule(s); });
        }}
        onDelete={() => {
          // 시트 안에서 이미 confirm 완료 — 시트를 '먼저' 닫고(닫힘 애니메이션과 리스트 변경이 겹쳐
          //   안드에서 삭제 카드가 깜빡이던 잔상 방지) 삭제는 낙관적으로 백그라운드 처리.
          //   (별도 AppAlert 띄우지 않음, RN 3중 Modal 충돌 회피)
          const s = selectedSchedule;
          setShowScheduleModal(false);
          if (!s) return;
          removeSchedule(s.id).catch(e => console.warn('[home] schedule remove failed:', e?.message)); // 낙관적 제거(컨텍스트가 즉시 반영·실패 시 복원)
          // 전파 일정(groupId) 개인 삭제 = 조용히 탈퇴 — 취소 알림 X(한 명이 빠지는 것일 뿐, 개인 권리 존중).
          //   탈퇴(memberUids 제거)는 유지 → 변경 푸시 중단. 식사 audienceUids도 이탈 → 식사 푸시·카드 중단. ([[schedule-propagation-spec]])
          if (s.groupId && currentUid) {
            leaveScheduleGroup(s.groupId, currentUid).catch(e => { if (__DEV__) console.warn('[home] leave group', e?.message); });
            leaveMealAudience(s.groupId, currentUid);
          }
        }}
      />

      {/* 일정 시트 '함께 식사' — 트리거 버튼 없이 시트만(세컨 카드 등 next 아닌 일정에서도 접근). D-0 카드 식사바와 별개([[afterround-meal-decision]]) */}
      <MealDecisionBar
        triggerless
        schedule={sheetMealSchedule}
        uid={currentUid}
        nickname={userProfile?.nickname}
        friendMeta={friendMeta}
        active={!!sheetMealSchedule}
        autoOpen={sheetMealAutoOpen}
        onAutoOpened={() => setSheetMealAutoOpen(false)}
        onClose={() => {
          // 식사 시트 닫히면 원래 일정 시트로 복귀(빈 화면에 덩그러니 남지 않게). 모달 닫힘 후 재오픈([[ios-modal-stacking]]).
          const s = sheetMealSchedule;
          if (s) setTimeout(() => { setSelectedSchedule(s); setShowScheduleModal(true); setSheetMealSchedule(null); }, 260);
        }}
      />

      {/* 단체팀 화면 — 시트 닫은 뒤 열림(형제 Modal 회피, [[ios-modal-stacking]]) */}
      <RoundupTeamScreen visible={!!teamScheduleRid} roundupId={teamScheduleRid} onClose={() => setTeamScheduleRid(null)} />

      <WeatherTransportPopup
        visible={showWeatherFull || showTrafficFull || showWeatherPopup}
        initialTab={showTrafficFull ? 'tr' : 'wx'}
        schedule={selectedSchedule || next}
        schedules={schedules}
        weatherOnly={showWeatherPopup}
        onClose={() => { setShowWeatherFull(false); setShowTrafficFull(false); setShowWeatherPopup(false); refreshWxEmojiRef.current(); }}
      />

      <ScheduleModal visible={showAddModal} onClose={() => setShowAddModal(false)} onSave={handleScheduleSave} />
      <HomeIntroModal
        visible={showHomeIntro}
        onClose={() => setShowHomeIntro(false)}
        onAddSchedulePress={() => setShowAddModal(true)} />
      <ScheduleModal
        visible={!!editScheduleTarget}
        initial={editScheduleTarget}
        onClose={() => setEditScheduleTarget(null)}
        onSave={handleScheduleSave}
      />

      <AlarmSetupModal
        visible={!!pendingAlarmSchedule}
        schedule={pendingAlarmSchedule}
        existing={alarmEditExisting}
        onClose={() => {
          setPendingAlarmSchedule(null);
          setAlarmEditExisting(null);
        }}
      />

      {/* '이대로 자동' 모드 — 식사시각만 묻고 나머지는 저장설정대로 자동 적용 */}
      <QuickMealPrompt
        visible={!!pendingQuickAlarm}
        schedule={pendingQuickAlarm}
        onDone={(arriveAt) => {
          const s = pendingQuickAlarm;
          setPendingQuickAlarm(null);
          if (s) applyDefaultAlarms(s, userProfile, { arriveAt });
        }}
      />

      {/* 일정 공유 카드 — 이미지(바로공유/저장) + 평문 링크(설치 동선). 시트 닫은 뒤 홈 레벨에서 열림 */}
      <ShareMomentModal
        moment={scheduleShareTarget ? { ...scheduleShareTarget, shareKind: 'schedule' } : null}
        visible={!!scheduleShareTarget}
        onClose={() => setScheduleShareTarget(null)}
        onShareLink={() => { const t = scheduleShareTarget; setScheduleShareTarget(null); setTimeout(() => shareScheduleText(t), 350); }}
      />

      {/* 체크인 카드 뷰어 — 공유화면 없이 카드만 깔끔히 전체화면(프론트 체크인용). 닫기만 ([[schedule-booker]]) */}
      <Modal visible={!!checkinCard} transparent animationType="fade" onRequestClose={() => setCheckinCard(null)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setCheckinCard(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <TouchableOpacity onPress={() => setCheckinCard(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{ position: 'absolute', top: insets.top + 14, right: 22 }}>
            <Text style={{ fontSize: fs(26), color: 'rgba(255,255,255,0.9)' }}>✕</Text>
          </TouchableOpacity>
          {/* activeOpacity 1 + 카드 자체 탭은 닫기 막기(배경 탭만 닫힘) */}
          {/* 공유 카드와 '똑같이' 320폭으로 렌더(거기서 구장명 정상) → 비율 그대로 transform scale로만 확대.
              폭을 바꾸면 폰트가 다시 reflow돼 잘리므로, 레이아웃은 320 고정하고 화면에 맞춰 크게 보이게만. */}
          <TouchableOpacity activeOpacity={1} onPress={() => {}}
            style={{ transform: [{ scale: Math.min((winW - 24) / 320, 1.35) }] }}>
            {checkinCard && <ScheduleShareCard schedule={checkinCard} width={320} />}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>


      <HomeTooltip
        visible={showTooltip}
        onClose={() => { setShowTooltip(false); storage.save(STORAGE_KEYS.homeTooltipDone, true); }}
      />

      {/* 친구 일정에 초대(일정 전파) — 친구 다중선택 → 인앱 초대 발송 ([[schedule-propagation-spec]]) */}
      <FriendSelectModal
        visible={inviteOpen}
        mode="companion"
        friends={inviteFriends}
        maxSelect={inviteMax}
        onClose={() => { setInviteOpen(false); setInviteTarget(null); }}
        onConfirm={submitInviteFriends}
      />

      {/* 메시지(DM) — 홈 우상단 💬 진입 = 대화 목록(인스타식). 단일 Modal서 목록↔대화방 전환([[dm-design]]). */}
      <Modal visible={dmOpen} transparent animationType="slide"
        statusBarTranslucent={Platform.OS === 'android'}
        onRequestClose={() => (dmChat ? setDmChat(null) : setDmOpen(false))}>
        {dmChat ? (
          <DMChatScreen friendUid={dmChat.uid} friendName={dmChat.name} friendAvatarUri={dmChat.avatar || null} onClose={() => setDmChat(null)}
            onOpenRoundup={(postId, hostUid, scope) => {
              setDmChat(null); setDmOpen(false);
              // 친구지정(select)=내 참여 초대장(openView:'mine'), 그 외(친구모집 등)=모집 상세(openPostId)
              if (scope === 'select') navigation.navigate(ROUTES.LOUNGE, { openView: 'mine' });
              else navigation.navigate(ROUTES.LOUNGE, { openPostId: postId, openPostHost: hostUid });
            }} />
        ) : (
          <DMListScreen onClose={() => { setDmOpen(false); setDmChat(null); }} onOpenChat={(uid, name, avatar) => setDmChat({ uid, name, avatar })} />
        )}
      </Modal>

      {/* 크루(친구 소수그룹 공유앨범) — 홈 우상단 DM 아래 진입. 단일 Modal서 리스트↔앨범 전환(앨범은 이어서 구현, docs/crew-space-design.md) */}
      <Modal visible={crewOpen} transparent animationType={crewModalAnim}
        statusBarTranslucent={Platform.OS === 'android'}
        onRequestClose={() => { if (crewBack.current) crewBack.current(); else setCrewOpen(false); }}>
        <ModalBackContext.Provider value={crewBack}>
          <CrewListScreen onClose={() => setCrewOpen(false)}
            reopenCrewId={crewReturnId} onReopenConsumed={() => setCrewReturnId(null)}
            onOpenDM={(uid, name, avatar) => { if (uid && uid !== currentUid) setCrewDmChat({ uid, name, avatar }); }}
            onOpenRoundup={(id, hostUid, crewId) => {
              if (!id) return;
              if (Platform.OS === 'android') {
                // 안드: 크루 모달을 '연 채로' 라운지로 전환 → 무거운 라운지 렌더가 크루 모달 뒤(비노출)서 끝나고,
                //   모집 상세가 크루 위로 stack돼 '모달 하나 떠오름'처럼 보인다(탭 점프 비노출). 닫으면 밑의 크루가 바로 보임. [[rn-modal-android-jank]]
                navigation.navigate(ROUTES.LOUNGE, { openPostId: id, openPostHost: hostUid || undefined, openPostReturn: 'crewKept', openPostCrewId: crewId || undefined });
              } else {
                // iOS: 형제 풀스크린 Modal 2개 동시표시 불가([[ios-modal-stacking]]) → 크루 닫고 점프(iOS는 이미 부드러움).
                setCrewModalAnim('slide'); setCrewOpen(false);
                navigation.navigate(ROUTES.LOUNGE, { openPostId: id, openPostHost: hostUid || undefined, openPostReturn: 'crew', openPostCrewId: crewId || undefined });
              }
            }} />
        </ModalBackContext.Provider>

        {/* 크루에서 연 DM — 크루 Modal '안에' 중첩. iOS는 형제 Modal 2개를 동시에 못 띄워(크루 위 DM이 안 떴음) →
            중첩하면 크루 Modal이 DM을 위에 정상 표시. 안드는 기존대로 동작. 닫으면 크루로 복귀(DM 목록 안 거침). */}
        <Modal visible={!!crewDmChat} transparent animationType="slide"
          statusBarTranslucent={Platform.OS === 'android'}
          onRequestClose={() => setCrewDmChat(null)}>
          {/* 다크 프레임(DM_SURFACE #211E1B와 같은 색)을 먼저 깔아 슬라이드 동안 빈 화면이 안 보이게 —
              본문은 crewDmReady 뒤에 붙는다(위 ★ 지연 마운트). */}
          <View style={{ flex: 1, backgroundColor: '#211E1B' }}>
          {crewDmChat && crewDmReady && (
            <DMChatScreen friendUid={crewDmChat.uid} friendName={crewDmChat.name} friendAvatarUri={crewDmChat.avatar || null}
              onClose={() => setCrewDmChat(null)}
              onOpenRoundup={(postId, hostUid, scope) => {
                setCrewDmChat(null); setCrewOpen(false);
                if (scope === 'select') navigation.navigate(ROUTES.LOUNGE, { openView: 'mine' });
                else navigation.navigate(ROUTES.LOUNGE, { openPostId: postId, openPostHost: hostUid });
              }} />
          )}
          </View>
        </Modal>
      </Modal>

      {/* 일정 풀스크린 — 홈의 '일정' 라벨 탭 시 캘린더 화면 표시 */}
      <ScheduleScreen
        asModal
        visible={showScheduleScreen}
        onClose={() => setShowScheduleScreen(false)}
        navigation={navigation}
      />
    </View>
  );
}

