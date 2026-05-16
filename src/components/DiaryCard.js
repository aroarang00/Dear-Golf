import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image } from 'react-native';
import { C, F } from '../constants/colors';
import { dS } from '../styles/dS';
import { getTagColor } from '../utils/helpers';

export function DiaryCard({ item, onPress, avgScore }) {
  const [expanded, setExpanded] = useState(false);
  const diff = item.score - item.par;
  const diffLabel = diff > 0 ? `+${diff}` : `${diff}`;
  const hasBest = item.badge === '베스트';
  const hasPhoto = item.photos && item.photos.length > 0;
  const isSpecial = item.special === 'HOLE IN ONE' || item.special === 'ALBATROSS' || item.special === 'EAGLE';
  const isSingle = !!item.score && item.score <= 79; // 싱글 — 80타 미만

  let lineColor;
  if (hasBest) lineColor = '#6B1E2A';
  else if (avgScore != null && item.score < avgScore) lineColor = '#F5E6A8';
  else if (avgScore != null && item.score === avgScore) lineColor = '#C8D9E6';
  else lineColor = '#8B8680';
  const memoBorderColor = isSpecial ? '#C9A84C' : lineColor;

  const body = (
    <View style={dS.cardBody}>
      <Text style={dS.cardDate}>{item.date} {item.day}</Text>
      <Text style={[dS.cardCourse, isSpecial && { color: '#8B6914' }]}>{item.course}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <Text style={[dS.cardScore, isSingle && { color: '#C9A84C' }, hasBest && { color: C.burgundy }, isSpecial && { color: '#8B6914' }]}>{item.score}</Text>
        <Text style={[dS.cardScoreUnit, isSingle && { color: '#C9A84C' }, hasBest && { color: C.burgundy }, isSpecial && { color: '#8B6914' }]}>타</Text>
        <Text style={dS.cardPar}>{diffLabel} · par {item.par}</Text>
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
      {item.memo ? (
        <View style={{ borderLeftWidth: 2, borderLeftColor: memoBorderColor, paddingLeft: 8, marginBottom: 8 }}>
          <Text style={{ fontFamily: F.en, fontSize: 12, color: C.textSecondary, lineHeight: 18 }}>"{item.memo}"</Text>
        </View>
      ) : null}
      {item.tags && item.tags.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {item.tags.slice(0, 4).map((tag, i) => {
              const c = getTagColor(tag);
              return (
                <View key={i} style={{ backgroundColor: c.bg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ fontFamily: F.sys, fontSize: 10, color: c.text, fontWeight: '600' }}>{tag}</Text>
                </View>
              );
            })}
            {item.tags.length > 4 && (
              <Text style={{ fontFamily: F.sys, fontSize: 10, color: C.warmGrayLight, alignSelf: 'center', marginLeft: 4 }}>+{item.tags.length - 4}</Text>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );

  if (hasPhoto) {
    return (
      <TouchableOpacity
        style={[dS.card, isSpecial && dS.cardSpecial]}
        activeOpacity={0.88} onPress={() => onPress(item)}>
        {isSpecial && <View style={dS.cardSpecialLine} />}
        <View style={dS.photoHero43}>
          <Image source={{ uri: item.photos[0] }} style={dS.photoImg} resizeMode="cover" />
          <View style={dS.photoBottomOverlay}>
            <Text style={dS.overlayCourse} numberOfLines={1}>{item.course}</Text>
            <Text style={dS.overlayDate}>{item.date} {item.day}</Text>
          </View>
          {isSpecial && (
            <View style={dS.specialBadge}>
              <Text style={dS.specialBadgeTxt}>{item.special}</Text>
            </View>
          )}
          <View style={dS.photoCount}>
            <Text style={dS.photoCountTxt}>{item.photos.length}장</Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => setExpanded(e => !e)} activeOpacity={0.7} style={dS.toggleBtn}>
          <Text style={dS.toggleBtnTxt}>{expanded ? '접기 ∧' : '기록 보기 ∨'}</Text>
        </TouchableOpacity>
        {expanded && body}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[dS.card, isSpecial ? dS.cardSpecial : { borderLeftWidth: 3, borderLeftColor: lineColor }]}
      activeOpacity={0.88} onPress={() => onPress(item)}>
      {isSpecial && <View style={dS.cardSpecialLine} />}
      {isSpecial && (
        <View style={dS.specialNoPhoto}>
          <Text style={dS.specialNoPhotoTxt}>{item.special}</Text>
          {item.specialHole && <Text style={dS.specialNoPhotoSub}>{item.specialHole}번홀</Text>}
        </View>
      )}
      {body}
    </TouchableOpacity>
  );
}
