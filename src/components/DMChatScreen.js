import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Keyboard, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { getUid } from '../utils/firebase';
import { ensureConversation, sendMessage, subscribeMessages } from '../utils/dm';
import { setActiveDmPair } from '../utils/notifications';
import { useAndroidBack } from '../hooks/useAndroidBack';

const _and = Platform.OS === 'android';
const WD = ['일', '월', '화', '수', '목', '금', '토'];
// 말풍선 옆 시각 — 작고 흐리게
const timeStyle = { fontFamily: F.sys, fontSize: fs(10), color: C.warmGray, marginBottom: 2 };

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
export function DMChatScreen({ friendUid, friendName = '친구', onClose, onOpenOptions }) {
  const insets = useSafeAreaInsets();
  const [myUid, setMyUid] = useState(null);
  const [convId, setConvId] = useState(null);
  const [messages, setMessages] = useState(null);  // null = 로딩 중
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [kb, setKb] = useState(0);  // 안드 키보드 높이 — 입력창이 키보드에 가려지지 않게 직접 띄움
  const listRef = useRef(null);
  useAndroidBack(true, onClose); // 대화방 열린 동안 안드 뒤로가기 → 닫기

  // 안드(엣지투엣지)에선 키보드가 창을 리사이즈하지 않아 입력창이 가려진다([[fresh-install-release-bugs]] 류 환경차).
  //   키보드 높이만큼 입력영역을 직접 띄운다(아래 androidKbPad). iOS는 KeyboardAvoidingView(padding)가 처리.
  useEffect(() => {
    if (!_and) return;
    const show = Keyboard.addListener('keyboardDidShow', e => {
      setKb(e.endCoordinates?.height || 0);
      requestAnimationFrame(() => listRef.current?.scrollToEnd?.({ animated: true }));
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKb(0));
    return () => { show.remove(); hide.remove(); };
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
    setText('');
    setSending(true);
    try { await sendMessage(friendUid, body); }
    catch (e) { if (__DEV__) console.warn('[DMChat] send', e?.message); setText(body); } // 실패 시 입력 복구
    finally { setSending(false); }
  };

  const list = messages || [];
  const renderItem = ({ item, index }) => {
    const mine = item.senderUid === myUid;
    const prev = index > 0 ? list[index - 1] : null;
    // 날짜가 바뀌면(또는 첫 메시지) 위에 날짜 구분선. pending(시각 미해결)이면 라벨 빈값이라 미표시.
    const showDate = (!prev || dayKey(prev.createdAt) !== dayKey(item.createdAt)) && !!fmtDay(item.createdAt);
    const time = fmtClock(item.createdAt);
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
        {/* 말풍선 — 내것=차콜+흰글씨(고대비), 상대=흰바탕+차콜글씨+테두리(크림 배경서 또렷). 시각은 안쪽에 작게 */}
        <View style={{ flexDirection: 'row', justifyContent: mine ? 'flex-end' : 'flex-start',
          alignItems: 'flex-end', paddingHorizontal: 14, marginVertical: 3, gap: 6 }}>
          {mine && !!time && <Text style={timeStyle}>{time}</Text>}
          <View style={{
            maxWidth: '76%', backgroundColor: mine ? C.charcoal : C.bgSecondary,
            borderRadius: 16, borderTopRightRadius: mine ? 4 : 16, borderTopLeftRadius: mine ? 16 : 4,
            paddingHorizontal: 13, paddingVertical: 9,
            borderWidth: mine ? 0 : 0.5, borderColor: C.hairline,
          }}>
            <Text style={{ fontFamily: F.sys, fontSize: fs(14), lineHeight: 20, color: mine ? '#fff' : C.charcoal }}>{item.body}</Text>
          </View>
          {!mine && !!time && <Text style={timeStyle}>{time}</Text>}
        </View>
      </View>
    );
  };

  const canSend = !!text.trim() && !sending;
  // SafeAreaView가 이미 하단 inset만큼 패딩하므로, 키보드 높이에서 그만큼 빼서 입력창을 키보드 바로 위로.
  const androidKbPad = (_and && kb) ? Math.max(0, kb - insets.bottom) : 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'bottom', 'left', 'right']}>
      {/* 헤더 — 뒤로 · 상대 이름(별명은 진입부에서 friendName으로 전달) · 옵션(차단/신고, 5단계) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 0.5, borderBottomColor: C.hairline, gap: 12 }}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={{ fontSize: fs(22), color: C.charcoal }}>←</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal }} numberOfLines={1}>{friendName}</Text>
        {onOpenOptions && (
          <TouchableOpacity onPress={onOpenOptions} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ fontSize: fs(20), color: C.warmGray }}>⋯</Text>
          </TouchableOpacity>
        )}
      </View>

      <KeyboardAvoidingView style={{ flex: 1, paddingBottom: androidKbPad }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          ref={listRef}
          data={list}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingVertical: 12, flexGrow: 1, justifyContent: 'flex-end' }}
          onContentSizeChange={() => listRef.current?.scrollToEnd?.({ animated: false })}
          ListEmptyComponent={messages !== null ? (
            <View style={{ alignItems: 'center', paddingVertical: 44 }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, textAlign: 'center', lineHeight: 20 }}>
                {friendName}님과의 첫 메시지를{'\n'}남겨보세요
              </Text>
            </View>
          ) : null}
        />
        {/* 입력창 — maxLength 미사용(한글 IME 충돌, [[textinput-maxlength-hangul-bug]]).
            크고 넓게 + 글씨 또렷하게(중장년 가독성 [[avoid-small-text]]): fs15·minHeight44·넉넉한 패딩 */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 10, paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: C.hairline, gap: 8 }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="메시지를 입력하세요"
            placeholderTextColor={C.warmGray}
            multiline
            style={{
              flex: 1, minHeight: 44, maxHeight: 120, fontFamily: F.sys, fontSize: fs(15), lineHeight: 21, color: C.charcoal,
              backgroundColor: C.bgSecondary, borderRadius: 20, borderWidth: 0.5, borderColor: C.hairline,
              paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11,
            }}
          />
          {/* 전송 — 활성=차콜바탕+흰 화살표(또렷), 비활성=흰바탕+테두리+회색 화살표(흐릿하지만 보임). 입력창과 높이 맞춤(44) */}
          <TouchableOpacity onPress={handleSend} disabled={!canSend} activeOpacity={0.8}
            style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
              backgroundColor: canSend ? C.charcoal : C.bgSecondary, borderWidth: canSend ? 0 : 1, borderColor: C.hairline }}>
            <Text style={{ fontSize: fs(20), fontFamily: F.sysB, color: canSend ? '#fff' : C.warmGray }}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
