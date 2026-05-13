import AsyncStorage from '@react-native-async-storage/async-storage';

export const STORAGE_KEYS = {
  schedules:   '@dg_schedules',
  diaries:     '@dg_diaries',
  hof:         '@dg_hof',
  profile:     '@dg_profile',
  favorites:   '@dg_favorites',
  userCourses: '@dg_user_courses',
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
};
