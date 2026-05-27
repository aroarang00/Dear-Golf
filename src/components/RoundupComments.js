import React, { useState, useContext, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { C, F, fs } from '../constants/colors';
import { UserContext } from '../contexts/UserContext';
import { canAccessComments, isAfterTeeOff, sortComments, createComment, canDeleteComment } from '../utils/comments';
import { PROFANITY_BLOCK_MESSAGE } from '../utils/profanityFilter';

// 라운지 모집 댓글 영역 ([[roundup-comments-policy]]).
// - 참여 확정자만 작성·열람
// - 본인만 삭제, 주최자만 고정(1개)
// - 티오프 후 쓰기 비활성, 읽기는 유지
// - 비속어 자동 필터 (false positive 최소화)
// - 신고는 마이페이지 일원화 (이곳에 신고 버튼 X)

const COMMENT_MAX = 300;

function CommentRow({ comment, isMine, isHost, canModify, onDelete, onPin }) {
  const dateLabel = useMemo(() => formatRelative(comment.createdAt), [comment.createdAt]);
  return (
    <View style={{ paddingVertical: 12, borderTopWidth: 0.5, borderTopColor: C.hairline }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        {comment.pinned && (
          <View style={{ backgroundColor: C.navy, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(10), color: C.butter }}>📌 주최자 고정</Text>
          </View>
        )}
        <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal }}>
          {isMine ? '나' : comment.authorName}
        </Text>
        <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>· {dateLabel}</Text>
        {canModify && (
          <View style={{ flexDirection: 'row', gap: 10, marginLeft: 'auto' }}>
            {isHost && onPin && (
              <TouchableOpacity onPress={() => onPin(comment.id)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.warmGray }}>
                  {comment.pinned ? '고정 해제' : '고정'}
                </Text>
              </TouchableOpacity>
            )}
            {isMine && onDelete && (
              <TouchableOpacity onPress={() => onDelete(comment.id)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: '#8B2A2A' }}>삭제</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
      <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.charcoal, lineHeight: 19 }}>{comment.body}</Text>
    </View>
  );
}

export function RoundupComments({ post, comments, joined, onAdd, onDelete, onPin }) {
  const { userProfile } = useContext(UserContext);
  const [body, setBody] = useState('');
  const [error, setError] = useState(null);

  const myId = userProfile?.uid || userProfile?.kakaoId || null;
  const myName = userProfile?.nickname || '나';
  const isMine = post?.author === '나';   // 본인이 주최자
  // 접근 권한: 주최자 + 참여 확정자. 더미는 joined prop으로 우회, Firebase 시 participantUids 검증.
  const access = isMine || !!joined || canAccessComments(post, myId, myName);
  const closed = isAfterTeeOff(post);
  const sorted = useMemo(() => sortComments(comments || []), [comments]);

  const submit = () => {
    setError(null);
    const r = createComment(post.id, { uid: myId, name: '나' }, body);
    if (!r.ok) {
      if (r.reason === 'profanity') setError(PROFANITY_BLOCK_MESSAGE);
      else if (r.reason === 'empty') setError('댓글을 입력해주세요');
      return;
    }
    onAdd?.(r.comment);
    setBody('');
  };

  return (
    <View style={{ marginTop: 22 }}>
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
            {sorted.length === 0 ? (
              <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray }}>
                  아직 댓글이 없어요
                </Text>
              </View>
            ) : (
              sorted.map(c => {
                const mine = canDeleteComment(c, myId, myName);
                return (
                  <CommentRow key={c.id} comment={c} isMine={mine} isHost={isMine}
                    canModify={mine || isMine}
                    onDelete={onDelete} onPin={onPin} />
                );
              })
            )}

            {/* 입력 영역 — 티오프 후 비활성 */}
            <View style={{ borderTopWidth: 0.5, borderTopColor: C.hairline, paddingVertical: 12 }}>
              {closed ? (
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, textAlign: 'center', paddingVertical: 8 }}>
                  라운딩이 시작되어 댓글이 닫혔어요
                </Text>
              ) : (
                <>
                  <TextInput
                    style={{ fontFamily: F.sys, fontSize: fs(13), color: C.charcoal,
                      backgroundColor: C.bgPrimary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
                      borderWidth: 0.5, borderColor: C.hairline, minHeight: 40, textAlignVertical: 'top' }}
                    placeholder="동반자에게 남길 댓글을 적어주세요"
                    placeholderTextColor={C.warmGrayLight}
                    value={body}
                    onChangeText={(t) => { setBody(t); if (error) setError(null); }}
                    multiline
                    maxLength={COMMENT_MAX}
                  />
                  {error && (
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: '#8B2A2A', marginTop: 6 }}>{error}</Text>
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGrayLight }}>
                      {body.length}/{COMMENT_MAX}
                    </Text>
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

      <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGrayLight,
        marginHorizontal: 20, marginTop: 6, lineHeight: 14 }}>
        비매너 댓글은 마이페이지 → 신고하기로 신고해주세요
      </Text>
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
