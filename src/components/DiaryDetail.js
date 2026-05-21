import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, Alert } from 'react-native';
import { showAppAlert } from './AppAlert';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F } from '../constants/colors';
import { COURSE_TAGS, COURSE_TAG_COLORS } from '../constants/data';
import { dS } from '../styles/dS';
import { UserContext } from '../contexts/UserContext';
import { TripleStripe } from './common/TripleStripe';
import { PhotoViewer } from './common/PhotoViewer';
import { DiaryAddModal } from './DiaryAddModal';
import { PhotoEditModal } from './PhotoEditModal';
import { persistPhoto, resolvePhotoUri } from '../utils/photoStorage';

export function DiaryDetail({ item, onClose, onUpdate, onDelete }) {
  const { userProfile } = React.useContext(UserContext);
  const [photoViewer, setPhotoViewer] = useState(false);
  const [viewerStart, setViewerStart] = useState(0);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editPhotos, setEditPhotos] = useState(item.photos || []);
  const [editorIndex, setEditorIndex] = useState(null);

  useEffect(() => {
    setEditPhotos(item.photos || []);
  }, [item.photos]);
  const hasBest = item.badge === '베스트';
  const isSpecial = item.special === 'HOLE IN ONE' || item.special === 'ALBATROSS' || item.special === 'EAGLE';
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
    showAppAlert(
      '라운딩 삭제',
      '어떻게 삭제할까요?',
      [
        { text: '다이어리 기록만 삭제', onPress: () => onDelete && onDelete(item, 'diaryOnly') },
        { text: '전체 삭제 (일정까지)', style: 'destructive', onPress: () => onDelete && onDelete(item, 'all') },
        { text: '취소', style: 'cancel' },
      ],
    );
  };

  const handlePhotoLongPress = (index) => {
    if (!isEditing) return;
    showAppAlert(
      '사진 옵션',
      null,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '대표사진으로 지정',
          onPress: () => {
            if (index === 0) return;
            setEditPhotos(prev => {
              const next = [...prev];
              const [picked] = next.splice(index, 1);
              next.unshift(picked);
              return next;
            });
          },
        },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => {
            setEditPhotos(prev => prev.filter((_, i) => i !== index));
          },
        },
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
            <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.burgundy }}>수정</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete}>
            <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.warmGray }}>삭제</Text>
          </TouchableOpacity>
        </View>
      </View>
      {isSpecial
        ? <View style={{ flexDirection: 'row', height: 3 }}>
            <View style={{ flex: 1, backgroundColor: '#C9A84C' }} />
            <View style={{ flex: 1, backgroundColor: '#E8D9A0' }} />
            <View style={{ flex: 1, backgroundColor: '#8B6914' }} />
          </View>
        : <TripleStripe />
      }
      <ScrollView showsVerticalScrollIndicator={false}>
        {isSpecial && (
          <View style={[dS.specialBanner,
            item.special === 'HOLE IN ONE' && { backgroundColor: '#2A2622' },
            item.special === 'EAGLE' && { backgroundColor: '#6B6660' },
            item.special === 'ALBATROSS' && { backgroundColor: C.burgundy },
          ]}>
            <Text style={dS.specialBannerSub}>달성</Text>
            <Text style={dS.specialBannerTitle}>{item.special}</Text>
            <Text style={dS.specialBannerSub}>{item.specialHole}번홀 기록</Text>
          </View>
        )}
        <View style={[dS.detailInfoArea, isSpecial && { borderBottomColor: '#C9A84C33' }]}>
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
                <Text style={{ fontFamily: F.sys, fontSize: 11, color: '#2A2622', fontWeight: '600' }}>싱글</Text>
              </View>
            )}
            {item.special && (
              <View style={{
                backgroundColor: item.special === 'HOLE IN ONE' ? '#2A2622' : '#6B1E2A',
                borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3,
                alignSelf: 'center',
              }}>
                <Text style={{ fontFamily: F.sys, fontSize: 11, color: item.special === 'HOLE IN ONE' ? '#C9A84C' : '#F5E6A8', fontWeight: '600' }}>{item.special}</Text>
              </View>
            )}
            {item.birdieCount > 0 && (
              <View style={{
                backgroundColor: '#3D3935',
                borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3,
                alignSelf: 'center',
              }}>
                <Text style={{ fontFamily: F.sys, fontSize: 11, color: '#F5E6A8', fontWeight: '600' }}>버디 ×{item.birdieCount}</Text>
              </View>
            )}
          </View>
          <Text style={dS.detailCourseTxt}>{item.course} · {item.date} {item.day} · {item.weather}</Text>
          {item.tags && item.tags.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, marginBottom: 4 }}>
              {item.tags.map(tag => {
                const entry = Object.entries(COURSE_TAGS).find(([, tags]) => tags.includes(tag));
                const color = entry ? COURSE_TAG_COLORS[entry[0]] : { bg: C.bgSecondary, text: C.warmGrayLight };
                return (
                  <View key={tag} style={{
                    backgroundColor: color.bg,
                    paddingHorizontal: 10, paddingVertical: 4,
                    borderRadius: 12,
                  }}>
                    <Text style={{ fontFamily: F.sys, fontSize: 11, color: color.text }}>{tag}</Text>
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
              marginTop: 12, marginBottom: 14,
              backgroundColor: C.bgSecondary,
              borderRadius: 10, padding: 14,
              borderWidth: 0.5, borderColor: C.hairline,
            }}>
              <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, letterSpacing: 1.5, marginBottom: 8 }}>더 기록하기</Text>
              <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.textPrimary, lineHeight: 22 }}>{item.detailMemo}</Text>
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
                  {companionsToShow.map(c => c.name).join(' · ')}
                </Text>
              </View>
            </View>
          </View>
        </View>
        <View style={dS.photosArea}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <Text style={dS.photosLabel}>사진 · 영상</Text>
            {isEditing ? (
              <View style={{ flexDirection: 'row', gap: 14 }}>
                <TouchableOpacity onPress={() => {
                  setEditPhotos(item.photos || []);
                  setIsEditing(false);
                }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.warmGray }}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => {
                  onUpdate && onUpdate({ ...item, photos: editPhotos });
                  setIsEditing(false);
                }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.burgundy, fontWeight: '600' }}>완료</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => setIsEditing(true)}>
                <Text style={{ fontFamily: F.sys, fontSize: 13, color: C.burgundy }}>편집</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={dS.photosGrid}>
            {(isEditing ? editPhotos : photosToShow).map((uri, i) => {
              const src = resolvePhotoUri(typeof uri === 'object' ? uri.uri : uri);
              return (
                <TouchableOpacity key={i}
                  onPress={() => {
                    if (isEditing) {
                      const isVideo = typeof uri === 'object' && uri?.type === 'video';
                      if (isVideo) {
                        showAppAlert('편집 불가', '동영상은 회전 편집을 지원하지 않습니다.\n길게 눌러 대표 지정/삭제만 가능해요.');
                        return;
                      }
                      setEditorIndex(i);
                    } else { setViewerStart(i); setPhotoViewer(true); }
                  }}
                  onLongPress={() => handlePhotoLongPress(i)}
                  delayLongPress={400}
                  style={dS.photoGridItem}>
                  <GridThumb item={uri} src={src} />
                  {i === 0 && (
                    <View style={{ position: 'absolute', top: 6, left: 6, backgroundColor: C.burgundy, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
                      <Text style={{ fontFamily: F.sys, fontSize: 8, color: '#fff' }}>대표</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
      {photoViewer && <PhotoViewer photos={photosToShow} startIndex={viewerStart} onClose={() => setPhotoViewer(false)} />}
      <PhotoEditModal
        visible={editorIndex !== null}
        uri={editorIndex !== null ? resolvePhotoUri(typeof editPhotos[editorIndex] === 'object' ? editPhotos[editorIndex].uri : editPhotos[editorIndex]) : null}
        onClose={() => setEditorIndex(null)}
        onSave={async (newUri) => {
          // 회전 등 편집 결과(임시 캐시 uri)를 영구 저장
          const persisted = await persistPhoto(newUri);
          setEditPhotos(prev => {
            const next = [...prev];
            const orig = next[editorIndex];
            next[editorIndex] = typeof orig === 'object' ? { ...orig, uri: persisted } : persisted;
            return next;
          });
          setEditorIndex(null);
        }}
      />
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
  const [thumb, setThumb] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!isVideo) return;
    (async () => {
      try {
        const { uri } = await VideoThumbnails.getThumbnailAsync(src, { time: 0, quality: 0.6 });
        if (!cancelled) setThumb(uri);
      } catch (e) {
        if (!cancelled) console.warn('thumbnail failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [isVideo, src]);

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
            <Text style={{ color: '#fff', fontSize: 14, marginLeft: 2 }}>▶</Text>
          </View>
        </View>
      </View>
    );
  }

  return <Image source={{ uri: src }} style={dS.photoGridImg} resizeMode="cover" />;
}
