import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, Image, Dimensions } from 'react-native';
import { Gesture, GestureDetector, ScrollView, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated';
import { VideoView, useVideoPlayer } from 'expo-video';
import { F, fs } from '../../constants/colors';
import { resolvePhotoUri } from '../../utils/photoStorage';

const { width: SW, height: SH } = Dimensions.get('window');
const _arCache = new Map(); // uri → 종횡비(w/h) 세션 캐시 — 사진 실제 비율로 뷰어 높이 결정(가로사진 검은 여백 해소)

function VideoItem({ uri, active }) {
  const player = useVideoPlayer(uri, p => {
    p.loop = false;
  });

  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [active, player]);

  return (
    <VideoView
      player={player}
      style={{ width: SW, height: SW * 1.2 }}
      contentFit="contain"
      nativeControls
      allowsFullscreen
      allowsPictureInPicture
    />
  );
}

function PinchableImage({ uri, width, height, active, onZoomChange, onSingleTap }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const [isZoomed, setIsZoomed] = useState(false); // pan 활성/페이저 잠금 토글

  const notify = (z) => { setIsZoomed(z); onZoomChange && onZoomChange(z); };

  const hardReset = () => {
    scale.value = 1; savedScale.value = 1;
    tx.value = 0; ty.value = 0; savedTx.value = 0; savedTy.value = 0;
  };

  // 다른 사진으로 스와이프해 비활성화되면 확대·이동 초기화
  useEffect(() => {
    if (!active) { hardReset(); if (isZoomed) notify(false); }
  }, [active]);

  // 확대 배율에 따라 이동 범위 제한 (스케일된 박스 안에서만)
  const clampPan = () => {
    'worklet';
    const maxX = (width * (scale.value - 1)) / 2;
    const maxY = (height * (scale.value - 1)) / 2;
    tx.value = Math.min(maxX, Math.max(-maxX, tx.value));
    ty.value = Math.min(maxY, Math.max(-maxY, ty.value));
  };

  const pinch = Gesture.Pinch()
    .onUpdate(e => { scale.value = Math.min(4, Math.max(1, savedScale.value * e.scale)); clampPan(); })
    .onEnd(() => {
      if (scale.value < 1.05) {
        scale.value = withSpring(1); savedScale.value = 1;
        tx.value = withSpring(0); ty.value = withSpring(0); savedTx.value = 0; savedTy.value = 0;
        runOnJS(notify)(false);
      } else {
        savedScale.value = scale.value; runOnJS(notify)(true);
      }
    });

  // pan은 확대된 상태에서만 활성 (평상시 가로 페이저 스와이프 보존)
  const pan = Gesture.Pan()
    .enabled(isZoomed)
    .onUpdate(e => { tx.value = savedTx.value + e.translationX; ty.value = savedTy.value + e.translationY; clampPan(); })
    .onEnd(() => { savedTx.value = tx.value; savedTy.value = ty.value; });

  // 더블탭으로 확대/원위치 토글
  const doubleTap = Gesture.Tap().numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1.05) {
        scale.value = withSpring(1); savedScale.value = 1;
        tx.value = withSpring(0); ty.value = withSpring(0); savedTx.value = 0; savedTy.value = 0;
        runOnJS(notify)(false);
      } else {
        scale.value = withSpring(2.5); savedScale.value = 2.5; runOnJS(notify)(true);
      }
    });

  // 단일 탭 — 캡션(글) 표시/숨김 토글. 더블탭(확대)이 우선이라 Exclusive로 묶어 더블탭 실패 시에만 발화.
  const singleTap = Gesture.Tap().numberOfTaps(1)
    .onEnd((_e, success) => { if (success && onSingleTap) runOnJS(onSingleTap)(); });
  const taps = Gesture.Exclusive(doubleTap, singleTap);
  const composed = Gesture.Simultaneous(Gesture.Race(taps, pan), pinch);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[{ width, height }, animStyle]}>
        <Image source={{ uri }} style={{ width, height }} resizeMode="contain" />
      </Animated.View>
    </GestureDetector>
  );
}

export function PhotoViewer({ photos, startIndex, onClose, caption }) {
  const [idx, setIdx] = useState(startIndex);
  const [zoomed, setZoomed] = useState(false); // 현재 사진 확대 여부 — 확대 중 가로 페이저 잠금
  const [showCaption, setShowCaption] = useState(true); // 글(caption) 표시 — 사진 탭으로 토글
  const current = photos[idx];
  const isVideo = current?.type === 'video';

  // 사진 실제 비율 측정 → 가로사진은 높이를 낮춰 위로 붙이고, 남는 공간은 글이 채움(고정 박스 검은 여백 해소).
  const [arMap, setArMap] = useState({});
  useEffect(() => {
    photos.forEach(p => {
      if (p?.type === 'video') return;
      const u = resolvePhotoUri(p.uri || p);
      if (_arCache.has(u)) { setArMap(m => (m[u] ? m : { ...m, [u]: _arCache.get(u) })); return; }
      Image.getSize(u, (w, h) => { if (h) { const ar = w / h; _arCache.set(u, ar); setArMap(m => ({ ...m, [u]: ar })); } }, () => {});
    });
  }, [photos]);
  const captionShown = !!(caption && showCaption);
  // 사진 영역 최대 높이 — 캡션 보일 땐 화면 절반(아래 글 공간 확보), 순수 보기는 크게.
  const availMax = captionShown ? SH * 0.5 : SH * 0.84;
  const curUri = !isVideo && current ? resolvePhotoUri(current.uri || current) : null;
  const curAr = curUri ? arMap[curUri] : null;
  // 가로(ar>1) → SW/ar로 낮게 / 세로 → availMax로 cap / 측정 전 → 4:5 폴백
  const mediaH = isVideo ? SW * 1.2 : (curAr ? Math.min(availMax, Math.round(SW / curAr)) : Math.min(availMax, Math.round(SW * 1.25)));

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {/* 안드로이드에서 Modal은 별도 윈도우 — 앱 루트의 GestureHandlerRootView 밖이라 핀치 줌이 안 먹는다.
          ScheduleScreen·WeatherTransportPopup과 동일하게 Modal 안에서 한 번 더 감싼다(2026-06-04 핀치 줌 버그 수정). */}
      <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.97)', justifyContent: (caption && showCaption) ? 'flex-start' : 'center' }}>
        <TouchableOpacity style={{ position: 'absolute', top: 52, right: 20, zIndex: 10 }} onPress={onClose}>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: fs(28), lineHeight: 32 }}>✕</Text>
        </TouchableOpacity>
        <View style={{ position: 'absolute', top: 56, left: 0, right: 0, alignItems: 'center', zIndex: 5 }}>
          <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.6)' }}>
            {idx + 1} / {photos.length} {isVideo ? '· 영상' : ''}
          </Text>
        </View>
        {/* 캡션 표시 중엔 사진을 위(카운터 아래)로 올려 바로 아래 글이 오게(중앙 정렬 시 생기는 검은 여백 해소).
            캡션 숨김(탭)·순수 사진 보기는 가운데 정렬 유지. */}
        {captionShown ? <View style={{ height: 92 }} /> : null}
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, height: mediaH }}
          scrollEnabled={!zoomed}
          contentOffset={{ x: idx * SW, y: 0 }}
          onMomentumScrollEnd={e => { setIdx(Math.round(e.nativeEvent.contentOffset.x / SW)); setZoomed(false); }}>
          {photos.map((item, i) => (
            <View key={i} style={{ width: SW, height: mediaH, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
              {item.type === 'video' ? (
                <VideoItem uri={resolvePhotoUri(item.uri)} active={i === idx} />
              ) : (
                <PinchableImage uri={resolvePhotoUri(item.uri || item)} width={SW} height={mediaH} active={i === idx} onZoomChange={setZoomed} onSingleTap={() => setShowCaption(s => !s)} />
              )}
            </View>
          ))}
        </ScrollView>

        {/* 글(캡션) — 사진 바로 아래 흐름으로 배치, 남은 공간 전체에서 세로 스크롤. 사진 탭으로 숨김/표시 토글. */}
        {caption && showCaption ? (
          <ScrollView style={{ flex: 1, alignSelf: 'stretch' }}
            contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 16, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}>
            <Text style={{ fontFamily: F.sys, fontSize: fs(15), color: '#fff', lineHeight: 23 }}>{caption}</Text>
          </ScrollView>
        ) : null}
      </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
