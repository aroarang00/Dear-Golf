import React, { useState, useEffect } from 'react';
import { View, Text, Image, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { F, fs } from '../../constants/colors';
import { resolvePhotoUri } from '../../utils/photoStorage';
import { FocalImage } from './FocalImage';

// 기기 생성 썸네일 세션 캐시 — uri→thumbUri. 피드 스크롤로 카드가 재마운트돼도 재생성 안 하도록.
//   poster(업로드된 jpg) 없는 영상(특히 MY/나만보기 로컬 영상)이 매 마운트마다 느리게 추출되던 문제 완화.
const _thumbCache = new Map();

// 영상 슬라이드 — 첫 프레임 정지화면을 깔고 그 위에 ▶ 오버레이 (인라인 재생 X, 탭하면 PhotoViewer).
//   썸네일 로딩 전·실패 시에만 어두운 폴백. 상세/추가화면(GridThumb·AddPhotoThumb)과 동일 패턴.
function VideoSlide({ uri, poster }) {
  const [thumb, setThumb] = useState(poster || _thumbCache.get(uri) || null);
  useEffect(() => {
    if (poster) { setThumb(poster); return; } // 업로드된 포스터 있으면 기기 생성 불필요(안드 안정)
    const cached = _thumbCache.get(uri);
    if (cached) { setThumb(cached); return; } // 세션 내 이미 생성 — 재생성 생략
    let cancelled = false;
    (async () => {
      try {
        const { uri: t } = await VideoThumbnails.getThumbnailAsync(uri, { time: 0, quality: 0.6 });
        if (!cancelled) { _thumbCache.set(uri, t); setThumb(t); }
      } catch (e) {
        if (!cancelled) console.warn('thumbnail failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [uri, poster]);

  return (
    <View style={{ flex: 1, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' }}>
      {thumb && <Image source={{ uri: thumb }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }} resizeMode="cover" />}
      {/* 썸네일 로딩 전(포스터 없는 원격 영상은 첫 프레임 추출에 수 초) — 검정 대신 스피너로 '불러오는 중' 인지 */}
      {thumb ? (
        <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(0,0,0,0.45)',
          alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: fs(20), marginLeft: 3 }}>▶</Text>
        </View>
      ) : (
        <ActivityIndicator color="rgba(255,255,255,0.85)" />
      )}
      <Text style={{ position: 'absolute', bottom: 10, left: 10, fontFamily: F.sys, fontSize: fs(10), color: 'rgba(255,255,255,0.85)' }}>영상</Text>
    </View>
  );
}

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
            const poster = isVideo && p?.poster ? resolvePhotoUri(p.poster) : null;
            const focus = !isVideo && typeof p === 'object' ? p?.focus : null;
            return (
              <TouchableOpacity
                key={i} activeOpacity={0.95}
                onPress={() => onTap && onTap(i)}
                style={{ width: w, height: h }}>
                {isVideo ? (
                  <VideoSlide uri={uri} poster={poster} />
                ) : (
                  <FocalImage uri={uri} focus={focus} width={w} height={h} />
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
