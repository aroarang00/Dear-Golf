import {
  collection, query, where, limit, getDocs, addDoc, deleteDoc,
  doc, updateDoc, arrayUnion, arrayRemove, increment, serverTimestamp,
} from 'firebase/firestore';
import { db, getUid } from './firebase';
import { COURSE_COMMENTS } from '../constants/data';

// 골프장별 골퍼 코멘트 — Firestore 'courseComments' 컬렉션에 전체 유저 공유 저장.
// 문서: { courseId, text, authorUid, authorName, date, likes, likedBy[], createdAt }

const COL = 'courseComments';

// Firestore 문서 → 앱에서 쓰는 코멘트 객체 (기존 컴포넌트 구조 유지)
function toComment(d, uid) {
  const v = d.data() || {};
  const likedBy = Array.isArray(v.likedBy) ? v.likedBy : [];
  return {
    id: d.id,
    courseId: v.courseId,
    authorUid: v.authorUid || null,
    txt: v.text || '',
    who: v.authorName || '익***',
    date: v.date || '',
    likes: typeof v.likes === 'number' ? v.likes : likedBy.length,
    likedByMe: uid ? likedBy.includes(uid) : false,
    mine: uid ? v.authorUid === uid : false,
    hiddenAt: v.hiddenAt || null,  // 자동 임시 가림(3건 누적, [[content-report-policy]])
  };
}

// 해당 골프장의 코멘트 전체 (정렬은 호출부에서 — 좋아요순)
// 자동 임시 가림(hiddenAt) 코멘트는 작성자 본인에게만 노출, 다른 사용자에겐 숨김.
export async function getCourseComments(courseId) {
  if (!courseId) return [];
  try {
    const uid = await getUid();
    const snap = await getDocs(query(collection(db, COL), where('courseId', '==', courseId)));
    return snap.docs
      .map((d) => toComment(d, uid))
      .filter((c) => !c.hiddenAt || c.mine);
  } catch (e) {
    console.warn('[comments] load failed', e?.message);
    return [];
  }
}

// 코멘트 작성 — 성공 시 추가된 코멘트 객체 반환, 실패 시 null
export async function addCourseComment(courseId, text, authorName, date) {
  const uid = await getUid();
  if (!uid || !courseId || !text) return null;
  try {
    const ref = await addDoc(collection(db, COL), {
      courseId,
      text,
      authorUid: uid,
      authorName: authorName || '익***',
      date: date || '',
      likes: 0,
      likedBy: [],
      createdAt: serverTimestamp(),
    });
    return { id: ref.id, courseId, txt: text, who: authorName || '익***', date: date || '', likes: 0, likedByMe: false, mine: true };
  } catch (e) {
    console.warn('[comments] add failed', e?.message);
    return null;
  }
}

// 좋아요 토글 — wasLiked: 누르기 직전 좋아요 상태
export async function toggleCommentLike(commentId, wasLiked) {
  const uid = await getUid();
  if (!uid || !commentId) return false;
  try {
    await updateDoc(doc(db, COL, commentId), {
      likedBy: wasLiked ? arrayRemove(uid) : arrayUnion(uid),
      likes: increment(wasLiked ? -1 : 1),
    });
    return true;
  } catch (e) {
    console.warn('[comments] like failed', e?.message);
    return false;
  }
}

// 내가 쓴 코멘트 삭제
export async function deleteCourseComment(commentId) {
  if (!commentId) return false;
  try {
    await deleteDoc(doc(db, COL, commentId));
    return true;
  } catch (e) {
    console.warn('[comments] delete failed', e?.message);
    return false;
  }
}

// 내가 쓴 코멘트 수정 — 본문(text)만. 보안 규칙: 작성자 본인만 update 가능.
export async function updateCourseComment(commentId, text) {
  if (!commentId || !text || !text.trim()) return false;
  try {
    await updateDoc(doc(db, COL, commentId), { text: text.trim() });
    return true;
  } catch (e) {
    console.warn('[comments] update failed', e?.message);
    return false;
  }
}

// 홈 화면용 — 해당 코스 좋아요 1위 코멘트 (없으면 null)
export async function getTopComment(courseId) {
  const list = await getCourseComments(courseId);
  if (list.length === 0) return null;
  return [...list].sort((a, b) => b.likes - a.likes)[0];
}

// 기존 목업 코멘트(data.js의 COURSE_COMMENTS)를 Firestore에 1회 업로드.
// 컬렉션이 비어 있을 때만 동작 — 중복 시드 방지. (개발용)
export async function seedCourseComments() {
  const uid = await getUid();
  if (!uid) return { seeded: 0, skipped: true, reason: '로그인 실패' };
  try {
    const existing = await getDocs(query(collection(db, COL), limit(1)));
    if (!existing.empty) return { seeded: 0, skipped: true, reason: '이미 데이터 있음' };
    let n = 0;
    for (const c of COURSE_COMMENTS) {
      await addDoc(collection(db, COL), {
        courseId: c.courseId,
        text: c.txt,
        authorUid: uid,
        authorName: c.who,
        date: '2025.03',
        likes: c.likes || 0,
        likedBy: [],
        createdAt: serverTimestamp(),
      });
      n++;
    }
    return { seeded: n, skipped: false };
  } catch (e) {
    console.warn('[comments] seed failed', e?.message);
    return { seeded: 0, skipped: true, reason: e?.message || '오류' };
  }
}
