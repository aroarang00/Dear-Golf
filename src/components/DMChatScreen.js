import React, { useState, useEffect, useRef, useContext } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { getUid } from '../utils/firebase';
import { ensureConversation, sendMessage, subscribeMessages } from '../utils/dm';
import { useAndroidBack } from '../hooks/useAndroidBack';

// 친구 1:1 DM 대화방 — 풀스크린, 말풍선(내 메시지 우측·상대 좌측). 카톡식 ([[dm-design]]).
//   열린 동안만 메시지 실시간 구독, 닫으면 unsub로 비용 차단([[lounge-realtime]]). 안 읽음·타이핑은 출시 후.
//   props 기반(navigation 비의존) — 네비 방식(Stack/모달)과 무관하게 재사용. onOpenOptions=차단·신고 시트(5단계).
export function DMChatScreen({ friendUid, friendName = '친구', onClose, onOpenOptions }) {
  const [myUid, setMyUid] = useState(null);
  const [convId, setConvId] = useState(null);
  const [messages, setMessages] = useState(null);  // null = 로딩 중
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);
  useAndroidBack(true, onClose); // 대화방 열린 동안 안드 뒤로가기 → 닫기

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

  const handleSend = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setText('');
    setSending(true);
    try { await sendMessage(friendUid, body); }
    catch (e) { if (__DEV__) console.warn('[DMChat] send', e?.message); setText(body); } // 실패 시 입력 복구
    finally { setSending(false); }
  };

  const renderItem = ({ item }) => {
    const mine = item.senderUid === myUid;
    return (
      <View style={{ flexDirection: 'row', justifyContent: mine ? 'flex-end' : 'flex-start', paddingHorizontal: 14, marginVertical: 3 }}>
        <View style={{
          maxWidth: '76%', backgroundColor: mine ? C.burgundy : C.bgSecondary,
          borderRadius: 16, borderTopRightRadius: mine ? 4 : 16, borderTopLeftRadius: mine ? 16 : 4,
          paddingHorizontal: 13, paddingVertical: 9,
        }}>
          <Text style={{ fontFamily: F.sys, fontSize: fs(14), lineHeight: 20, color: mine ? '#fff' : C.charcoal }}>{item.body}</Text>
        </View>
      </View>
    );
  };

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

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          ref={listRef}
          data={messages || []}
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
        {/* 입력창 — maxLength 미사용(한글 IME 충돌, [[textinput-maxlength-hangul-bug]]) */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 0.5, borderTopColor: C.hairline, gap: 8 }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="메시지 입력"
            placeholderTextColor={C.warmGrayLight}
            multiline
            style={{
              flex: 1, maxHeight: 100, fontFamily: F.sys, fontSize: fs(14), color: C.charcoal,
              backgroundColor: C.bgSecondary, borderRadius: 18, paddingHorizontal: 14, paddingTop: 9, paddingBottom: 9,
            }}
          />
          <TouchableOpacity onPress={handleSend} disabled={!text.trim() || sending} activeOpacity={0.8}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: text.trim() ? C.burgundy : C.hairline, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: fs(18), color: '#fff' }}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
