import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F } from '../constants/colors';
import { dS } from '../styles/dS';
import { UserContext } from '../contexts/UserContext';
import { TripleStripe } from './common/TripleStripe';
import { PhotoViewer } from './common/PhotoViewer';
import { DiaryAddModal } from './DiaryAddModal';

export function DiaryDetail({ item, onClose, onUpdate }) {
  const { userProfile } = React.useContext(UserContext);
  const [photoViewer, setPhotoViewer] = useState(false);
  const [viewerStart, setViewerStart] = useState(0);
  const [showEditModal, setShowEditModal] = useState(false);
  const hasBest = item.badge === '베스트';
  const isSpecial = item.special === 'HOLE IN ONE' || item.special === 'ALBATROSS' || item.special === 'EAGLE';
  const diff = item.score - item.par;
  const diffLabel = diff > 0 ? `+${diff}` : `${diff}`;
  const companionsToShow = item.companions || [];

  const COMP_PALETTE = [
    { bg: '#C8D9E6', fg: '#1A3D52' },
    { bg: '#F5E6A8', fg: '#5A4500' },
    { bg: '#3D3935', fg: '#F5E6A8' },
    { bg: '#8B8680', fg: '#fff' },
  ];

  const photosToShow = item.photos || [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: isSpecial ? '#F5F0E4' : C.bgPrimary }}>
      <View style={[dS.detailHdr, isSpecial && { borderBottomColor: '#C9A84C44' }]}>
        <TouchableOpacity onPress={onClose}>
          <Text style={dS.backBtn}>← Diary</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={[dS.detailHdrNickname, isSpecial && { backgroundColor: '#8B6914' }]}>
            <Text style={dS.detailHdrNicknameTxt}>{userProfile.nickname}</Text>
          </View>
          <TouchableOpacity onPress={() => setShowEditModal(true)}>
            <Text style={{ fontFamily: F.sys, fontSize: 14, color: C.burgundy }}>수정</Text>
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
            <Text style={[dS.detailScore, hasBest && { color: C.burgundy }, isSpecial && { color: '#8B6914' }]}>{item.score}</Text>
            <Text style={[dS.detailScoreUnit, hasBest && { color: C.burgundy }, isSpecial && { color: '#8B6914' }]}>타</Text>
            <Text style={dS.detailScoreSub}>{diffLabel} · par {item.par}</Text>
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
          <View style={{ marginBottom: 10 }}>
            <Text style={dS.photosLabel}>사진 · 영상</Text>
          </View>
          <View style={dS.photosGrid}>
            {photosToShow.map((uri, i) => {
              const src = typeof uri === 'object' ? uri.uri : uri;
              return (
                <TouchableOpacity key={i} onPress={() => { setViewerStart(i); setPhotoViewer(true); }} style={dS.photoGridItem}>
                  <Image source={{ uri: src }} style={dS.photoGridImg} resizeMode="cover" />
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
