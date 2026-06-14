import {
  collection, query, where, getDocs, doc, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { db, getUid } from './firebase';

// 코스별 골퍼 평점 — 'courseRatings' 컬렉션. 1인 1평가(문서ID={courseKey}_{uid}, 결정적 ID로 중복방지·upsert).
// 3카테고리 별 5점: mgmt(코스관리)·pace(경기진행)·value(가성비). 통계=클라 집계(MVP, [[project_course_rating]]).
//  ※ courseKey는 골퍼코멘트와 동일 키(카카오코스=kakaoId 통일)로 같은 코스 평점이 합산되게.

const COL = 'courseRatings';
const CATS = ['mgmt', 'pace', 'value'];

// 코스 평점 집계 → { count, avg:{mgmt,pace,value}, overall, mine:{mgmt,pace,value}|null }
export async function getCourseRatings(courseKey) {
  const empty = { count: 0, avg: { mgmt: 0, pace: 0, value: 0 }, overall: 0, mine: null };
  if (!courseKey) return empty;
  try {
    const uid = await getUid();
    const snap = await getDocs(query(collection(db, COL), where('courseId', '==', courseKey)));
    const sums = { mgmt: 0, pace: 0, value: 0 };
    let count = 0, mine = null;
    snap.forEach((d) => {
      const v = d.data() || {};
      if (!CATS.every((k) => typeof v[k] === 'number' && v[k] > 0)) return;
      count++;
      CATS.forEach((k) => { sums[k] += v[k]; });
      if (uid && v.uid === uid) mine = { mgmt: v.mgmt, pace: v.pace, value: v.value };
    });
    const avg = count
      ? { mgmt: sums.mgmt / count, pace: sums.pace / count, value: sums.value / count }
      : { mgmt: 0, pace: 0, value: 0 };
    const overall = count ? (avg.mgmt + avg.pace + avg.value) / 3 : 0;
    return { count, avg, overall, mine };
  } catch (e) {
    console.warn('[courseRatings] load failed', e?.message);
    return empty;
  }
}

// 내 평가 저장/수정 (upsert) — scores={mgmt,pace,value} 각 1~5
export async function setMyCourseRating(courseKey, scores) {
  const uid = await getUid();
  if (!uid || !courseKey) return false;
  if (!CATS.every((k) => typeof scores?.[k] === 'number' && scores[k] >= 1 && scores[k] <= 5)) return false;
  try {
    await setDoc(doc(db, COL, `${courseKey}_${uid}`), {
      courseId: courseKey, uid,
      mgmt: scores.mgmt, pace: scores.pace, value: scores.value,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return true;
  } catch (e) {
    console.warn('[courseRatings] save failed', e?.message);
    return false;
  }
}
