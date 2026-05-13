import { COURSE_TAGS, COURSE_TAG_COLORS, COURSE_LOG } from '../constants/data';

// 일정 배열을 오늘 기준 dDay 재계산 + 지난 일정(dDay < 0) 제거 + 날짜 오름차순 정렬
// + course 이름을 COURSE_LOG의 정식 이름으로 case-insensitive 자동 매핑 (courseLogId도 보충)
export const normalizeSchedules = (list) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const MS = 1000 * 60 * 60 * 24;
  return list
    .map(s => {
      const course = (s.course || '').toLowerCase();
      const matched = course && (
        COURSE_LOG.find(c => c.name.toLowerCase() === course)
        || COURSE_LOG.find(c => {
          const n = c.name.toLowerCase();
          return n.includes(course) || course.includes(n);
        })
      );
      const mapped = matched
        ? { ...s, course: matched.name, courseLogId: s.courseLogId || matched.id }
        : s;
      const [y, m, d] = (mapped.date || '').split('.').map(Number);
      if (!y || !m || !d) return { ...mapped, dDay: mapped.dDay ?? 0 };
      const target = new Date(y, m - 1, d);
      target.setHours(0, 0, 0, 0);
      return { ...mapped, dDay: Math.ceil((target - today) / MS) };
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
