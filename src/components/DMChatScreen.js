import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Keyboard, StatusBar } from 'react-native';
import { Image } from 'expo-image'; // 아바타 디스크캐시 ([[image-load-speed]])
import Svg, { Path } from 'react-native-svg'; // 전송 종이비행기 아이콘(Tabler send 아웃라인). ⚠️네이티브 모듈 — 다음 빌드부터 적용
import Reanimated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { KeyboardProvider, KeyboardEvents } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { getUid } from '../utils/firebase';
import { ensureConversation, sendMessage, subscribeMessages, setReaction, markConversationRead, subscribeConversation } from '../utils/dm';
import { setActiveDmPair } from '../utils/notifications';
import { OverlayAlert } from './common/OverlayAlert';
import { useAndroidBack } from '../hooks/useAndroidBack';

// ⚠️TEMP 키보드 진단 — DM 화면 우상단에 RN/keyboard-controller 키보드 높이를 띄움. 안드 키보드 가림 원인 확정용.
//   RN>0인데 KC=0 → keyboard-controller가 이 모달 윈도에서 키보드를 못 받음(Provider/윈도 문제).
//   둘 다 0 → 키보드 이벤트 자체가 이 윈도에 안 옴.  둘 다 >0인데 입력창 안 오름 → KAV 레이아웃 문제.
//   ★검증 끝나면 이 플래그·디버그 뷰·KeyboardEvents 제거할 것.
const TEMP_KB_DEBUG = true;

const WD = ['일', '월', '화', '수', '목', '금', '토'];
// DM 다크 룸 + 브랜드 색 말풍선 (사용자 상세 스펙 2026-06-11 [[dm-design]]):
//   다크 차콜 캔버스 위에 라이트 브랜드 말풍선 — 받은=페일스카이, 보낸=버터, 입력=크림. 헤더 포인트=버터/페일스카이.
const DM_CANVAS   = '#2A2622';                 // 대화 배경 — 다크 '방' 바닥(라이트 말풍선이 또렷이 뜸)
const DM_SURFACE  = '#211E1B';                 // 헤더·입력바·상태바 영역 — 다크 프레임
const DM_RECV_BG  = '#C8D9E6';                 // 받은 말풍선 = 페일스카이
const DM_RECV_TX  = '#2A3D47';                 // 받은 말풍선 글씨 — 딥 슬레이트
const DM_MINE_BG  = '#F5E6A8';                 // 보낸 말풍선 = 버터
const DM_MINE_TX  = '#3D3935';                 // 보낸 말풍선 글씨 = 차콜
const DM_FIELD    = '#FAF6EC';                 // 입력 필드 = 크림(둥근 모서리)
const DM_SEND     = '#6B1E2A';                 // 전송 버튼 = 버건디(원형)
const DM_BUTTER   = '#F5E6A8';                 // 헤더 ←·이름·전송 아이콘
const DM_PALESKY  = '#C8D9E6';                 // 헤더 부제·시각 등 보조
const DM_PLACE    = 'rgba(61,57,53,0.4)';      // 입력 플레이스홀더
const DM_LINE     = 'rgba(255,255,255,0.08)';  // 다크용 헤어라인
const DM_AVATAR   = '#46403B';                 // 친구 아바타 이니셜 배경 — 다크 위 식별(버터 이니셜)
// 말풍선 옆 시각 — 소형 반투명 페일스카이(사용자 스펙)
const timeStyle = { fontFamily: F.sys, fontSize: fs(12), color: 'rgba(200,217,230,0.5)', marginBottom: 2 };
// 공감 이모지 세트 — 인스타식 6개(마지막은 골프 ⛳). 메시지 길게누르기 → 선택, 같은 것 다시 누르면 해제.
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

// 입력 바 — ★자체 text 상태로 분리해 타이핑이 부모(메시지 리스트)를 리렌더하지 않게 함(입력 지연 방지).
//   onSend(body)→true/false(false면 입력 복구). 답장 미리보기·전송 버튼 포함. 포커스는 ref로 노출(공감→답장 동선).
const DMInputBar = React.memo(React.forwardRef(function DMInputBar({ onSend, replyTo, onCancelReply, friendName, myUid, bottomPad }, ref) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef(null);
  React.useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);
  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setText('');
    setSending(true);
    const ok = await onSend(body);
    if (ok === false) setText(body);  // 전송 실패 시 입력 복구
    setSending(false);
  };
  const canSend = !!text.trim() && !sending;
  return (
    <>
      {/* 답장(인용) 미리보기 바 — 누구에게·무슨 메시지에 답하는지 + ✕ 취소 */}
      {replyTo && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 9,
          borderTopWidth: 0.5, borderTopColor: DM_LINE, backgroundColor: DM_SURFACE }}>
          <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: DM_PALESKY }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: DM_BUTTER }}>
              {replyTo.senderUid === myUid ? '나' : friendName}님에게 답장
            </Text>
            <Text numberOfLines={1} style={{ fontFamily: F.sys, fontSize: fs(13), color: DM_PALESKY, marginTop: 1 }}>
              {replyTo.body}
            </Text>
          </View>
          <TouchableOpacity onPress={onCancelReply} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ fontSize: fs(18), color: DM_PALESKY }}>✕</Text>
          </TouchableOpacity>
        </View>
      )}
      {/* 입력창 — maxLength 미사용(한글 IME 충돌, [[textinput-maxlength-hangul-bug]]). 크림 필드(둥근 22) */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 10, paddingTop: 10,
        paddingBottom: bottomPad, backgroundColor: DM_SURFACE, borderTopWidth: replyTo ? 0 : 0.5, borderTopColor: DM_LINE, gap: 8 }}>
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={setText}
          placeholder="메시지를 입력하세요"
          placeholderTextColor={DM_PLACE}
          multiline
          style={{
            flex: 1, minHeight: 46, maxHeight: 120, fontFamily: F.sys, fontSize: fs(17), lineHeight: 23, color: DM_MINE_TX,
            backgroundColor: DM_FIELD, borderRadius: 22,
            paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12,
          }}
        />
        {/* 전송 — 버건디 원형 + 버터 종이비행기(Tabler send 아웃라인 SVG). 비활성=흐린 버건디+흐린 버터 */}
        <TouchableOpacity onPress={send} disabled={!canSend} activeOpacity={0.8}
          style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center',
            backgroundColor: canSend ? DM_SEND : 'rgba(107,30,42,0.4)' }}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" style={{ marginLeft: -1 }}>
            <Path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13"
              stroke={canSend ? DM_BUTTER : 'rgba(245,230,168,0.5)'}
              strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </TouchableOpacity>
      </View>
    </>
  );
}));

// 친구 1:1 DM 대화방 — 풀스크린, 말풍선(내 메시지 우측·상대 좌측). 카톡식 ([[dm-design]]).
//   열린 동안만 메시지 실시간 구독, 닫으면 unsub로 비용 차단([[lounge-realtime]]). 안 읽음·타이핑은 출시 후.
//   props 기반(navigation 비의존) — 네비 방식(Stack/모달)과 무관하게 재사용. onOpenOptions=차단·신고 시트(5단계).
function DMChatInner({ friendUid, friendName = '친구', friendAvatarUri = null, onClose, onOpenOptions }) {
  const insets = useSafeAreaInsets();
  const BAR_PAD = 8;  // 입력 바 내부 하단 숨틈(항상)
  // 닫힘 시 컨테이너 하단 패딩 — 합치면 옛 DM_BOTTOM_PAD(10+insets.bottom) 유지(닫힘 상태 픽셀 동일)
  const CLOSED_PAD = Math.max(0, 10 + insets.bottom - BAR_PAD);
  // ★키보드 처리 — reanimated 자동훅(useReanimatedKeyboardAnimation)은 RN Modal(별도 윈도, navigationBarTranslucent 미설정)
  //   에 안 붙어 값이 0에 머무름 → 입력창이 키보드 뒤에 완전히 가려짐(진단칩 KC>0인데 패딩 0). 명령형 RN Keyboard 이벤트는 모달서도
  //   신뢰됨(진단 RN값 매번 정확) → endCoordinates.height(=이 모달 좌표계의 키보드 윗면 높이, 내비바 제외)로 shared value를 직접
  //   구동. 컨테이너 paddingBottom = 그 높이 → 입력 바 바닥이 키보드 윗면에 딱. 내비바 이중계산 없음(3버튼/제스처 일관) ([[dm-design]]).
  const kbLift = useSharedValue(0);
  const kbPadStyle = useAnimatedStyle(() => ({ paddingBottom: Math.max(kbLift.value, CLOSED_PAD) }));
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      kbLift.value = withTiming(Math.round(e?.endCoordinates?.height || 0), { duration: 200 });
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      kbLift.value = withTiming(0, { duration: 200 });
    });
    return () => { show.remove(); hide.remove(); };
  }, []);
  const [myUid, setMyUid] = useState(null);
  const [convId, setConvId] = useState(null);
  const [messages, setMessages] = useState(null);  // null = 로딩 중
  const [alert, setAlert] = useState(null);  // 전송 실패 안내 — Modal 안이라 글로벌 alert 대신 자체 오버레이
  const [reactTarget, setReactTarget] = useState(null);  // 공감 피커 대상 메시지(길게누르기)
  const [replyTo, setReplyTo] = useState(null);  // 답장(인용) 대상 메시지 — 입력창 위 미리보기 바
  const [otherReadMs, setOtherReadMs] = useState(0);  // 상대가 이 방을 마지막으로 본 시각(ms) — 내 말풍선 읽음(✓✓) 판정
  const [kbDbg, setKbDbg] = useState({ rn: 0, kc: 0 });  // ⚠️TEMP 키보드 진단(검증 후 제거)
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

  // ⚠️TEMP 키보드 진단 — RN 기본 이벤트와 keyboard-controller 이벤트의 키보드 높이를 각각 잡아 비교(검증 후 제거)
  useEffect(() => {
    if (!TEMP_KB_DEBUG) return;
    const rnShow = Keyboard.addListener('keyboardDidShow', (e) => setKbDbg((s) => ({ ...s, rn: Math.round(e?.endCoordinates?.height || 0) })));
    const rnHide = Keyboard.addListener('keyboardDidHide', () => setKbDbg((s) => ({ ...s, rn: 0 })));
    const kcShow = KeyboardEvents.addListener('keyboardDidShow', (e) => setKbDbg((s) => ({ ...s, kc: Math.round(e?.height || 0) })));
    const kcHide = KeyboardEvents.addListener('keyboardDidHide', () => setKbDbg((s) => ({ ...s, kc: 0 })));
    return () => { rnShow.remove(); rnHide.remove(); kcShow.remove(); kcHide.remove(); };
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
      markConversationRead(convId);  // 첫 로드·새 메시지 도착 = 내가 보는 중 → 내 읽음시각 갱신(상대 화면 ✓✓)
      requestAnimationFrame(() => listRef.current?.scrollToEnd?.({ animated: true }));
    });
    return () => unsub();
  }, [convId]);

  // 상대의 읽음 시각 실시간 구독(conversation 1문서) — 내 말풍선 ✓✓ 판정용. 열린 동안만(저렴).
  useEffect(() => {
    if (!convId) return;
    const unsub = subscribeConversation(convId, (conv) => {
      const ts = conv?.lastRead?.[friendUid];
      setOtherReadMs(ts?.toMillis ? ts.toMillis() : 0);
    });
    return () => unsub();
  }, [convId, friendUid]);

  // 이 방을 보는 동안엔 같은 방 DM 푸시 배너 숨김(이미 실시간으로 보임). 이탈 시 해제 ([[dm-design]]).
  //   convId === pairId === CF 푸시 data.pairId 라 정확히 이 방만 억제.
  useEffect(() => {
    if (!convId) return;
    setActiveDmPair(convId);
    return () => setActiveDmPair(null);
  }, [convId]);

  // 전송 — DMInputBar가 body를 넘겨줌. true/false 반환(false면 입력바가 입력 복구). 인용은 replyTo로.
  const handleSend = useCallback(async (body) => {
    const quote = replyTo;  // 전송 시점 인용 캡처 — 실패 시 함께 복구
    setReplyTo(null);
    try {
      await sendMessage(friendUid, body, quote ? { msgId: quote.id, body: quote.body, senderUid: quote.senderUid } : null);
      return true;
    } catch (e) {
      if (__DEV__) console.warn('[DMChat] send', e?.message);
      setReplyTo(quote);
      // 중립 안내 — 차단·친구해지로 인한 거부(permission-denied)도 사유를 노출하지 않음(차단 비노출 정책)
      setAlert({
        title: '메시지를 보내지 못했어요',
        message: '지금은 이 대화에\n메시지를 보낼 수 없어요.',
        buttons: [{ text: '확인' }],
      });
      return false;
    }
  }, [replyTo, friendUid]);

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
  // ★입력 지연 방지 — renderItem을 useCallback으로 안정화. 안 하면 매 글자(setText) 리렌더마다 renderItem 참조가
  //   새로 생겨 FlatList가 보이는 말풍선을 전부 다시 그려 입력이 버벅임(안드 특히). list/읽음/상대정보 바뀔 때만 갱신.
  const renderItem = useCallback(({ item, index }) => {
    const mine = item.senderUid === myUid;
    const prev = index > 0 ? list[index - 1] : null;
    // 날짜가 바뀌면(또는 첫 메시지) 위에 날짜 구분선. pending(시각 미해결)이면 라벨 빈값이라 미표시.
    const showDate = (!prev || dayKey(prev.createdAt) !== dayKey(item.createdAt)) && !!fmtDay(item.createdAt);
    const time = fmtClock(item.createdAt);
    // 읽음(✓✓) — 내 메시지이고, 상대가 이 방을 본 시각이 이 메시지 시각 이후면 '읽음'.
    const msgMs = item.createdAt?.toMillis ? item.createdAt.toMillis() : 0;
    const read = mine && msgMs > 0 && otherReadMs >= msgMs;
    // 받은 메시지 묶음의 '첫 줄'에만 아바타를 말풍선 위에 1개 표시 → 아래 말풍선들은 좌측에 플러시로 붙음(사용자 2026-06-13).
    // 날짜가 바뀌면 새 묶음으로 봐 아바타 다시 표시.
    const firstOfGroup = !prev || prev.senderUid !== item.senderUid || showDate;
    return (
      <View>
        {showDate && (
          // 날짜 구분선 — 양옆 가로선 + 또렷한 캡슐(─── 오늘 ───). 캡슐만으론 다크 배경서 안 보인다는 피드백으로
          //   선 추가 + 글씨/바탕 밝기 강화(사용자 2026-06-13).
          <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 14, paddingHorizontal: 26, gap: 10 }}>
            <View style={{ flex: 1, height: 0.5, backgroundColor: 'rgba(255,255,255,0.2)' }} />
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: '#F2ECE0',
              backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 13, paddingVertical: 5, borderRadius: 12, overflow: 'hidden' }}>
              {fmtDay(item.createdAt)}
            </Text>
            <View style={{ flex: 1, height: 0.5, backgroundColor: 'rgba(255,255,255,0.2)' }} />
          </View>
        )}
        {/* 받은 메시지 묶음 시작 — 아바타를 말풍선 '위'에 한 번 올림. 이렇게 해야 아래 말풍선들이 좌측에 깔끔히 붙음(사용자 2026-06-13). */}
        {!mine && firstOfGroup && (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginTop: 8, marginBottom: 3 }}>
            <View style={{ width: 28, height: 28, borderRadius: 14, overflow: 'hidden',
              backgroundColor: DM_AVATAR, alignItems: 'center', justifyContent: 'center' }}>
              {friendAvatarUri && /^https?:\/\//.test(friendAvatarUri) ? (
                <Image source={{ uri: friendAvatarUri }} style={{ width: 28, height: 28 }} contentFit="cover" cachePolicy="memory-disk" />
              ) : (
                <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: C.butter }}>{(friendName || '?').charAt(0)}</Text>
              )}
            </View>
          </View>
        )}
        {/* 말풍선 — 보낸=우측(버터), 받은=좌측 플러시(페일스카이). 아바타는 위 묶음 헤더로 분리. 시각은 옆에 작게 */}
        <View style={{ flexDirection: 'row', justifyContent: mine ? 'flex-end' : 'flex-start',
          alignItems: 'flex-end', paddingHorizontal: 12, marginVertical: 2, gap: 6 }}>
          {/* 내 메시지 좌측: 읽음(✓✓ 페일스카이) + 시각. 읽기 전엔 시각만. */}
          {mine && (!!time || read) && (
            <View style={{ alignItems: 'flex-end', marginBottom: 2 }}>
              {read && <Text style={{ fontFamily: F.sysB, fontSize: fs(11), lineHeight: 14, color: '#C8D9E6' }}>✓</Text>}
              {!!time && <Text style={[timeStyle, { marginBottom: 0 }]}>{time}</Text>}
            </View>
          )}
          <View style={{ maxWidth: '78%' }}>
            {/* 길게누르기 → 공감 피커. 본문 탭 동작은 없음(오터치 방지) */}
            {/* 말풍선 — 보낸=버터, 받은=페일스카이. 발신자쪽 위 모서리만 각지게(말꼬리 효과): 보낸 우상단 4·받은 좌상단 4 */}
            <TouchableOpacity activeOpacity={0.85} delayLongPress={300} onLongPress={() => setReactTarget(item)}
              style={{ backgroundColor: mine ? DM_MINE_BG : DM_RECV_BG, paddingHorizontal: 16, paddingVertical: 12,
                borderTopLeftRadius: mine ? 16 : 4, borderTopRightRadius: mine ? 4 : 16,
                borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
              {/* 답장(인용) 블록 — 라이트 말풍선이라 어둡게 반투명. 좌측 액센트+발신자+2줄 요약 */}
              {item.replyTo && (
                <View style={{ borderLeftWidth: 3, borderLeftColor: mine ? 'rgba(61,57,53,0.3)' : 'rgba(42,61,71,0.3)',
                  backgroundColor: mine ? 'rgba(61,57,53,0.08)' : 'rgba(42,61,71,0.08)',
                  borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6, marginBottom: 6 }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: mine ? DM_MINE_TX : DM_RECV_TX }}>
                    {item.replyTo.senderUid === myUid ? '나' : friendName}
                  </Text>
                  <Text numberOfLines={2} style={{ fontFamily: F.sys, fontSize: fs(13), lineHeight: 18,
                    color: mine ? 'rgba(61,57,53,0.7)' : 'rgba(42,61,71,0.7)', marginTop: 1 }}>
                    {item.replyTo.body}
                  </Text>
                </View>
              )}
              {/* 본문 fs(17)·미디엄 — 가독성([[avoid-small-text]]). 얇아 보인다는 피드백으로 F.sys→F.sysM. 버터 위 차콜·페일스카이 위 슬레이트 글씨 */}
              <Text style={{ fontFamily: F.sysM, fontSize: fs(17), lineHeight: 25, color: mine ? DM_MINE_TX : DM_RECV_TX }}>{item.body}</Text>
            </TouchableOpacity>
            {/* 공감 표시 — 인스타식 말풍선 하단 안쪽 모서리에 살짝 겹친 알약 */}
            {(() => {
              const emojis = Object.values(item.reactions || {}).filter(Boolean);
              if (!emojis.length) return null;
              return (
                <View style={{ alignSelf: mine ? 'flex-start' : 'flex-end', marginTop: -10, marginHorizontal: 8,
                  backgroundColor: '#FFFFFF', borderRadius: 15, paddingHorizontal: 9, paddingVertical: 3,
                  borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.08)' }}>
                  {/* 말풍선에 붙는 공감 이모지 — 선택 피커(fs24)는 그대로, 표시 알약만 약 2배로 키움(사용자 "너무 작아") */}
                  <Text style={{ fontSize: fs(24), lineHeight: 30 }}>{emojis.join(' ')}</Text>
                </View>
              );
            })()}
          </View>
          {!mine && !!time && <Text style={timeStyle}>{time}</Text>}
        </View>
      </View>
    );
  }, [list, myUid, otherReadMs, friendName, friendAvatarUri]);

  return (
    <View style={{ flex: 1, backgroundColor: DM_SURFACE }}>
      {/* 다크 룸이라 상태바 아이콘(시계·배터리)을 밝게 — 언마운트 시 직전 화면 스타일로 자동 복원(RN StatusBar 스택). */}
      <StatusBar barStyle="light-content" />
      {/* 콘텐츠 컨테이너 — 루트 insets로 상단 패딩(중첩 SafeAreaProvider 없이). 키보드 뜨면 kbPadStyle로 하단 패딩(=RN
          endCoordinates.height)을 직접 줘 입력 바를 키보드 윗면에 딱 붙임(reanimated 자동훅 모달 미부착 대체, [[dm-design]]). */}
      <Reanimated.View style={[{ flex: 1, paddingTop: insets.top }, kbPadStyle]}>
      {/* 헤더 — 다크 프레임. 키운 상대 아바타(44) + 버터 이름 + 페일스카이 '님과 대화 중'. 별명은 friendName으로 전달 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 0.5, borderBottomColor: DM_LINE, gap: 12 }}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={{ fontSize: fs(27), color: DM_BUTTER }}>←</Text>
        </TouchableOpacity>
        {/* 상대 아바타(사진 우선·이니셜 fallback) — 44px로 키움, 다크 위 식별색 */}
        <View style={{ width: 44, height: 44, borderRadius: 22, overflow: 'hidden', backgroundColor: DM_AVATAR, alignItems: 'center', justifyContent: 'center' }}>
          {friendAvatarUri && /^https?:\/\//.test(friendAvatarUri)
            ? <Image source={{ uri: friendAvatarUri }} style={{ width: 44, height: 44 }} contentFit="cover" cachePolicy="memory-disk" />
            : <Text style={{ fontFamily: F.sysB, fontSize: fs(19), color: DM_BUTTER }}>{(friendName || '?').charAt(0)}</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(20), color: DM_BUTTER }} numberOfLines={1}>{friendName}</Text>
          <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: DM_PALESKY, marginTop: 2 }}>님과 대화 중</Text>
        </View>
        {onOpenOptions && (
          <TouchableOpacity onPress={onOpenOptions} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ fontSize: fs(22), color: DM_PALESKY }}>⋯</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 채팅 리스트 — flex로 남은 공간 채움. 키보드 뜨면 상위 Reanimated.View의 kbPadStyle(키보드높이 패딩)로
          전체가 줄어 입력창이 키보드 위로 올라가고 리스트도 그만큼 줄어 메시지가 안 가려짐. */}
      <View style={{ flex: 1, backgroundColor: DM_CANVAS }}>
      <FlatList
        ref={listRef}
        data={list}
        style={{ flex: 1 }}
        keyExtractor={(m) => m.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingVertical: 12, flexGrow: 1 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd?.({ animated: false })}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={11}
        ListEmptyComponent={messages !== null ? (
          <View style={{ alignItems: 'center', paddingVertical: 44 }}>
            <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: DM_PALESKY, textAlign: 'center', lineHeight: 22 }}>
              {friendName}님과의 첫 메시지를{'\n'}남겨보세요
            </Text>
          </View>
        ) : null}
      />
      </View>
      {/* 입력 바 — 분리된 컴포넌트(자체 text 상태)라 타이핑이 위 리스트를 리렌더 안 함(입력 지연 방지) */}
      <DMInputBar
        ref={inputRef}
        onSend={handleSend}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        friendName={friendName}
        myUid={myUid}
        bottomPad={BAR_PAD}
      />
      </Reanimated.View>
      {/* 공감 피커 — 자체 오버레이(Modal 호스트 안이라 글로벌 시트 대신, OverlayAlert와 동일 패턴). 바깥 탭/뒤로가기=닫기 */}
      {reactTarget && (
        <TouchableOpacity activeOpacity={1} onPress={() => setReactTarget(null)}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ alignItems: 'center', gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 4, backgroundColor: DM_FIELD, borderRadius: 26,
              paddingHorizontal: 12, paddingVertical: 8, borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.08)' }}>
              {REACTIONS.map(em => {
                const on = reactTarget.reactions?.[myUid] === em;  // 내가 이미 누른 이모지는 페일스카이 하이라이트(크림 카드 위 또렷, 다시 누르면 해제)
                return (
                  <TouchableOpacity key={em} activeOpacity={0.7} onPress={() => handleReact(em)}
                    style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: on ? C.paleSky : 'transparent' }}>
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
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: DM_FIELD,
                borderRadius: 22, paddingHorizontal: 22, paddingVertical: 11, borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.08)' }}>
              <Text style={{ fontSize: fs(15) }}>↩️</Text>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: DM_MINE_TX }}>답장</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}
      <OverlayAlert data={alert} onClose={() => setAlert(null)} />
      {/* ⚠️TEMP 키보드 진단 칩 — 우상단. RN=RN기본 키보드높이, KC=keyboard-controller 높이. 검증 후 제거 */}
      {TEMP_KB_DEBUG && (
        <View style={{ position: 'absolute', top: insets.top + 6, right: 8, zIndex: 999,
          backgroundColor: 'rgba(200,0,0,0.9)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(11), color: '#fff' }}>RN {kbDbg.rn} · KC {kbDbg.kc}</Text>
        </View>
      )}
    </View>
  );
}

// 친구 1:1 DM 대화방 — 외부 래퍼. RN Modal은 별도 네이티브 윈도우라 KeyboardProvider를 모달 안에 둠
//   (잘 되는 일정·기록·맛집 모달과 동일 구조). ★중첩 SafeAreaProvider는 제거 — 루트 insets가 모달 안에서도
//   정상 동작함이 ScheduleModal로 확인됨(insets.bottom 작동). 중첩 Provider가 안드 키보드 회피를 막았었음 ([[dm-design]]).
export function DMChatScreen(props) {
  return (
    <KeyboardProvider>
      <DMChatInner {...props} />
    </KeyboardProvider>
  );
}
