import React, { useState } from 'react';
import { View, Text, Image, ScrollView, TouchableOpacity } from 'react-native';
import { F, fs } from '../../constants/colors';
import { resolvePhotoUri } from '../../utils/photoStorage';

// 카드 안 인라인 미디어 캐러셀 — 상세 진입 없이 미리보기에서 가로로 넘겨보기 ([[friend-feed-design]]).
// 부모(dS.photoHero43 등)의 크기를 그대로 채우고, onLayout으로 슬라이드 폭/높이를 잰다.
//  - photos: 문자열('dgphoto:'/https) 또는 { uri, type:'video' } 객체 혼합 배열
//  - onTap(index): 슬라이드 탭 콜백 (MY=상세 진입, 친구=PhotoViewer 전체화면)
//  - 영상은 인라인 재생 대신 ▶ 플레이스홀더 — 탭하면 onTap으로 PhotoViewer에서 재생 (피드 성능 보호)
export function MediaCarousel({ photos, onTap }) {
  const [dim, setDim] = useState({ w: 0, h: 0 });
  const [idx, setIdx] = useState(0);
  if (!photos || photos.length === 0) return null;
  const single = photos.length === 1;
  const { w, h } = dim;

  return (
    <View
      style={{ width: '100%', height: '100%', backgroundColor: '#000' }}
      onLayout={e => {
        const { width, height } = e.nativeEvent.layout;
        if (width !== dim.w || height !== dim.h) setDim({ w: width, h: height });
      }}>
      {w > 0 && (
        <ScrollView
          horizontal
          pagingEnabled
          scrollEnabled={!single}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={e => setIdx(Math.round(e.nativeEvent.contentOffset.x / w))}>
          {photos.map((p, i) => {
            const isVideo = p && typeof p === 'object' && p.type === 'video';
            const raw = isVideo ? p.uri : (typeof p === 'object' ? p?.uri : p);
            const uri = resolvePhotoUri(raw);
            return (
              <TouchableOpacity
                key={i} activeOpacity={0.95}
                onPress={() => onTap && onTap(i)}
                style={{ width: w, height: h }}>
                {isVideo ? (
                  <View style={{ flex: 1, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' }}>
                    <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(0,0,0,0.45)',
                      alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#fff', fontSize: fs(20), marginLeft: 3 }}>▶</Text>
                    </View>
                    <Text style={{ position: 'absolute', bottom: 10, left: 10, fontFamily: F.sys, fontSize: fs(10), color: 'rgba(255,255,255,0.85)' }}>영상</Text>
                  </View>
                ) : (
                  <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
      {/* N/N 카운터 — 여러 장일 때만 (하단 오버레이와 겹치지 않게 우상단) */}
      {!single && (
        <View pointerEvents="none" style={{ position: 'absolute', top: 8, right: 10,
          backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
          <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: 'rgba(255,255,255,0.9)' }}>{idx + 1}/{photos.length}</Text>
        </View>
      )}
    </View>
  );
}
