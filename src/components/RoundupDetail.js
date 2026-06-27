import React, { useState, useEffect, useRef } from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity, Platform, Keyboard, useWindowDimensions } from 'react-native';

const _and = Platform.OS === 'android';
import { SafeAreaView, SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { groupColor, groupName, friendDisplayName } from '../utils/friendGroups';
import { SCOPE_BADGE, FILTER_BADGE, tagStyle, COMPANION_LABEL, AGEGROUP_LABEL, SKILL_LABEL, pickNames, isRoundupConfirmed, ROUNDUP_PUBLIC_ENABLED, ROUNDUP_LIKES_ENABLED } from '../constants/roundup';
import { ProfileActionSheet } from './common/ProfileActionSheet';
import { OverlayAlert } from './common/OverlayAlert';
import { UserContext } from '../contexts/UserContext';
import { getTrustGrade } from '../constants/trustGrade';
import { TrustBadge, TrustGradeModal } from './common/TrustBadge';
import { MannerBadge, MannerGradeModal } from './common/MannerBadge';
import { getCancelWarningByHours, isD7Inside } from '../constants/mannerGrade';
import { RoundupComments } from './RoundupComments';
import { anonNick } from '../utils/anonNick';
import { shareRoundup } from '../utils/invite';
import { ShareMomentModal } from './ShareMomentModal';
import { RoundupTeamScreen } from './RoundupTeamScreen';
import { isTeamPlanFilled } from '../utils/roundup';
import { AttentionMotion } from './common/AttentionMotion';   // 편성완료 미열람 맥동
import { storage, STORAGE_KEYS } from '../utils/storage';     // 단체팀 열람 시각(맥동 판단)
import { loadMyFriendsEnriched, loadSentRequests, sendFriendRequest } from '../utils/friends';
import { showToast } from './AppToast';

// 참여자 아바타 색상
const AV = [
  { bg: '#C8D9E6', fg: '#1A3D52' },
  { bg: '#F5E6A8', fg: '#5A4500' },
  { bg: '#6B8B5E', fg: '#fff' },
  { bg: '#D9B8B8', fg: '#5C1E1E' },
];

const sectionLabel = { fontFamily: F.sysSb, fontSize: fs(11), color: C.warmGray, letterSpacing: 1.5,
  marginHorizontal: 16, marginTop: _and ? 12 : 16, marginBottom: _and ? 4 : 6 };
const hintStyle = { fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: _and ? 4 : 6, lineHeight: _and ? 14 : 15 };

function Badge({ bg, fg, text }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ fontFamily: F.sysB, fontSize: fs(10), color: fg }}>{text}</Text>
    </View>
  );
}

// 참여자 / 빈 슬롯 한 줄. onPress 시 신고/차단 시트.
function SlotRow({ slot, idx, onPress, handicap }) {
  if (slot.open) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: _and ? 4 : 6 }}>
        <View style={{ width: _and ? 32 : 36, height: _and ? 32 : 36, borderRadius: _and ? 16 : 18, borderWidth: 1.5, borderColor: C.warmGrayLight,
          borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: fs(_and ? 13 : 14), color: C.warmGray }}>+</Text>
        </View>
        <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray }}>모집 중인 자리</Text>
      </View>
    );
  }
  const pal = AV[idx % AV.length];
  // 행 전체를 탭 영역으로 — 이름 텍스트만 탭 가능하던 때는 타깃이 작고 ScrollView가 첫 탭을 먹어 '여러 번 눌러야' 열렸다(2026-06-26).
  const Row = onPress ? TouchableOpacity : View;
  return (
    <Row {...(onPress ? { activeOpacity: 0.6, onPress } : {})}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: _and ? 7 : 9 }}>
      <View style={{ width: _and ? 32 : 36, height: _and ? 32 : 36, borderRadius: _and ? 16 : 18, backgroundColor: pal.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(_and ? 13 : 14), color: pal.fg }}>{(slot.name || '?').charAt(0)}</Text>
      </View>
      {/* 이름 영역 — flex:1 + 말줄임. 별명·닉네임이 길어도 행이 깨지지 않게 ([[friend_groups]] 2026-06-09) */}
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal }}>{slot.name}</Text>
        {handicap != null && (
          /* 이름과 gap:8로 이미 분리 — 구분점(·) 대신 '핸디' 라벨로(주최자 표시와 의미 통일). 작고 흐리게 유지 */
          <Text style={{ fontFamily: F.sysM, fontSize: fs(10), color: C.warmGray }}>핸디 {handicap}</Text>
        )}
        {slot.host && (
          <View style={{ backgroundColor: C.navy, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(10), color: C.butter }}>주최자</Text>
          </View>
        )}
        {slot.anonSelf && (
          // 본인이 익명 참여 중 — 다른 사람에겐 랜덤닉으로 보인다는 인지 뱃지 ([[roundup-anonymous-participation]])
          //   회색 채움+흰 글씨로 또렷이(이름과 구분). 주최자(네이비)와 색 구분.
          <View style={{ backgroundColor: C.warmGray, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(10), color: '#fff' }}>익명 참여</Text>
          </View>
        )}
      </View>
      {/* 탭 가능한 행이면 ›로 '누를 수 있음' 암시(친구신청·차단 시트). 비탭(본인·익명)은 '참여 완료'만 */}
      <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: '#3C7D4F' }}>참여 완료{onPress ? '  ›' : ''}</Text>
    </Row>
  );
}

// 대기자 한 줄. anon=주최자 시야에서 '익명으로 신청한 대기자'임을 표식(실명은 그대로 노출) ([[roundup-anonymous-participation]])
function WaitRow({ num, name, me, anon }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: _and ? 4 : 6 }}>
      <View style={{ minWidth: 44, alignItems: 'center', backgroundColor: '#F0E8D8', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3 }}>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(11), color: '#8B6914' }}>대기 {num}번</Text>
      </View>
      <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: me ? F.sysB : F.sysSb, fontSize: fs(13), color: C.charcoal }}>{name}</Text>
      {anon && (
        // 회색 채움+흰 글씨 — 참여자 현황의 '익명 참여' 뱃지와 색·의미 통일
        <View style={{ backgroundColor: C.warmGray, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(10), color: '#fff' }}>익명</Text>
        </View>
      )}
      <Text style={{ marginLeft: 'auto', fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>대기 중</Text>
    </View>
  );
}

// 슬롯 배열 생성 — 개별·단체 모두 평면 리스트(participantUids 기준).
//  ★단체도 팀으로 쪼개지 않고 전원(teams*4명)을 쭉 나열한다 — uid↔팀 매핑이 없어 팀별로 나누면
//   선착순 카운트가 '조편성'처럼 오해됨(카톡 오픈챗도 평면 나열). 조편성은 댓글로 ([[roundup-comments-policy]]).
// nameMap: { uid: nickname } — 실제 참여자 이름. participantUids 우선, 옛 더미 호환 위해 pickNames fallback.
function buildSlots(post, nameMap = {}, myUid = null, myName = null, friendMeta = {}) {
  const hostName = post.authorName || post.author || '주최자';
  const cap = post.capacity || 4;            // 단체=teams*4, 개별=members+1
  const filled = post.joined || 0;
  const uids = Array.isArray(post.participantUids) ? post.participantUids : [];
  // participantUids가 있으면 실제 참여자 기준, 없으면(옛 더미) pickNames fallback
  if (uids.length > 0) {
    return Array.from({ length: cap }, (_, i) => {
      if (i >= filled) return { open: true };
      const uid = uids[i];
      const host = uid ? uid === post.authorUid : i === 0;
      const isSelf = !!uid && uid === myUid;
      // 익명 참여 — 호스트(주최자)는 항상 실명, 그 외(본인 포함)는 랜덤닉으로 마스킹 ([[roundup-anonymous-participation]])
      const viewerIsHost = !!myUid && post.authorUid === myUid;
      const anon = !host && Array.isArray(post.anonymousUids) && post.anonymousUids.includes(uid);
      const masked = anon && !viewerIsHost;
      let base;
      if (host) {
        // 주최자도 내가 정한 별명 우선(owner-only) — 카드 타이틀과 일치. 본인·폴백은 닉네임 ([[friend_groups]])
        base = isSelf ? hostName : friendDisplayName(friendMeta, uid, hostName);
      } else if (masked) {
        base = anonNick(uid, post.id);            // 랜덤닉(저장X·결정적) — 일반 닉처럼 묻힘
      } else {
        const fallback = nameMap[uid] || (isSelf ? (myName || '동반자') : '동반자');
        base = (uid && !isSelf) ? friendDisplayName(friendMeta, uid, fallback) : fallback;   // 내 별명 우선(owner-only) — 익명·본인 제외 ([[friend_groups]])
      }
      const name = isSelf ? `${base}(나)` : base;   // 참여자 현황에서만 본인 표시
      return { name, host, uid, masked, anonSelf: masked && isSelf };   // masked: 신원 노출(프로필시트·핸디) 차단 / anonSelf: 본인 익명 뱃지
    });
  }
  const names = pickNames(post.id, filled);
  return Array.from({ length: cap }, (_, i) =>
    i < filled ? { name: i === 0 ? hostName : names[i], host: i === 0 } : { open: true });
}

// 라운딩 모집 상세 화면
export function RoundupDetail({ post, myUid, friendGroups, friendMeta = {}, participantNames = {}, participantHandicaps = {}, visible, joined, applied, waitlistNum, isBookmarked, comments = [], onClose, onApply, onWaitlist, onCancel, onCancelWait, onDelete, onConfirm, onGradePress, onToggleBookmark, onToggleLike, onBlock, onReport, onEdit, onAddComment, onDeleteComment, onPinComment, onNotifySchedule, commentTotal = 0, onLoadOlderComments }) {
  const { userProfile } = React.useContext(UserContext);
  const [alert, setAlert] = useState(null);
  const [actionTarget, setActionTarget] = useState(null); // 프로필 클릭 — 친구신청/차단 시트
  const [friendSet, setFriendSet] = useState(() => new Set());  // 내 친구 uid — 시트 '친구 신청' 게이트
  const [sentSet, setSentSet] = useState(() => new Set());      // 내가 보낸 친구신청 recipient uid — '신청됨'

  // 친구 상태 로드 — 라운지 참여자는 주최자 친구일 뿐 내 친구는 아닐 수 있어 '친구 신청' 제공.
  //   이미 친구/신청됨을 구분하려 상세 열릴 때 1회 로드(친구목록·보낸신청). friendMeta는 별명·그룹뿐이라 부정확 → 실목록 사용.
  useEffect(() => {
    if (!visible || !myUid) return;
    let alive = true;
    loadMyFriendsEnriched().then((l) => { if (alive) setFriendSet(new Set((l || []).map((f) => f.id))); }).catch(() => {});
    loadSentRequests().then((r) => { if (alive) setSentSet(new Set((r || []).map((x) => x.recipientUid))); }).catch(() => {});
    return () => { alive = false; };
  }, [visible, myUid]);

  // 친구 신청 — 낙관적 '신청됨' 후 전송(이미 친구/신청됨이면 무해). 익명·본인 슬롯은 애초에 시트가 안 열림.
  const requestFriend = (t) => {
    if (!t?.uid || friendSet.has(t.uid) || sentSet.has(t.uid)) return;
    setSentSet((p) => new Set(p).add(t.uid));
    sendFriendRequest(t.uid, userProfile?.nickname || '').catch((e) => { if (__DEV__) console.warn('[roundup] friendReq', e?.code, e?.message); });
    showToast(`${t.name}님에게 친구 신청을 보냈어요`);
  };
  const targetFriendState = !actionTarget?.uid ? 'none'
    : friendSet.has(actionTarget.uid) ? 'friend' : (sentSet.has(actionTarget.uid) ? 'sent' : 'none');
  // z-index 이슈로 부모(RoundupTab)의 모달이 이 Modal 뒤로 가려져서, 등급/차단 확인 모달은 여기서 자체 렌더링.
  const [gradeKey, setGradeKey] = useState(null);          // 트러스트 등급 안내 모달
  const [mannerKey, setMannerKey] = useState(null);        // 매너 등급 안내 모달

  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const scrollRef = useRef(null);
  const scrollY = useRef(0);
  const commentInputNode = useRef(null);
  const kbHeightRef = useRef(0);
  const [kbHeight, setKbHeight] = useState(0);
  const [shareCardOpen, setShareCardOpen] = useState(false); // 모집 공유 — 이미지/링크 선택 모달(ShareMomentModal)
  const [teamOpen, setTeamOpen] = useState(false);           // 단체팀 화면(조 편성·티오프) — 내부 중첩 Modal([[ios-modal-stacking]])
  const [teamSeenMs, setTeamSeenMs] = useState(0);           // 이 모집 단체팀 마지막 열람 시각(로컬) — 편성완료 미열람 맥동 판단
  // 단체팀 열람 시각 로드 — 모집 바뀔 때
  useEffect(() => {
    if (!visible || !post?.id) return;
    let alive = true;
    storage.load(STORAGE_KEYS.teamSeenAt, {}).then((m) => { if (alive) setTeamSeenMs((m && m[post.id]) || 0); }).catch(() => {});
    return () => { alive = false; };
  }, [visible, post?.id]);
  // 단체팀 열기 — 열람 시각 기록(맥동 정지) 후 화면 오픈
  const openTeam = React.useCallback(() => {
    const id = post?.id;
    setTeamOpen(true);
    if (!id) return;
    const now = Date.now();
    setTeamSeenMs(now);
    storage.load(STORAGE_KEYS.teamSeenAt, {}).then((m) => storage.save(STORAGE_KEYS.teamSeenAt, { ...(m || {}), [id]: now })).catch(() => {});
  }, [post?.id]);
  // 안드(엣지투엣지): 키보드가 창을 리사이즈하지 않고 콘텐츠 위로 떠서 댓글 입력칸이 가려짐.
  // 포커스된 입력칸을 키보드 위로 직접 스크롤. (iOS는 automaticallyAdjustKeyboardInsets가 처리)
  const scrollCommentIntoView = () => {
    if (Platform.OS !== 'android') return;
    setTimeout(() => {
      const node = commentInputNode.current;
      const scroll = scrollRef.current;
      const kb = kbHeightRef.current;
      if (!node?.measureInWindow || !scroll || !kb) return;
      node.measureInWindow((x, y, w, h) => {
        const kbTop = winH - kb - insets.bottom;     // 키보드 상단 Y (내비바 보정)
        const overlap = (y + h + 48) - kbTop;        // 입력칸 하단이 키보드를 침범한 양 (+여유 48)
        if (overlap > 0) scroll.scrollTo({ y: scrollY.current + overlap, animated: true });
      });
    }, 160);
  };
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', e => {
      kbHeightRef.current = e.endCoordinates?.height || 0;
      setKbHeight(kbHeightRef.current);
      scrollCommentIntoView();
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => { kbHeightRef.current = 0; setKbHeight(0); });
    return () => { show.remove(); hide.remove(); };
  }, []);

  // 안드로이드 뒤로가기 — RN Modal에선 onRequestClose가 유일하게 신뢰되는 back 핸들러다.
  // (Modal 안에서 BackHandler 리스너는 onRequestClose보다 안 먹는 RN 고질 이슈 → 훅 제거)
  // 내부 RN Modal(등급·매너·액션시트)은 각자 onRequestClose로 닫히고,
  // 자체 오버레이(OverlayAlert)만 부모 Modal의 onRequestClose에서 우선 닫는다.
  const handleRequestClose = () => {
    if (alert) { setAlert(null); return; }      // 확인창 떠 있으면 그것만 취소로 닫기 (상세는 유지)
    onClose();
  };

  if (!post) return null;

  const isTeam = post.teams > 1;
  const isMine = !!myUid && post.authorUid === myUid;
  // 핸디 조회 — 내 핸디는 userProfile, 남은 participantHandicaps(users 문서). 라운지에선 작고 흐리게.
  const hcOf = (uid) => {
    if (!uid) return null;
    const v = (uid === myUid) ? userProfile?.handicap : participantHandicaps[uid];
    return (typeof v === 'number') ? v : null;
  };
  const sb = SCOPE_BADGE[post.scope] || SCOPE_BADGE.all;
  const authorGrade = getTrustGrade(post.authorHostedCount, post.authorMannerScore);
  // 옛 더미 데이터에 companions가 남아있을 수 있음(2026-05-26 폐기 전 데이터). 호환 위해 합산.
  const companionsCount = isTeam ? 0 : (post.companions?.length || 0);
  // 정원 만석 판정 — 단체·개별 모두 joined 기반으로 통일(카드와 동일). teamJoined는 joinRoundup이
  //   갱신하지 않아(joined만 +1) 단체 모집이 만석에 못 닿고 확정 버튼이 안 뜨던 버그가 있었다 ([[roundup-team-flat-roster]]).
  const capTotal = post.capacity || (isTeam ? post.teams * 4 : 4);
  const allFull = (post.joined || 0) + companionsCount >= capTotal;
  // 만석(allFull) 또는 주최자 확정(closed)이면 마감 — 비참여자에겐 대기신청 동선.
  //  취소로 결원이 나면 closed는 유지되고 joined만 -1 → 아래 vacancy로 참여 버튼 복귀(빈자리 충원).
  const isClosed = post.closed || allFull;
  const slots = buildSlots(post, participantNames, myUid, userProfile?.nickname, friendMeta);
  // 대기자 수 — 실제 대기열(waitlistUids) 기준. 옛 waitlistCount 필드는 아무도 갱신하지 않아 항상 0이었다.
  const waitlistTotal = Array.isArray(post.waitlistUids) ? post.waitlistUids.length : (post.waitlistCount || 0);
  // 본인 외 다른 대기자 — 개별 명단/이름으로 노출하지 않고 요약 한 줄로만 표시(가짜 이름·타인 신원 노출 방지).
  const othersWaiting = Math.max(0, waitlistTotal - (waitlistNum ? 1 : 0));
  // 내가 익명으로 대기 중 — 내 행도 랜덤닉으로 보여 본인조차 자기인지 모르니 '(나)'+'익명' 표식으로 식별 ([[roundup-anonymous-participation]])
  const iAmAnonWaiting = !!myUid && !!waitlistNum && Array.isArray(post.anonymousUids) && post.anonymousUids.includes(myUid);
  // 확정 후 빈자리 충원 — 만석 확정 모집에 결원(정원 미만)이고 대기자가 없으면 빈자리 신규 참여 허용(closed 유지, 개별·단체 공통).
  //   대기자가 있으면 자동 승격이 그 자리를 채우므로 비참여자는 대기 신청만(우선권 보호). ([[roundup-waitlist-autopromote]])
  //   ★미달 마감(closedShort)은 제외 — 주최자가 일부러 적게 확정해 잠근 모집이라 빈자리 추가 모집 안 함.
  const vacancy = post.closed && !post.closedShort && (post.joined || 0) < capTotal && waitlistTotal === 0;
  // 상태 배지 분리 — 만석이어도 주최자 확정(closed) 전엔 '확정 대기'(미확정). '확정'은 closed일 때만(테스터 혼란 해소).
  const awaitingConfirm = !post.closed && allFull && post.type !== 'open'; // 확정형 만석인데 미확정
  const vacancySeats = Math.max(0, capTotal - (post.joined || 0));

  // 전체공개는 신청(수락 대기), 친구공개·친구지정은 즉시 참여
  const confirmApply = () => {
    const instant = post.scope !== 'all';
    // 결과를 받아 실패 시 자체 OverlayAlert로 표시 — 부모(RoundupTab) alert는
    // 이 Detail Modal 뒤로 가려져 '상세를 닫아야 보이는' 문제가 있었음.
    const doJoin = async (anonymous) => {
      const r = await onApply?.(anonymous);
      if (r && r.ok === false) {
        setAlert({
          title: '참여 처리에 실패했어요',
          message: __DEV__ && r.message ? r.message : '잠시 후 다시 시도해 주세요.',
          buttons: [{ text: '확인' }],
        });
      }
    };
    setAlert({
      title: instant ? '이 라운딩에 참여할까요?' : '이 라운딩에 참여 신청할까요?',
      message: instant
        ? '친구 대상 모집이라 바로 참여가 확정돼요.'
        : '주최자에게 신청이 전달되고, 주최자가 수락하면 참여가 확정돼요.',
      // 익명 참여 — 명단·댓글에 닉네임 대신 임의 닉으로(호스트에겐 이름 보임). 친구공개·친구지정만 ([[roundup-anonymous-participation]])
      note: instant ? '익명으로 참여하면\n명단·댓글에 임의 닉으로 표시돼요.\n호스트에게는 이름이 보이고\n라운딩 당일엔 자연스럽게 만나요.' : undefined,
      buttons: instant ? [
        { text: '참여하기', onPress: () => doJoin(false) },
        { text: '익명으로 참여', style: 'secondary', onPress: () => doJoin(true) },
        { text: '취소', style: 'cancel' },
      ] : [
        { text: '취소', style: 'cancel' },
        { text: '참여 신청', onPress: () => doJoin(false) },
      ],
    });
  };

  // 대기 신청 — 참여(confirmApply)와 동일하게 '자체' OverlayAlert로(부모 alert는 이 Detail Modal 뒤로 가려짐).
  //   익명 선택을 onWaitlist(anonymous)로 부모에 전달. 친구공개·친구지정만 익명 가능 ([[roundup-anonymous-participation]])
  const confirmWaitlist = () => {
    const canAnon = post.scope !== 'all';
    setAlert({
      title: '대기 신청할까요?',
      message: '자리가 나면 대기 순서대로 자동 참여돼요.',
      note: canAnon ? '익명으로 신청하면\n명단·댓글에 임의 닉으로 표시돼요.\n호스트에게는 이름이 보이고\n승격되면 그대로 이어져요.' : undefined,
      buttons: canAnon ? [
        { text: '대기 신청', onPress: () => onWaitlist?.(false) },
        { text: '익명으로 대기', style: 'secondary', onPress: () => onWaitlist?.(true) },
        { text: '취소', style: 'cancel' },
      ] : [
        { text: '취소', style: 'cancel' },
        { text: '대기 신청', onPress: () => onWaitlist?.(false) },
      ],
    });
  };
  // 참여 취소 — D-7 단일선 ([[roundup-penalty-policy]] §1).
  // D-7 이전: 자유 취소, 패널티 X. D-7 이내: 취소 가능(법적 권리 보장), 매너 -5 자동 차감.
  // 시스템 차단은 약관규제법 제9조 위험으로 폐기됨. 노쇼는 별도 신고 시스템 ([[noshow-report-system]]).
  const confirmCancel = () => {
    let hoursUntil = 24 * 30; // 오픈형 기본: 한 달치 — D-7 이전 취급
    if (post.date) {
      const [y, m, d] = post.date.split('.').map(Number);
      const [hh, mm] = (post.time || '07:00').split(':').map(Number);
      const target = new Date(y, m - 1, d, hh, mm);
      const now = new Date();
      hoursUntil = (target - now) / 3600000;
    }
    // 안내 3분기 (2026-05-30) — D-7은 매너 -5 분기일 뿐이라 사용자에겐 강하게 느껴짐.
    // 상황별로 톤을 나눔. 매너 차감은 전체공개+D-7이내+확정만 (친구모집은 시스템 제재 예외).
    const insideD7 = isD7Inside(hoursUntil);
    // (1) 전체공개 + D-7 이내 + 모집확정 — 매너 점수 차감 분기 (패널티 있는 유일 케이스)
    if (post.scope === 'all' && insideD7 && isRoundupConfirmed(post)) {
      setAlert({
        title: '확정된 라운딩 취소',
        message: '확정된 라운딩이라 지금 취소하면\n매너 점수가 차감될 수 있어요.\n\n사전 안내 없이 나타나지 않으면\n노쇼로 신고받을 수 있으니\n부득이한 사정이라면 댓글로 양해를 구해주세요.',
        buttons: [
          { text: '계속 참여', style: 'cancel' },
          { text: '취소하기', style: 'destructive', onPress: onCancel },
        ],
      });
      return;
    }
    // (2) D-7 이내 + 미확정(또는 친구모집) — 패널티 없음, 임박 안내만
    if (insideD7) {
      setAlert({
        title: '라운딩이 며칠 안 남았어요',
        message: '라운딩 날짜가 가까워요.\n정말 취소하시겠어요?\n취소하면 자리는 다시 열려요.',
        buttons: [
          { text: '계속 참여', style: 'cancel' },
          { text: '취소하기', style: 'destructive', onPress: onCancel },
        ],
      });
      return;
    }
    // (3) D-7 이전 — 자유 취소, 약속 존중 톤
    setAlert({
      title: '참여를 취소할까요?',
      message: '참여 확정된 라운딩이에요.\n신중하게 생각하고 취소해 주세요.\n취소하면 자리는 다시 열려요.',
      buttons: [
        { text: '계속 참여', style: 'cancel' },
        { text: '참여 취소', style: 'destructive', onPress: onCancel },
      ],
    });
  };
  // 모집 확정 — 만석 상태에서 주최자가 명시적으로 closed:true. 매너 -5 분기점 ([[roundup-penalty-policy]] §1)
  // ★확정 후엔 수정 불가(삭제 후 재모집뿐)이라, 잠길 코스·날짜·시간을 눈으로 확인시키고 오타·시간 오기재를
  //   지금 고치도록 강하게 안내. 단체는 삭제 시 동반자 전원에게 취소 알림이 가 부담이 더 큼.
  const confirmFinalize = () => {
    const others = (Array.isArray(post.participantUids) ? post.participantUids : [])
      .filter(u => u && u !== myUid).length;
    const dateLine = `${post.date}${post.day ? ` (${post.day})` : ''} · ${post.time}`;
    setAlert({
      title: '이대로 확정할까요?',
      message:
        '확정하면 코스·날짜·시간을\n더는 수정할 수 없어요.\n아래 내용이 맞는지 확인해 주세요.',
      highlight: [
        { icon: '📍', text: post.course },
        { icon: '🗓️', text: dateLine },
      ],
      note:
        '잘못 적었다면 지금 닫고\n‘모집글 수정’에서 고쳐주세요.\n\n' +
        (others > 0
          ? `확정 뒤 바꾸려면 모집을 삭제하고\n다시 만들어야 해서, 동반자 ${others}명에게\n취소 알림이 가요.`
          : '확정 뒤 바꾸려면 모집을 삭제하고\n다시 만들어야 해요.'),
      buttons: [
        { text: '다시 확인', style: 'cancel' },
        { text: '확정', onPress: onConfirm },
      ],
    });
  };
  // 확정 후 결원으로 빈자리가 열렸을 때 — 원치 않는 입장 차단: 현재 인원으로 잠금.
  //   onConfirm(=closeRoundup) 재호출 시 joined<cap이라 closedShort=true로 설정돼 빈자리(vacancy)가 닫힌다.
  //   기존 메커니즘 재사용 — 데이터·규칙·신규 함수 0(부작용 없음: handleConfirmRoundup은 closeRoundup+낙관갱신뿐).
  const lockSeats = () => {
    setAlert({
      title: '이 인원으로 마감할까요?',
      message: '빈자리를 닫고 지금 인원으로 마감해요.\n더 이상 새 참여를 받지 않아요.',
      buttons: [
        { text: '취소', style: 'cancel' },
        { text: '이대로 마감', onPress: onConfirm },
      ],
    });
  };
  // 인원 미달 마감 — 단체는 정원(팀*4)을 온라인으로 다 못 채울 수 있어, 남은 자리를 직접(오프라인) 채우기로 하고
  //   주최자가 이대로 확정. confirmFinalize와 동일하게 onConfirm(closed:true). 확정 뒤에도 빈자리 충원(vacancy)은
  //   열려 있어 온라인으로 더 받을 수도 있다 ([[roundup-underfilled-finalize]]).
  const confirmFinalizeUnderfilled = () => {
    const filled = (post.joined || 0) + companionsCount;
    const remaining = Math.max(0, capTotal - filled);
    const dateLine = `${post.date}${post.day ? ` (${post.day})` : ''} · ${post.time}`;
    setAlert({
      title: '인원이 다 안 찼어요',
      message: `아직 ${remaining}자리 비었어요.\n남은 자리는 직접 채우기로 하고\n이대로 확정(마감)할까요?`,
      highlight: [
        { icon: '📍', text: post.course },
        { icon: '🗓️', text: dateLine },
      ],
      note: '확정하면 코스·날짜·시간을 더는 수정할 수 없어요.\n이 인원으로 마감(잠금)돼 빈자리는 더 받지 않아요.\n남은 자리는 직접 채워주세요.',
      buttons: [
        { text: '다시 확인', style: 'cancel' },
        { text: '이대로 마감', onPress: onConfirm },
      ],
    });
  };
  // 신청 취소 — 아직 미확정(수락 대기)이라 자유 취소, 매너/패널티 영향 없음
  const confirmCancelApplication = () => setAlert({
    title: '신청을 취소할까요?',
    message: '주최자에게 보낸 참여 신청이 취소돼요.\n필요하면 다시 신청할 수 있어요.',
    buttons: [
      { text: '닫기', style: 'cancel' },
      { text: '신청 취소', style: 'destructive', onPress: onCancel },
    ],
  });
  // 대기 취소 — 대기는 확정 참여가 아니라 매너 점수 차감 없음
  const confirmCancelWait = () => setAlert({
    title: '대기를 취소할까요?',
    message: '대기 신청이 취소돼요. 필요하면 다시 대기 신청할 수 있어요.',
    buttons: [
      { text: '닫기', style: 'cancel' },
      { text: '대기 취소', style: 'destructive', onPress: onCancelWait },
    ],
  });
  // 동반자에게 일정 알리기 — 주최자 전용. 확정 동반자 전원에게 인앱 알림(+배포 시 푸시) 발송.
  // 카카오 단톡방은 자동 생성/초대 API가 없어 폐기, 소통은 댓글로 일원화 ([[project_roundup_kakao_chat]]).
  const handleNotifySchedule = async () => {
    const sent = await onNotifySchedule?.(post);  // 부모(RoundupTab)가 Firestore에 fan-out, 보낸 인원 수 반환
    if (sent > 0) {
      setAlert({
        title: '일정을 알렸어요',
        message: `동반자 ${sent}명에게\n라운딩 일정을 알림으로 보냈어요.`,
        buttons: [{ text: '확인' }],
      });
    } else {
      setAlert({
        title: '알림을 보내지 못했어요',
        message: '잠시 후 다시 시도해 주세요.',
        buttons: [{ text: '확인' }],
      });
    }
  };
  // 주최자 모집 취소 — 시점(D-7 이전/이내) × 모집 종류(전체공개/친구공개) × 확정자 유무로 안내 분기
  // 정책 근거: [[roundup-penalty-policy]] D-7 / [[manner-evaluation-policy]] §1-0·§1-A / [[trust-grade-system]] §2-0
  const confirmDelete = () => {
    let hoursUntil = 24 * 30; // 오픈형 기본: D-7 이전 취급
    if (post.date) {
      const [y, m, d] = post.date.split('.').map(Number);
      const [hh, mm] = (post.time || '07:00').split(':').map(Number);
      const target = new Date(y, m - 1, d, hh, mm);
      hoursUntil = (target - new Date()) / 3600000;
    }
    const insideD7 = isD7Inside(hoursUntil);
    const isFriendsScope = post.scope !== 'all'; // 친구공개·친구지정
    // post.joined는 주최자 포함 총 확정자 수 (모집 시작 시 1, 신규 참여마다 +1)
    // 주최자 외 확정자가 있는지 = joined > 1
    const hasOthers = (post.joined || 0) > 1;

    let message;
    if (!insideD7) {
      // D-7 이전 — 자유 취소
      message = hasOthers
        ? 'D-7 이전이라 자유롭게 취소할 수 있어요.\n참여자·대기자에게 더 이상 보이지 않아요.'
        : 'D-7 이전이라 자유롭게 취소할 수 있어요.';
    } else if (!hasOthers) {
      // D-7 이내 + 나홀로 (확정 참여자 0) — 알림·매너평가 발동 X. "7일 이내" 강조 불필요
      message = '아직 확정 참여자가 없어요.\n자유롭게 취소할 수 있어요.';
    } else if (isFriendsScope) {
      // D-7 이내 + 친구공개·친구지정 + 확정자 있음
      // 매너평가 X ([[manner-evaluation-policy]] §1-0) · 신뢰등급 카운트 X ([[trust-grade-system]] §2-0)
      // 친구 관계라 시스템 안내보단 사람 간 양해 톤
      message = '친구들에게 즉시 알림이 가요.\n부득이한 사유면 댓글로 양해를 구해주세요.';
    } else {
      // D-7 이내 + 전체공개 + 확정자 있음 — 매너평가 48h 윈도우 발동 + 신뢰등급 카운트 X
      message = '참여자에게 즉시 알림이 가고\n48시간 안에 매너 평가를 받을 수 있어요.\n\n부득이한 사유면 진행하세요.\n취소된 라운딩은 신뢰등급에 반영되지 않아요.';
    }

    // 소프트 취소(보상 매너평가 발동) vs 하드 삭제 구분.
    // D-7 이내 + 전체공개 + 주최자 외 확정자 있음 → 소프트 취소(문서 보존, functions (C)가 윈도우 발동).
    // 그 외(D-7 이전·나홀로·친구공개)는 기존 하드 삭제.
    const useSoftCancel = insideD7 && !isFriendsScope && hasOthers;
    setAlert({
      title: '모집을 취소할까요?',
      message,
      buttons: [
        { text: '닫기', style: 'cancel' },
        { text: '모집 취소', style: 'destructive', onPress: () => onDelete(useSoftCancel) },
      ],
    });
  };

  // 참여 / 마감(대기) 버튼
  let actionBtn;
  if (isMine) {
    actionBtn = (
      <View>
        {post.closed ? (
          // 이미 확정됨 — closed:true. D-7 이내 참여자 취소 시 매너 -5 분기 활성 ([[roundup-penalty-policy]] §1)
          <>
          <View style={{ borderRadius: 10, paddingVertical: _and ? 8 : 11, alignItems: 'center',
            backgroundColor: C.bgPrimary, borderWidth: 1, borderColor: '#3C7D4F' }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: '#3C7D4F' }}>모집 확정됨 ✓</Text>
          </View>
          {/* 결원으로 빈자리가 열림 — 원치 않는 입장 차단: 현재 인원으로 마감(closedShort 잠금) */}
          {vacancy && (
            <>
              <TouchableOpacity activeOpacity={0.85} onPress={lockSeats}
                style={{ marginTop: 8, borderRadius: 10, paddingVertical: _and ? 8 : 11, alignItems: 'center', borderWidth: 1, borderColor: C.navy, backgroundColor: C.bgSecondary }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(13.5), color: C.navy }}>이 인원으로 마감 (빈자리 닫기)</Text>
              </TouchableOpacity>
              <Text style={hintStyle}>결원으로 한 자리 열렸어요. 더 받지 않으려면 ‘이 인원으로 마감’을 누르세요.</Text>
            </>
          )}
          </>
        ) : allFull ? (
          post.type === 'open' ? (
            // 오픈형 만석 — 일정 미정이라 확정 불가. 먼저 '모집글 수정'에서 확정형(날짜·골프장)으로 전환해야 함.
            <>
              <View style={{ borderRadius: 10, paddingVertical: _and ? 8 : 11, alignItems: 'center',
                backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline, opacity: 0.7 }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.warmGrayLight }}>모집 확정하기</Text>
              </View>
              <Text style={hintStyle}>
                일정이 아직 정해지지 않았어요.{'\n'}'모집글 수정'에서 날짜·골프장을 정하면 확정할 수 있어요.
              </Text>
            </>
          ) : (
            // 만석 + 미확정(확정형) — 주최자 명시 확정 버튼. 만석 자체는 자동 확정 X (2026-05-28 정책)
            <>
              <TouchableOpacity activeOpacity={0.85} onPress={confirmFinalize}
                style={{ borderRadius: 10, paddingVertical: _and ? 8 : 11, alignItems: 'center', backgroundColor: '#3C7D4F' }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: '#fff' }}>모집 확정하기</Text>
              </TouchableOpacity>
              {/* 만석=확정 아님. 버튼 아래에 대기 상태 강조 — 주최자가 '눌러야 함' 인식 ([[roundup-confirm-judgment]]) */}
              <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: C.navy, textAlign: 'center', marginTop: _and ? 7 : 9 }}>
                ⏳ 인원이 다 모였어요 · 모집 확정 대기중
              </Text>
              <Text style={hintStyle}>
‘모집 확정하기’를 눌러 모집을 확정해 주세요.{'\n'}확정하면 동반자와 본인 일정에 자동 추가돼요.{'\n'}확정 후엔 수정 불가 — 변경은 삭제 후 다시 모집해요.
              </Text>
            </>
          )
        ) : (
          <>
            <View style={{ borderRadius: 10, paddingVertical: _and ? 8 : 11, alignItems: 'center',
              backgroundColor: C.bgPrimary, borderWidth: 1, borderColor: C.hairline }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.warmGray }}>내가 올린 모집글</Text>
            </View>
            {/* 인원 미달 마감 — 단체는 정원을 온라인으로 다 못 채울 수 있어, 남은 자리는 직접 채우기로 하고 확정.
                확정형만(오픈형은 날짜부터). [[roundup-underfilled-finalize]] */}
            {isTeam && post.type === 'fixed' && (
              <>
                <TouchableOpacity activeOpacity={0.85} onPress={confirmFinalizeUnderfilled}
                  style={{ marginTop: _and ? 6 : 8, borderRadius: 10, paddingVertical: _and ? 8 : 11, alignItems: 'center', backgroundColor: '#3C7D4F' }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: '#fff' }}>이대로 마감하기</Text>
                </TouchableOpacity>
                <Text style={hintStyle}>
                  인원이 다 안 차도 마감할 수 있어요.{'\n'}이 인원으로 잠겨 빈자리는 더 받지 않아요 — 남은 자리는 직접 채워주세요.
                </Text>
              </>
            )}
          </>
        )}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: _and ? 6 : 8 }}>
          {onEdit && !post.closed && (
            <TouchableOpacity activeOpacity={0.85} onPress={onEdit}
              style={{ flex: 1, borderRadius: 10, paddingVertical: _and ? 8 : 11, alignItems: 'center',
                backgroundColor: C.bgPrimary, borderWidth: 1, borderColor: C.charcoal }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal }}>모집글 수정</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity activeOpacity={0.85} onPress={confirmDelete}
            style={{ flex: 1, borderRadius: 10, paddingVertical: _and ? 8 : 11, alignItems: 'center',
              backgroundColor: C.bgPrimary, borderWidth: 1, borderColor: C.burgundy }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.burgundy }}>모집글 삭제</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  } else if (joined) {
    actionBtn = (
      <View>
        {post.closed ? (
          // 모집 확정됨 — 주최자가 확정(closed:true). 참여자에게도 "모집 확정" 표시 ([[roundup-penalty-policy]] §1)
          <View style={{ borderRadius: 10, paddingVertical: _and ? 8 : 11, alignItems: 'center',
            backgroundColor: '#EAF2EC', borderWidth: 1, borderColor: '#3C7D4F' }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: '#3C7D4F' }}>모집 확정 · 참여 완료 ✓</Text>
          </View>
        ) : allFull ? (
          // 만석이지만 주최자 미확정 — 참여자에게 '일정 확정 대기중' 명시.
          //   만석=확정 아님([[roundup-confirm-judgment]]). 확정되면 위 'closed' 분기로 바뀜.
          <>
            <View style={{ borderRadius: 10, paddingVertical: _and ? 8 : 11, alignItems: 'center',
              backgroundColor: C.bgPrimary, borderWidth: 1, borderColor: C.navy }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.navy }}>참여 완료 ✓ · 확정 대기중</Text>
            </View>
            <Text style={hintStyle}>
              인원은 다 모였어요.{'\n'}주최자가 일정을 확정하면{'\n'}일정에 추가되고 알려드려요
            </Text>
          </>
        ) : (
          <View style={{ borderRadius: 10, paddingVertical: _and ? 8 : 11, alignItems: 'center',
            backgroundColor: C.bgPrimary, borderWidth: 1, borderColor: C.burgundy }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.burgundy }}>참여 완료 ✓</Text>
          </View>
        )}
        <TouchableOpacity onPress={confirmCancel} activeOpacity={0.7}
          style={{ marginTop: 6, alignItems: 'center', paddingVertical: 6 }}>
          <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, textDecorationLine: 'underline' }}>
            참여 취소
          </Text>
        </TouchableOpacity>
      </View>
    );
  } else if (applied) {
    actionBtn = (
      <View>
        <View style={{ borderRadius: 10, paddingVertical: _and ? 8 : 11, alignItems: 'center',
          backgroundColor: '#F0E8D8', borderWidth: 1, borderColor: '#C9A84C' }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: '#8B6914' }}>신청 완료 · 수락 대기 중</Text>
        </View>
        <TouchableOpacity onPress={confirmCancelApplication} activeOpacity={0.7}
          style={{ marginTop: 6, alignItems: 'center', paddingVertical: 6 }}>
          <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, textDecorationLine: 'underline' }}>
            신청 취소
          </Text>
        </TouchableOpacity>
      </View>
    );
  } else if (waitlistNum) {
    actionBtn = (
      <View>
        <View style={{ borderRadius: 10, paddingVertical: _and ? 8 : 11, alignItems: 'center',
          backgroundColor: '#F0E8D8', borderWidth: 1, borderColor: '#C9A84C' }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: '#8B6914' }}>⏳ 대기 {waitlistNum}번</Text>
        </View>
        <Text style={hintStyle}>
          자리가 나면 대기 순서대로 자동 참여돼요. 참여가 확정되면 알림을 보내드려요.
        </Text>
        <TouchableOpacity onPress={confirmCancelWait} activeOpacity={0.7}
          style={{ marginTop: 4, alignItems: 'center', paddingVertical: 6 }}>
          <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, textDecorationLine: 'underline' }}>
            대기 취소
          </Text>
        </TouchableOpacity>
      </View>
    );
  } else if (userProfile?.isRestricted) {
    actionBtn = (
      <View style={{ borderRadius: 10, paddingVertical: _and ? 8 : 11, alignItems: 'center',
        backgroundColor: C.bgPrimary, borderWidth: 1, borderColor: '#8B2A2A' }}>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: '#8B2A2A' }}>🚫 이용 제한 중</Text>
      </View>
    );
  } else if (userProfile?.mannerEvaluationPending) {
    actionBtn = (
      <View style={{ borderRadius: 10, paddingVertical: _and ? 8 : 11, alignItems: 'center',
        backgroundColor: '#F0E8D8', borderWidth: 1, borderColor: '#C9A84C' }}>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: '#8B6914' }}>지난 라운딩 평가 후 신청 가능해요</Text>
      </View>
    );
  } else if (!isClosed || vacancy) {
    const instant = post.scope !== 'all';
    actionBtn = (
      <View>
        <TouchableOpacity activeOpacity={0.85} onPress={confirmApply}
          style={{ borderRadius: 10, paddingVertical: _and ? 8 : 11, alignItems: 'center', backgroundColor: C.burgundy }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.butter }}>{instant ? '참여하기' : '참여 신청'}</Text>
        </TouchableOpacity>
        {vacancy && (
          <Text style={hintStyle}>확정된 모집에 결원이 생겨 한 자리 비었어요 — 지금 참여하면 채워져요.</Text>
        )}
      </View>
    );
  } else if (post.closedShort) {
    // 미달 마감(잠금) — 주최자가 인원을 적게 확정한 모집. 빈자리 추가 모집 안 함(참여·대기 둘 다 X).
    actionBtn = (
      <View>
        <View style={{ borderRadius: 10, paddingVertical: _and ? 8 : 11, alignItems: 'center',
          backgroundColor: C.bgPrimary, borderWidth: 1, borderColor: C.hairline }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.warmGray }}>마감된 모집이에요</Text>
        </View>
        <Text style={hintStyle}>주최자가 인원을 확정해 마감한 모집이라 더는 참여를 받지 않아요.</Text>
      </View>
    );
  } else {
    actionBtn = (
      <View>
        <TouchableOpacity activeOpacity={0.85} onPress={confirmWaitlist}
          style={{ borderRadius: 10, paddingVertical: _and ? 8 : 11, alignItems: 'center',
            backgroundColor: C.bgPrimary, borderWidth: 1, borderColor: C.charcoal }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal }}>
            대기 신청{waitlistTotal > 0 ? ` (현재 ${waitlistTotal}명 대기)` : ''}
          </Text>
        </TouchableOpacity>
        <Text style={hintStyle}>
          마감된 모집이에요. 대기 신청하면 자리가 날 때 대기 순서대로 자동 참여되고 알림을 보내드려요.
        </Text>
      </View>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleRequestClose}>
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'bottom', 'left', 'right']}>
          {/* 헤더 */}
          <View style={{ backgroundColor: C.bgPrimary, paddingHorizontal: 20, paddingVertical: _and ? 8 : 11,
            flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: fs(22), color: C.charcoal }}>←</Text>
            </TouchableOpacity>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal }}>모집 상세</Text>
            <View style={{ flex: 1 }} />
            {/* 공유/초대 — 색 텍스트(칩 중복 회피, 네이비 [[navy-lounge-color]]).
                친구지정(select)은 호스트만 '초대 보내기' — audienceUids 지정 친구는 앱·계정 보유라 딥링크 카카오 초대가 깔끔(탭→앱→초대카드→수락).
                  비지정자에게 새도 Firestore 규칙이 참여 차단(무해). 그 외(친구공개·전체공개)는 누구나 '공유'(설치 홍보). ([[invite-deeplink-system]]) */}
            {(post.scope !== 'select' || isMine) && (
              <TouchableOpacity onPress={() => setShareCardOpen(true)} activeOpacity={0.85}
                hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.navy,
                  borderRadius: 18, paddingHorizontal: 13, paddingVertical: 7 }}>
                <Text style={{ fontSize: fs(14) }}>{post.scope === 'select' ? '✉️' : '🔗'}</Text>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(13.5), color: '#fff' }}>{post.scope === 'select' ? '초대 보내기' : '공유'}</Text>
              </TouchableOpacity>
            )}
            {!isMine && onToggleBookmark && (
              <TouchableOpacity onPress={onToggleBookmark} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ fontSize: fs(22), color: isBookmarked ? '#E2B33D' : C.warmGrayLight }}>
                  {isBookmarked ? '★' : '☆'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 36 + (kbHeight ? kbHeight + 80 : 0) }}
            scrollEventThrottle={16}
            onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }}
            keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets>
            {/* 긍정 문구 — 약속·시간 존중 문화 고정 안내 ([[roundup-penalty-policy]] §5) */}
            <View style={{ marginHorizontal: 16, marginTop: _and ? 9 : 12,
              backgroundColor: '#F0E8D8', borderWidth: 1, borderColor: '#E2D2A8',
              borderRadius: 10, paddingVertical: _and ? 5 : 7, paddingHorizontal: 14, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: '#6B5A2E', lineHeight: _and ? 15 : 16 }}>
                함께하는 골프, 서로의 시간을 존중해요
              </Text>
            </View>

            {/* 1. 모집글 정보 */}
            <View style={{ backgroundColor: C.bgSecondary, marginHorizontal: 16, marginTop: _and ? 6 : 8, marginBottom: 4, borderRadius: 14, borderWidth: 0.5, borderColor: C.hairline, padding: _and ? 11 : 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: _and ? 8 : 10 }}>
                <Badge bg={post.type === 'fixed' ? C.charcoal : '#6B8B5E'} fg="#fff" text={post.type === 'fixed' ? '확정형' : '오픈형'} />
                {isTeam && <Badge bg={C.navy} fg={C.butter} text={`단체 ${post.teams}팀`} />}
                <Badge bg={sb.bg} fg={sb.fg} text={sb.label} />
                {/* 확정(closed)+자리없음 → 그린 ✓확정 / 만석 미확정 → 호박 확정 대기 / 확정+빈자리 → ✓확정·N자리 */}
                {post.closed && !vacancy && <Badge bg="#D9E8CE" fg="#2E6B3E" text="✓ 확정" />}
                {awaitingConfirm && <Badge bg="#F3E2A0" fg="#7A5A00" text="확정 대기" />}
                {vacancy && <Badge bg="#D9E8CE" fg="#3C6B2E" text={`✓ 확정 · ${vacancySeats}자리`} />}
              </View>

              {/* 단체팀 — 조 편성·팀별 티오프 화면. 단체 모집 + 참여자(주최자·확정자)만 노출 ([[event-model]]) */}
              {isTeam && (isMine || joined) && (() => {
                // 배지 — 주최자가 '편성 완료'를 명시(teamPlanDone)하면 그린 '✓ 편성 완료', 아니면 앰버 '편성 전'.
                //   옛 데이터(완료 버튼 전 입력분) 호환 위해 isTeamPlanFilled도 완료로 인정 ([[event-model]]).
                const teamDone = !!post.teamPlanDone || isTeamPlanFilled(post);
                // 맥동 — 참여자(비주최자)가 '새로 완료된 편성'을 아직 안 봤을 때만 1회 주목(열면 정지). 주최자엔 안 띔.
                const teamPlannedMs = post.teamPlannedAt?.toMillis ? post.teamPlannedAt.toMillis() : 0;
                const teamUnseen = !isMine && !!post.teamPlanDone && teamPlannedMs > teamSeenMs;
                return (
                <AttentionMotion type="pulse" enabled={teamUnseen}>
                <TouchableOpacity onPress={openTeam} activeOpacity={0.85}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                    marginBottom: _and ? 8 : 10, borderRadius: 10, paddingVertical: _and ? 9 : 11, paddingHorizontal: 14, backgroundColor: C.navy }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(13.5), color: C.butter }}>🗂 단체팀 · 조 편성 · 티오프</Text>
                  <View style={{ borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3,
                    backgroundColor: teamDone ? '#6B8B5E' : '#E8C77E' }}>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(13.5), color: teamDone ? '#fff' : '#5A4500' }}>
                      {teamDone ? '✓ 편성 완료' : '편성 전'}
                    </Text>
                  </View>
                </TouchableOpacity>
                </AttentionMotion>
                );
              })()}

              {/* 주최자 — 이름 표시. 매너·주최횟수·신뢰배지는 친구모집(전체공개 OFF)에선 무의미해 숨김([[roundup-friend-redesign]]) */}
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: _and ? 6 : 8, paddingHorizontal: 12,
                  backgroundColor: C.bgPrimary, borderRadius: 10, marginBottom: _and ? 8 : 10 }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.warmGray, letterSpacing: 1, marginRight: 2 }}>주최자</Text>
                <TouchableOpacity activeOpacity={0.7}
                  onPress={() => setActionTarget({ id: post.authorUid || post.authorId || post.author, name: friendDisplayName(friendMeta, post.authorUid, post.authorName || post.author || '주최자'), role: 'host' })}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.charcoal }}>{friendDisplayName(friendMeta, post.authorUid, post.authorName || post.author || '주최자')}</Text>
                </TouchableOpacity>
                {hcOf(post.authorUid) != null && (
                  <Text style={{ fontFamily: F.sysM, fontSize: fs(11), color: C.warmGray }}>· 핸디 {hcOf(post.authorUid)}</Text>
                )}
                {ROUNDUP_PUBLIC_ENABLED && <TrustBadge grade={authorGrade} onPress={() => setGradeKey(authorGrade.key)} />}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
                  {/* 지정 라벨(그룹·개인)은 카드에서만 표시 — 상세는 한 모집만 보는 화면이라 구분 불필요하고
                      상단 '친구지정' 뱃지로 충분. 라벨은 여러 모집을 구분하는 카드(목록)용 (2026-06-10) */}
                  {ROUNDUP_PUBLIC_ENABLED && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>
                        주최 <Text style={{ fontFamily: F.sysB, color: C.charcoal }}>{post.authorHostedCount || 0}</Text>회 ·
                      </Text>
                      <MannerBadge score={post.authorMannerScore || 0} size={14} onPress={() => {
                        const score = post.authorMannerScore || 0;
                        const g = (score >= 95) ? 'king'
                          : (score >= 80) ? 'good'
                          : (score >= 40) ? 'normal' : 'caution';
                        setMannerKey(g);
                      }} />
                    </View>
                  )}
                  {/* 좋아요(응원) — 소프트 비활성([[roundup-likes-disabled]]). 관심(별표)과 경쟁 제거. 데이터·함수 보존 */}
                  {ROUNDUP_LIKES_ENABLED && (() => {
                    const likeCount = Array.isArray(post.likedBy) ? post.likedBy.length : 0;
                    const liked = !!myUid && Array.isArray(post.likedBy) && post.likedBy.includes(myUid);
                    const isHost = post.authorUid === myUid;
                    const inner = (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Text style={{ fontSize: fs(15), color: liked ? '#E0506A' : C.warmGrayLight }}>{liked ? '♥' : '♡'}</Text>
                        <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: liked ? '#E0506A' : C.warmGray }}>{likeCount}</Text>
                      </View>
                    );
                    return isHost ? inner : (
                      <TouchableOpacity onPress={() => onToggleLike?.(post.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        {inner}
                      </TouchableOpacity>
                    );
                  })()}
                </View>
              </View>

              {post.type === 'fixed' ? (
                <>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(_and ? 16 : 17), color: C.charcoal, lineHeight: fs(_and ? 21 : 23) }}>{post.course}</Text>
                  {post.subCourse ? (
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: C.warmGray, marginTop: 2 }}>{post.subCourse}</Text>
                  ) : null}
                  <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary, marginTop: _and ? 2 : 4, lineHeight: _and ? 17 : 18 }}>
                    {post.date} ({post.day}) · {post.time}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(_and ? 16 : 17), color: C.charcoal, lineHeight: fs(_and ? 21 : 23) }}>장소 · 날짜 미정</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary, marginTop: _and ? 2 : 4, lineHeight: _and ? 17 : 18 }}>
                    {post.openTime?.length === 1
                      ? (post.openTime[0] === 'weekday' ? '📅 주중 선호 · 동반자와 함께 정해요' : '📅 주말 선호 · 동반자와 함께 정해요')
                      : '동반자와 함께 정해요'}
                  </Text>
                </>
              )}

              {/* 동반자 조건 — 구성·연령대·실력·태그. 'any'/빈배열은 숨김 */}
              {(() => {
                const compTxt = post.companion && post.companion !== 'any' ? COMPANION_LABEL[post.companion] : null;
                const ageTxt = post.ageGroup && post.ageGroup !== 'any' ? AGEGROUP_LABEL[post.ageGroup] : null;
                const skillTxt = post.skill && post.skill !== 'any' ? SKILL_LABEL[post.skill] : null;
                const tagList = Array.isArray(post.tags) ? post.tags : [];
                if (!compTxt && !ageTxt && !skillTxt && tagList.length === 0) return null;
                // 데모그래픽(구성·연령·실력) 없이 태그만 있으면(친구모집 기본) 헤더를 '라운딩 성격'으로
                const onlyTags = !compTxt && !ageTxt && !skillTxt;
                return (
                  <View style={{ marginTop: _and ? 9 : 12, paddingTop: _and ? 9 : 12, borderTopWidth: 0.5, borderTopColor: C.hairline }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.warmGray, letterSpacing: 1.5, marginBottom: _and ? 4 : 6 }}>{onlyTags ? '라운딩 성격' : '동반자 조건'}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {compTxt && <Badge bg={FILTER_BADGE.companion.bg} fg={FILTER_BADGE.companion.fg} text={compTxt} />}
                      {ageTxt && <Badge bg={FILTER_BADGE.ageGroup.bg} fg={FILTER_BADGE.ageGroup.fg} text={ageTxt} />}
                      {skillTxt && <Badge bg={FILTER_BADGE.skill.bg} fg={FILTER_BADGE.skill.fg} text={skillTxt} />}
                      {tagList.map(t => {
                        const ts = tagStyle(t);
                        return <Badge key={t} bg={ts.soft} fg={ts.deep} text={`#${t}`} />;
                      })}
                    </View>
                  </View>
                );
              })()}

              {post.word ? (
                <View style={{ backgroundColor: C.bgPrimary, borderRadius: 10, padding: _and ? 8 : 10, marginTop: _and ? 8 : 10 }}>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary, lineHeight: _and ? 17 : 18 }}>"{post.word}"</Text>
                </View>
              ) : null}

              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: _and ? 8 : 10 }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.warmGray }}>모집 인원</Text>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.charcoal, marginLeft: 8 }}>
                  {isTeam ? `${post.teams}팀 · ${post.teams * 4}명` : `${post.capacity}명`}
                </Text>
                {post.companions?.length > 0 && !isTeam ? (
                  <Text style={{ fontFamily: F.sysM, fontSize: fs(11), color: C.warmGray, marginLeft: 8 }}>
                    (동반자 {post.companions.map(c => (typeof c === 'string' ? c : c?.name)).filter(Boolean).join(', ')} 포함)
                  </Text>
                ) : null}
              </View>

              <View style={{ marginTop: _and ? 9 : 12 }}>{actionBtn}</View>
            </View>

            {/* 2·3. 참여자 현황 — 단체도 팀으로 안 나누고 전원 평면 나열(조편성은 댓글) */}
            <Text style={[sectionLabel, { marginTop: _and ? 6 : 8 }]}>참여자 현황</Text>
            <View style={{ marginHorizontal: 16, backgroundColor: C.bgSecondary, borderRadius: 14,
              borderWidth: 0.5, borderColor: C.hairline, padding: _and ? 11 : 14 }}>
              {slots.map((s, i) => {
                // 본인 슬롯(uid===myUid 또는 라벨 '나')은 액션시트 X — 자기 차단·신고·친구신청 방지.
                // id는 uid 우선(친구상태 매칭·isMe 판정용), 없으면 이름 fallback(옛 더미).
                const isSelfSlot = (s.uid && s.uid === myUid) || s.name === '나';
                // 익명 마스킹된 슬롯은 프로필 시트(신고/차단/친구신청)·핸디 노출 X — 신원 유추 차단 ([[roundup-anonymous-participation]])
                return (
                  <SlotRow key={i} slot={s} idx={i} handicap={s.masked ? null : hcOf(s.uid)}
                    onPress={(s.name && !isSelfSlot && !s.masked)
                      ? () => setActionTarget({ id: s.uid || s.name, uid: s.uid || null, name: s.name, role: s.host ? 'host' : 'participant' })
                      : null} />
                );
              })}
            </View>

            {/* 대기자 — 주최자는 실명 명단(독려용), 그 외엔 '내 자리 + 요약 한 줄'만(타인 신원·가짜 이름 노출 방지) */}
            {(waitlistTotal > 0 || waitlistNum) && (
              <>
                <Text style={sectionLabel}>대기자</Text>
                <View style={{ marginHorizontal: 16, backgroundColor: C.bgSecondary, borderRadius: 14,
                  borderWidth: 0.5, borderColor: C.hairline, padding: 16 }}>
                  {isMine && Array.isArray(post.waitlistUids) && post.waitlistUids.length > 0 ? (
                    // 주최자 — 대기자 실명을 순번대로 나열해 직접 독려할 수 있게. 익명 신청자도 호스트에겐
                    //   실명 노출(승격 시 그대로 이어짐)하되 '익명' 표식으로 존중 ([[roundup-anonymous-participation]]).
                    //   이름은 내 별명(friendMeta) 우선 → participantNames(닉네임 보강) → 폴백. 호스트는 본인이 대기자가 아님.
                    post.waitlistUids.map((uid, i) => (
                      <WaitRow key={uid} num={i + 1}
                        name={friendDisplayName(friendMeta, uid, participantNames[uid] || '대기자')}
                        anon={Array.isArray(post.anonymousUids) && post.anonymousUids.includes(uid)} />
                    ))
                  ) : (
                    <>
                      {/* 내가 익명으로 대기했으면 내 행도 랜덤닉 — '남에겐 이렇게 보인다' 확인 겸, 랜덤닉이라 본인이 자기인지
                          모르므로 '(나)'와 '익명' 표식으로 식별([[roundup-anonymous-participation]]). 비익명은 내 닉네임+'(나)'. */}
                      {waitlistNum ? (
                        <WaitRow num={waitlistNum}
                          name={`${iAmAnonWaiting ? anonNick(myUid, post.id) : (userProfile?.nickname || '나')}(나)`}
                          me anon={iAmAnonWaiting} />
                      ) : null}
                      {othersWaiting > 0 ? (
                        <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray,
                          marginTop: waitlistNum ? (_and ? 6 : 8) : 0,
                          textAlign: waitlistNum ? 'left' : 'center' }}>
                          {waitlistNum
                            ? `나 외 ${othersWaiting}명이 함께 대기하고 있어요`
                            : `현재 ${othersWaiting}명이 대기하고 있어요`}
                        </Text>
                      ) : null}
                    </>
                  )}
                </View>
              </>
            )}

            {/* 4. 동반자에게 일정 알리기 — 주최자 전용, 확정 동반자 있을 때. 인앱 알림(+푸시) 발송.
                남용 방지: 모집 확정(isClosed) 후에만 활성 — 확정 전엔 비활성+안내 */}
            {isMine && (() => {
              const others = (Array.isArray(post.participantUids) ? post.participantUids : []).filter(u => u && u !== myUid);
              if (others.length === 0) return null;
              // ★post.closed(실제 확정)로 판정 — isClosed(=closed||allFull)는 '만석'도 포함이라
              //   만석만으로 활성되면, 자동 일정 등록(RoundupTab: post.closed 기준)은 안 되는데
              //   일정 알림만 가는 불일치 발생(확정 착각). 두 기능 모두 '주최자 확정' 기준으로 통일.
              const enabled = !!post.closed;  // 주최자가 모집을 확정(closed)해야 일정 알림 가능
              return (
                <>
                  <TouchableOpacity onPress={enabled ? handleNotifySchedule : undefined} disabled={!enabled} activeOpacity={0.85}
                    style={{ marginHorizontal: 16, marginTop: _and ? 12 : 16, borderRadius: 10, paddingVertical: _and ? 8 : 11,
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                      backgroundColor: enabled ? C.navy : C.bgSecondary,
                      borderWidth: enabled ? 0 : 0.5, borderColor: C.hairline, opacity: enabled ? 1 : 0.7 }}>
                    <Text style={{ fontSize: fs(15) }}>📣</Text>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: enabled ? C.butter : C.warmGrayLight }}>
                      동반자에게 일정 알리기
                    </Text>
                  </TouchableOpacity>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray,
                    marginHorizontal: 16, marginTop: 6, textAlign: 'center' }}>
                    {enabled
                      ? `동반자 ${others.length}명에게\n라운딩 일정을 알림으로 보내요`
                      : '모집을 확정하면\n동반자에게 일정을 알릴 수 있어요'}
                  </Text>
                </>
              );
            })()}

            {/* 댓글 — 참여 확정자만 작성·열람, 본인만 삭제, 주최자만 고정, 티오프 후 비활성 */}
            <RoundupComments
              post={post}
              comments={comments}
              total={commentTotal}
              joined={joined}
              myUid={myUid}
              nameMap={participantNames}
              friendMeta={friendMeta}
              inputRef={commentInputNode}
              onInputFocus={scrollCommentIntoView}
              onAdd={onAddComment}
              onDelete={onDeleteComment}
              onPin={onPinComment}
              onLoadOlder={onLoadOlderComments} />

            <View style={{ height: 20 }} />
          </ScrollView>

          {/* 참여 확인 / 카카오 안내 / 차단 확인 — 모달 위 오버레이 */}
          <OverlayAlert data={alert} onClose={() => setAlert(null)} />
          {/* 등급 안내 모달 — 부모 모달 뒤로 가려지지 않게 자체 렌더링 */}
          <TrustGradeModal visible={!!gradeKey} highlightKey={gradeKey} onClose={() => setGradeKey(null)} />
          <MannerGradeModal visible={!!mannerKey} highlightKey={mannerKey} onClose={() => setMannerKey(null)} />
          {/* 프로필 액션 시트 — 친구 신청 + 차단. 라운지 참여자는 주최자 친구일 뿐 내 친구는 아닐 수 있어 친구 신청 제공(2026-06-26 재도입). */}
          <ProfileActionSheet
            visible={!!actionTarget}
            target={actionTarget}
            isMe={!!myUid && (actionTarget?.id === myUid || actionTarget?.name === '나')}
            friendState={targetFriendState}
            onFriendRequest={requestFriend}
            onClose={() => setActionTarget(null)}
            onBlock={(t) => {
              // 시트 닫고 자체 확인 alert. 확인 시 RoundupDetail 닫고 부모로 차단 신호 (부모는 alert 없이 즉시 처리)
              setActionTarget(null);
              setAlert({
                title: `${t.name}님을 차단할까요?`,
                message: '차단하면 서로의 모집글이 보이지 않고, 진행 중인 참여·신청·대기도 자동 취소돼요.\n친구라면 친구 관계도 자동 해지되고 차단 해제 후에도 복원되지 않아요.\n💡 상대방에게는 알림이 가지 않아요.',
                buttons: [
                  { text: '취소', style: 'cancel' },
                  { text: '차단', style: 'destructive', onPress: () => { onClose(); onBlock?.(t); } },
                ],
              });
            }} />
          {/* 모집 공유 — 이미지(모집 카드)/이미지 저장/링크 공유 선택 모달. 카카오 버튼은 ShareMomentModal에서
              글로벌 제거됨(딥링크 미연동 철회). 링크 공유는 평문 직행(shareRoundup, 카톡 OG 카드+App Links).
              ※ 4e70d49에서 카카오 빼며 통째로 제거됐던 선택 화면을 카카오 없이 복원 (사용자 2026-06-17, [[invite-deeplink-system]]) */}
          <ShareMomentModal
            moment={shareCardOpen ? { ...post, shareKind: 'roundup' } : null}
            visible={shareCardOpen}
            onClose={() => setShareCardOpen(false)}
            onShareLink={() => { setShareCardOpen(false); setTimeout(() => shareRoundup(post), 350); }}
          />

          {/* 단체팀 화면 — 상세 Modal 내부 중첩(형제 Modal 회피, [[ios-modal-stacking]]) */}
          <RoundupTeamScreen visible={teamOpen} roundupId={post?.id} onClose={() => setTeamOpen(false)} />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
