import AsyncStorage from '@react-native-async-storage/async-storage';

export const STORAGE_KEYS = {
  schedules:        '@dg_schedules',
  scheduleSyncDismissed: '@dg_schedule_sync_dismissed', // 전파 일정 변경 '나중에' 미룬 서명 {groupId: sig} — 같은 변경 재확인 방지
  diaries:          '@dg_diaries',
  hof:              '@dg_hof',
  profile:          '@dg_profile',
  favorites:        '@dg_favorites',
  userCourses:      '@dg_user_courses',
  recentCourses:    '@dg_recent_courses',
  courseComments:   '@dg_course_comments',
  savedRestaurants: '@dg_saved_restaurants',
  savedCourses:     '@dg_saved_courses',     // 내 저장 골프장(위시리스트) — 기록·일정과 무관
  foodRecs:         '@dg_food_recs',
  homeTooltipDone:  '@dg_home_tooltip_done',
  hofTeaserDismissed: '@dg_hof_teaser_dismissed',
  hofHintSeen:      '@dg_hof_hint_seen',   // 첫 특별한 순간 생긴 후 '펼치기' 안내 말풍선 본 여부
  alarms:           '@dg_alarms',
  calendarEvents:   '@dg_calendar_events',
  top100Checks:     '@dg_top100_checks',
  calendarChoice:   '@dg_calendar_choice',
  friendCoachDone:  '@dg_friend_coach_done',     // 친구 탭 첫 진입 툴팁 1회
  friendFeedSeen:   '@dg_friend_feed_seen',      // 친구별 마지막 본 글 시각 {uid: millis} — 친구탭 NEW 점
  dmFriendMeta:     '@dg_dm_friend_meta',        // DM 목록 친구 이름·아바타·별명 캐시 {names,avatars,meta} — 즉시 표시
  roundupTipDone:   '@dg_roundup_tip_done',      // 모집글 작성 화면 툴팁 1회
  roundupBookmarks: '@dg_roundup_bookmarks',     // 관심 모집 북마크 {postId: true}
  roundupHidden: '@dg_roundup_hidden',           // 가리기 — 길게 눌러 숨긴 모집 {postId: true} (내 화면 한정, 해제 없음)
  dismissedRoundCards: '@dg_dismissed_round_cards', // 홈 종료 카드 나가기 — 사용자가 닫은 D-0 카드 {scheduleId: true} (홈에서만 숨김, 자정 자연 정리)
  d0Info: '@dg_d0info_',  // [접두사] D-0 카드 날씨·교통·준비물 마지막값 캐시 — 키=d0Info+scheduleId, {t,date,v}. 콜드스타트 즉시표시용(stagger 완화)
  homeIntroSeen:    '@dg_home_intro_seen',       // 홈 Dear Golf 이용 안내 1회 — 뱃지 표시 제어
  roundupIntroSeen: '@dg_roundup_intro_seen',    // 라운지 소개 모달 첫 진입 1회 자동 열림 제어
  roundupIntroOpenedManually: '@dg_roundup_intro_opened_manual', // 라운지 소개 FAB 능동 클릭 1회 — 노란 알림 점 표시 제어 (자동 모달과 분리)
  userReportCount: '@dg_user_report_count',     // 사용자 신고 월 1건 한도 — { yearMonth: '2026-05', count: 0 }. 월 바뀌면 자동 0 초기화 (Phase 2 [[report-block-policy]] §3)
  kickCount: '@dg_kick_count',                  // 주최자 강퇴 월 2회 한도 — { yearMonth: '2026-05', count: 0 } ([[roundup-kick-policy]] §4)
  friendRequestCount: '@dg_friend_request_count', // 친구 신청 일 10건 한도 — { date: '2026.05.27', count: 0 } ([[friend-add-feature]])
  sentFriendRequests: '@dg_sent_friend_requests', // 보낸 친구 신청 id 배열 — ['userId', ...]
  kakaoTrace: '@dg_kakao_trace',  // 카카오 연동 흔적(true) — 익명 세션으로 떨어졌을 때 '카카오로 다시 연결' 배너 판단용 ([[anonymous-user-policy]] 복귀 경로)
  crewFavorites: '@dg_crew_favorites', // 크루 즐겨찾기 {crewId: true} — 기기 로컬, per-user 표시 선호(서버 미저장)
  crewSeen: '@dg_crew_seen', // 크루별 마지막으로 본 시점의 게시물 '개수' {crewId: postCount} — 기기 로컬, 목록 '새 글 N' 배지 판단(서버 미저장)
  crewSeenAt: '@dg_crew_seen_at', // 크루별 마지막으로 앨범 닫은 시각 {crewId: millis} — 기기 로컬, 앨범 안 NEW 점·'내 글 새 댓글'·목록 반응 신호 판단
  crewOrder: '@dg_crew_order', // 크루 목록 수동 순서 [crewId,...] — 기기 로컬, 드래그 정렬(서버 미저장)
  crewAliases: '@dg_crew_aliases', // 크루 내 별명 {crewId: alias} — 기기 로컬, per-user '나만 보는' 이름(서버 name은 불변, 전원공유 방지)
  crewDraft: '@dg_crew_draft', // 크루 새 글 작성 중 임시저장 {crewId: text} — 기기 로컬, 글만(미디어 uri는 휘발이라 제외). 게시 성공·지우기 시 삭제
  crewMuted: '@dg_crew_muted', // 크루별 알림(새 글 점) 음소거 {crewId: true} — 기기 로컬, per-user. 홈 크루 점에서 제외(어쩔수없이 든 크루 등)
  teamSeenAt: '@dg_team_seen_at', // 단체 모집별 단체팀(조편성) 마지막 열람 시각 {roundupId: millis} — 편성완료 미열람 맥동 판단(서버 미저장)
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
