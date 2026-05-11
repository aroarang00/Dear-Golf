import { COURSE_TAGS, COURSE_TAG_COLORS } from '../constants/data';

// 일정 배열을 오늘 기준 dDay 재계산 + 지난 일정(dDay < 0) 제거 + 날짜 오름차순 정렬
export const normalizeSchedules = (list) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const MS = 1000 * 60 * 60 * 24;
  return list
    .map(s => {
      const [y, m, d] = (s.date || '').split('.').map(Number);
      if (!y || !m || !d) return { ...s, dDay: s.dDay ?? 0 };
      const target = new Date(y, m - 1, d);
      target.setHours(0, 0, 0, 0);
      return { ...s, dDay: Math.ceil((target - today) / MS) };
    })
    .filter(s => s.dDay >= 0)
    .sort((a, b) => a.dDay - b.dDay);
};

export const getTagColor = (tag) => {
  for (const [category, tags] of Object.entries(COURSE_TAGS)) {
    if (tags.includes(tag)) return COURSE_TAG_COLORS[category];
  }
  return { bg: '#F5E6A8', text: '#5A4500' };
};
