import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, Alert } from 'react-native';
import { showAppAlert } from './AppAlert';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
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

export function DiaryDetail({ item, onClose, onUpdate, onDelete, isFirstSingle }) {
  const { userProfile } = React.useContext(UserContext);
  // 안드로이드 뒤로가기 — 상세 화면이 RN Modal이 아니라 직접 닫기 처리
  useAndroidBack(true, onClose);
  const [photoViewer, setPhotoViewer] = useState(false);
  const [viewerStart, setViewerStart] = useState(0);
  const [showEditModal, setShowEditModal] = useState(false);

  const hasBest = item.badge === '베스트';
  const isSpecial = item.special === 'HOLE IN ONE' || item.special === 'ALBATROSS' || item.special === 'EAGLE';
  const isMoment = item.kind === 'moment'; // 일상 — 스코어·구장·동반자 없이 날짜+글만 ([[moment-feed-extension]])
  const isSingle = !!item.score && item.score <= 79; // 싱글 — 80타 미만
  const diff = item.score - item.par;
  const diffLabel = diff > 0 ? `+${diff}` : `${diff}`;
  const companionsToShow = item.companions || [];

  const COMP_PALETTE = [
    { bg: '#C8D9E6', fg: C.navy },
    { bg: '#F5E6A8', fg: '#5A4500' },
    { bg: '#3D3935', fg: '#F5E6A8' },
    { bg: '#8B8680', fg: '#fff' },
  ];

  const photosToShow = item.photos || [];

  const handleDelete = () => {
    // 삭제는 단일 동작으로 통일 — 기록 + 연결된 개인 일정 함께 삭제(라운지 일정은 보호).
    // '기록만/전체' 두 갈래는 자동일정 폐지 후 구분 실익이 없어 단순화. ([[diary-schedule-orphan-fix]])
    showAppAlert(
      isMoment ? '일상 삭제' : '라운딩 삭제',
      isMoment ? '이 일상 기록을 삭제할까요?' : '이 라운딩 기록을 삭제할까요?',
      [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: () => onDelete && onDelete(item, 'all') },
      ],
    );
  };


  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: isSpecial ? '#F5F0E4' : C.bgPrimary }}>
      <View style={[dS.detailHdr, isSpecial && { borderBottomColor: '#C9A84C44' }]}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={dS.backBtn}>←</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={[dS.detailHdrNickname, isSpecial && { backgroundColor: '#8B6914' }]}>
            <Text style={dS.detailHdrNicknameTxt}>{userProfile.nickname}</Text>
          </View>
          <TouchableOpacity onPress={() => setShowEditModal(true)}>
            <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: C.burgundy }}>수정</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete}>
            <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: C.warmGray }}>삭제</Text>
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
            <Text style={dS.specialBannerSub}>{isSpecial ? `${item.specialHole}번홀 기록` : `${item.score}타 기록`}</Text>
          </View>
        )}
        <View style={[dS.detailInfoArea, (isSpecial || isFirstSingle) && { borderBottomColor: '#C9A84C33' }]}>
          {isMoment ? (
            <>
              <Text style={dS.detailCourseTxt}>{item.date} {item.day}</Text>
              {item.memo ? (
                <Text style={{ fontFamily: F.sys, fontSize: fs(15), color: C.textPrimary, lineHeight: 24, marginTop: 10 }}>
                  {item.memo}
                </Text>
              ) : null}
            </>
          ) : (
          <>
          <View style={dS.detailScoreRow}>
            <Text style={[dS.detailScore, isSingle && { color: '#C9A84C' }, hasBest && { color: C.burgundy }, isSpecial && { color: '#8B6914' }]}>{item.score}</Text>
            <Text style={[dS.detailScoreUnit, isSingle && { color: '#C9A84C' }, hasBest && { color: C.burgundy }, isSpecial && { color: '#8B6914' }]}>타</Text>
            <Text style={dS.detailScoreSub}>{diffLabel} · par {item.par}</Text>
            {isSingle && (
              <View style={{
                backgroundColor: '#C9A84C',
                borderRadius: 12, paddingHorizontal: 12, paddingVertical: 3,
                minWidth: 52, alignItems: 'center', alignSelf: 'center',
              }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: '#2A2622' }}>싱글</Text>
              </View>
            )}
            {item.special && (
              <View style={{
                backgroundColor: item.special === 'HOLE IN ONE' ? '#2A2622' : '#6B1E2A',
                borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3,
                alignSelf: 'center',
              }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: item.special === 'HOLE IN ONE' ? '#C9A84C' : '#F5E6A8' }}>{item.special}</Text>
              </View>
            )}
            {item.birdieCount > 0 && (
              <View style={{
                backgroundColor: '#3D3935',
                borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3,
                alignSelf: 'center',
              }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: '#F5E6A8' }}>버디 ×{item.birdieCount}</Text>
              </View>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={dS.detailCourseTxt}>{item.course} · {item.date} {item.day} · {item.weather}</Text>
            {item.overseas && item.country ? (
              <View style={{ backgroundColor: C.paleSky, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                {getCountryFlag(item.country) ? <Text style={{ fontSize: fs(12) }}>{getCountryFlag(item.country)}</Text> : null}
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(10), color: C.navy }}>{item.country}</Text>
              </View>
            ) : null}
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
                        <Text style={[dS.avatarTxt, { color: palette.fg }]}>{(c.name || '?').charAt(0)}</Text>
                      </View>
                    );
                  })}
                </View>
                <Text style={dS.compNames} numberOfLines={1}>
                  {formatNameList(companionsToShow.map(c => c.name))}
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
            return (
              <View style={{ marginTop: 16 }}>
                <Text style={[dS.companionLabel, { marginTop: 0, marginBottom: 10 }]}>홀별 스코어</Text>
                <View style={{ borderWidth: 0.5, borderColor: C.hairline, borderRadius: 8, overflow: 'hidden' }}>
                  {row('홀', nums(0), 'T', { header: true })}
                  {hasPar && row('par', pars(0), parFront, { muted: true })}
                  {row('타수', scores(0), front, { tint: true })}
                  {row('홀', nums(9), 'T', { header: true, topBorder: true })}
                  {hasPar && row('par', pars(9), parBack, { muted: true })}
                  {row('타수', scores(9), back, { tint: true })}
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
              style={{ paddingVertical: 18, paddingHorizontal: 16, borderRadius: 12,
                backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, textAlign: 'center', lineHeight: 20 }}>
                📷 사진을 등록하면 미리보기에{'\n'}대표 사진이 표시돼요.{'\n'}그날 라운딩의 순간을{'\n'}언제든 다시 볼 수 있어요.
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
        <View style={{ height: 40 }} />
      </ScrollView>
      {photoViewer && <PhotoViewer photos={photosToShow} startIndex={viewerStart} onClose={() => setPhotoViewer(false)} />}
      {/* 사진 편집(대표지정·회전·자르기·삭제)은 DiaryAddModal('수정')로 일원화 — 상세의 편집 모드 제거 */}
      <DiaryAddModal
        visible={showEditModal}
        onClose={() => setShowEditModal(false)}
        initial={item}
        isEdit
        onSave={(type, data) => {
          if (type === 'diary-edit') {
            onUpdate && onUpdate({ ...item, ...data });
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
          <Image source={{ uri: thumb }} style={dS.photoGridImg} resizeMode="cover" />
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

  return <Image source={{ uri: src }} style={dS.photoGridImg} resizeMode="cover" />;
}
