import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets, initialWindowMetrics } from 'react-native-safe-area-context';
import { KeyboardProvider, KeyboardEvents } from 'react-native-keyboard-controller'; // 안드 RN Modal서 입력바 키보드 가림 방지
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { C, F, fs } from '../constants/colors';
import AppTextInput from './common/AppTextInput';
import { Icon } from './common/Icon';
import { Spinner } from './common/Spinner';
import { showToast } from './AppToast';
import { subscribeRoundComments, addRoundComment, deleteRoundComment, ROUND_COMMENT_MAX } from '../utils/roundComments';
import { PROFANITY_BLOCK_MESSAGE } from '../utils/profanityFilter';

// 라운딩·일상 글 댓글 시트 — 피드 카드(DiaryCard)의 말풍선에서 열림(2026-09-22).
//   일정 '이야기'(ScheduleCommentsModal)를 그대로 가져와 @멘션·읽음 수를 뺀 것. 말풍선(내것=우측 버건디 / 남=좌측 회색+이름),
//   실시간 구독, 본인 댓글(또는 내 글의 댓글) 길게 눌러 삭제.
//   ★안드 RN Modal은 별도 윈도우라 adjustResize가 안 먹어 입력바가 키보드에 가림 → KeyboardEvents로 명령형 리프트.
//   ★카드 안에서 조건부(showComments &&)로 렌더된다 — 카드 20장이 모달 20개를 항상 마운트하지 않게.

function fmtTime(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const now = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (sameDay) return `${hh}:${mm}`;
  return `${d.getMonth() + 1}.${d.getDate()} ${hh}:${mm}`;
}

// roundId: 글 id / ownerUid: 글 주인(내 글이면 남의 댓글도 지울 수 있음) / label: 헤더에 붙는 구장명·'일상'
// myName: 내 닉네임(댓글에 스냅샷 저장) / nameOf(uid, snapshot): 친구 별명 우선, 없으면 저장된 이름
// onCountChange(n): 카드의 '댓글 N' 숫자를 즉시 맞추기 위한 콜백(피드는 실시간 구독이 아니라서)
export function RoundCommentsModal({ visible, roundId, ownerUid, label, myUid, myName, nameOf, onClose, onCountChange }) {
  const insets = useSafeAreaInsets();
  const [comments, setComments] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null); // 삭제 확인 대상 comment
  const [ready, setReady] = useState(false);   // 슬라이드 애니 끝난 뒤 true — 리스트는 그 뒤 마운트(열림 덜컥거림 방지)
  const [loaded, setLoaded] = useState(false); // 첫 스냅샷 도착 여부 — 빈상태 깜빡임 방지 + 스피너 판정
  const [denied, setDenied] = useState(false); // 읽기 권한 없음(규칙 미배포·공개범위 밖) — 스피너가 영원히 돌지 않게
  const scrollRef = useRef(null);
  const isOwner = !!myUid && myUid === ownerUid;

  useEffect(() => {
    if (visible) return;
    setComments([]); setDraft(''); setConfirmDel(null); setReady(false); setLoaded(false); setDenied(false);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setReady(true), 240);
    return () => clearTimeout(t);
  }, [visible]);

  // 열리면 '즉시' 실시간 구독 — 슬라이드 애니(ready 240ms)와 병렬로 네트워크가 돌게(일정 이야기와 같은 교훈).
  useEffect(() => {
    if (!visible || !roundId) return;
    const unsub = subscribeRoundComments(roundId,
      (list) => { setComments(list); setLoaded(true); onCountChange?.(list.length); },
      () => { setDenied(true); setLoaded(true); });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, roundId]);

  // 새 댓글/준비 시 맨 아래로
  useEffect(() => {
    if (!visible || !ready) return;
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 30);
    return () => clearTimeout(t);
  }, [comments.length, visible, ready]);

  // 입력바를 키보드 높이만큼 들어올림(안드 RN Modal 대응 — CrewCommentScreen·ScheduleCommentsModal과 동일 패턴)
  const BAR_PAD = 8;
  const safeBottom = Math.max(insets.bottom || 0, initialWindowMetrics?.insets?.bottom || 0);
  const CLOSED_PAD = safeBottom + 14;   // 네비바 위 확실한 여유(+14) — 딱 붙으면 가린 것처럼 보임
  const kbLift = useSharedValue(0);
  const kbPadStyle = useAnimatedStyle(() => ({ paddingBottom: Math.max(kbLift.value, CLOSED_PAD) }));
  useEffect(() => {
    const onShow = (e) => { kbLift.value = withTiming(Math.round(e?.height || 0) + 8, { duration: e?.duration || 220 }); };
    const onHide = (e) => { kbLift.value = withTiming(0, { duration: e?.duration || 220 }); };
    const subs = [
      KeyboardEvents.addListener('keyboardWillShow', onShow),
      KeyboardEvents.addListener('keyboardDidShow', onShow),
      KeyboardEvents.addListener('keyboardWillHide', onHide),
      KeyboardEvents.addListener('keyboardDidHide', onHide),
    ];
    return () => subs.forEach((s) => s.remove());
  }, []);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const r = await addRoundComment(roundId, myName, body);
      if (!r.ok) {
        if (r.reason === 'profanity') showToast(PROFANITY_BLOCK_MESSAGE);
        else if (r.reason === 'toolong') showToast(`${ROUND_COMMENT_MAX}자까지 쓸 수 있어요`);
        return;
      }
      setDraft('');
    } catch (e) {
      // permission-denied = 공개범위 밖이거나 규칙이 아직 안 올라감
      showToast(e?.code === 'permission-denied' ? '이 글에는 댓글을 남길 수 없어요' : '전송에 실패했어요');
    } finally { setSending(false); }
  };

  const remove = async (c) => {
    setConfirmDel(null);
    try { await deleteRoundComment(roundId, c.id, { hasCount: comments.length > 0 }); }
    catch (e) { showToast('삭제에 실패했어요'); }
  };

  // 말풍선 목록은 comments/myUid/nameOf에만 의존 — 타이핑 때마다 재렌더되지 않게
  const commentBubbles = useMemo(() => comments.map((c) => {
    const mine = c.authorUid && c.authorUid === myUid;
    const name = nameOf ? nameOf(c.authorUid, c.authorName) : (c.authorName || '');
    const canDelete = mine || isOwner;   // 내 글이면 남의 댓글도 정리할 수 있다
    return (
      <View key={c.id} style={{ marginBottom: 12, alignItems: mine ? 'flex-end' : 'flex-start' }}>
        {!mine && <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: C.warmGray, marginBottom: 3, marginLeft: 4 }}>{name}</Text>}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', maxWidth: '82%' }}>
          {mine && <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginRight: 5 }}>{fmtTime(c.createdAt)}</Text>}
          <TouchableOpacity activeOpacity={canDelete ? 0.7 : 1} onLongPress={canDelete ? () => setConfirmDel(c) : undefined}
            style={{
              backgroundColor: mine ? C.burgundy : '#E8E0D0',
              borderRadius: 14, borderTopRightRadius: mine ? 4 : 14, borderTopLeftRadius: mine ? 14 : 4,
              paddingHorizontal: 12, paddingVertical: 9,
              flexShrink: 1, // 긴 메시지가 row(maxWidth 82%)를 넘어 잘리지 않게 — 말풍선이 줄어들며 줄바꿈
            }}>
            <Text style={{ fontFamily: F.sys, fontSize: fs(13), lineHeight: 22, color: mine ? '#fff' : C.charcoal }}>{c.body}</Text>
          </TouchableOpacity>
          {!mine && <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginLeft: 5 }}>{fmtTime(c.createdAt)}</Text>}
        </View>
      </View>
    );
  }), [comments, myUid, nameOf, isOwner]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardProvider>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
          <View style={{ backgroundColor: C.bgPrimary, borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '82%' }}>
            {/* 헤더 */}
            <View style={{ paddingTop: 12, paddingHorizontal: 20, paddingBottom: 10, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: C.hairline, alignSelf: 'center', marginBottom: 12 }} />
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Icon name="chat" size={fs(17)} color={C.burgundy} />
                <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal, marginLeft: 6 }}>댓글</Text>
                {!!label && <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: C.charcoal, marginLeft: 8, flexShrink: 1 }} numberOfLines={1}>· {label}</Text>}
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ marginLeft: 'auto' }}>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(20), color: C.warmGray }}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* 리스트 */}
            <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 14 }}
              keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
              {(!ready || !loaded) ? (
                <View style={{ paddingVertical: 56, alignItems: 'center' }}>
                  <Spinner />
                </View>
              ) : denied ? (
                <View style={{ paddingVertical: 48, alignItems: 'center' }}>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, textAlign: 'center', lineHeight: 21 }}>
                    이 글의 댓글을 볼 수 없어요.{'\n'}공개 범위 밖이거나 삭제된 글일 수 있어요.
                  </Text>
                </View>
              ) : comments.length === 0 ? (
                <View style={{ paddingVertical: 48, alignItems: 'center' }}>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, textAlign: 'center', lineHeight: 21 }}>
                    {isOwner ? '아직 댓글이 없어요.' : '첫 댓글을 남겨보세요.\n굿샷 한마디면 충분해요.'}
                  </Text>
                </View>
              ) : commentBubbles}
            </ScrollView>

            {/* 입력바 — 키보드 높이만큼 paddingBottom 리프트(안드 모달 대응) */}
            <Animated.View style={[{ paddingHorizontal: 14, paddingTop: BAR_PAD,
              borderTopWidth: 0.5, borderTopColor: C.hairline, backgroundColor: C.bgPrimary }, kbPadStyle]}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                <AppTextInput
                  value={draft} onChangeText={setDraft} multiline maxLength={ROUND_COMMENT_MAX}
                  placeholder="댓글 남기기" placeholderTextColor={C.warmGrayLight}
                  editable={!denied}
                  style={{ flex: 1, fontFamily: F.sys, fontSize: fs(13), lineHeight: 20, color: C.charcoal, maxHeight: 110,
                    backgroundColor: C.bgSecondary, borderRadius: 18, paddingHorizontal: 15, paddingVertical: 10, textAlignVertical: 'center' }}
                />
                <TouchableOpacity onPress={send} disabled={!draft.trim() || sending || denied} activeOpacity={0.8}
                  style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: draft.trim() && !denied ? C.burgundy : C.hairline, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="send" size={fs(18)} color={draft.trim() && !denied ? '#fff' : C.warmGray} />
                </TouchableOpacity>
              </View>
            </Animated.View>

            {/* 삭제 확인(인라인 — 중첩 Modal 회피) */}
            {confirmDel && (
              <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ backgroundColor: C.bgPrimary, borderRadius: 16, paddingHorizontal: 22, paddingVertical: 20, width: '76%' }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal, marginBottom: 6 }}>댓글 삭제</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, marginBottom: 16 }}>이 댓글을 삭제할까요?</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                    <TouchableOpacity onPress={() => setConfirmDel(null)} style={{ paddingHorizontal: 14, paddingVertical: 8 }}>
                      <Text style={{ fontFamily: F.sysM, fontSize: fs(13), color: C.warmGray }}>취소</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => remove(confirmDel)} style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 9, backgroundColor: '#D32F2F' }}>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: '#fff' }}>삭제</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
          </View>
        </View>
      </KeyboardProvider>
    </Modal>
  );
}
