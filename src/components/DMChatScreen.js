import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Keyboard } from 'react-native';
import { Image } from 'expo-image'; // 아바타 디스크캐시 ([[image-load-speed]])
import { KeyboardProvider, KeyboardStickyView } from 'react-native-keyboard-controller';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { getUid } from '../utils/firebase';
import { ensureConversation, sendMessage, subscribeMessages, setReaction } from '../utils/dm';
import { setActiveDmPair } from '../utils/notifications';
import { OverlayAlert } from './common/OverlayAlert';
import { useAndroidBack } from '../hooks/useAndroidBack';

const WD = ['일', '월', '화', '수', '목', '금', '토'];
// 말풍선 옆 시각 — 작고 흐리게
const timeStyle = { fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginBottom: 2 };
// 말풍선 색 — 디어골프 고급 톤(사용자 확정 2026-06-11 [[dm-design]]): 내것=딥 포레스트 그린(골프 그린·흰글씨),
//   받은것=흰 바탕+테두리(크림 배경서 또렷). 네이비는 라운지 전용이라 회피([[navy-lounge-color]]).
const MY_BUBBLE = '#1F4A38';
// 공감 이모지 세트 — 인스타식 6개(마지막은 골프 ⛳). 메시지 길게누르기 → 선택, 같은 것 다시 누르면 해제.
const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '⛳'];

// 메시지 시각 — 오전/오후 h:mm
function fmtClock(ts) {
  const ms = ts?.toMillis ? ts.toMillis() : 0;
  if (!ms) return '';
  const d = new Date(ms);
  const h = d.getHours();
  return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`;
}
// 날짜 구분선 라벨 — 오늘/어제/그 외 'YYYY년 M월 D일 요일'
function fmtDay(ts) {
  const ms = ts?.toMillis ? ts.toMillis() : 0;
  if (!ms) return '';
  const d = new Date(ms);
  const a = new Date(d); a.setHours(0, 0, 0, 0);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((t - a) / 86400000);
  if (diff === 0) return '오늘';
  if (diff === 1) return '어제';
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${WD[d.getDay()]}요일`;
}
// 같은 날 판정용 키 (null/pending이면 빈 문자열 → 구분선 미표시)
function dayKey(ts) {
  const ms = ts?.toMillis ? ts.toMillis() : 0;
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// 친구 1:1 DM 대화방 — 풀스크린, 말풍선(내 메시지 우측·상대 좌측). 카톡식 ([[dm-design]]).
//   열린 동안만 메시지 실시간 구독, 닫으면 unsub로 비용 차단([[lounge-realtime]]). 안 읽음·타이핑은 출시 후.
//   props 기반(navigation 비의존) — 네비 방식(Stack/모달)과 무관하게 재사용. onOpenOptions=차단·신고 시트(5단계).
export function DMChatScreen({ friendUid, friendName = '친구', friendAvatarUri = null, onClose, onOpenOptions }) {
  const insets = useSafeAreaInsets();  // 입력창 하단 여백(홈바) — SafeAreaView bottom edge 대신 입력 컨테이너에 직접
  const [myUid, setMyUid] = useState(null);
  const [convId, setConvId] = useState(null);
  const [messages, setMessages] = useState(null);  // null = 로딩 중
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [alert, setAlert] = useState(null);  // 전송 실패 안내 — Modal 안이라 글로벌 alert 대신 자체 오버레이
  const [reactTarget, setReactTarget] = useState(null);  // 공감 피커 대상 메시지(길게누르기)
  const [replyTo, setReplyTo] = useState(null);  // 답장(인용) 대상 메시지 — 입력창 위 미리보기 바
  const listRef = useRef(null);
  const inputRef = useRef(null);
  useAndroidBack(true, onClose); // 대화방 열린 동안 안드 뒤로가기 → 닫기
  // 피커가 떠 있으면 뒤로가기는 피커만 닫기 — 나중에 등록된 리스너가 먼저 소비(위 화면닫기보다 우선)
  useAndroidBack(!!reactTarget, () => setReactTarget(null));

  // 키보드가 뜨면 마지막 메시지가 보이게 끝으로 스크롤 (입력영역 띄우기는 keyboard-controller KAV가 처리)
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => {
      requestAnimationFrame(() => listRef.current?.scrollToEnd?.({ animated: true }));
    });
    return () => show.remove();
  }, []);

  // 내 uid + 대화방 보장(메시지 0건이라도 방은 존재)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const uid = await getUid();
        const id = await ensureConversation(friendUid);
        if (alive) { setMyUid(uid); setConvId(id); }
      } catch (e) { if (__DEV__) console.warn('[DMChat] ensure', e?.message); }
    })();
    return () => { alive = false; };
  }, [friendUid]);

  // 대화방 열린 동안만 메시지 실시간 구독 (닫으면 cleanup에서 unsub)
  useEffect(() => {
    if (!convId) return;
    const unsub = subscribeMessages(convId, (msgs) => {
      setMessages(msgs);
      requestAnimationFrame(() => listRef.current?.scrollToEnd?.({ animated: true }));
    });
    return () => unsub();
  }, [convId]);

  // 이 방을 보는 동안엔 같은 방 DM 푸시 배너 숨김(이미 실시간으로 보임). 이탈 시 해제 ([[dm-design]]).
  //   convId === pairId === CF 푸시 data.pairId 라 정확히 이 방만 억제.
  useEffect(() => {
    if (!convId) return;
    setActiveDmPair(convId);
    return () => setActiveDmPair(null);
  }, [convId]);

  const handleSend = async () => {
    const body = text.trim();
    if (!body || sending) return;
    const quote = replyTo;  // 전송 시점 인용 캡처 — 실패 시 함께 복구
    setText('');
    setReplyTo(null);
    setSending(true);
    try { await sendMessage(friendUid, body, quote ? { msgId: quote.id, body: quote.body, senderUid: quote.senderUid } : null); }
    catch (e) {
      if (__DEV__) console.warn('[DMChat] send', e?.message);
      setText(body); // 실패 시 입력 복구
      setReplyTo(quote);
      // 중립 안내 — 차단·친구해지로 인한 거부(permission-denied)도 사유를 노출하지 않음(차단 비노출 정책)
      setAlert({
        title: '메시지를 보내지 못했어요',
        message: '지금은 이 대화에\n메시지를 보낼 수 없어요.',
        buttons: [{ text: '확인' }],
      });
    }
    finally { setSending(false); }
  };

  // 공감 토글 — 같은 이모지 다시 누르면 해제. 실패(차단·친구해지 거부)는 조용히(차단 비노출 정책, 실시간이라 화면 반영도 안 됨)
  const handleReact = async (emoji) => {
    const target = reactTarget;
    setReactTarget(null);
    if (!target || !convId) return;
    const cur = target.reactions?.[myUid];
    try { await setReaction(convId, target.id, cur === emoji ? null : emoji); }
    catch (e) { if (__DEV__) console.warn('[DMChat] react', e?.message); }
  };

  const list = messages || [];
  const renderItem = ({ item, index }) => {
    const mine = item.senderUid === myUid;
    const prev = index > 0 ? list[index - 1] : null;
    const next = index < list.length - 1 ? list[index + 1] : null;
    // 날짜가 바뀌면(또는 첫 메시지) 위에 날짜 구분선. pending(시각 미해결)이면 라벨 빈값이라 미표시.
    const showDate = (!prev || dayKey(prev.createdAt) !== dayKey(item.createdAt)) && !!fmtDay(item.createdAt);
    const time = fmtClock(item.createdAt);
    // 인스타식: 연속된 상대 메시지 묶음의 마지막에만 아바타 1개(매 줄 반복 X), 나머지는 자리만 확보해 정렬 유지
    const lastOfGroup = !next || next.senderUid !== item.senderUid;
    return (
      <View>
        {showDate && (
          <View style={{ alignItems: 'center', marginVertical: 10 }}>
            <Text style={{ fontFamily: F.sysM, fontSize: fs(11), color: C.textSecondary,
              backgroundColor: C.hairline, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 11, overflow: 'hidden' }}>
              {fmtDay(item.createdAt)}
            </Text>
          </View>
        )}
        {/* 말풍선 — 인스타 DM식(2026-06-11 사용자 지시): 내것=차콜+흰글씨 우측, 상대=연그레이(테두리 없음)+차콜글씨 좌측+아바타.
            보낸/받은 구분 = 정렬방향+색+아바타 3중. 시각은 옆에 작게(우리 식 유지) */}
        <View style={{ flexDirection: 'row', justifyContent: mine ? 'flex-end' : 'flex-start',
          alignItems: 'flex-end', paddingHorizontal: 12, marginVertical: 2, gap: 6 }}>
          {mine && !!time && <Text style={timeStyle}>{time}</Text>}
          {!mine && (
            <View style={{ width: 28, height: 28, borderRadius: 14, overflow: 'hidden', marginBottom: 1,
              backgroundColor: lastOfGroup ? MY_BUBBLE : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              {lastOfGroup && (friendAvatarUri && /^https?:\/\//.test(friendAvatarUri) ? (
                <Image source={{ uri: friendAvatarUri }} style={{ width: 28, height: 28 }} contentFit="cover" cachePolicy="memory-disk" />
              ) : (
                <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: C.butter }}>{(friendName || '?').charAt(0)}</Text>
              ))}
            </View>
          )}
          <View style={{ maxWidth: '74%' }}>
            {/* 길게누르기 → 공감 피커. 본문 탭 동작은 없음(오터치 방지) */}
            <TouchableOpacity activeOpacity={0.85} delayLongPress={300} onLongPress={() => setReactTarget(item)}
              style={{ backgroundColor: mine ? MY_BUBBLE : C.bgSecondary, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9,
                borderWidth: mine ? 0 : 0.5, borderColor: C.hairline }}>
              {/* 답장(인용) 블록 — 본문 위에 원본 발신자+내용 2줄 요약. 말풍선 색에 맞춘 반투명 박스+좌측 액센트 */}
              {item.replyTo && (
                <View style={{ borderLeftWidth: 3, borderLeftColor: mine ? 'rgba(255,255,255,0.45)' : C.warmGrayLight,
                  backgroundColor: mine ? 'rgba(255,255,255,0.12)' : 'rgba(61,57,53,0.06)',
                  borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6, marginBottom: 6 }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: mine ? 'rgba(255,255,255,0.85)' : C.textSecondary }}>
                    {item.replyTo.senderUid === myUid ? '나' : friendName}
                  </Text>
                  <Text numberOfLines={2} style={{ fontFamily: F.sys, fontSize: fs(13), lineHeight: 18,
                    color: mine ? 'rgba(255,255,255,0.75)' : C.textSecondary, marginTop: 1 }}>
                    {item.replyTo.body}
                  </Text>
                </View>
              )}
              {/* fs(16) — fs(14)는 BODY_BUMP(11~13만 보정) 사각지대라 안드서 13으로 렌더돼 너무 작았음([[avoid-small-text]]) */}
              <Text style={{ fontFamily: F.sys, fontSize: fs(16), lineHeight: 23, color: mine ? '#fff' : C.charcoal }}>{item.body}</Text>
            </TouchableOpacity>
            {/* 공감 표시 — 인스타식 말풍선 하단 안쪽 모서리에 살짝 겹친 알약 */}
            {(() => {
              const emojis = Object.values(item.reactions || {}).filter(Boolean);
              if (!emojis.length) return null;
              return (
                <View style={{ alignSelf: mine ? 'flex-start' : 'flex-end', marginTop: -7, marginHorizontal: 8,
                  backgroundColor: C.bgSecondary, borderRadius: 11, paddingHorizontal: 7, paddingVertical: 2,
                  borderWidth: 0.5, borderColor: C.hairline }}>
                  <Text style={{ fontSize: fs(12), lineHeight: 16 }}>{emojis.join(' ')}</Text>
                </View>
              );
            })()}
          </View>
          {!mine && !!time && <Text style={timeStyle}>{time}</Text>}
        </View>
      </View>
    );
  };

  const canSend = !!text.trim() && !sending;

  return (
    // KeyboardProvider — 호스트(DiaryScreen·FriendProfile)가 RN Modal=별도 네이티브 윈도우라 자체 Provider 필요
    //   (DiaryAddModal·ScheduleModal과 동일 패턴, 안드 빌드 검증됨). 수동 키보드 높이 계산(endCoordinates)은
    //   엣지투엣지서 내비바 포함 여부가 기기마다 달라 폐기 ([[dm-design]]).
    <KeyboardProvider>
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'left', 'right']}>
      {/* 헤더 — 뒤로 · 상대 이름(별명은 진입부에서 friendName으로 전달) · 옵션(차단/신고, 5단계) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 0.5, borderBottomColor: C.hairline, gap: 12 }}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={{ fontSize: fs(22), color: C.charcoal }}>←</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(17), color: C.charcoal }} numberOfLines={1}>{friendName}</Text>
        {onOpenOptions && (
          <TouchableOpacity onPress={onOpenOptions} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ fontSize: fs(20), color: C.warmGray }}>⋯</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 채팅 리스트 — flex로 남은 공간 채우고, 입력영역은 아래 KeyboardStickyView가 키보드 위에 고정 */}
      <FlatList
        ref={listRef}
        data={list}
        style={{ flex: 1 }}
        keyExtractor={(m) => m.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingVertical: 12, flexGrow: 1, justifyContent: 'flex-end' }}
        onContentSizeChange={() => listRef.current?.scrollToEnd?.({ animated: false })}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={messages !== null ? (
          <View style={{ alignItems: 'center', paddingVertical: 44 }}>
            <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, textAlign: 'center', lineHeight: 22 }}>
              {friendName}님과의 첫 메시지를{'\n'}남겨보세요
            </Text>
          </View>
        ) : null}
      />
      {/* KeyboardStickyView — 채팅 입력영역을 키보드 위에 딱 붙임(채팅 표준, 안드·iOS 공통).
          이전 KeyboardAvoidingView(padding)가 안드 FlatList 구조에서 입력창을 못 띄우던 문제 교체 ([[dm-design]]).
          하단 홈바 여백은 insets.bottom으로(SafeAreaView bottom edge 대신). */}
      <KeyboardStickyView>
        {/* 답장(인용) 미리보기 바 — 누구에게·무슨 메시지에 답하는지 + ✕ 취소 */}
        {replyTo && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 9,
            borderTopWidth: 0.5, borderTopColor: C.hairline, backgroundColor: C.bgSecondary }}>
            <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: C.warmGrayLight }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.textSecondary }}>
                {replyTo.senderUid === myUid ? '나' : friendName}님에게 답장
              </Text>
              <Text numberOfLines={1} style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, marginTop: 1 }}>
                {replyTo.body}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: fs(16), color: C.warmGray }}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
        {/* 입력창 — maxLength 미사용(한글 IME 충돌, [[textinput-maxlength-hangul-bug]]).
            크고 넓게 + 글씨 또렷하게(중장년 가독성 [[avoid-small-text]]): fs15·minHeight44·넉넉한 패딩 */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 10, paddingTop: 10,
          paddingBottom: 10 + insets.bottom, backgroundColor: C.bgPrimary,
          borderTopWidth: replyTo ? 0 : 0.5, borderTopColor: C.hairline, gap: 8 }}>
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            placeholder="메시지를 입력하세요"
            placeholderTextColor={C.warmGray}
            multiline
            style={{
              flex: 1, minHeight: 44, maxHeight: 120, fontFamily: F.sys, fontSize: fs(16), lineHeight: 22, color: C.charcoal,
              backgroundColor: C.bgSecondary, borderRadius: 20, borderWidth: 0.5, borderColor: C.hairline,
              paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11,
            }}
          />
          {/* 전송 — 활성=딥그린바탕+흰 화살표(말풍선과 통일), 비활성=흰바탕+테두리+회색. 입력창과 높이 맞춤(44) */}
          <TouchableOpacity onPress={handleSend} disabled={!canSend} activeOpacity={0.8}
            style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
              backgroundColor: canSend ? MY_BUBBLE : C.bgSecondary, borderWidth: canSend ? 0 : 1, borderColor: C.hairline }}>
            <Text style={{ fontSize: fs(20), fontFamily: F.sysB, color: canSend ? '#fff' : C.warmGray }}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardStickyView>
      {/* 공감 피커 — 자체 오버레이(Modal 호스트 안이라 글로벌 시트 대신, OverlayAlert와 동일 패턴). 바깥 탭/뒤로가기=닫기 */}
      {reactTarget && (
        <TouchableOpacity activeOpacity={1} onPress={() => setReactTarget(null)}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ alignItems: 'center', gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 4, backgroundColor: C.bgSecondary, borderRadius: 26,
              paddingHorizontal: 12, paddingVertical: 8, borderWidth: 0.5, borderColor: C.hairline }}>
              {REACTIONS.map(em => {
                const on = reactTarget.reactions?.[myUid] === em;  // 내가 이미 누른 이모지는 버터 하이라이트(다시 누르면 해제)
                return (
                  <TouchableOpacity key={em} activeOpacity={0.7} onPress={() => handleReact(em)}
                    style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: on ? C.butter : 'transparent' }}>
                    <Text style={{ fontSize: fs(24) }}>{em}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {/* 답장 — 인용 대상으로 지정하고 입력창 포커스(인스타식 long-press 메뉴) */}
            <TouchableOpacity activeOpacity={0.8}
              onPress={() => {
                const t = reactTarget;
                setReactTarget(null);
                setReplyTo(t);
                requestAnimationFrame(() => inputRef.current?.focus?.());
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.bgSecondary,
                borderRadius: 22, paddingHorizontal: 22, paddingVertical: 11, borderWidth: 0.5, borderColor: C.hairline }}>
              <Text style={{ fontSize: fs(15) }}>↩️</Text>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: C.charcoal }}>답장</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}
      <OverlayAlert data={alert} onClose={() => setAlert(null)} />
    </SafeAreaView>
    </KeyboardProvider>
  );
}
