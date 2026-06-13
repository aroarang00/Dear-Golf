import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Keyboard, StatusBar, Animated } from 'react-native';
import { Image } from 'expo-image'; // 아바타 디스크캐시 ([[image-load-speed]])
import Svg, { Path } from 'react-native-svg'; // 전송 종이비행기 아이콘(Tabler send 아웃라인). ⚠️네이티브 모듈 — 다음 빌드부터 적용
import Reanimated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { KeyboardProvider, KeyboardEvents } from 'react-native-keyboard-controller';
import { useSafeAreaInsets, SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { getUid } from '../utils/firebase';
import { ensureConversation, sendMessage, subscribeMessages, setReaction, markConversationRead, subscribeConversation, setTyping, deleteMessage } from '../utils/dm';
import { setActiveDmPair } from '../utils/notifications';
import { OverlayAlert } from './common/OverlayAlert';
import { ReportModal } from './ReportModal';
import { useAndroidBack } from '../hooks/useAndroidBack';
import { useBlockUser } from '../hooks/useBlockUser';


// ⚠️TEMP __DEV__ 키보드 미리보기 — 로그인·친구 없이 Metro에서 DM 키보드 레이아웃만 점검(가짜 대화방). 검증 후 제거.
//   DMChatScreen에 devPreview prop을 주면 네트워크(uid·대화방·구독·전송) 전부 건너뛰고, 입력창/키보드만 실제 Modal 환경 그대로 테스트.
const mockTs = (ms) => ({ toMillis: () => ms });
const DEV_PREVIEW_MESSAGES = [
  { id: 'dev1', senderUid: '__friend__', body: '키보드 테스트용 가짜 대화예요.', createdAt: mockTs(1700000000000) },
  { id: 'dev2', senderUid: '__me__', body: '아래 입력창을 눌러 키보드를 올려보세요.', createdAt: mockTs(1700000600000) },
  { id: 'dev3', senderUid: '__friend__', body: '입력창이 키보드 바로 위에 붙으면 정상이에요.', createdAt: mockTs(1700001200000) },
];

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
const DMInputBar = React.memo(React.forwardRef(function DMInputBar({ onSend, replyTo, onCancelReply, friendName, myUid, bottomPad, onTyping }, ref) {
  // ★언컨트롤드 입력 — value 바인딩 제거. 키 입력마다 setState/리렌더하던 게 안드 입력 지연의 주범이라,
  //   실제 텍스트는 textRef(리렌더 안 함)에 두고 setState는 '비었다↔있다' 전환 때만(전송버튼 토글용).
  const [hasText, setHasText] = useState(false);
  const [sending, setSending] = useState(false);
  const textRef = useRef('');
  const inputRef = useRef(null);
  React.useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);
  const onChangeText = (t) => {
    textRef.current = t;
    const ne = t.trim().length > 0;
    setHasText((p) => (p === ne ? p : ne));  // 값이 바뀔 때만 리렌더(매 글자 X)
    if (ne) onTyping?.();  // 입력 중 알림(디바운스는 부모에서)
  };
  const send = async () => {
    const body = textRef.current.trim();
    if (!body || sending) return;
    // ★낙관적 즉시 비움 — 메시지는 로컬 즉시반영으로 바로 뜸(메시지 우선 전송). 전송 완료까지 입력이 남아 '렉' 느껴지던 것 제거.
    inputRef.current?.clear();
    textRef.current = '';
    setHasText(false);
    setSending(true);
    await onSend(body);  // 실패는 드물고(차단·친구해지) alert가 안내 — 낙관적이라 입력 복구는 생략
    setSending(false);
  };
  const canSend = hasText && !sending;
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
          defaultValue=""
          onChangeText={onChangeText}
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
// 입력 중 표시 — iMessage식 통통 튀는 점 3개(받은 말풍선 톤). 인버티드 리스트의 ListHeaderComponent(=시각적 바닥)로 노출.
function TypingDot({ delay }) {
  // ★RN Animated(useNativeDriver) — Reanimated withRepeat가 안드 RN Modal에서 안 도는 현상(reverse 패턴으로도 미해결)
  //   이라 검증된 네이티브 루프로 교체. 모달 안에서도 안정적으로 펄스+튐 반복.
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 420, useNativeDriver: true }),
    ]));
    const t = setTimeout(() => loop.start(), delay);  // 점마다 시차(스태거)
    return () => { clearTimeout(t); loop.stop(); };
  }, []);
  return <Animated.View style={{ width: 7, height: 7, borderRadius: 4, marginHorizontal: 2, backgroundColor: DM_RECV_TX,
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }] }} />;
}
function TypingDots() {
  return (
    <View style={{ flexDirection: 'row', paddingHorizontal: 12, marginTop: 4, marginBottom: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: DM_RECV_BG,
        borderRadius: 16, borderTopLeftRadius: 4, paddingHorizontal: 16, paddingVertical: 14 }}>
        {[0, 1, 2].map((i) => <TypingDot key={i} delay={i * 160} />)}
      </View>
    </View>
  );
}

function DMChatInner({ friendUid, friendName = '친구', friendAvatarUri = null, onClose, onOpenOptions, devPreview = false }) {
  const insets = useSafeAreaInsets();
  const BAR_PAD = 8;  // 입력 바 내부 하단 숨틈(항상)
  // 닫힘 시 컨테이너 하단 패딩 — 합치면 옛 DM_BOTTOM_PAD(10+insets.bottom) 유지(닫힘 상태 픽셀 동일)
  const CLOSED_PAD = Math.max(0, 10 + insets.bottom - BAR_PAD);
  // ★키보드 처리 — reanimated 자동훅(useReanimatedKeyboardAnimation)은 RN Modal(별도 윈도)에 안 붙어 값이 0에 머무름.
  //   대신 keyboard-controller 명령형 이벤트(KeyboardEvents)는 모달서도 신뢰됨(진단칩 KC값 매번 정확). 이 모달 콘텐츠는 화면
  //   진짜 바닥(내비바 아래)까지 깔리므로, 키보드 윗면까지 거리 = 키보드높이 + 내비바 = KeyboardEvents의 e.height(=KC, 내비바 포함).
  //   RN Keyboard endCoordinates.height(=내비바 제외=310)를 쓰면 딱 내비바(48)만큼 모자라 입력창이 키보드 뒤로 내려가 툴바 아래로만
  //   살짝 보였음(실측 확인). KC(358)를 써야 입력 바 바닥이 키보드 윗면에 딱 붙음. 컨테이너 paddingBottom = KC ([[dm-design]]).
  const kbLift = useSharedValue(0);
  const kbPadStyle = useAnimatedStyle(() => ({ paddingBottom: Math.max(kbLift.value, CLOSED_PAD) }));
  // 키보드와 '동시에' 입력창을 밀어 올림(인스타식). will 이벤트로 키보드 슬라이드 시작과 같이 출발 + 키보드 자체 duration을 써
  //   같은 속도로 따라 올라감. did 이벤트는 will 미발화(일부 기기) 대비 최종값 보장. e.height=KC(per-device 동적, 윈도우 기준).
  useEffect(() => {
    const onShow = (e) => { kbLift.value = withTiming(Math.round(e?.height || 0), { duration: e?.duration || 220 }); };
    const onHide = (e) => { kbLift.value = withTiming(0, { duration: e?.duration || 220 }); };
    const subs = [
      KeyboardEvents.addListener('keyboardWillShow', onShow),
      KeyboardEvents.addListener('keyboardDidShow', onShow),
      KeyboardEvents.addListener('keyboardWillHide', onHide),
      KeyboardEvents.addListener('keyboardDidHide', onHide),
    ];
    return () => subs.forEach((s) => s.remove());
  }, []);
  const [myUid, setMyUid] = useState(null);
  const [convId, setConvId] = useState(null);
  const [messages, setMessages] = useState(null);  // null = 로딩 중
  const [alert, setAlert] = useState(null);  // 전송 실패 안내 — Modal 안이라 글로벌 alert 대신 자체 오버레이
  const [reactTarget, setReactTarget] = useState(null);  // 공감 피커 대상 메시지(길게누르기)
  const [replyTo, setReplyTo] = useState(null);  // 답장(인용) 대상 메시지 — 입력창 위 미리보기 바
  const [otherReadMs, setOtherReadMs] = useState(0);  // 상대가 이 방을 마지막으로 본 시각(ms) — 내 말풍선 읽음(✓) 판정
  const [friendTyping, setFriendTyping] = useState(false);  // 상대 입력 중 — 말풍선 점 표시
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const typingHideRef = useRef(null);   // 상대 typing 자동 숨김 타이머
  const lastTypingMsRef = useRef(0);    // 상대 typing 마지막 시각(값 변화 감지용 — Date.now 비교 안 함)
  const myUidRef = useRef(null);        // 구독 콜백에서 내/상대 메시지 판별용(클로저 stale·재구독 방지)
  const typingState = useRef({ last: 0, stop: null });  // 내 typing 디바운스(쓰기 절약)
  const { block: blockUserFn, remaining: blockRemaining } = useBlockUser(); // 공용 차단 훅(친구 차단과 동일 동작)
  const [optionsOpen, setOptionsOpen] = useState(false);    // 헤더 ⋯ 옵션 시트(신고·차단)
  const [reportPrefill, setReportPrefill] = useState(null); // 신고 모달 — null=닫힘, 문자열=열림(근거 프리필=메시지 인용 등)
  useAndroidBack(true, onClose); // 대화방 열린 동안 안드 뒤로가기 → 닫기
  // 피커·옵션시트가 떠 있으면 뒤로가기는 그것만 닫기 — 나중에 등록된 리스너가 먼저 소비(위 화면닫기보다 우선)
  useAndroidBack(!!reactTarget, () => setReactTarget(null));
  useAndroidBack(optionsOpen, () => setOptionsOpen(false));

  // 키보드가 뜨면 마지막 메시지가 보이게 끝으로 스크롤 (입력영역 띄우기는 keyboard-controller KAV가 처리)
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => {
      requestAnimationFrame(() => listRef.current?.scrollToOffset?.({ offset: 0, animated: true }));  // 인버티드: offset 0 = 최신(바닥)
    });
    return () => show.remove();
  }, []);

  // 내 uid + 대화방 보장(메시지 0건이라도 방은 존재)
  useEffect(() => {
    if (devPreview) { setMyUid('__me__'); setMessages(DEV_PREVIEW_MESSAGES); return; }  // ⚠️TEMP 키보드 미리보기 — 네트워크 건너뜀
    let alive = true;
    (async () => {
      try {
        const uid = await getUid();
        const id = await ensureConversation(friendUid);
        if (alive) { myUidRef.current = uid; setMyUid(uid); setConvId(id); }
      } catch (e) { if (__DEV__) console.warn('[DMChat] ensure', e?.message); }
    })();
    return () => { alive = false; };
  }, [friendUid]);

  // 대화방 열린 동안만 메시지 실시간 구독 (닫으면 cleanup에서 unsub)
  useEffect(() => {
    if (!convId) return;
    const unsub = subscribeMessages(convId, (msgs) => {
      setMessages(msgs);
      // 최신 메시지가 상대 것일 때만 읽음 기록 — 내 전송·리액션 변경 땐 불필요한 쓰기·스냅샷 churn 제거(렉 완화). msgs=오래된→최신.
      const newest = msgs[msgs.length - 1];
      if (newest && newest.senderUid !== myUidRef.current) markConversationRead(convId);
      requestAnimationFrame(() => listRef.current?.scrollToOffset?.({ offset: 0, animated: true }));  // 인버티드: offset 0 = 최신(바닥)
    });
    return () => unsub();
  }, [convId]);

  // 상대 읽음 시각 + 입력 중 실시간 구독(conversation 1문서, 기존 리스너 재사용 — 타이핑 추가 비용 0). 열린 동안만.
  useEffect(() => {
    if (!convId) return;
    const unsub = subscribeConversation(convId, (conv) => {
      const ts = conv?.lastRead?.[friendUid];
      setOtherReadMs(ts?.toMillis ? ts.toMillis() : 0);
      // 상대 입력 중 — typing.{friendUid} 값이 '갱신'되면 표시(방금 입력). ★Date.now 비교 안 함(기기 시계가 서버보다
      //   앞서면 항상 stale로 처리돼 점이 안 뜨던 버그). 값 변화 감지 + 6초 무갱신 시 자동 숨김. 해제 기록(0) 오면 즉시 숨김.
      const tt = conv?.typing?.[friendUid];
      const tms = tt?.toMillis ? tt.toMillis() : 0;
      if (!tms) {
        lastTypingMsRef.current = 0;
        clearTimeout(typingHideRef.current);
        setFriendTyping(false);
      } else if (tms !== lastTypingMsRef.current) {
        lastTypingMsRef.current = tms;
        setFriendTyping(true);
        clearTimeout(typingHideRef.current);
        typingHideRef.current = setTimeout(() => setFriendTyping(false), 6000);
      }
    });
    return () => { unsub(); clearTimeout(typingHideRef.current); };
  }, [convId, friendUid]);

  // 내 입력 중 기록 — 디바운스(매 글자 X): 3초에 한 번 typing=true, 4초 멈추면 false. 화면 이탈 시 해제(상대 점 안 남게).
  const notifyTyping = useCallback(() => {
    if (!convId) return;
    const now = Date.now();
    if (now - typingState.current.last > 3000) { typingState.current.last = now; setTyping(convId, true); }
    clearTimeout(typingState.current.stop);
    typingState.current.stop = setTimeout(() => { typingState.current.last = 0; setTyping(convId, false); }, 4000);
  }, [convId]);
  const stopTyping = useCallback(() => {
    clearTimeout(typingState.current.stop);
    typingState.current.last = 0;
    if (convId) setTyping(convId, false);
  }, [convId]);
  useEffect(() => () => { clearTimeout(typingState.current.stop); if (convId) setTyping(convId, false); }, [convId]);

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
    stopTyping();  // 전송하면 입력 중 해제
    if (devPreview) {  // ⚠️TEMP 키보드 미리보기 — 서버 없이 로컬 append만
      setMessages((prev) => [...(prev || []), { id: 'dev-s-' + (prev?.length || 0), senderUid: '__me__', body,
        createdAt: mockTs(Date.now()), replyTo: quote ? { msgId: quote.id, body: quote.body, senderUid: quote.senderUid } : null }]);
      return true;
    }
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
  }, [replyTo, friendUid, devPreview]);

  // 메시지 삭제(언센드) — 본인 메시지만. 확인 후 양쪽 화면에서 완전 삭제(실시간 구독이 양쪽 반영). devPreview는 convId 없어 무시.
  const confirmDeleteMsg = () => {
    const target = reactTarget;
    setReactTarget(null);
    if (!target || !convId) return;
    setAlert({
      title: '메시지를 삭제할까요?',
      message: '나와 상대방 모두에게서\n이 메시지가 사라져요.',
      buttons: [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: () => {
          deleteMessage(convId, target.id).catch(e => { if (__DEV__) console.warn('[DMChat] delete', e?.message); });
        } },
      ],
    });
  };

  // 신고 — 상대(friendUid) 대상 ReportModal 열기. prefill=근거란 초기값(메시지 신고 시 그 메시지 인용 스냅샷 → 언센드돼도 증거 보존).
  const openReport = (prefill = '') => { setReactTarget(null); setOptionsOpen(false); if (devPreview || !friendUid) return; setReportPrefill(prefill); };
  // 차단 — 친구 차단과 동일(공용 훅). 한도 체크 → 확인 → 차단되면 대화 불가라 대화방 닫기. devPreview(가짜 대화방)는 무시.
  const confirmBlock = () => {
    setOptionsOpen(false);
    if (devPreview || !friendUid) return;
    if (blockRemaining <= 0) {
      setAlert({ title: '차단 횟수 초과', message: '오늘 차단 가능한 횟수를 초과했어요.\n내일 다시 시도해주세요.', buttons: [{ text: '확인' }] });
      return;
    }
    setAlert({
      title: `${friendName}님을 차단할까요?`,
      message: '친구가 끊기고, 이 사람의 글·모집·메시지가\n더 이상 보이지 않아요.\n\n💡 상대방에게는 알림이 가지 않아요.',
      buttons: [
        { text: '취소', style: 'cancel' },
        { text: '차단', style: 'destructive', onPress: async () => { const r = await blockUserFn(friendUid); if (r?.ok) onClose(); } },
      ],
    });
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
  // 인버티드 FlatList용 — 최신이 index 0(시각적 바닥). 새 메시지가 바닥에 자동으로 쌓여 끌어올릴 필요 없음 + 메시지 적어도 입력창 바로 위에 붙음(카톡식 아래고정).
  const rlist = useMemo(() => list.slice().reverse(), [list]);
  // ★입력 지연 방지 — renderItem을 useCallback으로 안정화. 안 하면 매 글자(setText) 리렌더마다 renderItem 참조가
  //   새로 생겨 FlatList가 보이는 말풍선을 전부 다시 그려 입력이 버벅임(안드 특히). list/읽음/상대정보 바뀔 때만 갱신.
  const renderItem = useCallback(({ item, index }) => {
    const mine = item.senderUid === myUid;
    // 인버티드: index+1 = 시각적 위(더 오래된 이웃). 날짜 구분선·아바타 묶음 판정에 '더 오래된 메시지' 사용.
    const older = index < rlist.length - 1 ? rlist[index + 1] : null;
    // 날짜가 바뀌면(또는 첫 메시지) 위에 날짜 구분선. pending(시각 미해결)이면 라벨 빈값이라 미표시.
    const showDate = (!older || dayKey(older.createdAt) !== dayKey(item.createdAt)) && !!fmtDay(item.createdAt);
    const time = fmtClock(item.createdAt);
    // 읽음(✓✓) — 내 메시지이고, 상대가 이 방을 본 시각이 이 메시지 시각 이후면 '읽음'.
    const msgMs = item.createdAt?.toMillis ? item.createdAt.toMillis() : 0;
    const read = mine && msgMs > 0 && otherReadMs >= msgMs;
    // 받은 메시지 묶음의 '첫 줄'에만 아바타를 말풍선 위에 1개 표시 → 아래 말풍선들은 좌측에 플러시로 붙음(사용자 2026-06-13).
    // 날짜가 바뀌면 새 묶음으로 봐 아바타 다시 표시.
    const firstOfGroup = !older || older.senderUid !== item.senderUid || showDate;
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
              {read && <Text style={{ fontFamily: F.sysB, fontSize: fs(11), lineHeight: 14, color: '#C8D9E6' }}>✓ 읽음</Text>}
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
  }, [rlist, myUid, otherReadMs, friendName, friendAvatarUri]);

  return (
    <View style={{ flex: 1, backgroundColor: DM_SURFACE }}>
      {/* 다크 룸이라 상태바 아이콘(시계·배터리)을 밝게 — 언마운트 시 직전 화면 스타일로 자동 복원(RN StatusBar 스택). */}
      <StatusBar barStyle="light-content" />
      {/* 콘텐츠 컨테이너 — 루트 insets로 상단 패딩(중첩 SafeAreaProvider 없이). 키보드 뜨면 kbPadStyle로 하단 패딩(=KC,
          내비바 포함 키보드 윗면 높이)을 직접 줘 입력 바를 키보드 윗면에 딱 붙임(reanimated 자동훅 모달 미부착 대체, [[dm-design]]). */}
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
        {/* ⋯ 옵션 — 신고·차단 시트(아래 자체 오버레이). onOpenOptions(외부 위임)가 오면 그걸 우선. */}
        <TouchableOpacity onPress={() => (onOpenOptions ? onOpenOptions() : setOptionsOpen(true))} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={{ fontSize: fs(22), color: DM_PALESKY }}>⋯</Text>
        </TouchableOpacity>
      </View>

      {/* 채팅 리스트 — flex로 남은 공간 채움. 키보드 뜨면 상위 Reanimated.View의 kbPadStyle(키보드높이 패딩)로
          전체가 줄어 입력창이 키보드 위로 올라가고 리스트도 그만큼 줄어 메시지가 안 가려짐. */}
      <View style={{ flex: 1, backgroundColor: DM_CANVAS }}>
      <FlatList
        ref={listRef}
        data={rlist}
        inverted
        style={{ flex: 1 }}
        keyExtractor={(m) => m.id}
        renderItem={renderItem}
        ListHeaderComponent={friendTyping ? <TypingDots /> : null}
        contentContainerStyle={{ paddingVertical: 12 }}
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
        onTyping={notifyTyping}
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
            {/* 삭제(언센드) — 내 메시지만. 확인 후 양쪽서 사라짐 ([[dm-design]]) */}
            {reactTarget.senderUid === myUid && (
              <TouchableOpacity activeOpacity={0.8} onPress={confirmDeleteMsg}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: DM_FIELD,
                  borderRadius: 22, paddingHorizontal: 22, paddingVertical: 11, borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.08)' }}>
                <Text style={{ fontSize: fs(15) }}>🗑️</Text>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: '#B3261E' }}>삭제</Text>
              </TouchableOpacity>
            )}
            {/* 신고 — 받은(상대) 메시지만. 그 메시지를 인용해 신고 모달 근거에 프리필(증거 스냅샷 → 언센드돼도 보존) */}
            {reactTarget.senderUid !== myUid && (
              <TouchableOpacity activeOpacity={0.8}
                onPress={() => openReport(`[받은 메시지] "${(reactTarget.body || '').slice(0, 200)}"`)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: DM_FIELD,
                  borderRadius: 22, paddingHorizontal: 22, paddingVertical: 11, borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.08)' }}>
                <Text style={{ fontSize: fs(15) }}>🚩</Text>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: '#B3261E' }}>신고</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      )}
      {/* ⋯ 옵션 시트 — 신고·차단(바텀 시트, 자체 오버레이=Modal 중첩 회피). 바깥 탭/뒤로가기 닫기 */}
      {optionsOpen && (
        <TouchableOpacity activeOpacity={1} onPress={() => setOptionsOpen(false)}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: DM_FIELD, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 10) + 6 }}>
            <TouchableOpacity activeOpacity={0.7} onPress={() => openReport('')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 15, paddingHorizontal: 24 }}>
              <Text style={{ fontSize: fs(17) }}>🚩</Text>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: DM_MINE_TX }}>{friendName}님 신고</Text>
            </TouchableOpacity>
            <View style={{ height: 0.5, backgroundColor: 'rgba(0,0,0,0.08)', marginHorizontal: 20 }} />
            <TouchableOpacity activeOpacity={0.7} onPress={confirmBlock}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 15, paddingHorizontal: 24 }}>
              <Text style={{ fontSize: fs(17) }}>🚫</Text>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: '#B3261E' }}>{friendName}님 차단</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}
      {/* 신고 모달 — 상대 고정(presetTarget) + 메시지 인용 프리필. ReportModal은 Modal(MyPage 내부서도 검증된 중첩 패턴) */}
      <ReportModal visible={reportPrefill !== null}
        onClose={() => setReportPrefill(null)}
        presetTarget={{ id: friendUid, name: friendName }}
        prefillEvidence={reportPrefill || ''} />
      <OverlayAlert data={alert} onClose={() => setAlert(null)} />
    </View>
  );
}

// 친구 1:1 DM 대화방 — 외부 래퍼. RN Modal은 별도 네이티브 윈도우라 KeyboardProvider를 모달 안에 둠(일정·기록·맛집 모달과 동일).
//   ★SafeAreaProvider 복원 — RN Modal 안에선 루트 SafeAreaProvider가 안 닿아 iOS insets.top=0(헤더가 노치 위로 붙음).
//   DMListScreen과 동일하게 자체 Provider+initialWindowMetrics로 재측정. 옛날엔 중첩 Provider가 reanimated KAV와 충돌해 뺐지만,
//   지금은 imperative KeyboardEvents 방식이라 충돌 없음(키보드 높이는 Provider와 무관하게 들어옴) ([[dm-design]] iOS safe-area 버그).
export function DMChatScreen(props) {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <KeyboardProvider>
        <DMChatInner {...props} />
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
