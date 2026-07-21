import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Image } from 'expo-image'; // 상세 사진 그리드 디스크캐시 — 피드 카드(expo-image)와 캐시 공유로 '한 장씩 뜨는' 지연 제거 ([[image-load-speed]])
import { showAppAlert } from './AppAlert';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { Icon } from './common/Icon'; // 📷 → 커스텀 카메라
import { COURSE_TAGS, COURSE_TAG_COLORS, getCountryFlag } from '../constants/data';
import { dS } from '../styles/dS';
import { formatNameList } from '../utils/nameList';
import { UserContext } from '../contexts/UserContext';
import { TripleStripe } from './common/TripleStripe';
import { PhotoViewer } from './common/PhotoViewer';
import { DiaryAddModal } from './DiaryAddModal';
import { hofBgColor } from './HallOfFameCard';
import { resolvePhotoUri } from '../utils/photoStorage';
import { useAndroidBack } from '../hooks/useAndroidBack';
import { ownerVisibilityLabel, friendDisplayName } from '../utils/friendGroups';

export function DiaryDetail({ item, onClose, onUpdate, onDelete, onShare, isFirstSingle, friendGroups, friendMeta = {} }) {
  const { userProfile } = React.useContext(UserContext);
  const insets = useSafeAreaInsets();
  // 안드로이드 뒤로가기 — 상세 화면이 RN Modal이 아니라 직접 닫기 처리
  useAndroidBack(true, onClose);
  const [photoViewer, setPhotoViewer] = useState(false);
  const [viewerStart, setViewerStart] = useState(0);
  const [showEditModal, setShowEditModal] = useState(false);

  const hasBest = item.badge === '베스트';
  const isSpecial = item.special === 'HOLE IN ONE' || item.special === 'ALBATROSS' || item.special === 'EAGLE';
  const isMoment = item.kind === 'moment'; // 일상 — 스코어·구장·동반자 없이 날짜+글만 ([[moment-feed-extension]])
  // 공개범위(나만 보는 라벨) — 상세는 선택 그룹 전체 표시(색점+이름). 친구전체는 null ([[friend_groups]])
  const ovd = friendGroups ? ownerVisibilityLabel(friendGroups, item.visibility, item.audienceGroupIds) : null;
  const isSingle = !!item.score && item.score <= 79; // 싱글 — 80타 미만
  const hasPar = typeof item.par === 'number'; // 파생 라운드 등 par 누락 시 NaN/"par undefined" 노출 방지
  const diff = hasPar ? item.score - item.par : null;
  const diffLabel = diff == null ? '' : (diff > 0 ? `+${diff}` : `${diff}`);
  const companionsToShow = item.companions || [];

  const COMP_PALETTE = [
    { bg: '#C8D9E6', fg: C.navy },
    { bg: '#F5E6A8', fg: '#5A4500' },
    { bg: '#3D3935', fg: '#F5E6A8' },
    { bg: '#8B8680', fg: '#fff' },
  ];

  const photosToShow = item.photos || [];

  // 상세 진입 즉시 원격 사진(영상은 포스터)을 병렬 프리페치 → 그리드가 화면에 그려지길 기다리지 않고
  // 미리 디스크캐시에 적재해 '한 장씩 뜨는' 지연 제거. 로컬(file://)은 이미 디스크에 있어 제외 ([[image-load-speed]]).
  useEffect(() => {
    const uris = photosToShow
      .map((p) => {
        if (p && typeof p === 'object') {
          if (p.type === 'video') return p.poster ? resolvePhotoUri(p.poster) : null;
          return resolvePhotoUri(p.uri);
        }
        return resolvePhotoUri(p);
      })
      .filter((u) => typeof u === 'string' && /^https?:/.test(u));
    if (uris.length) Image.prefetch(uris, { cachePolicy: 'memory-disk' });
  }, [item.id]);

  const handleDelete = () => {
    // 삭제는 단일 동작으로 통일 — 기록 + 연결된 개인 일정 함께 삭제(라운지 일정은 보호).
    // '기록만/전체' 두 갈래는 자동일정 폐지 후 구분 실익이 없어 단순화. ([[diary-schedule-orphan-fix]])
    // 확인창은 손실 규모를 명시 — 라운딩 기록 삭제는 기록 본체 외 가계부 비용·통계·연결 일정·명전까지
    //   연쇄로 사라지고 복구 불가. '이 기록 삭제할까요?'만으론 약해 가벼운 라운지 가리기보다도 경고가 빈약했음.
    showAppAlert(
      isMoment ? '일상 기록 삭제' : '라운딩 기록 삭제',
      isMoment
        ? '사진·메모가 사라져요.\n한 번 삭제하면 되살릴 수 없어요.'
        : '사진·스코어·메모는 물론\n가계부 비용·통계 기록까지 함께 사라져요.\n한 번 삭제하면 되살릴 수 없어요.',
      [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: () => onDelete && onDelete(item, 'all') },
      ],
    );
  };


  // 하단 edge 제외 — 이 화면은 탭바 위에 얹히는 탭 콘텐츠라, 하단 inset을 넣으면 탭바와 사이에 빈 띠(벽)가 생김.
  // HomeScreen·GuideScreen 등 탭 콘텐츠와 동일하게 top/left/right만(2026-06-15 안드·iOS 공통 증상)
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: isSpecial ? '#F5F0E4' : C.bgPrimary }} edges={['top', 'left', 'right']}>
      <View style={[dS.detailHdr, isSpecial && { borderBottomColor: '#C9A84C44' }]}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={dS.backBtn}>←</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {/* 카드 공유 — 내 닉네임(상세는 항상 내 기록이라 잉여) 자리로 이동. 배지 줄에서 밀리던 문제 해결(2026-06-15 사용자).
              라운딩만(일상은 onShare undefined). 다이어리 골드 펄 ([[score-brag-card]]) */}
          {onShare && (
            <TouchableOpacity onPress={() => onShare(item)} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              style={[dS.detailHdrNickname, { backgroundColor: '#8B6914', flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
              <Text style={{ fontSize: fs(11) }}>🔗</Text>
              <Text style={dS.detailHdrNicknameTxt}>카드 공유</Text>
            </TouchableOpacity>
          )}
          {/* 수정=네이비 / 삭제=버건디(위험) — 박스 없이 텍스트만, 볼드+색 구분으로 또렷하게(사용자 2026-06-19) */}
          <TouchableOpacity onPress={() => setShowEditModal(true)} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.navy }}>수정</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.burgundy }}>삭제</Text>
          </TouchableOpacity>
        </View>
      </View>
      {(isSpecial || isFirstSingle)
        ? <View style={{ flexDirection: 'row', height: 3 }}>
            <View style={{ flex: 1, backgroundColor: '#C9A84C' }} />
            <View style={{ flex: 1, backgroundColor: '#E8D9A0' }} />
            <View style={{ flex: 1, backgroundColor: '#8B6914' }} />
          </View>
        : <TripleStripe />
      }
      <ScrollView showsVerticalScrollIndicator={false}>
        {(isSpecial || isFirstSingle) && (
          <View style={[dS.specialBanner, { backgroundColor: hofBgColor(isSpecial ? item.special : '퍼스트 싱글') }]}>
            <Text style={dS.specialBannerSub}>달성</Text>
            <Text style={dS.specialBannerTitle}>{isSpecial ? item.special : 'FIRST SINGLE'}</Text>
            <Text style={dS.specialBannerSub}>{isSpecial ? (Number.isFinite(item.specialHole) ? `${item.specialHole}번홀 기록` : '기록 달성') : `${item.score}타 기록`}</Text>
          </View>
        )}
        <View style={[dS.detailInfoArea, (isSpecial || isFirstSingle) && { borderBottomColor: '#C9A84C33' }]}>
          {/* 공개범위 — 스코어 위 좌측 캡션(우측 정렬 시 좌측이 비어 떠 보여 좌측 정렬로). 선택 그룹 전체 표시 ([[friend_groups]]) */}
          {ovd && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', alignItems: 'center', gap: 8, marginTop: -12, marginBottom: 6 }}>
              {ovd.groups && ovd.groups.length
                ? ovd.groups.map((g, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: g.color }} />
                      <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>{g.name}</Text>
                    </View>
                  ))
                : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      {ovd.icon ? <Text style={{ fontSize: fs(10) }}>{ovd.icon}</Text> : null}
                      <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>{ovd.text}</Text>
                    </View>
                  )}
            </View>
          )}
          {isMoment ? (
            <>
              {/* 일상은 구장·스코어가 없어 날짜가 사실상 제목 — 본문(fs15 sys)과 위계가 안 갈려 굵고 크게 보강(공유 detailCourseTxt 대신 전용, 2026-06-13) */}
              <Text style={{ fontFamily: F.sysB, fontSize: fs(18), color: C.charcoal, letterSpacing: 0.3 }}>{item.date} {item.day}</Text>
              {item.memo ? (
                <Text style={{ fontFamily: F.sys, fontSize: fs(15), color: C.textPrimary, lineHeight: 24, marginTop: 12 }}>
                  {item.memo}
                </Text>
              ) : null}
            </>
          ) : (
          <>
          <View style={dS.detailScoreRow}>
            <Text style={[dS.detailScore, isSingle && { color: '#C9A84C' }, hasBest && { color: C.burgundy }, isSpecial && { color: '#8B6914' }]}>{item.score}</Text>
            <Text style={[dS.detailScoreUnit, isSingle && { color: '#C9A84C' }, hasBest && { color: C.burgundy }, isSpecial && { color: '#8B6914' }]}>타</Text>
            {/* par 72 + 버디 배지를 가운데정렬 묶음으로 — 배지를 스코어 줄 par 옆에 (baseline 직접 배치 시 어정쩡하게 떨어지는 것 회피) */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={dS.detailScoreSub}>{hasPar ? `${diffLabel} · par ${item.par}` : ''}</Text>
              {item.birdieCount > 0 && (
                <View style={{ backgroundColor: '#3D3935', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: '#F5E6A8' }}>버디 ×{item.birdieCount}</Text>
                </View>
              )}
            </View>
          </View>
          {/* 싱글 배지 — 헤드라인 성취라 점수 아래 전용 줄. 버디는 위 스코어 줄로 이동(2026-06-23).
              특별(홀인원·알바·이글) 뱃지는 상단 specialBanner에 이미 크게 표시돼 여기선 생략(중복 제거) */}
          {isSingle && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <View style={{
                backgroundColor: '#C9A84C',
                borderRadius: 12, paddingHorizontal: 12, paddingVertical: 3,
                minWidth: 52, alignItems: 'center',
              }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: '#2A2622' }}>싱글</Text>
              </View>
            </View>
          )}
          {/* 구장명(+코스)을 윗줄, 날짜·날씨를 아랫줄로 분리 — 구장명이 길어 두 줄이 될 때
              날짜·날씨가 중간에 끼어 애매하게 잘리는 것 방지(사용자 2026-06-20). 코스(세부코스)는 구장명 같은 줄. */}
          <View style={{ marginBottom: 16 }}>
            {/* 구장명 = 제목 위계로 키우고 굵게(아래 날짜 fs12 sys와 구분) */}
            <Text style={[dS.detailCourseTxt, { marginBottom: 0, fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal }]}>{item.course}{item.subCourse ? ` · ${item.subCourse}` : ''}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 3 }}>
              <Text style={[dS.detailCourseTxt, { marginBottom: 0 }]}>{item.date} {item.day}{item.time ? ` · ${item.time}` : ''} · {item.weather}</Text>
              {item.overseas && item.country ? (
                <View style={{ backgroundColor: C.paleSky, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  {getCountryFlag(item.country) ? <Text style={{ fontSize: fs(12) }}>{getCountryFlag(item.country)}</Text> : null}
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(10), color: C.navy }}>{item.country}</Text>
                </View>
              ) : null}
            </View>
          </View>
          {item.tags && item.tags.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
              {item.tags.map(tag => {
                const entry = Object.entries(COURSE_TAGS).find(([, tags]) => tags.includes(tag));
                const color = entry ? COURSE_TAG_COLORS[entry[0]] : { bg: C.bgSecondary, text: C.warmGrayLight };
                return (
                  <View key={tag} style={{
                    backgroundColor: color.bg,
                    paddingHorizontal: 10, paddingVertical: 4,
                    borderRadius: 12,
                  }}>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: color.text }}>{tag}</Text>
                  </View>
                );
              })}
            </View>
          )}
          <View style={[dS.detailMemoBox, isSpecial && { borderLeftColor: '#C9A84C' }]}>
            <Text style={dS.detailMemoTxt}>"{item.memo}"</Text>
          </View>
          {item.detailMemo ? (
            <View style={{
              marginBottom: 16,
              backgroundColor: C.bgSecondary,
              borderRadius: 10, padding: 14,
              borderWidth: 0.5, borderColor: C.hairline,
            }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGray, letterSpacing: 1.5, marginBottom: 8 }}>더 기록하기</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.textPrimary, lineHeight: 22 }}>{item.detailMemo}</Text>
            </View>
          ) : null}
          <View style={dS.companionArea}>
            <Text style={dS.companionLabel}>동반자</Text>
            <View style={{ flex: 1 }}>
              <View style={dS.avatarLine}>
                <View style={dS.avatarRow}>
                  {companionsToShow.map((c, i) => {
                    const others = companionsToShow.filter(x => !x.isMe);
                    const colorIdx = others.indexOf(c);
                    const palette = c.isMe
                      ? { bg: '#6B1E2A', fg: '#F5E6A8' }
                      : COMP_PALETTE[colorIdx % COMP_PALETTE.length];
                    return (
                      <View key={i} style={[dS.avatar, { backgroundColor: palette.bg, marginLeft: i === 0 ? 0 : -8 }]}>
                        <Text style={[dS.avatarTxt, { color: palette.fg }]}>{(friendDisplayName(friendMeta, c.friendUid, c.name) || '?').charAt(0)}</Text>
                      </View>
                    );
                  })}
                </View>
                <Text style={dS.compNames} numberOfLines={1}>
                  {formatNameList(companionsToShow.map(c => friendDisplayName(friendMeta, c.friendUid, c.name)))}
                </Text>
              </View>
            </View>
          </View>
          {/* 홀별 스코어 — 스코어카드로 입력한 경우만 노출. 총타만 입력 시 미표시(현재처럼 깔끔) */}
          {Array.isArray(item.holeScores) && item.holeScores.some(n => Number.isFinite(n)) && (() => {
            const hs = item.holeScores;
            const sum = (a) => a.reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0);
            const front = sum(hs.slice(0, 9)), back = sum(hs.slice(9, 18));
            const cellBox = { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 5, borderRightWidth: 0.5, borderColor: C.hairline };
            const sideBox = { width: 34, alignItems: 'center', justifyContent: 'center', paddingVertical: 5, borderColor: C.hairline };
            const numTxt = { fontFamily: F.sys, fontSize: fs(11), color: C.warmGray };
            const scoreTxt = { fontFamily: F.sysSb, fontSize: fs(13), color: C.textPrimary };
            const labelTxt = { fontFamily: F.sysSb, fontSize: fs(10), color: C.warmGray, letterSpacing: 0.5 };
            const nums = (s) => Array.from({ length: 9 }, (_, k) => s + k + 1);
            const scores = (s) => Array.from({ length: 9 }, (_, k) => { const v = hs[s + k]; return Number.isFinite(v) ? v : '-'; });
            const hp = item.holePars;
            const hasPar = Array.isArray(hp) && hp.some(n => Number.isFinite(n));
            const pars = (s) => Array.from({ length: 9 }, (_, k) => { const v = hp?.[s + k]; return Number.isFinite(v) ? v : '-'; });
            const parFront = hasPar ? sum(hp.slice(0, 9)) : null;
            const parBack = hasPar ? sum(hp.slice(9, 18)) : null;
            const mutedTxt = { fontFamily: F.sys, fontSize: fs(12), color: C.warmGray };
            const row = (label, cells, totalText, opt = {}) => (
              <View style={{ flexDirection: 'row',
                borderBottomWidth: opt.header ? 0.5 : 0, borderTopWidth: opt.topBorder ? 0.5 : 0, borderColor: C.hairline,
                backgroundColor: opt.header ? C.bgSecondary : opt.tint ? 'rgba(107,30,42,0.06)' : 'transparent' }}>
                <View style={[sideBox, { borderRightWidth: 0.5 }]}><Text style={labelTxt}>{label}</Text></View>
                {cells.map((c, i) => (
                  <View key={i} style={cellBox}><Text style={opt.header ? numTxt : opt.muted ? mutedTxt : scoreTxt}>{c}</Text></View>
                ))}
                <View style={sideBox}>
                  <Text style={opt.header ? labelTxt : opt.muted ? mutedTxt : { ...scoreTxt, color: C.burgundy }}>{totalText}</Text>
                </View>
              </View>
            );
            // 홀별 골프식 표기 — 공유 스코어카드와 동일 규칙(파=연골드 빈 원/버디=버건디 채움/이글=골드 채움/홀인원·알바트로스=골드+버건디 링/보기=숫자 하단 짧은 밑줄/더블+=표시 없음).
            //   흰 표 바탕에 맞춰 색 조정(빨강 X). par 없으면 평범 표시. [[golfer-score-psychology]]
            const UNDER = 'rgba(60,56,50,0.65)'; // 보기 밑줄 — 중립 그레이(흐림은 안 보여 밑줄로 되돌림, 사용자 2026-06-15)
            const tierOf = (i) => {
              const v = hs[i];
              if (!Number.isFinite(v)) return 'none';
              const p = hp?.[i];
              const d = Number.isFinite(p) ? v - p : null;
              if (v === 1 || (d != null && d <= -3)) return 'ace';
              if (d === -2) return 'eagle';
              if (d === -1) return 'birdie';
              if (d === 0) return 'par';
              if (d === 1) return 'bogey';
              if (d != null && d >= 2) return 'dbogey';
              return 'over';
            };
            const scoreCell = (i) => {
              const v = hs[i];
              const t = tierOf(i);
              const circ = t === 'par' || t === 'birdie' || t === 'eagle' || t === 'ace';
              let bg = 'transparent', bw = 0, bc = 'transparent', tcol = C.textPrimary;
              if (t === 'birdie') { bg = '#6B1E2A'; tcol = '#fff'; }
              else if (t === 'eagle') { bg = '#C9A84C'; tcol = '#3D2A00'; }
              else if (t === 'ace') { bg = '#C9A84C'; tcol = '#3D2A00'; bw = 1.5; bc = '#6B1E2A'; }
              else if (t === 'par') { bw = 1.2; bc = 'rgba(201,168,76,0.55)'; }
              return (
                <View key={i} style={cellBox}>
                  {circ ? (
                    <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: bg, borderWidth: bw, borderColor: bc }}>
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: tcol }}>{Number.isFinite(v) ? v : '-'}</Text>
                    </View>
                  ) : (
                    // par 외(보기·더블+·over) — 숫자를 원형 셀과 동일한 22 높이 박스 중앙에 고정(정렬 통일).
                    //   보기 밑줄은 절대배치라 숫자 위치에 영향 없음 → 숫자 높이 물결 방지(사용자 2026-06-19).
                    <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={scoreTxt}>{Number.isFinite(v) ? v : '-'}</Text>
                      {t === 'bogey' && (
                        <View style={{ position: 'absolute', bottom: 1, height: 1.6, width: 5, backgroundColor: UNDER, borderRadius: 1 }} />
                      )}
                    </View>
                  )}
                </View>
              );
            };
            const scoreRow = (start, total) => (
              <View style={{ flexDirection: 'row', backgroundColor: 'rgba(107,30,42,0.06)' }}>
                <View style={[sideBox, { borderRightWidth: 0.5 }]}><Text style={labelTxt}>타수</Text></View>
                {Array.from({ length: 9 }, (_, k) => scoreCell(start + k))}
                <View style={sideBox}><Text style={{ ...scoreTxt, color: C.burgundy }}>{total}</Text></View>
              </View>
            );
            return (
              <View style={{ marginTop: 16 }}>
                <Text style={[dS.companionLabel, { marginTop: 0, marginBottom: 10 }]}>홀별 스코어</Text>
                <View style={{ borderWidth: 0.5, borderColor: C.hairline, borderRadius: 8, overflow: 'hidden' }}>
                  {row('홀', nums(0), 'T', { header: true })}
                  {hasPar && row('par', pars(0), parFront, { muted: true })}
                  {scoreRow(0, front)}
                  {row('홀', nums(9), 'T', { header: true, topBorder: true })}
                  {hasPar && row('par', pars(9), parBack, { muted: true })}
                  {scoreRow(9, back)}
                </View>
              </View>
            );
          })()}
          </>
          )}
        </View>
        {(photosToShow.length > 0 || !isMoment) && (
        <View style={dS.photosArea}>
          <Text style={[dS.photosLabel, { marginBottom: 10 }]}>사진 · 영상</Text>
          {/* 사진 추가·대표지정·회전·자르기·삭제는 모두 '수정'에서 — 상세는 보기 전용(탭→전체화면) ([[cover-focal-point]]) */}
          {photosToShow.length === 0 ? (
            // 사진 미등록 — 탭하면 수정(DiaryAddModal) 진입.
            <TouchableOpacity activeOpacity={0.85} onPress={() => setShowEditModal(true)}
              style={{ paddingVertical: 18, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center',
                backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline }}>
              <Icon name="camera" size={fs(26)} color={C.charcoal} strokeWidth={1.8} />
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, textAlign: 'center', lineHeight: 20, marginTop: 8 }}>
                사진을 등록하면 미리보기에{'\n'}대표 사진이 표시돼요.{'\n'}그날 라운딩의 순간을{'\n'}언제든 다시 볼 수 있어요.
              </Text>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.burgundy, textAlign: 'center', marginTop: 10 }}>
                [수정]에서 사진 추가·편집하기
              </Text>
            </TouchableOpacity>
          ) : (
          <View style={dS.photosGrid}>
            {photosToShow.map((uri, i) => {
              const src = resolvePhotoUri(typeof uri === 'object' ? uri.uri : uri);
              return (
                <TouchableOpacity key={i}
                  onPress={() => { setViewerStart(i); setPhotoViewer(true); }}
                  style={dS.photoGridItem}>
                  <GridThumb item={uri} src={src} />
                  {i === 0 && (
                    <View style={{ position: 'absolute', top: 6, left: 6, backgroundColor: C.burgundy, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(8), color: '#fff' }}>대표</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
          )}
        </View>
        )}
        {/* 하단 여백 — 상세는 탭 화면 위에 뜨는 구조라 플로팅 탭바(≈insets.bottom+66)가 계속 보인다.
            40px 고정이라 마지막 사진이 탭바에 가린 채 더 스크롤되지 않던 문제(사용자 2026-07-22).
            내 기록 피드와 같은 값(insets.bottom+92)으로 맞춤. */}
        <View style={{ height: insets.bottom + 92 }} />
      </ScrollView>
      {photoViewer && <PhotoViewer photos={photosToShow} startIndex={viewerStart} onClose={() => setPhotoViewer(false)} />}
      {/* 사진 편집(대표지정·회전·자르기·삭제)은 DiaryAddModal('수정')로 일원화 — 상세의 편집 모드 제거 */}
      <DiaryAddModal
        visible={showEditModal}
        onClose={() => setShowEditModal(false)}
        initial={item}
        isEdit
        onSave={async (type, data) => {
          if (type === 'diary-edit') {
            // 저장 실패(false) 시 모달을 닫지 않고 false를 전파 — DiaryAddModal이 입력 보존+안내(회귀 방지)
            const ok = await (onUpdate ? onUpdate({ ...item, ...data }) : undefined);
            if (ok === false) return false;
            setShowEditModal(false);
          }
        }}
      />
    </SafeAreaView>
  );
}

function GridThumb({ item, src }) {
  const isVideo = typeof item === 'object' && item?.type === 'video';
  const poster = isVideo && item?.poster ? resolvePhotoUri(item.poster) : null;
  const [thumb, setThumb] = useState(poster || null);
  const [broken, setBroken] = useState(false);   // 로드 실패(파일 소실·iCloud 미다운로드) → 검정 대신 안내

  useEffect(() => {
    if (!isVideo) return;
    if (poster) { setThumb(poster); return; } // 업로드된 포스터 우선(안드 원격 생성 회피)
    let cancelled = false;
    (async () => {
      try {
        const { uri } = await VideoThumbnails.getThumbnailAsync(src, { time: 0, quality: 0.6 });
        if (!cancelled) setThumb(uri);
      } catch (e) {
        if (!cancelled) console.warn('thumbnail failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [isVideo, src, poster]);

  if (isVideo) {
    return (
      <View style={{ flex: 1 }}>
        {thumb ? (
          <Image source={{ uri: thumb }} style={dS.photoGridImg} contentFit="cover" cachePolicy="memory-disk" transition={150} />
        ) : (
          <View style={[dS.photoGridImg, { backgroundColor: '#2A2622' }]} />
        )}
        <View style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <View style={{
            width: 32, height: 32, borderRadius: 16,
            backgroundColor: 'rgba(0,0,0,0.55)',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ color: '#fff', fontSize: fs(14), marginLeft: 2 }}>▶</Text>
          </View>
        </View>
      </View>
    );
  }

  // 사진 로드 실패 — 검정/회색 대신 '다시 첨부' 안내(진단 로그로 원인 추적)
  if (broken) {
    return (
      <View style={[dS.photoGridImg, { backgroundColor: C.bgSecondary, alignItems: 'center', justifyContent: 'center', padding: 6 }]}>
        <Text style={{ fontSize: fs(16) }}>🖼️</Text>
        <Text style={{ fontFamily: F.sys, fontSize: fs(9), color: C.warmGray, textAlign: 'center', marginTop: 3, lineHeight: 12 }}>
          불러올 수 없어요{'\n'}수정에서 다시 첨부
        </Text>
      </View>
    );
  }
  return <Image source={{ uri: src }} style={dS.photoGridImg} contentFit="cover" cachePolicy="memory-disk" transition={150}
    onError={() => { if (__DEV__) console.warn('[diaryPhoto] 미리보기 로드 실패', src); setBroken(true); }} />;
}
