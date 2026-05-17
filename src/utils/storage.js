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
  alarms:           '@dg_alarms',
  calendarEvents:   '@dg_calendar_events',
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
