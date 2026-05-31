import AsyncStorage from '@react-native-async-storage/async-storage';

export const STORAGE_KEYS = {
  schedules:        '@dg_schedules',
  diaries:          '@dg_diaries',
  hof:              '@dg_hof',
  profile:          '@dg_profile',
  favorites:        '@dg_favorites',
  userCourses:      '@dg_user_courses',
  recentCourses:    '@dg_recent_courses',
  courseComments:   '@dg_course_comments',
  savedRestaurants: '@dg_saved_restaurants',
  foodRecs:         '@dg_food_recs',
  homeTooltipDone:  '@dg_home_tooltip_done',
  hofTeaserDismissed: '@dg_hof_teaser_dismissed',
  hofHintSeen:      '@dg_hof_hint_seen',   // 첫 특별한 순간 생긴 후 '펼치기' 안내 말풍선 본 여부
  alarms:           '@dg_alarms',
  calendarEvents:   '@dg_calendar_events',
  top100Checks:     '@dg_top100_checks',
  calendarChoice:   '@dg_calendar_choice',
  friendCoachDone:  '@dg_friend_coach_done',     // 친구 탭 첫 진입 툴팁 1회
  roundupTipDone:   '@dg_roundup_tip_done',      // 모집글 작성 화면 툴팁 1회
  roundupBookmarks: '@dg_roundup_bookmarks',     // 관심 모집 북마크 {postId: true}
  roundupHidden: '@dg_roundup_hidden',           // 가리기 — 길게 눌러 숨긴 모집 {postId: true} (내 화면 한정, 해제 없음)
  dismissedRoundCards: '@dg_dismissed_round_cards', // 홈 종료 카드 나가기 — 사용자가 닫은 D-0 카드 {scheduleId: true} (홈에서만 숨김, 자정 자연 정리)
  homeIntroSeen:    '@dg_home_intro_seen',       // 홈 Dear Golf 이용 안내 1회 — 뱃지 표시 제어
  roundupIntroSeen: '@dg_roundup_intro_seen',    // 라운지 소개 모달 첫 진입 1회 자동 열림 제어
  roundupIntroOpenedManually: '@dg_roundup_intro_opened_manual', // 라운지 소개 FAB 능동 클릭 1회 — 노란 알림 점 표시 제어 (자동 모달과 분리)
  userReportCount: '@dg_user_report_count',     // 사용자 신고 월 1건 한도 — { yearMonth: '2026-05', count: 0 }. 월 바뀌면 자동 0 초기화 (Phase 2 [[report-block-policy]] §3)
  kickCount: '@dg_kick_count',                  // 주최자 강퇴 월 2회 한도 — { yearMonth: '2026-05', count: 0 } ([[roundup-kick-policy]] §4)
  friendRequestCount: '@dg_friend_request_count', // 친구 신청 일 10건 한도 — { date: '2026.05.27', count: 0 } ([[friend-add-feature]])
  sentFriendRequests: '@dg_sent_friend_requests', // 보낸 친구 신청 id 배열 — ['userId', ...]
};

export const storage = {
  async save(key, data) {
    try { await AsyncStorage.setItem(key, JSON.stringify(data)); } catch (e) { console.warn('storage.save', key, e); }
  },
  async load(key, fallback) {
    try {
      const raw = await AsyncStorage.getItem(key);
      return raw != null ? JSON.parse(raw) : fallback;
    } catch (e) { console.warn('storage.load', key, e); return fallback; }
  },
  async clear() {
    try { await AsyncStorage.clear(); } catch (e) { console.warn('storage.clear', e); }
  },
};
