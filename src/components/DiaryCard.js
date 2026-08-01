import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, F, fs } from '../constants/colors';
import { dS } from '../styles/dS';
import { getTagColor } from '../utils/helpers';
import { hofBgColor } from './HallOfFameCard';
import { MediaCarousel } from './common/MediaCarousel';
import { Icon } from './common/Icon'; // 좋아요 = 하트 아이콘(엄지 대체)
import { WhoLikedModal } from './common/WhoLikedModal';
import { toggleRoundLike } from '../utils/round';
import { ownerVisibilityLabel } from '../utils/friendGroups';
import { getPhotoRatio, feedFrameAspect, firstPhotoUri } from '../utils/photoRatio';   // 사진에 맞는 카드 틀(4:3·1:1·4:5)

// 라운딩 기록 카드.
//  - variant 'mine'(기본): MY 다이어리 — 사진 캐러셀(탭→상세) + 기록 보기 토글로 상세 펼침
//  - variant 'friend'    : 친구 피드 — 같은 골격에 정보만 줄임(구장·스코어·한줄메모·★) + 좋아요/댓글 줄.
//                          탭→PhotoViewer(onOpenPhoto), 정보는 항상 노출(접기 없음) ([[friend-feed-design]])
// React.memo — 부모(DiaryScreen) 리렌더(스크롤 feedLimit·검색·선택)마다 props 안 바뀐 카드는 건너뜀.
//   onPress는 부모에서 useCallback으로 안정화, friendGroups·friendNameByUid는 state(로드 후 안정), avgScore는 숫자.
function DiaryCardBase({ item, onPress, avgScore, isFirstSingle, variant = 'mine', myUid, onOpenPhoto, friendNameByUid, onReport, friendGroups, collapseSignal = 0 }) {
  const [expanded, setExpanded] = useState(false);
  const [showLikers, setShowLikers] = useState(false); // 내 글 — 누가 좋아요 눌렀나 팝업
  const isFriend = variant === 'friend';
  // 사진 틀 — 4:3 하나로 고정하던 것을 사진에 맞춰 3단계(가로 4:3 / 정사각 1:1 / 세로 4:5)로 고른다.
  //   3:4 세로 사진이 56%만 보이던 문제(사람이 아래 있으면 하늘만 남음) → 94%까지 살아난다.
  //   첫 장 기준(인스타와 같은 규칙). 잰 적 있는 사진이면 캐시에서 바로 나와 높이가 처음부터 정확하고,
  //   처음 보는 사진만 로드 후 한 번 확정된다(그 뒤로는 캐시).
  const [photoAr, setPhotoAr] = useState(() => getPhotoRatio(firstPhotoUri(item.photos)));
  const frameAspect = feedFrameAspect(photoAr);
  // 펼침 원위치 — 화면을 떠났다 돌아오면 접힌 상태로(사용자 2026-07-22). 내 기록 탭·친구 프로필 모두
  //   화면이 언마운트되지 않고 유지돼서, 안 하면 예전에 펼쳐둔 카드가 그대로 펼쳐진 채 남는다.
  //   부모가 떠날 때 collapseSignal을 올리면 카드들이 일제히 접힌다.
  useEffect(() => { setExpanded(false); }, [collapseSignal]);

  // 친구 피드 카드 — 길게 누르면 신고 액션시트 ([[content-report-policy]]·[[diary-profanity-policy]]).
  //   onReport 미연결이면 그대로 통과. 일상·라운드 4갈래 모두 같은 래퍼로 감싼다(탭은 내부 사진/좋아요가 처리).
  const wrapFriend = (children) => {
    // cardShadow: iOS 입체감 래퍼(카드 overflow:hidden 회피). 친구 4갈래 공통 통과 지점.
    const shadowed = <View style={dS.cardShadow}>{children}</View>;
    return onReport ? (
      <Pressable onLongPress={() => onReport(item)} delayLongPress={350}>{shadowed}</Pressable>
    ) : shadowed;
  };

  // 좋아요 상태 — 친구 변형에서만 의미. (훅은 항상 호출)
  const likedInit = !!(myUid && (item.likes || []).includes(myUid));
  const [liked, setLiked] = useState(likedInit);
  const likeOthers = (item.likes || []).filter(u => u !== myUid).length;
  const likeCount = likeOthers + (liked ? 1 : 0);
  const onToggleLike = () => {
    const next = !liked;
    setLiked(next);
    toggleRoundLike(item.id, next).catch((e) => {
      if (__DEV__) console.warn('[like] toggle fail', item?.id, e?.code, e?.message); // 진단 — permission-denied면 규칙/데이터(visibility·친구관계)
      setLiked(!next); // 실패 시 롤백
    });
  };

  // 날짜 라벨 — 티오프 시간이 있으면 점으로 붙임(없으면 날짜만). 내/친구 피드 모든 카드 변형에서 동일 사용.
  const dLabel = `${item.date} ${item.day}${item.time ? ' · ' + item.time : ''}`;
  const hasScore = typeof item.score === 'number';
  const hasPar = typeof item.par === 'number'; // 파생 라운드 등 par 누락 시 NaN/"par undefined" 방지
  const diff = (hasScore && hasPar) ? item.score - item.par : 0;
  const diffLabel = diff > 0 ? `+${diff}` : `${diff}`;
  const hasBest = item.badge === '베스트';
  const hasPhoto = item.photos && item.photos.length > 0;
  const isSpecial = item.special === 'HOLE IN ONE' || item.special === 'ALBATROSS' || item.special === 'EAGLE';

  // owner-only 그룹/공개범위 색라벨 — 내 카드에서만(친구 카드엔 숨김). group=색점+그룹명, private=🔒, 친구전체=없음 ([[friend_groups]])
  const ownerLabelData = (!isFriend && friendGroups) ? ownerVisibilityLabel(friendGroups, item.visibility, item.audienceGroupIds, item.audienceKind) : null;
  // 공개범위 색라벨 — 무사진 카드 날짜 줄 오른쪽 끝(우상단)에 인라인. 사진 카드의 코너칩(ownerChip)과 같은 시각 위치로 통일 ([[friend_groups]])
  const ownerLabelTopRight = ownerLabelData ? (
    // flexShrink/minWidth/numberOfLines — 긴 그룹명이 날짜·더보기와 같은 줄에서 겹치지 않게 말줄임 ([[friend_groups]])
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1, minWidth: 0 }}>
      {ownerLabelData.groups && ownerLabelData.groups.length
        ? ownerLabelData.groups.map((g, gi) => <View key={gi} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: g.color }} />)
        : (ownerLabelData.icon ? <Text style={{ fontSize: fs(9) }}>{ownerLabelData.icon}</Text> : null)}
      <Text numberOfLines={1} style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGray, flexShrink: 1 }}>{ownerLabelData.text}</Text>
    </View>
  ) : null;
  // 사진 카드용 — 사진 우상단 반투명 코너 칩(높이 0 증가 → 카드 통일 유지). 좌상단은 specialBadge와 충돌 회피 ([[friend_groups]] A안)
  const ownerChip = ownerLabelData ? (
    <View style={{ position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, zIndex: 3 }}>
      {ownerLabelData.groups && ownerLabelData.groups.length
        ? ownerLabelData.groups.map((g, gi) => <View key={gi} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: g.color }} />)
        : (ownerLabelData.icon ? <Text style={{ fontSize: fs(9) }}>{ownerLabelData.icon}</Text> : null)}
      <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: '#fff' }}>{ownerLabelData.text}</Text>
    </View>
  ) : null;
  const isSingle = !!item.score && item.score <= 79; // 싱글 — 80타 미만
  const highlight = isSpecial || (!isFriend && isFirstSingle); // 골드 프레임 (친구 피드의 첫싱글 처리는 HoF 논의 후)
  const rating = item.starRating || 0;

  let lineColor;
  if (hasBest) lineColor = '#6B1E2A';
  else if (avgScore != null && item.score < avgScore) lineColor = '#F5E6A8';
  else if (avgScore != null && item.score === avgScore) lineColor = '#C8D9E6';
  else lineColor = '#8B8680';
  const memoBorderColor = isSpecial ? '#C9A84C' : lineColor;

  // 스코어 줄 — 타수·차이·par + 싱글/버디 배지. 특별(홀인원·알바·이글) 뱃지는 사진 코너(specialBadge)·무사진 배너(specialNoPhoto)에
  //   이미 떠 있어 여기선 생략 — 싱글·특별·버디 3개가 겹쳐 줄바꿈되며 카드가 길어지던 중복 제거(2026-06-15)
  const scoreLine = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
      {hasScore ? (
        <>
          <Text style={[dS.cardScore, isSingle && { color: '#C9A84C' }, hasBest && { color: C.burgundy }, isSpecial && { color: '#8B6914' }]}>{item.score}</Text>
          <Text style={[dS.cardScoreUnit, isSingle && { color: '#C9A84C' }, hasBest && { color: C.burgundy }, isSpecial && { color: '#8B6914' }]}>타</Text>
          <Text style={dS.cardPar}>{hasPar ? `${diffLabel} · par ${item.par}` : ''}</Text>
        </>
      ) : (
        <Text style={dS.cardPar}>스코어 미기록</Text>
      )}
      {isSingle && (
        <View style={{ backgroundColor: '#C9A84C', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 3, minWidth: 52, alignItems: 'center', alignSelf: 'center' }}>
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: '#2A2622' }}>싱글</Text>
        </View>
      )}
      {item.birdieCount > 0 && (
        <View style={{ backgroundColor: '#3D3935', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'center' }}>
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: '#F5E6A8' }}>버디 ×{item.birdieCount}</Text>
        </View>
      )}
    </View>
  );

  const memoBlock = item.memo ? (
    <View style={{ borderLeftWidth: 2, borderLeftColor: memoBorderColor, paddingLeft: 8, marginBottom: 8 }}>
      <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary, lineHeight: 18 }}>"{item.memo}"</Text>
    </View>
  ) : null;

  const ratingStars = rating > 0 ? (
    <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: '#C9A84C', marginBottom: 6 }}>{'★'.repeat(rating)}<Text style={{ color: C.hairline }}>{'★'.repeat(5 - rating)}</Text></Text>
  ) : null;

  // 내 글 좋아요 — 읽기전용(내 글엔 내가 좋아요 안 누름). likes(uid)를 친구 닉네임으로 해석, 탭→누가 팝업.
  // 친구 무사진 카드와 동일하게 태그 줄 우측 끝에 배치(아래 body 태그 줄의 오른쪽 자식).
  const likerUids = item.likes || [];
  const likerNames = likerUids.map(uid => (friendNameByUid && friendNameByUid[uid]) || '골프 친구');
  const mineLikeRow = (!isFriend && likerUids.length > 0) ? (
    <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); setShowLikers(true); }} activeOpacity={0.7}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <Icon name="heartFilled" size={fs(18)} />
      <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: C.burgundy }}>{likerUids.length}</Text>
    </TouchableOpacity>
  ) : null;

  // 친구 좋아요 — 박스(배경·테두리) 없이 하트 + 숫자만. 누른 상태는 숫자 색(버건디)으로 표시.
  //   패딩은 그대로 유지 — 내용물 위치·탭 영역을 기존 박스와 동일하게(우측 끝 앵커라 패딩 제거 시 숫자가 밀림).
  //   ★body보다 먼저 선언해야 한다 — body가 이 값을 참조하는데, const는 선언 전 참조가 불가(2026-07-22 통일).
  const likeButton = (
    <TouchableOpacity onPress={onToggleLike} activeOpacity={0.7}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 3, paddingHorizontal: 9 }}>
      <Icon name={liked ? 'heartFilled' : 'heart'} size={fs(18)} color={C.warmGray} />
      <Text style={{ fontFamily: F.sysB, fontSize: fs(12), color: liked ? C.burgundy : C.warmGray }}>{likeCount}</Text>
    </TouchableOpacity>
  );

  // ── 카드 본문 (내 기록·친구 피드 공통) ──
  const body = (
    <View style={dS.cardBody}>
      {/* 날짜 줄 — 무사진 카드 우측 끝: 내 기록은 공개범위 라벨(사진 카드 코너칩과 위치 통일, [[friend_groups]]),
          친구 기록은 그 자리가 비니 좋아요를 올린다(사용자 2026-07-22). 덕분에 아래 태그 줄이 폭을 온전히 쓴다. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={dS.cardDate}>{dLabel}</Text>
        {!hasPhoto ? (isFriend ? likeButton : ownerLabelTopRight) : null}
      </View>
      {/* 구장명 줄 — 좋아요는 카드 하단 우측으로 이동(친구 피드와 위치 통일, 2026-06-13).
          멘트(F.sys)와 굵기가 같아 구분이 약해 Medium으로 한 단계 진하게(피드 한정, 2026-06-16) */}
      <Text style={[dS.cardCourse, { fontFamily: F.sysM }, isSpecial && { color: '#8B6914' }]} numberOfLines={1}>{item.course}</Text>
      {/* 구장 별점 — 전엔 친구 카드에만 있었는데 카드 통일(2026-07-22)로 공통 본문으로 올림. 매긴 기록만 표시(rating>0) */}
      {ratingStars}
      {scoreLine}
      {memoBlock}
      {/* 하단 줄 — 좌: 태그(스크롤) / 우: 내 기록의 좋아요. 친구 카드 좋아요는 위 날짜 줄로 올라가 여기 없음.
          사진 카드 좋아요는 '기록 보기' 토글줄에서 따로 표시(!hasPhoto 조건) */}
      {((item.tags && item.tags.length > 0) || (!hasPhoto && !isFriend && mineLikeRow)) ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 8 }}>
          {/* 태그 — ★개수를 자르지 않고 전부, 줄바꿈 허용(사용자 2026-07-22 결정). 카드가 한 줄 길어지는 대신
              '어떤 건 +N이 보이고 어떤 건 태그가 잘리고' 제각각이던 문제가 사라진다(규칙 하나: 태그는 다 보인다).
              가로 스크롤·개수 상한(slice)·고정 높이 클리핑은 전부 실패한 방식이라 되돌리지 말 것 —
              폭에 따라 결과가 달라지거나(스크롤·상한) 글자가 통째로 잘렸다(고정 높이). */}
          <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
            {(item.tags || []).map((tag, i) => {
              const c = getTagColor(tag);
              return (
                <View key={i} style={{ backgroundColor: c.bg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(10), color: c.text }}>{tag}</Text>
                </View>
              );
            })}
          </View>
          {!hasPhoto && !isFriend && mineLikeRow ? <View style={{ marginLeft: 8 }}>{mineLikeRow}</View> : null}
        </View>
      ) : null}
    </View>
  );

  // ※ 친구 사진 카드의 '사진 위 타수 오버레이'는 카드 구성을 내 기록과 통일하며 제거(2026-07-22).
  //    타수는 '기록 보기'를 펼치면 본문에서 보인다. 되살리려면 photoHero(onTap, scoreNode)의 둘째 인자로 넘기면 됨.

  const photoHero = (onTap, scoreNode) => (
    <View style={[dS.photoHero43, { aspectRatio: frameAspect }]}>
      <MediaCarousel photos={item.photos} onTap={onTap} onFirstRatio={setPhotoAr} />
      {ownerChip}
      <View pointerEvents="none" style={[dS.photoBottomOverlay, { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }]}>
        <View style={{ flex: 1 }}>
          <Text style={dS.overlayCourse} numberOfLines={1}>{item.course}</Text>
          <Text style={dS.overlayDate}>{dLabel}</Text>
        </View>
        {scoreNode}
      </View>
      {isSpecial && (
        <View pointerEvents="none" style={dS.specialBadge}>
          <Text style={dS.specialBadgeTxt}>{item.special}</Text>
        </View>
      )}
      {!isFriend && isFirstSingle && !isSpecial && (
        <View pointerEvents="none" style={dS.specialBadge}>
          <Text style={dS.specialBadgeTxt}>FIRST SINGLE</Text>
        </View>
      )}
    </View>
  );

  // ===== 일상(모멘트) — 라운딩 카드와 높이·구조 통일 ([[moment-feed-extension]]) =====
  //  · 사진 일상 = 라운딩 사진카드와 동일: 사진(날짜 오버레이) + 더보기 토글 + 펼침(글)
  //  · 글만 일상 = 무사진 라운딩 카드와 높이 맞춤: 날짜+글 붙이고 더보기는 날짜 옆(인라인)
  if (item.kind === 'moment') {
    const momentTextStyle = { fontFamily: F.sys, fontSize: fs(15), color: C.charcoal, lineHeight: 23 };
    // 사진 일상 카드의 하단 날짜 — 기존 dS.cardDate(fs10·warmGray)가 너무 작고 흐려 가독성↑(사용자 2026-06-17).
    //   '더보기/기록보기' 토글(dS.toggleBtnTxt)은 그대로 유지.
    const momentDateStyle = { fontFamily: F.sysM, fontSize: fs(12.5), color: C.textSecondary };
    // 글만 일상 — 사진이 없어 본문이 주인공이라 더 크게 (사용자 2026-06-16)
    const momentTextOnlyStyle = { fontFamily: F.sys, fontSize: fs(16), color: C.textPrimary, lineHeight: 24 };
    // 일상 구분 — 흰 바탕(라운딩 기록과 통일). 라운딩은 '왼쪽' 띠, 일상은 '오른쪽' 띠 → 자리로 구분(색 절제, 빈티지 인상 제거).
    const momentCard = [dS.card, { borderRightWidth: 3, borderRightColor: C.paleSky }];
    if (hasPhoto) {
      // withDate=true → 사진 위 날짜 그라데이션(친구 카드). 내 카드는 날짜를 아래 더보기 줄로 옮김(false).
      const photoEl = (withDate) => (
        <View style={[dS.photoHero43, { aspectRatio: frameAspect }]}>
          <MediaCarousel photos={item.photos} onFirstRatio={setPhotoAr}
            onTap={isFriend ? (i => onOpenPhoto && onOpenPhoto(item.photos, i)) : (() => onPress(item))} />
          {ownerChip}
          {withDate && (
            <LinearGradient pointerEvents="none" colors={['transparent', 'rgba(0,0,0,0.45)']}
              style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 46,
                justifyContent: 'flex-end', paddingHorizontal: 10, paddingBottom: 8 }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: '#fff',
                textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 }}>
                {dLabel}
              </Text>
            </LinearGradient>
          )}
        </View>
      );
      if (isFriend) {
        // 친구 사진 일상 — MY 카드와 동일 스타일: 사진 + [날짜+더보기] 바 + 글 기본 숨김(더보기로 펼침).
        //   글은 이 카드의 '더보기'로 본다. 사진 탭은 PhotoViewer 전체화면 보기 전용 ([[friend-feed-design]]).
        return wrapFriend(
          <View style={momentCard}>
            {photoEl(false)}
            {/* 날짜·더보기·좋아요 한 줄 — 별도 좋아요 줄 제거(라운딩 사진카드와 통일, 카드 안 길어지게) ([[friend_feed_design]]) */}
            <View style={[dS.toggleBtn, { backgroundColor: '#fff', flexDirection: 'row',
              alignItems: 'center', gap: 10, paddingHorizontal: 12 }]}>
              <Text style={momentDateStyle}>{dLabel}</Text>
              {item.memo ? (
                <TouchableOpacity onPress={() => setExpanded(e => !e)} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={dS.toggleBtnTxt}>{expanded ? '접기 ∧' : '더보기 ∨'}</Text>
                </TouchableOpacity>
              ) : null}
              <View style={{ marginLeft: 'auto' }}>{likeButton}</View>
            </View>
            {item.memo && expanded && (
              <View style={dS.cardBody}>
                <Text style={momentTextStyle}>{item.memo}</Text>
              </View>
            )}
          </View>
        );
      }
      // 내 피드 사진 일상 — 날짜를 아래 바의 '더보기' 옆에 표시(사진 위 오버레이 없음)
      return (
        <>
        <View style={dS.cardShadow}>
        <TouchableOpacity style={momentCard} activeOpacity={0.88} onPress={() => onPress(item)}>
          {photoEl(false)}
          {/* 날짜·더보기·좋아요 한 줄 — 친구 일상 사진카드와 동일(좋아요를 바 안 우측으로). '한 줄 아래' 해소. 더보기는 좌측이라 FAB와 안 겹침 */}
          <View style={[dS.toggleBtn, { backgroundColor: '#fff', flexDirection: 'row',
            alignItems: 'center', gap: 10, paddingHorizontal: 12 }]}>
            <Text style={momentDateStyle}>{dLabel}</Text>
            {item.memo ? (
              <TouchableOpacity onPress={() => setExpanded(e => !e)} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={dS.toggleBtnTxt}>{expanded ? '접기 ∧' : '더보기 ∨'}</Text>
              </TouchableOpacity>
            ) : null}
            {mineLikeRow ? <View style={{ marginLeft: 'auto' }}>{mineLikeRow}</View> : null}
          </View>
          {/* 공개범위는 사진 코너 칩(ownerChip)으로 — 별도 줄 제거(높이 통일) ([[friend_groups]] A안) */}
          {item.memo && expanded && (
            <View style={dS.cardBody}>
              <Text style={momentTextStyle}>{item.memo}</Text>
            </View>
          )}
        </TouchableOpacity>
        </View>
        {showLikers && <WhoLikedModal names={likerNames} onClose={() => setShowLikers(false)} />}
        </>
      );
    }
    // 글만 일상 — 날짜+글 붙이고 더보기 인라인(날짜 옆). 무사진 라운딩 카드와 높이 통일.
    const textBody = (
      <View style={dS.cardBody}>
        <ExpandableMemo text={item.memo} style={momentTextOnlyStyle} lines={5}
          collapseSignal={collapseSignal}
          dateNode={<Text style={dS.cardDate}>{dLabel}</Text>}
          rightNode={!isFriend ? ownerLabelTopRight : null} />
        {!isFriend && mineLikeRow ? <View style={{ alignItems: 'flex-end', marginTop: 8 }}>{mineLikeRow}</View> : null}
      </View>
    );
    if (isFriend) {
      return wrapFriend(
        <View style={momentCard}>
          {textBody}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 12, paddingBottom: 10, marginTop: -4 }}>
            {likeButton}
          </View>
        </View>
      );
    }
    return (
      <>
      <View style={dS.cardShadow}>
      <TouchableOpacity style={momentCard} activeOpacity={0.88} onPress={() => onPress(item)}>
        {textBody}
      </TouchableOpacity>
      </View>
      {showLikers && <WhoLikedModal names={likerNames} onClose={() => setShowLikers(false)} />}
      </>
    );
  }

  // ===== 카드 렌더 — 내 기록·친구 피드 공통 구성 (2026-07-22 통일, 사용자 결정) =====
  //   전엔 친구 카드가 별도 포맷이었는데(사진 위 타수, 2열 압축 등) 두 피드가 따로 놀고 유지보수도 갈라졌다.
  //   이제 구조는 하나 — 사진 카드는 [사진 → 기록 보기 토글(+좋아요 우측) → 펼치면 본문], 무사진은 본문 그대로.
  //   친구 피드에서만 다른 것: ①길게 눌러 신고(wrapFriend) ②사진 탭은 상세 대신 뷰어 ③좋아요는 누를 수 있는 버튼
  //   ④무사진 카드의 좋아요는 '날짜 줄 우측'(MY는 그 자리가 공개범위 라벨인데 친구 카드엔 없어 빈자리).
  const likeNode = isFriend ? likeButton : mineLikeRow;
  // 카드 전체 탭 — 내 기록은 상세로. 친구 기록은 상세 화면이 없어 탭을 막고 사진/좋아요만 반응하게 둔다.
  const shell = (inner) => (isFriend ? wrapFriend(inner) : <View style={dS.cardShadow}>{inner}</View>);

  if (hasPhoto) {
    return (
      <>
      {shell(
        <TouchableOpacity style={[dS.card, highlight && dS.cardSpecial]} activeOpacity={isFriend ? 1 : 0.88}
          disabled={isFriend} onPress={isFriend ? undefined : () => onPress(item)}>
          {highlight && <View style={dS.cardSpecialLine} />}
          {photoHero(isFriend
            ? (i => onOpenPhoto && onOpenPhoto(item.photos, i))
            : (() => onPress(item)))}
          {/* 기록보기 토글 줄 — 좋아요를 같은 줄 우측에 절대배치(토글 텍스트는 가운데 유지). 한 줄 아래가 아니라 '기록 보기' 줄에(사용자 2026-06-13) */}
          <View style={{ justifyContent: 'center' }}>
            <TouchableOpacity onPress={() => setExpanded(e => !e)} activeOpacity={0.7} style={dS.toggleBtn}>
              <Text style={dS.toggleBtnTxt}>{expanded ? '접기 ∧' : '기록 보기 ∨'}</Text>
            </TouchableOpacity>
            {likeNode ? (
              <View style={{ position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' }}>{likeNode}</View>
            ) : null}
          </View>
          {expanded && body}
        </TouchableOpacity>
      )}
      {showLikers && <WhoLikedModal names={likerNames} onClose={() => setShowLikers(false)} />}
      </>
    );
  }

  return (
    <>
    {shell(
      <TouchableOpacity style={[dS.card, highlight ? dS.cardSpecial : { borderLeftWidth: 3, borderLeftColor: lineColor }]}
        activeOpacity={isFriend ? 1 : 0.88} disabled={isFriend} onPress={isFriend ? undefined : () => onPress(item)}>
        {highlight && <View style={dS.cardSpecialLine} />}
        {isSpecial && (
          <View style={[dS.specialNoPhoto, { backgroundColor: hofBgColor(item.special) }]}>
            {/* 제목(HOLE IN ONE 등)은 크게(fs28) — 홀번호(번홀)는 생략, 상세에서 확인(2026-06-15 사용자) */}
            <Text style={[dS.specialNoPhotoTxt, { fontSize: fs(28), letterSpacing: 3 }]}>{item.special}</Text>
          </View>
        )}
        {isFirstSingle && !isSpecial && (
          <View style={[dS.specialNoPhoto, { backgroundColor: hofBgColor('퍼스트 싱글') }]}>
            <Text style={dS.specialNoPhotoTxt}>FIRST SINGLE</Text>
            <Text style={dS.specialNoPhotoSub}>명예의 전당 등재</Text>
          </View>
        )}
        {body}
      </TouchableOpacity>
    )}
    {showLikers && <WhoLikedModal names={likerNames} onClose={() => setShowLikers(false)} />}
    </>
  );
}

// 일상(모멘트) 카드 본문 — 긴 글은 N줄까지만 보이고 인라인 '더보기/접기'로 펼침.
// RN은 numberOfLines를 건 텍스트의 onTextLayout이 잘린 줄 수만 줘서 넘침을 못 잡으므로,
// 화면 밖(absolute·opacity 0) 숨은 텍스트로 실제 줄 수를 1회 측정해 토글 노출을 결정한다.
// dateNode를 주면 날짜 + 더보기(옆)를 한 줄로 묶어 글과 붙임(무사진 라운딩 카드와 높이 통일).
// 없으면 글 아래에 더보기 표시(기본).
function ExpandableMemo({ text, style, lines = 5, dateNode, rightNode, collapseSignal = 0 }) {
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const [measured, setMeasured] = useState(false);
  useEffect(() => { setExpanded(false); }, [collapseSignal]);   // 화면 떠났다 오면 접기(카드와 동일)
  const toggle = overflow ? (
    <TouchableOpacity activeOpacity={0.7} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      onPress={(e) => { e.stopPropagation?.(); setExpanded(v => !v); }}>
      <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.burgundy, marginLeft: 8 }}>
        {expanded ? '접기' : '더보기'}
      </Text>
    </TouchableOpacity>
  ) : null;
  return (
    <View>
      {dateNode ? (
        // 날짜(고정) · 가변 spacer · 공개라벨(길면 말줄임) · 더보기(고정) — 좁은 기기에서도 한 줄 겹침 방지
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3 }}>
          <View style={{ flexShrink: 0 }}>{dateNode}</View>
          <View style={{ flex: 1, minWidth: 8 }} />
          {rightNode}
          {toggle}
        </View>
      ) : null}
      {!measured && (
        <Text style={[style, { position: 'absolute', left: 0, right: 0, opacity: 0 }]}
          onTextLayout={(e) => { setOverflow(e.nativeEvent.lines.length > lines); setMeasured(true); }}>
          {text}
        </Text>
      )}
      <Text style={style} numberOfLines={expanded ? undefined : lines}>{text}</Text>
      {!dateNode && toggle ? (
        <View style={{ marginTop: 5 }}>{toggle}</View>
      ) : null}
    </View>
  );
}

export const DiaryCard = React.memo(DiaryCardBase);
