import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, Image, Dimensions } from 'react-native';
import { Gesture, GestureDetector, ScrollView, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { VideoView, useVideoPlayer } from 'expo-video';
import { F, fs } from '../../constants/colors';
import { resolvePhotoUri } from '../../utils/photoStorage';

const { width: SW } = Dimensions.get('window');

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

function PinchableImage({ uri, width, height, active }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);

  // 다른 사진으로 스와이프하면 확대 상태 초기화
  useEffect(() => {
    if (!active) {
      scale.value = withSpring(1);
      savedScale.value = 1;
    }
  }, [active]);

  const pinch = Gesture.Pinch()
    .onUpdate(e => {
      scale.value = Math.max(1, savedScale.value * e.scale);
    })
    .onEnd(() => {
      if (scale.value < 1.05) {
        scale.value = withSpring(1);
        savedScale.value = 1;
      } else {
        savedScale.value = scale.value;
      }
    });

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={pinch}>
      <Animated.View style={[{ width, height }, animStyle]}>
        <Image source={{ uri }} style={{ width, height }} resizeMode="contain" />
      </Animated.View>
    </GestureDetector>
  );
}

export function PhotoViewer({ photos, startIndex, onClose }) {
  const [idx, setIdx] = useState(startIndex);
  const current = photos[idx];
  const isVideo = current?.type === 'video';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {/* 안드로이드에서 Modal은 별도 윈도우 — 앱 루트의 GestureHandlerRootView 밖이라 핀치 줌이 안 먹는다.
          ScheduleScreen·WeatherTransportPopup과 동일하게 Modal 안에서 한 번 더 감싼다(2026-06-04 핀치 줌 버그 수정). */}
      <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.97)', justifyContent: 'center' }}>
        <TouchableOpacity style={{ position: 'absolute', top: 52, right: 20, zIndex: 10 }} onPress={onClose}>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: fs(28), lineHeight: 32 }}>✕</Text>
        </TouchableOpacity>
        <View style={{ position: 'absolute', top: 56, left: 0, right: 0, alignItems: 'center' }}>
          <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.6)' }}>
            {idx + 1} / {photos.length} {isVideo ? '· 영상' : ''}
          </Text>
        </View>
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}
          contentOffset={{ x: idx * SW, y: 0 }}
          onMomentumScrollEnd={e => setIdx(Math.round(e.nativeEvent.contentOffset.x / SW))}>
          {photos.map((item, i) => (
            <View key={i} style={{ width: SW, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
              {item.type === 'video' ? (
                <VideoItem uri={resolvePhotoUri(item.uri)} active={i === idx} />
              ) : (
                <PinchableImage uri={resolvePhotoUri(item.uri || item)} width={SW} height={SW * 1.2} active={i === idx} />
              )}
            </View>
          ))}
        </ScrollView>
      </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
