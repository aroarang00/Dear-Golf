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
import { subscribeScheduleComments, addScheduleComment, deleteScheduleComment, COMMENT_MAX, markScheduleRead, subscribeScheduleReads } from '../utils/scheduleComments';
import { getScheduleGroup } from '../utils/scheduleShares'; // @멘션 후보(그룹 동반자) 로드
import { PROFANITY_BLOCK_MESSAGE } from '../utils/profanityFilter';

// 일정 '이야기'(댓글) 스레드 — 전파 일정 시트에서 열림. 공지(memo)와 별개의 조율 대화.
//   말풍선(내것=우측 버건디 / 남=좌측 회색+이름), 실시간 구독, 본인 댓글 길게눌러 삭제.
//   ★안드 RN Modal은 별도 윈도우라 adjustResize가 안 먹어 입력바가 키보드에 가림 → KeyboardEvents로 명령형 리프트.
// 본문의 '@이름' 토큰을 색으로 강조 (내 말풍선=버터골드 / 상대=네이비)
function renderBody(body, mine) {
  const parts = String(body || '').split(/(@[^\s@]+)/g);
  return parts.map((p, i) => (p.startsWith('@')
    ? <Text key={i} style={{ fontFamily: F.sysB, color: mine ? '#F5E6A8' : C.navy }}>{p}</Text>
    : p));
}

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

export function ScheduleCommentsModal({ visible, groupId, courseLabel, myUid, myName, nameOf, onClose }) {
  const insets = useSafeAreaInsets();
  const [comments, setComments] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null); // 삭제 확인 대상 comment
  const [members, setMembers] = useState([]); // @멘션 후보 [{uid,name}] — 그룹 동반자(본인 제외)
  const [memberUids, setMemberUids] = useState([]); // 이야기 볼 수 있는 동반자 전원(uid) — 안읽음 수 분모
  const [reads, setReads] = useState({});     // { uid: 마지막 읽은 ms } — 동반자별. 안읽음 수 계산용
  const [ready, setReady] = useState(false);   // 슬라이드 애니 끝난 뒤 true — 무거운 리스트는 그 뒤 마운트(열림 덜컥거림 방지)
  const [loaded, setLoaded] = useState(false); // 첫 스냅샷 도착 여부 — 빈상태('없어요') 깜빡임 방지 + 로딩 스피너 판정
  const scrollRef = useRef(null);

  // 닫히면 상태 리셋
  useEffect(() => {
    if (visible) return;
    setComments([]); setDraft(''); setConfirmDel(null); setMembers([]); setMemberUids([]); setReads({}); setReady(false); setLoaded(false);
  }, [visible]);

  // 열리면 슬라이드 애니가 끝난 뒤 콘텐츠 준비 — 애니 도중 구독·스크롤 리렌더로 '덜컥'거리던 것 방지
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setReady(true), 240);
    return () => clearTimeout(t);
  }, [visible]);

  // ★열리면 '즉시' 실시간 구독 + 멘션 후보 로드 — 슬라이드 애니(ready 240ms)와 병렬로 네트워크가 돌게.
  //   예전엔 ready 뒤에야 구독을 발사해 240ms + 왕복이 통째로 더해졌음(로딩 체감 지연의 주범, 사용자 2026-07-25).
  //   무거운 리스트 마운트만 ready로 미루고, fetch는 여기서 바로 시작한다.
  useEffect(() => {
    if (!visible || !groupId) return;
    const unsub = subscribeScheduleComments(groupId, (list) => { setComments(list); setLoaded(true); });
    const unsubReads = subscribeScheduleReads(groupId, setReads); // 동반자별 읽은 시각(안읽음 수 계산)
    markScheduleRead(groupId); // 내가 열었음 → 내 읽은 시각 기록(동반자 화면의 안읽음 수에 반영)
    getScheduleGroup(groupId).then(g => {
      if (!g) return;
      setMemberUids(g.memberUids || []); // 안읽음 수 분모 = 이야기 볼 수 있는 동반자 전원
      const names = g.names || {};
      const list = (g.memberUids || []).filter(u => u && u !== myUid)
        .map(u => ({ uid: u, name: (nameOf ? nameOf(u, names[u]) : names[u]) || '' }))
        .filter(m => m.name);
      setMembers(list);
    }).catch(() => {});
    return () => { unsub(); unsubReads(); };
  }, [visible, groupId, myUid]);

  // 열려 있는 동안 새 댓글이 오면 내 읽은 시각을 갱신 — 화면을 보고 있으니 '읽음'이 맞다(카톡과 동일).
  useEffect(() => {
    if (visible && groupId && loaded && comments.length) markScheduleRead(groupId);
  }, [comments.length, visible, groupId, loaded]);

  // 현재 입력 끝에서 타이핑 중인 @멘션 토큰 감지 → 피커 표시(끝에서 멘션하는 일반 케이스 지원)
  const mentionMatch = draft.match(/@([^\s@]*)$/);
  const mentionQuery = mentionMatch ? mentionMatch[1] : null;
  const mentionList = (mentionQuery !== null && members.length)
    ? members.filter(m => !mentionQuery || m.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6)
    : [];
  const pickMention = (m) => { setDraft(draft.replace(/@([^\s@]*)$/, `@${m.name} `)); };

  // 새 댓글/준비 시 맨 아래로 — 비애니(슬라이드와 겹쳐도 잽 없음)
  useEffect(() => {
    if (!visible || !ready) return;
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 30);
    return () => clearTimeout(t);
  }, [comments.length, visible, ready]);

  // 입력바를 키보드 높이만큼 들어올림(안드 RN Modal 대응 — CrewCommentScreen과 동일 패턴)
  const BAR_PAD = 8;
  // ★RN Modal은 안드에서 별도 윈도우라 useSafeAreaInsets.bottom이 0으로 나와 네비바에 입력창이 가림.
  //   initialWindowMetrics(정적 값, 모달서도 유효)로 폴백해 하단 안전영역 확보(PhotoViewer와 동일 대응).
  const safeBottom = Math.max(insets.bottom || 0, initialWindowMetrics?.insets?.bottom || 0);
  // 네비바(safeBottom) 위로 확실한 여유(+14) — pad==safeBottom이면 입력창이 네비바에 딱 붙어 가린 것처럼 보임(사용자 2026-07-25).
  const CLOSED_PAD = safeBottom + 14;
  const kbLift = useSharedValue(0);
  const kbPadStyle = useAnimatedStyle(() => ({ paddingBottom: Math.max(kbLift.value, CLOSED_PAD) }));
  useEffect(() => {
    const onShow = (e) => { kbLift.value = withTiming(Math.round(e?.height || 0) + 8, { duration: e?.duration || 220 }); }; // +8 = 키보드와 살짝 여유
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
      // 본문에 '@이름'이 들어간 멤버만 멘션(편집 중 지웠어도 최종 본문 기준으로 재판정)
      const mentions = members.filter(m => body.includes('@' + m.name)).map(m => m.uid);
      const r = await addScheduleComment(groupId, myName, body, { mentions, course: courseLabel });
      if (!r.ok) {
        if (r.reason === 'profanity') showToast(PROFANITY_BLOCK_MESSAGE);
        return;
      }
      setDraft('');
    } catch (e) {
      showToast('전송에 실패했어요');
    } finally { setSending(false); }
  };

  const remove = async (c) => {
    setConfirmDel(null);
    try { await deleteScheduleComment(groupId, c.id); } catch (e) { showToast('삭제에 실패했어요'); }
  };

  // 말풍선 목록은 comments/myUid/nameOf에만 의존 — 입력창(draft) 타이핑 때마다 100개 말풍선이
  //   재렌더되던 렉 제거(setConfirmDel은 안정된 setter라 deps 불필요, 사용자 2026-07-25).
  const commentBubbles = useMemo(() => comments.map((c) => {
    const mine = c.authorUid && c.authorUid === myUid;
    const name = nameOf ? nameOf(c.authorUid, c.authorName) : (c.authorName || '');
    // 카톡식 '안 읽은 동반자 수' — 내 메시지에만. 이야기 볼 수 있는 동반자(memberUids) 중 나 제외,
    //   아직 이 메시지 이후로 안 연 사람 수. 0이면 숨김(=모두 읽음).
    const unread = mine
      ? memberUids.filter(u => u && u !== myUid && (reads[u] || 0) < (c.createdAt || 0)).length
      : 0;
    return (
      <View key={c.id} style={{ marginBottom: 12, alignItems: mine ? 'flex-end' : 'flex-start' }}>
        {!mine && <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: C.warmGray, marginBottom: 3, marginLeft: 4 }}>{name}</Text>}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', maxWidth: '82%' }}>
          {mine && unread > 0 && <Text style={{ fontFamily: F.sysB, fontSize: fs(11), color: '#C79A3B', marginRight: 4 }}>{unread}</Text>}
          {mine && <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginRight: 5 }}>{fmtTime(c.createdAt)}</Text>}
          <TouchableOpacity activeOpacity={mine ? 0.7 : 1} onLongPress={mine ? () => setConfirmDel(c) : undefined}
            style={{
              backgroundColor: mine ? C.burgundy : '#E8E0D0',
              borderRadius: 14, borderTopRightRadius: mine ? 4 : 14, borderTopLeftRadius: mine ? 14 : 4,
              paddingHorizontal: 12, paddingVertical: 9,
            }}>
            <Text style={{ fontFamily: F.sys, fontSize: fs(13), lineHeight: 22, color: mine ? '#fff' : C.charcoal }}>{renderBody(c.body, mine)}</Text>
          </TouchableOpacity>
          {!mine && <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginLeft: 5 }}>{fmtTime(c.createdAt)}</Text>}
        </View>
      </View>
    );
  }), [comments, myUid, nameOf, reads, memberUids]);

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
                <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal, marginLeft: 6 }}>이야기</Text>
                {!!courseLabel && <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: C.charcoal, marginLeft: 8, flexShrink: 1 }} numberOfLines={1}>· {courseLabel}</Text>}
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ marginLeft: 'auto' }}>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(20), color: C.warmGray }}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* 리스트 */}
            <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 14 }}
              keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
              {/* 애니 대기(!ready) 또는 첫 스냅샷 전(!loaded)이면 스피너 — 빈상태 문구가 잠깐 떴다 사라지는 깜빡임 방지 */}
              {(!ready || !loaded) ? (
                <View style={{ paddingVertical: 56, alignItems: 'center' }}>
                  <Spinner />
                </View>
              ) : comments.length === 0 ? (
                <View style={{ paddingVertical: 48, alignItems: 'center' }}>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, textAlign: 'center', lineHeight: 21 }}>
                    아직 이야기가 없어요.{'\n'}집결 시간·차편 등 편하게 얘기해요.
                  </Text>
                </View>
              ) : commentBubbles}
            </ScrollView>

            {/* 입력바 — 키보드 높이만큼 paddingBottom 리프트(안드 모달 대응). @피커는 입력 위에 얹음. */}
            <Animated.View style={[{ paddingHorizontal: 14, paddingTop: BAR_PAD,
              borderTopWidth: 0.5, borderTopColor: C.hairline, backgroundColor: C.bgPrimary }, kbPadStyle]}>
              {/* @멘션 자동완성 — @입력 시 동반자 목록 */}
              {mentionList.length > 0 && (
                <View style={{ marginBottom: 8, backgroundColor: C.bgSecondary, borderRadius: 12, overflow: 'hidden',
                  shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 3 }}>
                  {mentionList.map((m, i) => (
                    <TouchableOpacity key={m.uid} onPress={() => pickMention(m)} activeOpacity={0.6}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 11,
                        borderTopWidth: i === 0 ? 0 : 0.5, borderTopColor: C.hairline }}>
                      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(26,61,82,0.1)', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: C.navy }}>{(m.name || '?').slice(0, 1)}</Text>
                      </View>
                      <Text style={{ fontFamily: F.sysM, fontSize: fs(13), color: C.charcoal }}>{m.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                <AppTextInput
                  value={draft} onChangeText={setDraft} multiline maxLength={COMMENT_MAX}
                  placeholder="한마디 남기기 · @로 동반자 부르기" placeholderTextColor={C.warmGrayLight}
                  style={{ flex: 1, fontFamily: F.sys, fontSize: fs(13), lineHeight: 20, color: C.charcoal, maxHeight: 110,
                    backgroundColor: C.bgSecondary, borderRadius: 18, paddingHorizontal: 15, paddingVertical: 10, textAlignVertical: 'center' }}
                />
                <TouchableOpacity onPress={send} disabled={!draft.trim() || sending} activeOpacity={0.8}
                  style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: draft.trim() ? C.burgundy : C.hairline, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="send" size={fs(18)} color={draft.trim() ? '#fff' : C.warmGray} />
                </TouchableOpacity>
              </View>
            </Animated.View>

            {/* 삭제 확인(인라인 — 중첩 Modal 회피) */}
            {confirmDel && (
              <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ backgroundColor: C.bgPrimary, borderRadius: 16, paddingHorizontal: 22, paddingVertical: 20, width: '76%' }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal, marginBottom: 6 }}>이야기 삭제</Text>
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
