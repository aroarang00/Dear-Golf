import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Keyboard, StatusBar, Animated, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image'; // 아바타 디스크캐시 ([[image-load-speed]])
import { PhotoViewer, primePhotoRatio } from './common/PhotoViewer'; // DM 사진 전체화면 보기 + 실비율 프라임(뷰어 열 때 리플로우 제거)
import Svg, { Path } from 'react-native-svg'; // 전송 종이비행기 아이콘(Tabler send 아웃라인). ⚠️네이티브 모듈 — 다음 빌드부터 적용
import Reanimated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { KeyboardProvider, KeyboardEvents } from 'react-native-keyboard-controller';
import { useSafeAreaInsets, SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { getUid, auth } from '../utils/firebase';
import { connectKakaoAccount } from '../utils/kakaoAuth';
import { useCurrentUid } from '../contexts/CurrentUidContext';
import { LinkText } from './common/LinkText';
import { ensureConversation, sendMessage, sendImageMessage, sendImagesMessage, sendVideoMessage, subscribeMessages, setReaction, markConversationRead, subscribeConversation, setTyping, deleteMessage } from '../utils/dm';
import * as ImagePicker from 'expo-image-picker';
import { storage } from '../utils/storage';
import { setActiveDmPair } from '../utils/notifications';
import { OverlayAlert } from './common/OverlayAlert';
import { ReportModal } from './ReportModal';
import { useAndroidBack } from '../hooks/useAndroidBack';
import { useBlockUser } from '../hooks/useBlockUser';


const WD =['일', '월', '화', '수', '목', '금', '토'];
// DM 다크 룸 + 브랜드 색 말풍선 (사용자 상세 스펙 2026-06-11 [[dm-design]]):
//   다크 차콜 캔버스 위에 라이트 브랜드 말풍선 — 받은=페일스카이, 보낸=버터, 입력=크림. 헤더 포인트=버터/페일스카이.
const DM_CANVAS   = '#2A2622';                 // 대화 배경 — 다크 '방' 바닥(라이트 말풍선이 또렷이 뜸)
const DM_SURFACE  = '#211E1B';                 // 헤더·입력바·상태바 영역 — 다크 프레임
const DM_RECV_BG  = '#C8D9E6';                 // 받은 말풍선 = 페일스카이
const DM_RECV_TX  = '#2A3D47';                 // 받은 말풍선 글씨 — 딥 슬레이트
const DM_MINE_BG  = '#F5E6A8';                 // 보낸 말풍선 = 버터
const DM_MINE_TX  = '#3D3935';                 // 보낸 말풍선 글씨 = 차콜
const HIDDEN_MSGS_KEY = 'dm_hidden_msgs';      // 나만 삭제(숨김)한 메시지 id 로컬 저장 키 — 내 화면에서만 가림
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

// 이모지 시퀀스 1개 — 베이스 이모지(+VS16·키캡·스킨톤·ZWJ 결합) 또는 국기(Regional Indicator 2자). 카톡·아이메시지식 '이모지만 크게'.
//  ★Hermes 호환: \p{Extended_Pictographic} 등 Unicode 속성명은 Hermes 미지원 시 정규식 SyntaxError(모듈 로드 크래시) 위험 → 명시적 코드포인트 범위로 대체.
//  범위: 1F300–1FAFF(주요 이모지)·2600–27BF(기호/딩뱃 ☀️❤️⛳)·2300–23FF(⏰⌚)·2B00–2BFF(⭐)·2190–21FF(↗️). 스킨톤 1F3FB–1F3FF, VS16 FE0F, 키캡 20E3, ZWJ 200D.
const EMOJI_RANGE = '\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{2300}-\\u{23FF}\\u{2B00}-\\u{2BFF}\\u{2190}-\\u{21FF}';
const EMOJI_SEQ_RE = new RegExp(
  `(?:[${EMOJI_RANGE}](?:\\uFE0F|\\u20E3|[\\u{1F3FB}-\\u{1F3FF}])?(?:\\u200D[${EMOJI_RANGE}](?:\\uFE0F|[\\u{1F3FB}-\\u{1F3FF}])?)*)|[\\u{1F1E6}-\\u{1F1FF}]{2}`,
  'gu',
);
// 본문이 '이모지만'(공백 제외)인지 — 맞으면 개수 반환, 아니면 null. 숫자·문자가 섞이면 일반 텍스트로 처리(스트립 후 잔여 검사).
function emojiOnlyCount(text) {
  const t = (text || '').trim();
  if (!t || t.length > 80) return 0;                     // 너무 길면(섞인 장문) 일반 처리
  const matches = t.match(EMOJI_SEQ_RE);
  if (!matches) return 0;
  if (t.replace(EMOJI_SEQ_RE, '').replace(/\s+/g, '').length > 0) return 0; // 이모지·공백 외 글자 있으면 일반
  return matches.length;
}
// 이모지 전용 메시지 글자 크기 — 적을수록 크게(1개 최대), 많아질수록 단계적으로 줄임.
function emojiFontSize(n) {
  if (n === 1) return fs(44);
  if (n <= 3) return fs(34);
  if (n <= 6) return fs(26);
  return fs(20);
}

// 입력 바 — ★자체 text 상태로 분리해 타이핑이 부모(메시지 리스트)를 리렌더하지 않게 함(입력 지연 방지).
//   onSend(body)→true/false(false면 입력 복구). 답장 미리보기·전송 버튼 포함. 포커스는 ref로 노출(공감→답장 동선).
const DMInputBar = React.memo(React.forwardRef(function DMInputBar({ onSend, onPickImage, replyTo, onCancelReply, friendName, myUid, bottomPad, onTyping }, ref) {
  // ★언컨트롤드 입력 — value 바인딩 제거. 키 입력마다 setState/리렌더하던 게 안드 입력 지연의 주범이라,
  //   실제 텍스트는 textRef(리렌더 안 함)에 두고 setState는 '비었다↔있다' 전환 때만(전송버튼 토글용).
  const [hasText, setHasText] = useState(false);
  const [sending, setSending] = useState(false);
  const [inputH, setInputH] = useState(46);  // 입력창 높이 — onContentSizeChange로 구동(iOS 멀티라인 자동확장 안 되던 것 해결, [46,120] 클램프)
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
    setInputH(46);  // 전송 후 입력창 높이 원위치(clear가 onContentSizeChange를 항상 트리거하진 않음)
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
        {/* 사진 보내기 — 갤러리 선택 → 즉시 전송(캡션 없음 v1). 입력 좌측. */}
        <TouchableOpacity onPress={onPickImage} activeOpacity={0.7}
          style={{ width: 40, height: 46, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: fs(22) }}>📷</Text>
        </TouchableOpacity>
        <TextInput
          ref={inputRef}
          defaultValue=""
          onChangeText={onChangeText}
          placeholder="메시지를 입력하세요"
          placeholderTextColor={DM_PLACE}
          multiline
          onContentSizeChange={(e) => {
            // iOS·안드 공통 자동 높이 — 콘텐츠 높이로 구동(iOS는 min/maxHeight만으론 안 늘어남). [46,120] 클램프, 넘으면 내부 스크롤
            const h = Math.ceil(e.nativeEvent.contentSize.height);
            setInputH(prev => { const next = Math.min(120, Math.max(46, h)); return next === prev ? prev : next; });
          }}
          style={{
            flex: 1, height: Math.min(120, Math.max(46, inputH)), fontFamily: F.sys, fontSize: fs(17), lineHeight: 23, color: DM_MINE_TX,
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

// DM 사진 한 칸 — 로드 실패(보관기간 만료·삭제) 시 '만료된 사진' 플레이스홀더. 만료는 정상 동작이라 조용히 대체.
//  full=단일 사진(앨범 아님): 실제 비율로 높이를 잡아 세로로 긴 카드(초대장·모집공유)가 하단까지 보이게.
//   과도한 길이는 클램프(0.6~1.9×). 비율 알기 전엔 정사각으로 시작 → onLoad에서 보정.
function DmImg({ uri, size, radius, full }) {
  const [err, setErr] = useState(false);
  const [ratio, setRatio] = useState(null);   // w/h (full 모드 높이 산정용)
  if (err) {
    return (
      <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: 'rgba(0,0,0,0.12)', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: fs(size > 130 ? 26 : 18) }}>🖼️</Text>
        <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: 'rgba(0,0,0,0.45)', marginTop: 4 }}>만료된 사진</Text>
      </View>
    );
  }
  const h = full ? Math.min(size * 1.9, Math.max(size * 0.6, size / (ratio || 1))) : size;
  return (
    <Image source={{ uri }} onError={() => setErr(true)}
      onLoad={(e) => { const w = e?.source?.width, hh = e?.source?.height; if (w && hh) { primePhotoRatio(uri, w / hh); if (full) setRatio(w / hh); } }}
      style={{ width: size, height: h, borderRadius: radius, backgroundColor: 'rgba(0,0,0,0.06)' }}
      contentFit="cover" cachePolicy="memory-disk" transition={150} />
  );
}

// DM 사진 그리드(앨범) — 1장=정사각 크게, 2장+=2열 격자(최대 4칸, 5장+ 4번째에 +N). 카톡 앨범식.
//   onPressIndex 있으면 칸 탭=뷰어(해당 index). 없으면(미리보기) 비활성. 컨테이너 폭 210 고정.
function DmImageGrid({ uris, onPressIndex, onLongPress, full }) {
  const c = uris.length;
  if (c === 1) {
    return (
      <TouchableOpacity activeOpacity={onPressIndex ? 0.9 : 1} disabled={!onPressIndex && !onLongPress}
        onPress={() => onPressIndex?.(0)} onLongPress={onLongPress} delayLongPress={300}>
        <DmImg uri={uris[0]} size={210} radius={12} full={full} />
      </TouchableOpacity>
    );
  }
  const cell = 103;
  return (
    <View style={{ width: 210, flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
      {uris.slice(0, 4).map((u, i) => {
        const more = (i === 3 && c > 4) ? c - 4 : 0;
        return (
          <TouchableOpacity key={i} activeOpacity={onPressIndex ? 0.9 : 1} disabled={!onPressIndex && !onLongPress}
            onPress={() => onPressIndex?.(i)} onLongPress={onLongPress} delayLongPress={300}>
            <DmImg uri={u} size={cell} radius={8} />
            {more > 0 && (
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontFamily: F.sysB, fontSize: fs(18) }}>+{more}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// DM 동영상 — 포스터 썸네일 + ▶ 오버레이. 탭하면 전체화면 재생(PhotoViewer). 포스터 없으면 어두운 박스 폴백.
function DmVideo({ uri, poster, size, onPress, onLongPress }) {
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} onLongPress={onLongPress} delayLongPress={300}>
      {poster
        ? <DmImg uri={poster} size={size} radius={12} />
        : <View style={{ width: size, height: size, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.3)' }} />}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: fs(18), color: '#fff', marginLeft: 3 }}>▶</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function DMChatInner({ friendUid, friendName = '친구', friendAvatarUri = null, onClose, onOpenOptions, onOpenRoundup }) {
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
  const currentUid = useCurrentUid();   // uid 안정화([[uid-stabilization-plan]] 3단계) — uid 변경 시 내 uid·대화방 재확정
  const [convId, setConvId] = useState(null);
  const [messages, setMessages] = useState(null);  // null = 로딩 중
  const [alert, setAlert] = useState(null);  // 전송 실패 안내 — Modal 안이라 글로벌 alert 대신 자체 오버레이
  const [reactTarget, setReactTarget] = useState(null);  // 공감 피커 대상 메시지(길게누르기)
  const [replyTo, setReplyTo] = useState(null);  // 답장(인용) 대상 메시지 — 입력창 위 미리보기 바
  const [otherReadMs, setOtherReadMs] = useState(0);  // 상대가 이 방을 마지막으로 본 시각(ms) — 내 말풍선 읽음(✓) 판정
  const [myClearedMs, setMyClearedMs] = useState(0);  // 내가 '목록에서 지운' 시각(ms) — 그 이전 메시지는 내 화면에서 숨김(카톡식, 상대는 보존)
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
  const [imgViewer, setImgViewer] = useState(null); // DM 사진 전체화면 — url 문자열(열림)/null(닫힘). 뒤로가기는 PhotoViewer 자체 Modal(onRequestClose)이 처리.
  const [pendingImgs, setPendingImgs] = useState([]); // 낙관적 미리보기 — 업로드 중 사진을 즉시 보여줌 [{tempId, uris}]. 전송 완료 시 제거(실제 메시지로 대체).
  const [vidSending, setVidSending] = useState(0);    // 업로드 중인 동영상 수(진행 표시) — 용량 커서 시간 걸림
  const [hiddenMsgs, setHiddenMsgs] = useState(() => new Set()); // 나만 삭제(숨김) — 내 화면에서만 가린 메시지 id(로컬 영속). 상대 화면엔 유지.
  useEffect(() => { storage.load(HIDDEN_MSGS_KEY, []).then(arr => setHiddenMsgs(new Set(Array.isArray(arr) ? arr : []))).catch(() => {}); }, []);
  useAndroidBack(true, onClose); // 대화방 열린 동안 안드 뒤로가기 → 닫기
  // 피커·옵션시트가 떠 있으면 뒤로가기는 그것만 닫기 — 나중에 등록된 리스너가 먼저 소비(위 화면닫기보다 우선)
  useAndroidBack(!!reactTarget, () => setReactTarget(null));
  useAndroidBack(optionsOpen, () => setOptionsOpen(false));

  // 키보드가 뜨면 마지막 메시지가 보이게 끝으로 스크롤 (입력영역 띄우기는 keyboard-controller KAV가 처리)
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => {
      requestAnimationFrame(() => listRef.current?.scrollToOffset?.({ offset: 0, animated: false }));  // 인버티드: offset 0 = 최신(바닥). 즉시 점프(스냅샷마다 애니 스크롤=실시간 수신 버벅임 원인)
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
        if (alive) { myUidRef.current = uid; setMyUid(uid); setConvId(id); }
      } catch (e) { if (__DEV__) console.warn('[DMChat] ensure', e?.message); }
    })();
    return () => { alive = false; };
  }, [friendUid, currentUid]);   // uid 바뀌면 새 계정 기준으로 myUid·convId 재확정(stale 발신자 방지)

  // 대화방 열린 동안만 메시지 실시간 구독 (닫으면 cleanup에서 unsub)
  useEffect(() => {
    if (!convId) return;
    const unsub = subscribeMessages(convId, (msgs) => {
      setMessages(msgs);
      // 읽음 처리는 conversation 구독에서 'unread>0일 때'로 일원화(아래) — 여기서 senderUid로 거르면
      //   상대 메시지 후 내가 답장해 최신이 '내 것'이 되는 순간 내 안읽음이 안 지워지고 박혀버림
      //   ('내가 쓴 글이 나에게 새글' 버그, 2026-06-17 실데이터 확인). msgs=오래된→최신.
      requestAnimationFrame(() => listRef.current?.scrollToOffset?.({ offset: 0, animated: false }));  // 인버티드: offset 0 = 최신(바닥). 즉시 점프(스냅샷마다 애니 스크롤=실시간 수신 버벅임 원인)
    });
    return () => unsub();
  }, [convId]);

  // 상대 읽음 시각 + 입력 중 실시간 구독(conversation 1문서, 기존 리스너 재사용 — 타이핑 추가 비용 0). 열린 동안만.
  useEffect(() => {
    if (!convId) return;
    const unsub = subscribeConversation(convId, (conv) => {
      // 방을 보고 있는 동안 내 안읽음이 남아 있으면 즉시 0 — 누가 마지막에 말했든 확실히 클리어
      //   (상대 메시지 후 내가 답장해 최신이 내 것이 돼도 박히지 않음). unread>0일 때만 써서 churn 없음.
      if ((conv?.unread?.[myUidRef.current] || 0) > 0) markConversationRead(convId);
      const ts = conv?.lastRead?.[friendUid];
      setOtherReadMs(ts?.toMillis ? ts.toMillis() : 0);
      // 내가 목록에서 지운 시각 — 이 이후 메시지만 내 화면에 표시(카톡식: 지우면 그 전 대화는 내게서 사라짐, 상대는 보존). 사용자 2026-06-14
      const cl = conv?.clearedAt?.[myUidRef.current];
      setMyClearedMs(cl?.toMillis ? cl.toMillis() : 0);
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

  // 익명(카카오 미연동) → 카카오 연동 게이트(DM도 소셜 액션) ([[anonymous-user-policy]])
  //   DM은 친구끼리만이라 익명은 사실상 도달 불가하지만, 능동 소셜 액션이라 방어적으로 게이트.
  const requireKakaoLink = (onProceed) => {
    setAlert({
      title: '카카오 연동이 필요해요',
      message: 'DM은 카카오 연동 후\n이용할 수 있어요.\n연동하면 바로 이어서 보낼게요.',
      buttons: [
        { text: '닫기', style: 'cancel' },
        { text: '카카오 연동하기', onPress: async () => {
            const r = await connectKakaoAccount();
            if (r?.banned) { setAlert({ title: '이용이 제한된 계정이에요', message: '이 카카오 계정은\nDear Golf 이용이 제한되었어요.', buttons: [{ text: '확인' }] }); return; }
            if (!r?.ok) { setAlert({ title: '카카오 연동 실패', message: '잠시 후 다시 시도해주세요.', buttons: [{ text: '확인' }] }); return; }
            onProceed?.();
          } },
      ],
    });
  };

  // 전송 — DMInputBar가 body를 넘겨줌. true/false 반환(false면 입력바가 입력 복구). 인용은 replyTo로.
  const handleSend = useCallback(async (body) => {
    if (auth.currentUser?.isAnonymous) { requireKakaoLink(() => handleSend(body)); return false; }
    const quote = replyTo;  // 전송 시점 인용 캡처 — 실패 시 함께 복구
    setReplyTo(null);
    stopTyping();  // 전송하면 입력 중 해제
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

  // 사진 보내기 — 갤러리에서 1장 선택 → 압축·업로드·전송(캡션 없음 v1). 익명은 카카오 연동 게이트.
  const handlePickImage = useCallback(async () => {
    if (auth.currentUser?.isAnonymous) { requireKakaoLink(() => handlePickImage()); return; }
    try {
      const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) await ImagePicker.requestMediaLibraryPermissionsAsync();
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, selectionLimit: 10, quality: 1, videoMaxDuration: 60 });
      if (res.canceled) return;
      const assets = res.assets || [];
      const imgUris = assets.filter(a => a?.uri && a.type !== 'video').map(a => a.uri);
      const vidUris = assets.filter(a => a?.uri && a.type === 'video').map(a => a.uri);
      // 사진 — 모아보내기(앨범). 낙관적 미리보기(즉시 그리드)→업로드 완료 시 실제 메시지로 대체. 최대 10장.
      if (imgUris.length) {
        const tempId = `pending_${Date.now()}_${Math.round(Math.random() * 1e6)}`;
        setPendingImgs(prev => [{ tempId, uris: imgUris }, ...prev]);
        sendImagesMessage(friendUid, imgUris)
          .catch(e => { if (__DEV__) console.warn('[DMChat] sendImages', e?.message); setAlert({ title: '사진을 보내지 못했어요', message: '지금은 이 대화에\n사진을 보낼 수 없어요.', buttons: [{ text: '확인' }] }); })
          .finally(() => setPendingImgs(prev => prev.filter(p => p.tempId !== tempId)));
      }
      // 동영상 — 각각 전송(용량 커서 업로드 느릴 수 있어 진행 표시). 포스터 자동 생성.
      vidUris.forEach((v) => {
        setVidSending(n => n + 1);
        sendVideoMessage(friendUid, v)
          .catch(e => { if (__DEV__) console.warn('[DMChat] sendVideo', e?.message); setAlert({ title: '동영상을 보내지 못했어요', message: '용량이 크거나(최대 80MB)\n네트워크 상태를 확인해주세요.', buttons: [{ text: '확인' }] }); })
          .finally(() => setVidSending(n => Math.max(0, n - 1)));
      });
    } catch (e) {
      if (__DEV__) console.warn('[DMChat] pickImage', e?.message);
    }
  }, [friendUid]);

  // 메시지 삭제(언센드) — 본인 메시지만. 확인 후 양쪽 화면에서 완전 삭제(실시간 구독이 양쪽 반영).
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

  // 나만 삭제(숨김) — 내 화면에서만 가림(상대 화면 유지). 로컬 영속. 내 메시지·상대 메시지 모두 가능.
  const hideMessage = () => {
    const t = reactTarget;
    setReactTarget(null);
    if (!t?.id) return;
    setHiddenMsgs(prev => {
      const next = new Set(prev); next.add(t.id);
      storage.save(HIDDEN_MSGS_KEY, [...next]).catch(() => {});
      return next;
    });
  };

  // 신고 — 상대(friendUid) 대상 ReportModal 열기. prefill=근거란 초기값(메시지 신고 시 그 메시지 인용 스냅샷 → 언센드돼도 증거 보존).
  const openReport = (prefill = '') => { setReactTarget(null); setOptionsOpen(false); if (!friendUid) return; setReportPrefill(prefill); };
  // 차단 — 친구 차단과 동일(공용 훅). 한도 체크 → 확인 → 차단되면 대화 불가라 대화방 닫기.
  const confirmBlock = () => {
    setOptionsOpen(false);
    if (!friendUid) return;
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

  // 카톡식 — '목록에서 지우기'(clearedAt) 이후 메시지만 내 화면에 표시. 그 전 대화는 숨김(메시지는 상대 위해 서버 보존, 내 화면만 필터). 사용자 2026-06-14
  const list = useMemo(() => {
    const all = messages || [];
    return all.filter(m => {
      if (hiddenMsgs.has(m.id)) return false;                 // 나만 삭제(숨김)
      if (!myClearedMs) return true;
      const ms = m.createdAt?.toMillis ? m.createdAt.toMillis() : 0;
      return ms > myClearedMs;
    });
  }, [messages, myClearedMs, hiddenMsgs]);
  // 인버티드 FlatList용 — 최신이 index 0(시각적 바닥). 새 메시지가 바닥에 자동으로 쌓여 끌어올릴 필요 없음 + 메시지 적어도 입력창 바로 위에 붙음(카톡식 아래고정).
  const rlist = useMemo(() => list.slice().reverse(), [list]);
  // ★입력 지연 방지 — renderItem을 useCallback으로 안정화. 안 하면 매 글자(setText) 리렌더마다 renderItem 참조가
  //   새로 생겨 FlatList가 보이는 말풍선을 전부 다시 그려 입력이 버벅임(안드 특히). list/읽음/상대정보 바뀔 때만 갱신.
  const renderItem = useCallback(({ item, index }) => {
    const mine = item.senderUid === myUid;
    // 동영상 메시지 — videoUrl(+poster). 사진보다 우선 판정.
    const video = item.videoUrl ? { uri: item.videoUrl, poster: item.poster || null } : null;
    // 사진 정규화 — imageUrls(앨범) 우선, 없으면 imageUrl(단일·일정공유 카드)을 1장 배열로. 둘 다 없으면 텍스트.
    const imgs = (Array.isArray(item.imageUrls) && item.imageUrls.length) ? item.imageUrls : (item.imageUrl ? [item.imageUrl] : []);
    const hasImg = imgs.length > 0;
    // 이모지만 보낸 메시지 — 버블 없이 크게(카톡·아이메시지식). 사진·답장이 있으면 일반 처리.
    const emojiN = (!hasImg && !item.replyTo) ? emojiOnlyCount(item.body) : 0;
    const bigEmoji = emojiN > 0;
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
          alignItems: 'flex-end', paddingHorizontal: 12,
          // 발신자 바뀌어 내 그룹이 시작될 때 위 간격↑(받은 메시지는 아바타 헤더가 간격 담당) — 상대↔나 번갈아 보낼 때 붙던 것 해소.
          //   사진·영상은 크게 보여 연속 시 서로 붙어 보이므로 간격↑(텍스트는 2 유지).
          marginTop: (mine && firstOfGroup) ? 12 : ((hasImg || video) ? 9 : 2), marginBottom: (hasImg || video) ? 4 : 2, gap: 6 }}>
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
            <TouchableOpacity activeOpacity={(hasImg || video || bigEmoji) ? 1 : 0.85} delayLongPress={300}
              onLongPress={() => setReactTarget(item)}
              style={(hasImg || video || bigEmoji)
                ? { backgroundColor: 'transparent', alignSelf: mine ? 'flex-end' : 'flex-start' } // 사진·영상·이모지전용은 버블 배경 없이 깔끔하게
                : { backgroundColor: mine ? DM_MINE_BG : DM_RECV_BG, paddingHorizontal: 16, paddingVertical: 12,
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
              {/* 동영상 — 포스터 썸네일+▶, 탭 시 전체화면 재생(PhotoViewer). */}
              {video && (
                <DmVideo uri={video.uri} poster={video.poster} size={210}
                  onPress={() => setImgViewer({ video })} onLongPress={() => setReactTarget(item)} />
              )}
              {/* 사진(앨범 그리드) — 칸 탭 시 전체화면(PhotoViewer, 해당 index부터 넘겨보기). */}
              {hasImg && (
                <DmImageGrid uris={imgs} full onPressIndex={(i) => setImgViewer({ uris: imgs, index: i })}
                  onLongPress={() => setReactTarget(item)} />
              )}
              {/* 모집 초대 카드 — 카드 아래 버튼. 친구지정(select)=내 참여 초대장 / 그 외=모집 상세로 이동(분기는 HomeScreen onOpenRoundup). */}
              {!!item.roundupId && onOpenRoundup && (
                <TouchableOpacity onPress={() => onOpenRoundup(item.roundupId, item.roundupHost || null, item.roundupScope || null)} activeOpacity={0.85}
                  style={{ marginTop: 7, alignSelf: mine ? 'flex-end' : 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6,
                    backgroundColor: C.navy, borderRadius: 11, paddingHorizontal: 15, paddingVertical: 10 }}>
                  <Text style={{ fontSize: fs(13) }}>{item.roundupScope === 'select' ? '✉️' : '📋'}</Text>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: '#fff' }}>{item.roundupScope === 'select' ? '초대 확인하기' : '모집 보러 가기'}</Text>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.butter }}>›</Text>
                </TouchableOpacity>
              )}
              {/* 이모지만 보낸 메시지 — 버블 없이 크게(개수 적을수록 큼). 일반 본문은 fs(17)·미디엄(가독성 [[avoid-small-text]]). */}
              {!!item.body && (bigEmoji ? (
                <Text allowFontScaling={false} style={{ fontSize: emojiFontSize(emojiN), lineHeight: emojiFontSize(emojiN) + 8,
                  alignSelf: mine ? 'flex-end' : 'flex-start' }}>{item.body}</Text>
              ) : (
                <LinkText style={{ fontFamily: F.sysM, fontSize: fs(17), lineHeight: 25, color: mine ? DM_MINE_TX : DM_RECV_TX,
                  marginTop: item.imageUrl ? 6 : 0, marginHorizontal: item.imageUrl ? 6 : 0 }}
                  linkColor={mine ? '#13518F' : '#0E4C94'}>{item.body}</LinkText>
              ))}
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
        ListHeaderComponent={(pendingImgs.length || vidSending > 0 || friendTyping) ? (
          <View>
            {/* 낙관적 미리보기 — 업로드 중인 내 사진을 즉시 표시(흐림+스피너). 인버티드 헤더=시각적 바닥(최신 위치). */}
            {pendingImgs.map(p => (
              <View key={p.tempId} style={{ paddingHorizontal: 14, marginBottom: 8, alignItems: 'flex-end' }}>
                <View>
                  <View style={{ opacity: 0.55 }}><DmImageGrid uris={p.uris} /></View>
                  <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator color="#fff" />
                  </View>
                </View>
              </View>
            ))}
            {/* 동영상 업로드 중 — 용량 커서 시간 걸려 진행 표시(포스터 미리보기 없이 한 줄) */}
            {vidSending > 0 && (
              <View style={{ paddingHorizontal: 14, marginBottom: 8, alignItems: 'flex-end' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: DM_MINE_BG, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11 }}>
                  <ActivityIndicator color={DM_MINE_TX} size="small" />
                  <Text style={{ fontFamily: F.sysM, fontSize: fs(13), color: DM_MINE_TX }}>동영상 보내는 중…</Text>
                </View>
              </View>
            )}
            {friendTyping ? <TypingDots /> : null}
          </View>
        ) : null}
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
        ) : (
          // 로딩 중(messages === null) — 빈 화면 대신 스피너+안내(느릴 때 멈춘 듯 보이던 것 방지)
          <View style={{ alignItems: 'center', paddingVertical: 44 }}>
            <ActivityIndicator color={DM_PALESKY} />
            <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: DM_PALESKY, marginTop: 10 }}>대화를 불러오는 중…</Text>
          </View>
        )}
      />
      </View>
      {/* 입력 바 — 분리된 컴포넌트(자체 text 상태)라 타이핑이 위 리스트를 리렌더 안 함(입력 지연 방지) */}
      <DMInputBar
        ref={inputRef}
        onSend={handleSend}
        onPickImage={handlePickImage}
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
            {/* 숨기기(나만 삭제) — 내 화면에서만 가림(상대엔 유지). 내·상대 메시지 모두 가능. */}
            <TouchableOpacity activeOpacity={0.8} onPress={hideMessage}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: DM_FIELD,
                borderRadius: 22, paddingHorizontal: 22, paddingVertical: 11, borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.08)' }}>
              <Text style={{ fontSize: fs(15) }}>🙈</Text>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: DM_MINE_TX }}>숨기기</Text>
            </TouchableOpacity>
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
      {/* DM 사진 전체화면 — 말풍선 이미지 탭. 자체 Modal(onRequestClose)이라 뒤로가기는 뷰어만 닫음 */}
      {imgViewer && (
        <PhotoViewer
          photos={imgViewer.video
            ? [{ uri: imgViewer.video.uri, type: 'video', poster: imgViewer.video.poster }]
            : (imgViewer.uris || []).map(u => ({ uri: u }))}
          startIndex={imgViewer.index || 0} onClose={() => setImgViewer(null)} allowSave={!imgViewer.video} />
      )}
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
