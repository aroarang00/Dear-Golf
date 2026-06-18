import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector, ScrollView, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { F, fs } from '../../constants/colors';
import { resolvePhotoUri } from '../../utils/photoStorage';

const { width: SW, height: SH } = Dimensions.get('window');
const _arCache = new Map(); // uri → 종횡비(w/h) 세션 캐시 — 사진 실제 비율로 뷰어 높이 결정(가로사진 검은 여백 해소)

// 외부에서 비율 미리 심기 — DM 말풍선 등에서 먼저 로드된 사진의 실비율을 뷰어 캐시에 넣어두면
//   뷰어 열 때 첫 프레임부터 정확한 높이로 그려져 비율 리플로우(버벅임) 제거.
export function primePhotoRatio(uri, ratio) {
  if (!uri || !ratio) return;
  const u = resolvePhotoUri(uri);
  if (u && !_arCache.has(u)) _arCache.set(u, ratio);
}

function VideoItem({ uri, poster, active, width, height, onRatio, onZoomChange }) {
  const player = useVideoPlayer(uri, p => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.2; // timeUpdate 이벤트 활성화 — 첫 프레임 렌더 감지용
  });
  // 원본 영상은 버퍼링이 길어 첫 프레임 전 까만 화면 → 포스터(첫프레임 jpg)를 덮어 체감 지연 제거.
  //   ★재생 위치가 실제로 진행되면(currentTime>0 = 첫 프레임이 그려진 뒤) 포스터를 걷는다 —
  //    playing 신호에 걷으면 프레임 그려지기 직전이라 까만 깜빡임이 생김(사용자 2026-06-15). 한 번 걷으면 다시 안 띄움. [[video-poster-thumbnail]]
  const [started, setStarted] = useState(false);

  // 핀치 줌/팬 — 사진(PinchableImage)과 동일 패턴. 단 동영상은 네이티브 재생 컨트롤과 충돌 않게
  //   핀치(확대)+팬(이동)만 두고 단일탭/더블탭은 네이티브 컨트롤(재생·일시정지)에 양보. (사용자 2026-06-15)
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const zoomedSV = useSharedValue(0);
  const [isZoomed, setIsZoomed] = useState(false);
  const notify = (z) => { setIsZoomed(z); onZoomChange && onZoomChange(z); };
  const hardReset = () => {
    scale.value = 1; savedScale.value = 1;
    tx.value = 0; ty.value = 0; savedTx.value = 0; savedTy.value = 0; zoomedSV.value = 0;
  };

  useEffect(() => {
    if (started) return; // 첫 프레임 그려진 뒤엔 리스너 불필요 — 초당 5회 timeUpdate 부하 제거(렉 완화)
    const sub = player.addListener('timeUpdate', ({ currentTime }) => {
      if (currentTime > 0) setStarted(true);
    });
    return () => sub.remove();
  }, [player, started]);

  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [active, player]);

  // 다른 슬라이드로 넘어가 비활성화되면 확대·이동 초기화
  useEffect(() => {
    if (!active) { hardReset(); if (isZoomed) notify(false); }
  }, [active]);

  const clampPan = () => {
    'worklet';
    const maxX = (width * (scale.value - 1)) / 2;
    const maxY = (height * (scale.value - 1)) / 2;
    tx.value = Math.min(maxX, Math.max(-maxX, tx.value));
    ty.value = Math.min(maxY, Math.max(-maxY, ty.value));
  };

  const pinch = Gesture.Pinch()
    .onUpdate(e => {
      scale.value = Math.min(4, Math.max(1, savedScale.value * e.scale));
      if (scale.value > 1.02 && zoomedSV.value === 0) { zoomedSV.value = 1; runOnJS(notify)(true); }
      clampPan();
    })
    .onEnd(() => {
      if (scale.value < 1.05) {
        scale.value = withSpring(1); savedScale.value = 1;
        tx.value = withSpring(0); ty.value = withSpring(0); savedTx.value = 0; savedTy.value = 0;
        zoomedSV.value = 0;
        runOnJS(notify)(false);
      } else {
        savedScale.value = scale.value; zoomedSV.value = 1; runOnJS(notify)(true);
      }
    });

  // pan은 확대된 상태에서만 — 평상시 가로 페이저 스와이프·네이티브 컨트롤 보존
  const pan = Gesture.Pan()
    .enabled(isZoomed)
    .onUpdate(e => { tx.value = savedTx.value + e.translationX; ty.value = savedTy.value + e.translationY; clampPan(); })
    .onEnd(() => { savedTx.value = tx.value; savedTy.value = ty.value; });

  const composed = Gesture.Simultaneous(pan, pinch);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[{ width: SW, height }, animStyle]}>
        <VideoView
          player={player}
          style={{ width: SW, height }}
          contentFit="contain"
          nativeControls
          allowsFullscreen
          allowsPictureInPicture
        />
        {!started && poster ? (
          <Image source={{ uri: poster }} pointerEvents="none"
            style={{ position: 'absolute', top: 0, left: 0, width: SW, height }}
            contentFit="contain" cachePolicy="memory-disk"
            onLoad={(e) => { const w = e?.source?.width, h = e?.source?.height; if (w && h && onRatio) onRatio(poster, w / h); }} />
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}

// 비활성(지금 보고 있지 않은) 영상 슬라이드 — 플레이어 없이 포스터+▶만.
//   여러 영상이 동시에 useVideoPlayer로 플레이어를 만들면 무거워 렉이 생기므로, 현재 슬라이드(i===idx)만
//   VideoItem으로 실제 재생하고 나머지는 이걸로 가볍게 표시. 스와이프로 도달하면 그때 VideoItem이 마운트됨.
function VideoPoster({ poster, height, onRatio }) {
  return (
    <View style={{ width: SW, height, alignItems: 'center', justifyContent: 'center' }}>
      {poster ? (
        <Image source={{ uri: poster }} style={{ position: 'absolute', top: 0, left: 0, width: SW, height }}
          contentFit="contain" cachePolicy="memory-disk"
          onLoad={(e) => { const w = e?.source?.width, h = e?.source?.height; if (w && h && onRatio) onRatio(poster, w / h); }} />
      ) : null}
      <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontSize: fs(20), marginLeft: 3 }}>▶</Text>
      </View>
    </View>
  );
}

function PinchableImage({ uri, width, height, active, onZoomChange, onSingleTap, onRatio }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const zoomedSV = useSharedValue(0); // 박스 풀스크린 확장을 부모에 1회만 통지하기 위한 가드(라이브 핀치 중 중복 setState 방지)
  const [isZoomed, setIsZoomed] = useState(false); // pan 활성/페이저 잠금 토글

  const notify = (z) => { setIsZoomed(z); onZoomChange && onZoomChange(z); };

  const hardReset = () => {
    scale.value = 1; savedScale.value = 1;
    tx.value = 0; ty.value = 0; savedTx.value = 0; savedTy.value = 0;
    zoomedSV.value = 0;
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
    .onUpdate(e => {
      scale.value = Math.min(4, Math.max(1, savedScale.value * e.scale));
      // 핀치로 확대 시작하는 순간 박스를 풀스크린으로(부모 onZoomChange) — 라이브 핀치 중 비율 박스에 잘리던 문제 방지. 1회만.
      if (scale.value > 1.02 && zoomedSV.value === 0) { zoomedSV.value = 1; runOnJS(notify)(true); }
      clampPan();
    })
    .onEnd(() => {
      if (scale.value < 1.05) {
        scale.value = withSpring(1); savedScale.value = 1;
        tx.value = withSpring(0); ty.value = withSpring(0); savedTx.value = 0; savedTy.value = 0;
        zoomedSV.value = 0;
        runOnJS(notify)(false);
      } else {
        savedScale.value = scale.value; zoomedSV.value = 1; runOnJS(notify)(true);
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
        zoomedSV.value = 0;
        runOnJS(notify)(false);
      } else {
        scale.value = withSpring(2.5); savedScale.value = 2.5; zoomedSV.value = 1; runOnJS(notify)(true);
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
        {/* expo-image — 피드(FocalImage)와 디스크 캐시 공유 = 전체화면 열기 즉시. onLoad로 실비율 보고(getSize 별도 다운로드 제거) */}
        <Image source={{ uri }} style={{ width, height }} contentFit="contain" cachePolicy="memory-disk" priority="high" recyclingKey={uri}
          onLoad={(e) => { const w = e?.source?.width, h = e?.source?.height; if (w && h && onRatio) onRatio(uri, w / h); }} />
      </Animated.View>
    </GestureDetector>
  );
}

export function PhotoViewer({ photos, startIndex, onClose, caption, allowSave = false }) {
  const [idx, setIdx] = useState(startIndex);
  const [zoomed, setZoomed] = useState(false); // 현재 사진 확대 여부 — 확대 중 가로 페이저 잠금
  const [showCaption, setShowCaption] = useState(true); // 글(caption) 표시 — 사진 탭으로 토글
  const [savedToast, setSavedToast] = useState('');     // 저장 피드백(잠깐 표시)
  const [savingPhoto, setSavingPhoto] = useState(false);
  const current = photos[idx];
  const isVideo = current?.type === 'video';

  // 사진 실제 비율 측정 → 가로사진은 높이를 낮춰 위로 붙이고, 남는 공간은 글이 채움(고정 박스 검은 여백 해소).
  const [arMap, setArMap] = useState({});
  useEffect(() => {
    // 캐시된 비율만 즉시 반영 — 새 비율은 각 이미지 onLoad(handleRatio)로 도착(옛 Image.getSize 별도 다운로드 제거)
    photos.forEach(p => {
      // 영상은 포스터 uri로 비율 캐시(없으면 스킵), 사진은 자기 uri로.
      const u = p?.type === 'video' ? (p.poster ? resolvePhotoUri(p.poster) : null) : resolvePhotoUri(p.uri || p);
      if (u && _arCache.has(u)) setArMap(m => (m[u] ? m : { ...m, [u]: _arCache.get(u) }));
    });
  }, [photos]);
  const handleRatio = (u, ar) => {
    if (!ar) return;
    _arCache.set(u, ar);
    setArMap(m => (m[u] ? m : { ...m, [u]: ar }));
  };
  const captionShown = !!(caption && showCaption);
  // 사진 영역 최대 높이 — 캡션 보일 땐 화면 절반(아래 글 공간 확보), 순수 보기는 크게.
  const availMax = captionShown ? SH * 0.5 : SH * 0.84;
  const curUri = !isVideo && current ? resolvePhotoUri(current.uri || current) : null;
  const curVideoUri = isVideo && current ? resolvePhotoUri(current.uri) : null;   // 영상 저장용 원본 URI
  // 영상도 포스터(첫프레임) 비율로 박스 높이를 맞춰 검은 여백 제거(A안, 사용자 2026-06-15). 포스터 없는 옛 영상은 VIDEO_H 폴백.
  const curPosterUri = isVideo && current?.poster ? resolvePhotoUri(current.poster) : null;
  const curAr = isVideo ? (curPosterUri ? arMap[curPosterUri] : null) : (curUri ? arMap[curUri] : null);
  // 가로(ar>1) → SW/ar로 낮게 / 세로 → availMax로 cap / 측정 전 → 영상=VIDEO_H, 사진=4:5 폴백.
  const VIDEO_H = Math.max(Math.round(SW * 1.2), Math.round(SH * 0.8));
  // 캡션 보일 땐 영상도 availMax(화면 절반)로 cap — 비율 측정 전/포스터 없는 영상이 VIDEO_H(화면 80%)로
  //   잡혀 글을 밀어내던 문제 해소. 순수 보기(캡션 숨김)에선 영상은 크게(VIDEO_H) 유지. (사용자 2026-06-16)
  const mediaH = curAr
    ? Math.min(availMax, Math.round(SW / curAr))
    : (isVideo
        ? (captionShown ? Math.min(availMax, Math.round(SW * 1.25)) : VIDEO_H)
        : Math.min(availMax, Math.round(SW * 1.25)));

  // 현재 사진/동영상을 갤러리에 저장 — 원격(https) URL이면 캐시로 다운로드 후 저장(saveToLibraryAsync는 로컬 파일만).
  //   동영상은 확장자(mp4/mov)를 맞춰 받아야 갤러리가 영상으로 인식. 사진은 jpg.
  const savePhoto = async () => {
    const srcUri = isVideo ? curVideoUri : curUri;
    if (savingPhoto || !srcUri) return;
    setSavingPhoto(true);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) { setSavedToast('갤러리 접근 권한이 필요해요'); setTimeout(() => setSavedToast(''), 1800); return; }
      let localUri = srcUri;
      if (/^https?:\/\//.test(localUri)) {
        const ext = isVideo ? (srcUri.split('?')[0].match(/\.(mp4|mov|m4v)$/i)?.[1]?.toLowerCase() || 'mp4') : 'jpg';
        const dl = await FileSystem.downloadAsync(localUri, FileSystem.cacheDirectory + `dg_${Date.now()}.${ext}`);
        localUri = dl.uri;
      }
      await MediaLibrary.saveToLibraryAsync(localUri);
      setSavedToast(isVideo ? '동영상 저장됨 ✓' : '사진 저장됨 ✓'); setTimeout(() => setSavedToast(''), 1500);
    } catch (e) {
      if (__DEV__) console.warn('[viewer] save', e?.message);
      setSavedToast('저장에 실패했어요'); setTimeout(() => setSavedToast(''), 1800);
    } finally { setSavingPhoto(false); }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {/* 안드로이드에서 Modal은 별도 윈도우 — 앱 루트의 GestureHandlerRootView 밖이라 핀치 줌이 안 먹는다.
          ScheduleScreen·WeatherTransportPopup과 동일하게 Modal 안에서 한 번 더 감싼다(2026-06-04 핀치 줌 버그 수정). */}
      <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.97)', justifyContent: (caption && showCaption && !zoomed) ? 'flex-start' : 'center' }}>
        <TouchableOpacity style={{ position: 'absolute', top: 52, right: 20, zIndex: 10 }} onPress={onClose}>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: fs(28), lineHeight: 32 }}>✕</Text>
        </TouchableOpacity>
        {/* 저장 — 허용된 곳(DM 등)에서 사진·동영상 모두. 좌상단 알약 */}
        {allowSave && (curUri || curVideoUri) && (
          <TouchableOpacity onPress={savePhoto} disabled={savingPhoto} activeOpacity={0.8}
            style={{ position: 'absolute', top: 48, left: 18, zIndex: 10, flexDirection: 'row', alignItems: 'center', gap: 5,
              backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7, opacity: savingPhoto ? 0.6 : 1 }}>
            <Text style={{ fontSize: fs(14) }}>⬇️</Text>
            <Text style={{ fontFamily: F.sysM, fontSize: fs(13), color: '#fff' }}>저장</Text>
          </TouchableOpacity>
        )}
        {!!savedToast && (
          <View style={{ position: 'absolute', bottom: 64, left: 0, right: 0, alignItems: 'center', zIndex: 20 }} pointerEvents="none">
            <View style={{ backgroundColor: 'rgba(0,0,0,0.72)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 9 }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: '#fff' }}>{savedToast}</Text>
            </View>
          </View>
        )}
        <View style={{ position: 'absolute', top: 56, left: 0, right: 0, alignItems: 'center', zIndex: 5 }}>
          <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.6)' }}>
            {idx + 1} / {photos.length} {isVideo ? '· 영상' : ''}
          </Text>
        </View>
        {/* 캡션 표시 중엔 미디어를 카운터 아래로 내려 바로 아래 글이 오게(중앙 정렬 시 생기는 검은 여백 해소).
            ★영상도 동일 적용 — !isVideo면 영상만 스페이서가 빠져 화면 맨 위로 과하게 붙던 버그(사용자 2026-06-16).
            캡션 숨김(탭)·순수 보기는 가운데 정렬 유지. */}
        {captionShown && !zoomed ? <View style={{ height: 92 }} /> : null}
        {/* 확대(zoomed) 중엔 박스를 풀스크린(SH)으로 펼쳐 화면 전체에서 확대되게 — 평상시엔 사진 비율 높이(mediaH, 검은여백·캡션 잘림 해소). */}
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, height: zoomed ? SH : mediaH }}
          scrollEnabled={!zoomed}
          contentOffset={{ x: idx * SW, y: 0 }}
          onMomentumScrollEnd={e => { setIdx(Math.round(e.nativeEvent.contentOffset.x / SW)); setZoomed(false); }}>
          {photos.map((item, i) => (
            <View key={i} style={{ width: SW, height: zoomed ? SH : mediaH, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
              {item.type === 'video' ? (
                i === idx ? (
                  <VideoItem uri={resolvePhotoUri(item.uri)} poster={item.poster ? resolvePhotoUri(item.poster) : null} active width={SW} height={mediaH} onRatio={handleRatio} onZoomChange={setZoomed} />
                ) : (
                  <VideoPoster poster={item.poster ? resolvePhotoUri(item.poster) : null} height={mediaH} onRatio={handleRatio} />
                )
              ) : (
                // 윈도잉 — 현재±1만 제스처/reanimated PinchableImage, 나머지는 정적 Image(앨범 마운트 비용↓ 버벅임 완화)
                Math.abs(i - idx) <= 1 ? (
                  <PinchableImage uri={resolvePhotoUri(item.uri || item)} width={SW} height={mediaH} active={i === idx} onZoomChange={setZoomed} onSingleTap={() => setShowCaption(s => !s)} onRatio={handleRatio} />
                ) : (
                  <Image source={{ uri: resolvePhotoUri(item.uri || item) }} style={{ width: SW, height: mediaH }} contentFit="contain" cachePolicy="memory-disk" recyclingKey={resolvePhotoUri(item.uri || item)} />
                )
              )}
            </View>
          ))}
        </ScrollView>

        {/* 글(캡션) — 사진 바로 아래 흐름으로 배치, 남은 공간 전체에서 세로 스크롤. 사진 탭으로 숨김/표시 토글. 확대 중엔 숨김. */}
        {caption && showCaption && !zoomed ? (
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
