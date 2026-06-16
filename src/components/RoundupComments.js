import React, { useState, useContext, useMemo } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { UserContext } from '../contexts/UserContext';
import { canAccessComments, isCommentClosed, sortComments, createComment, canDeleteComment, COMMENT_MAX_TOTAL } from '../utils/comments';
import { createContentReport } from '../utils/contentReports';
import { PROFANITY_BLOCK_MESSAGE } from '../utils/profanityFilter';
import { anonNick } from '../utils/anonNick';
import { friendDisplayName } from '../utils/friendGroups';

// 댓글 작성자 표시 이름 — 익명 참여자면 랜덤닉(호스트는 nameMap으로 실명). 현재 anonymousUids 기준이라
//   '나중에 익명 토글'한 경우도 옛 댓글까지 가려진다 ([[roundup-anonymous-participation]]).
//   비익명·호스트노출은 내가 정한 별명(customName) 우선 — 카드·명단과 일치 ([[friend_groups]]).
function commentAuthor(comment, post, viewerUid, nameMap, friendMeta) {
  const uid = comment.authorUid;
  const anon = Array.isArray(post?.anonymousUids) && post.anonymousUids.includes(uid);
  if (!anon) {
    const fallback = comment.authorName || '동반자';
    return (uid && uid !== viewerUid) ? friendDisplayName(friendMeta, uid, fallback) : fallback;
  }
  const viewerIsHost = !!viewerUid && post?.authorUid === viewerUid;
  if (viewerIsHost) {
    const revealed = (nameMap && nameMap[uid]) || comment.authorName || '동반자';
    return uid ? friendDisplayName(friendMeta, uid, revealed) : revealed;
  }
  return anonNick(uid, post?.id);
}

// 라운지 모집 댓글 영역 ([[roundup-comments-policy]]).
// - 참여 확정자만 작성·열람
// - 댓글 탭 → 바텀시트(카카오 오픈챗 스타일): 주최자 고정/고정해제 · 본인 삭제 · 타인 신고 · 취소
//   (인라인 버튼 상시노출 제거로 목록 정돈 — [[feedback_design_integrity_paramount]])
// - 티오프+5h 후 쓰기 비활성, 읽기 유지 / 비속어 자동 필터
// - 신고: content_reports(roundupComment) 기록. 친구 범위라 자동 takedown은 후속, 현재 운영 검토용.

const COMMENT_MAX = 300;

function CommentRow({ comment, onPress, authorName }) {
  const dateLabel = useMemo(() => formatRelative(comment.createdAt), [comment.createdAt]);
  return (
    <TouchableOpacity activeOpacity={0.6} onPress={() => onPress(comment)}
      style={{ paddingVertical: 12, borderTopWidth: 0.5, borderTopColor: C.hairline }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        {comment.pinned && (
          <View style={{ backgroundColor: C.navy, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(10), color: C.butter }}>📌 주최자 고정</Text>
          </View>
        )}
        <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.sysB, fontSize: fs(13), color: C.charcoal }}>
          {authorName || comment.authorName || '동반자'}
        </Text>
        <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>· {dateLabel}</Text>
      </View>
      <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.textSecondary, lineHeight: 19 }}>{comment.body}</Text>
    </TouchableOpacity>
  );
}

// 댓글 액션 바텀시트 — 댓글 탭 시 하단에서 올라옴. 역할별 메뉴 → (신고는) 사유 선택 → 접수 안내.
function CommentActionSheet({ comment, isHost, isMine, onClose, onPin, onDelete, onReport }) {
  const insets = useSafeAreaInsets();   // 안드 내비바 인셋 — 시트 하단 잘림 방지
  const [step, setStep] = useState('menu');   // 'menu' | 'report' | 'done'
  const [doneMsg, setDoneMsg] = useState('');

  const Row = ({ label, color, onPress }) => (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}
      style={{ paddingVertical: 15, alignItems: 'center', borderTopWidth: 0.5, borderTopColor: C.hairline }}>
      <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: color || C.charcoal }}>{label}</Text>
    </TouchableOpacity>
  );

  const doReport = async (reason) => {
    const msg = await onReport(comment, reason);
    setDoneMsg(msg);
    setStep('done');
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}}
          style={{ backgroundColor: C.bgPrimary, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingBottom: 8 + insets.bottom }}>
          <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.hairline, marginTop: 10, marginBottom: 2 }} />

          {step === 'menu' && (
            <View style={{ marginTop: 6 }}>
              {isHost && (
                <Row label={comment.pinned ? '고정 해제' : '고정'} onPress={() => { onPin?.(comment.id); onClose(); }} />
              )}
              {isMine && (
                <Row label="삭제" color="#8B2A2A" onPress={() => { onDelete?.(comment.id); onClose(); }} />
              )}
              {!isMine && (
                <Row label="신고하기" color="#8B2A2A" onPress={() => setStep('report')} />
              )}
              <Row label="취소" color={C.warmGray} onPress={onClose} />
            </View>
          )}

          {step === 'report' && (
            <>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal, textAlign: 'center', paddingTop: 10, paddingBottom: 2 }}>
                신고 사유를 선택해주세요
              </Text>
              <Row label="광고 · 스팸" onPress={() => doReport('ad_spam')} />
              <Row label="부적절한 내용" onPress={() => doReport('inappropriate')} />
              <Row label="뒤로" color={C.warmGray} onPress={() => setStep('menu')} />
            </>
          )}

          {step === 'done' && (
            <>
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.charcoal, textAlign: 'center',
                paddingTop: 18, paddingHorizontal: 20, lineHeight: 20 }}>
                {doneMsg}
              </Text>
              <Row label="확인" onPress={onClose} />
            </>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

export function RoundupComments({ post, comments, total = 0, joined, myUid, nameMap = {}, friendMeta = {}, inputRef, onInputFocus, onAdd, onDelete, onPin, onLoadOlder }) {
  const { userProfile } = useContext(UserContext);
  const [body, setBody] = useState('');
  const [error, setError] = useState(null);
  const [actionComment, setActionComment] = useState(null);  // 액션 시트 대상 댓글

  const myId = userProfile?.uid || userProfile?.kakaoId || null;
  const myName = userProfile?.nickname || '나';
  // 본인이 주최자 — RoundupDetail과 동일하게 authorUid===myUid로 판정 (옛 로컬 데이터는 author==='나' 폴백)
  const isMine = (!!myUid && post?.authorUid === myUid) || post?.author === '나';
  // 접근 권한: 주최자 + 참여 확정자만.
  const access = isMine || !!joined || canAccessComments(post, myId, myName);
  const closed = isCommentClosed(post);
  const sorted = useMemo(() => sortComments(comments || []), [comments]);
  const hasMore = sorted.length < total;          // 로드 안 된 더 오래된 댓글 존재 → "이전 댓글 보기"
  const atLimit = total >= COMMENT_MAX_TOTAL;      // 총 300개 도달 → 작성 차단

  const submit = () => {
    setError(null);
    // 익명 참여 중이면 작성자명을 랜덤닉으로 저장 — 월드리더블 댓글 문서에 실명 비저장(authorUid는 그대로=신고·책임성).
    const anonMe = Array.isArray(post?.anonymousUids) && post.anonymousUids.includes(myUid || myId);
    const writeName = anonMe ? anonNick(myUid || myId, post.id) : myName;
    const r = createComment(post.id, { uid: myId, name: writeName }, body);
    if (!r.ok) {
      if (r.reason === 'profanity') setError(PROFANITY_BLOCK_MESSAGE);
      else if (r.reason === 'empty') setError('댓글을 입력해주세요');
      return;
    }
    onAdd?.(r.comment);
    setBody('');
  };

  // 댓글 신고 — content_reports(roundupComment) 기록. 1인 1회(멱등). 반환: 안내 문구.
  const reportComment = async (comment, reason) => {
    try {
      const r = await createContentReport({
        targetType: 'roundupComment',
        targetId: comment.id,
        targetAuthorUid: comment.authorUid || null,
        reason,
      });
      if (r?.alreadyReported) return '이미 신고한 댓글이에요.';
      return '신고가 접수됐어요.\n검토 후 조치할게요.';
    } catch (e) {
      return '신고에 실패했어요.\n잠시 후 다시 시도해주세요.';
    }
  };

  return (
    <View style={{ marginTop: 16 }}>
      <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.warmGray, letterSpacing: 1.5,
        marginHorizontal: 16, marginBottom: 8 }}>
        댓글{sorted.length > 0 ? ` ${sorted.length}` : ''}
      </Text>

      <View style={{ marginHorizontal: 16, backgroundColor: C.bgSecondary, borderRadius: 14,
        borderWidth: 0.5, borderColor: C.hairline, paddingHorizontal: 14 }}>

        {!access ? (
          <View style={{ paddingVertical: 32, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, textAlign: 'center', lineHeight: 18 }}>
              참여가 확정된 동반자만{'\n'}댓글을 작성·열람할 수 있어요
            </Text>
          </View>
        ) : (
          <>
            {/* 이전 댓글 보기 — 최신 100개 밖의 더 오래된 댓글 (최신이 아래라 목록 맨 위, 더 오래된 건 위로 쌓임).
                아래 첫 댓글 행의 상단 구분선이 경계 역할을 하므로 버튼 자체 보더는 두지 않음(이중선 방지). */}
            {hasMore && (
              <TouchableOpacity onPress={onLoadOlder} activeOpacity={0.7}
                style={{ paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.warmGray }}>이전 댓글 보기</Text>
              </TouchableOpacity>
            )}

            {sorted.length === 0 ? (
              <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                <Text style={{ fontSize: fs(24), marginBottom: 8 }}>💬</Text>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal, marginBottom: closed ? 0 : 3 }}>
                  아직 댓글이 없어요
                </Text>
                {!closed && (
                  <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray }}>동반자에게 첫 댓글을 남겨보세요</Text>
                )}
              </View>
            ) : (
              sorted.map(c => (
                <CommentRow key={c.id} comment={c} onPress={setActionComment}
                  authorName={commentAuthor(c, post, myUid, nameMap, friendMeta)} />
              ))
            )}

            {/* 입력 영역 — 티오프+5h 후 비활성 / 총 300개 도달 시 작성 차단 */}
            <View style={{ borderTopWidth: 0.5, borderTopColor: C.hairline, paddingVertical: 12 }}>
              {closed ? (
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, textAlign: 'center', paddingVertical: 8 }}>
                  라운딩이 끝나 댓글이 닫혔어요
                </Text>
              ) : atLimit ? (
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, textAlign: 'center', paddingVertical: 8 }}>
                  댓글이 가득 찼어요 (최대 {COMMENT_MAX_TOTAL}개)
                </Text>
              ) : (
                <>
                  <TextInput
                    ref={inputRef}
                    onFocus={onInputFocus}
                    style={{ fontFamily: F.sys, fontSize: fs(13), color: C.charcoal,
                      backgroundColor: C.bgPrimary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
                      borderWidth: 0.5, borderColor: C.hairline, minHeight: 40, textAlignVertical: 'top' }}
                    placeholder="동반자에게 남길 댓글을 적어주세요"
                    placeholderTextColor={C.warmGrayLight}
                    value={body}
                    onChangeText={(t) => { setBody(t.slice(0, COMMENT_MAX)); if (error) setError(null); }}
                    multiline
                  />
                  {error && (
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: '#8B2A2A', marginTop: 6 }}>{error}</Text>
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                    {/* 글자 수 카운터 — 한도(300자)에 가까울 때만 노출 (평소엔 노이즈) */}
                    {body.length >= 250 && (
                      <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: body.length >= 290 ? '#8B2A2A' : C.warmGrayLight }}>
                        {body.length}/{COMMENT_MAX}
                      </Text>
                    )}
                    <TouchableOpacity onPress={submit} disabled={!body.trim()}
                      activeOpacity={0.85}
                      style={{ marginLeft: 'auto', backgroundColor: body.trim() ? C.burgundy : C.hairline,
                        borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 }}>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(12),
                        color: body.trim() ? C.butter : C.warmGray }}>등록</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </>
        )}

      </View>

      {access && sorted.length > 0 && (
        <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGrayLight,
          marginHorizontal: 20, marginTop: 6, lineHeight: 14 }}>
          댓글을 누르면 신고하거나 삭제할 수 있어요
        </Text>
      )}

      {actionComment && (
        <CommentActionSheet
          comment={actionComment}
          isHost={isMine}
          isMine={canDeleteComment(actionComment, myId, myName)}
          onClose={() => setActionComment(null)}
          onPin={onPin}
          onDelete={onDelete}
          onReport={reportComment} />
      )}
    </View>
  );
}

function formatRelative(ms) {
  const diff = Date.now() - ms;
  if (diff < 60000) return '방금';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`;
  if (diff < 86400000 * 7) return `${Math.floor(diff / 86400000)}일 전`;
  const d = new Date(ms);
  return `${d.getMonth() + 1}.${d.getDate()}`;
}
