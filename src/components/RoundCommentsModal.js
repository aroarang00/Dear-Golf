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
import { createContentReport } from '../utils/contentReports';   // 댓글 신고(targetType roundComment)

// 라운딩·일상 글 댓글 시트 — 피드 카드(DiaryCard)의 말풍선에서 열림(2026-09-22).
//   일정 '이야기'(ScheduleCommentsModal)의 뼈대(시트·구독·키보드 리프트)를 가져오되, 채팅 말풍선은 버렸다 —
//   인스타식 평평한 댓글 목록([이름] 본문 / 아래 시간·삭제). 실시간 구독, 본인 댓글(또는 내 글의 댓글) '삭제' 링크.
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
  const inputRef = useRef(null);
  const isOwner = !!myUid && myUid === ownerUid;

  // 답글 = @이름 멘션(2026-09-23 A안, 대댓글 대신) — 목록은 평평하게 두고 불린 사람에게만 알림(roundReply).
  //   후보 = 이 글에 댓글 단 사람들(나 제외). 글 주인은 댓글이 없으면 후보에 없지만 어차피 roundComment로 받는다.
  //   ★name=내 화면 표시용(내가 붙인 별명 우선) / tag=본문에 실제로 들어가는 '@이름'(그 친구 본인 닉네임 스냅샷).
  //     별명을 본문에 넣으면 남들 눈에 내가 붙인 별명이 새어 나간다(사용자 2026-09-23 "태그할 땐 내 별명으로 태그돼").
  //     같은 사람이 여러 번 썼으면 가장 최근 댓글의 닉네임(개명 반영).
  const participants = useMemo(() => {
    const m = new Map();
    comments.forEach(c => {
      if (!c.authorUid || c.authorUid === myUid) return;
      const name = (nameOf ? nameOf(c.authorUid, c.authorName) : c.authorName) || '';
      const tag = String(c.authorName || '').trim() || name;
      if (name) m.set(c.authorUid, { uid: c.authorUid, name, tag });
    });
    return [...m.values()];
  }, [comments, myUid, nameOf]);
  const tagOf = (c, name) => String(c?.authorName || '').trim() || name;   // 답글 '@' 채움용 — 본인 닉네임
  // '답글' 링크(2026-09-23 B안 — 사용자 "대댓글은 댓글 바로 아래 달려야지") — 원댓글 밑에 한 단계로 붙는다.
  //   답글의 답글도 같은 원댓글(parentId) 밑에(인스타와 같은 규칙). 입력창 위에 "○○님에게 답글" 표시 + '@이름 ' 채움 + 포커스.
  const [replyTarget, setReplyTarget] = useState(null);   // { parentId, uid, name }
  const replyTo = (c, name) => {
    const tag = tagOf(c, name);   // 본문엔 본인 닉네임, "○○님에게 답글" 표시는 별명(name)
    setReplyTarget({ parentId: c.parentId || c.id, uid: c.authorUid, name });
    setDraft(d => (d.includes(`@${tag}`) ? d : `${d.trim() ? d.trim() + ' ' : ''}@${tag} `));
    setTimeout(() => inputRef.current?.focus?.(), 50);
  };
  // 신고 — 남의 댓글. 사유 2개(다른 신고와 동일), 1인 1회(결정적 ID). 시트 안 오버레이(중첩 Modal 회피).
  const [reportTarget, setReportTarget] = useState(null);
  // 댓글 끝 '⋯' 메뉴(사용자 2026-09-23 "삭제와 신고를 점 세 개로 한 번에") — 신고(남의 것)·삭제(내 댓글·내 글의 댓글)
  const [menuTarget, setMenuTarget] = useState(null);
  const doReport = async (reason) => {
    const c = reportTarget;
    setReportTarget(null);
    if (!c) return;
    try {
      const r = await createContentReport({ targetType: 'roundComment', targetId: `${roundId}_${c.id}`, targetAuthorUid: c.authorUid, reason });
      showToast(r.alreadyReported ? '이미 신고한 댓글이에요' : '신고가 접수됐어요');
    } catch (e) { showToast('신고하지 못했어요'); }
  };
  // 입력 끝에서 '@' 치는 중이면 후보 피커(일정 이야기와 같은 규칙)
  const mentionMatch = draft.match(/@([^\s@]*)$/);
  const mentionQuery = mentionMatch ? mentionMatch[1] : null;
  const mentionList = (mentionQuery !== null && participants.length)
    ? participants.filter(p => !mentionQuery || p.name.toLowerCase().includes(mentionQuery.toLowerCase())
        || p.tag.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6)
    : [];
  const pickMention = (p) => { setDraft(draft.replace(/@([^\s@]*)$/, `@${p.tag} `)); };   // 본문엔 본인 닉네임(tag)

  useEffect(() => {
    if (visible) return;
    setComments([]); setDraft(''); setConfirmDel(null); setReady(false); setLoaded(false); setDenied(false);
    setReplyTarget(null); setReportTarget(null); setMenuTarget(null);
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
      (list) => { setComments(list); setLoaded(true); onCountChange?.(list.length, list); },   // 카드 숫자·미리보기 즉시 갱신
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

  const esc = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');   // 이름에 든 정규식 특수문자 이스케이프
  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      // 멘션 = 답글 대상 + 본문에 '@이름'이 든 참여자(편집 중 지웠어도 최종 본문 기준).
      const mentions = [...new Set([
        ...(replyTarget?.uid ? [replyTarget.uid] : []),
        // '@김'이 '@김철수'에도 걸리던 접두어 오판 방지 — 이름 뒤가 공백·끝일 때만(리뷰 2026-09-23)
        //   본문의 '@이름'은 본인 닉네임(tag)으로 들어가지만, 예전 댓글이나 직접 타이핑한 별명도 잡히게 둘 다 본다.
        ...participants.filter(p => [p.tag, p.name].some(n => n && new RegExp('@' + esc(n) + '(?=\\s|$)').test(body))).map(p => p.uid),
      ])];
      const r = await addRoundComment(roundId, myName, body, {
        ownerUid, title: label, mentions, parentId: replyTarget?.parentId || null,   // 글 주인·답글 알림 + 원댓글 밑에 묶기
      });
      if (!r.ok) {
        if (r.reason === 'profanity') showToast(PROFANITY_BLOCK_MESSAGE);
        else if (r.reason === 'toolong') showToast(`${ROUND_COMMENT_MAX}자까지 쓸 수 있어요`);
        else showToast('잠시 후 다시 시도해주세요');   // auth(로그인 순간 미준비)·empty — 조용히 끝나면 '안 눌림'으로 보인다(리뷰 2026-09-23)
        return;
      }
      setDraft(''); setReplyTarget(null);
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
  // ★댓글은 채팅이 아니다(사용자 2026-09-22 "말풍선 스타일은 너무 복잡, 댓글답게 간편하게") — 인스타식 평평한 목록:
  //   [이름 굵게] 본문이 한 흐름, 아래 작은 회색 줄에 시간 · 답글 · 신고(남) / 삭제(내 댓글·내 글의 댓글).
  //   2026-09-23 B안: 답글(parentId)은 원댓글 바로 아래 한 단계 들여쓰기로 묶는다(사용자 "대댓글은 댓글 바로 아래 달려야지").
  //   원댓글이 지워진 답글(고아)은 맨 위 레벨로 올려 그린다(사라지지 않게).
  const threaded = useMemo(() => {
    const ids = new Set(comments.map(c => c.id));
    const tops = comments.filter(c => !c.parentId || !ids.has(c.parentId));
    const byParent = new Map();
    comments.forEach(c => {
      if (c.parentId && ids.has(c.parentId)) {
        if (!byParent.has(c.parentId)) byParent.set(c.parentId, []);
        byParent.get(c.parentId).push(c);
      }
    });
    return tops.map(t => ({ top: t, replies: byParent.get(t.id) || [] }));
  }, [comments]);

  const commentRows = useMemo(() => {
    const row = (c, depth) => {
      const mine = c.authorUid && c.authorUid === myUid;
      const name = mine ? '나' : (nameOf ? nameOf(c.authorUid, c.authorName) : (c.authorName || ''));
      const canDelete = mine || isOwner;   // 내 글이면 남의 댓글도 정리할 수 있다
      return (
        <View key={c.id} style={{ paddingVertical: depth ? 7 : 10, paddingLeft: depth ? 22 : 0 }}>
          <Text style={{ fontFamily: F.sys, fontSize: fs(13), lineHeight: 21, color: C.charcoal }}>
            <Text style={{ fontFamily: F.sysB, color: mine ? C.burgundy : C.charcoal }}>{name}</Text>
            {'  '}
            {/* '@이름' 토큰은 네이비 굵게 — 누구에게 한 말인지 한눈에 */}
            {String(c.body || '').split(/(@[^\s@]+)/g).map((p, k) => (p.startsWith('@')
              ? <Text key={k} style={{ fontFamily: F.sysB, color: C.navy }}>{p}</Text>
              : p))}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 3 }}>
            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>{fmtTime(c.createdAt)}</Text>
            {!mine && !!name && (
              <TouchableOpacity onPress={() => replyTo(c, name)} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                <Text style={{ fontFamily: F.sysM, fontSize: fs(11), color: C.warmGray }}>답글</Text>
              </TouchableOpacity>
            )}
            {/* ⋯ — 신고(남의 것)·삭제(내 댓글·내 글의 댓글)를 한 메뉴로. 둘 다 해당 없으면 안 그린다 */}
            {(!mine || canDelete) && (
              <TouchableOpacity onPress={() => setMenuTarget({ c, mine, canDelete })}
                hitSlop={{ top: 8, bottom: 8, left: 10, right: 10 }} style={{ marginLeft: 'auto', paddingHorizontal: 6 }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.warmGray, lineHeight: fs(15) }}>⋯</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      );
    };
    return threaded.map(({ top, replies }, i) => (
      <View key={top.id} style={{ borderTopWidth: i === 0 ? 0 : 0.5, borderTopColor: C.hairline }}>
        {row(top, 0)}
        {replies.map(r => row(r, 1))}
      </View>
    ));
    // replyTo·setReportTarget·setConfirmDel은 안정된 setter/ref 기반이라 deps 불필요
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threaded, myUid, nameOf, isOwner]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardProvider>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
          {/* 60% — 82%는 화면을 거의 덮어 '별도 화면으로 넘어간' 느낌(사용자 2026-09-22). 댓글은 카드 위에 살짝 얹히는 정도로. */}
          <View style={{ backgroundColor: C.bgPrimary, borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '60%' }}>
            {/* 헤더 */}
            <View style={{ paddingTop: 12, paddingHorizontal: 20, paddingBottom: 10, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: C.hairline, alignSelf: 'center', marginBottom: 12 }} />
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal }}>댓글{comments.length > 0 ? ` ${comments.length}` : ''}</Text>
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
                    {isOwner ? '아직 댓글이 없어요' : '첫 댓글을 남겨보세요'}
                  </Text>
                </View>
              ) : commentRows}
            </ScrollView>

            {/* 입력바 — 키보드 높이만큼 paddingBottom 리프트(안드 모달 대응) */}
            <Animated.View style={[{ paddingHorizontal: 14, paddingTop: BAR_PAD,
              borderTopWidth: 0.5, borderTopColor: C.hairline, backgroundColor: C.bgPrimary }, kbPadStyle]}>
              {/* 답글 대상 — '답글'을 누르면 입력창 위에 누구에게 다는지 보이고, ✕로 일반 댓글로 되돌린다 */}
              {replyTarget && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, paddingHorizontal: 4 }}>
                  <Text style={{ flex: 1, fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary }}>
                    <Text style={{ fontFamily: F.sysB, color: C.navy }}>{replyTarget.name}</Text>님에게 답글
                  </Text>
                  <TouchableOpacity onPress={() => setReplyTarget(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: C.warmGray }}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}
              {/* @멘션 후보 — 입력 끝에서 @를 치면 이 글에 댓글 단 사람 목록 */}
              {mentionList.length > 0 && (
                <View style={{ marginBottom: 8, backgroundColor: C.bgSecondary, borderRadius: 12, overflow: 'hidden' }}>
                  {mentionList.map((p, i) => (
                    <TouchableOpacity key={p.uid} onPress={() => pickMention(p)} activeOpacity={0.6}
                      style={{ paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: i === 0 ? 0 : 0.5, borderTopColor: C.hairline }}>
                      <Text style={{ fontFamily: F.sysM, fontSize: fs(13), color: C.charcoal }}>{p.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                <AppTextInput
                  ref={inputRef}
                  value={draft} onChangeText={setDraft} multiline maxLength={ROUND_COMMENT_MAX}
                  placeholder={participants.length ? '댓글 남기기 · @로 답글' : '댓글 남기기'} placeholderTextColor={C.warmGrayLight}
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

            {/* ⋯ 메뉴(인라인) — 신고 / 삭제 / 취소. 고르면 각자의 확인 단계로 넘어간다 */}
            {menuTarget && (
              <TouchableOpacity activeOpacity={1} onPress={() => setMenuTarget(null)}
                style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', paddingHorizontal: 32 }}>
                <View style={{ backgroundColor: C.bgPrimary, borderRadius: 16, overflow: 'hidden' }}>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary, textAlign: 'center', paddingTop: 14, paddingBottom: 6 }} numberOfLines={1}>
                    {String(menuTarget.c.body || '').slice(0, 30)}
                  </Text>
                  {!menuTarget.mine && (
                    <TouchableOpacity activeOpacity={0.6} onPress={() => { const c = menuTarget.c; setMenuTarget(null); setReportTarget(c); }}
                      style={{ paddingVertical: 14, paddingHorizontal: 18, borderTopWidth: 0.5, borderTopColor: C.hairline }}>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: C.charcoal, textAlign: 'center' }}>신고</Text>
                    </TouchableOpacity>
                  )}
                  {menuTarget.canDelete && (
                    <TouchableOpacity activeOpacity={0.6} onPress={() => { const c = menuTarget.c; setMenuTarget(null); setConfirmDel(c); }}
                      style={{ paddingVertical: 14, paddingHorizontal: 18, borderTopWidth: 0.5, borderTopColor: C.hairline }}>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: '#D32F2F', textAlign: 'center' }}>삭제</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity activeOpacity={0.6} onPress={() => setMenuTarget(null)}
                    style={{ paddingVertical: 14, paddingHorizontal: 18, borderTopWidth: 0.5, borderTopColor: C.hairline, backgroundColor: C.bgSecondary }}>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: C.warmGray, textAlign: 'center' }}>취소</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            )}

            {/* 신고 사유(인라인 — 중첩 Modal 회피). 친구 프로필 게시물 신고 시트와 같은 사유 2개 */}
            {reportTarget && (
              <TouchableOpacity activeOpacity={1} onPress={() => setReportTarget(null)}
                style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', paddingHorizontal: 32 }}>
                <View style={{ backgroundColor: C.bgPrimary, borderRadius: 16, overflow: 'hidden' }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.charcoal, textAlign: 'center', paddingTop: 16, paddingBottom: 4 }}>댓글 신고</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary, textAlign: 'center', paddingBottom: 10 }}>어떤 이유로 신고할까요?</Text>
                  {[{ k: 'ad_spam', t: '광고 · 스팸' }, { k: 'inappropriate', t: '부적절한 내용' }].map(r => (
                    <TouchableOpacity key={r.k} activeOpacity={0.6} onPress={() => doReport(r.k)}
                      style={{ paddingVertical: 14, paddingHorizontal: 18, borderTopWidth: 0.5, borderTopColor: C.hairline }}>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: C.charcoal, textAlign: 'center' }}>{r.t}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity activeOpacity={0.6} onPress={() => setReportTarget(null)}
                    style={{ paddingVertical: 14, paddingHorizontal: 18, borderTopWidth: 0.5, borderTopColor: C.hairline, backgroundColor: C.bgSecondary }}>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: C.warmGray, textAlign: 'center' }}>취소</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            )}

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
