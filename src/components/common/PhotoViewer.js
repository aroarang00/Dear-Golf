import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, Dimensions, Platform } from 'react-native';
import { initialWindowMetrics } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Gesture, GestureDetector, ScrollView, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { F, fs } from '../../constants/colors';
import { resolvePhotoUri } from '../../utils/photoStorage';

const { width: SW, height: SH } = Dimensions.get('window');
// 안드 엣지투엣지 — 하단 시스템 내비바 높이(없으면 0). '게시글 보기' 버튼이 내비바에 가리지 않게 띄움.
const NAV_BOTTOM = Platform.OS === 'android' ? (initialWindowMetrics?.insets?.bottom || 0) : 0;
const _arCache = new Map(); // uri → 종횡비(w/h) 세션 캐시 — 사진 실제 비율로 뷰어 높이 결정(가로사진 검은 여백 해소)

// 외부에서 비율 미리 심기 — DM 말풍선 등에서 먼저 로드된 사진의 실비율을 뷰어 캐시에 넣어두면
//   뷰어 열 때 첫 프레임부터 정확한 높이로 그려져 비율 리플로우(버벅임) 제거.
export function primePhotoRatio(uri, ratio) {
  if (!uri || !ratio) return;
  const u = resolvePhotoUri(uri);
  if (u && !_arCache.has(u)) _arCache.set(u, ratio);
}

// 미디어 한 장의 비율 캐시 키 — 영상은 포스터(첫프레임) uri, 사진은 자기 uri.
function ratioKey(p) {
  if (p?.type === 'video') return p.poster ? resolvePhotoUri(p.poster) : null;
  return resolvePhotoUri(p?.uri || p);
}

// 열자마자 쓸 수 있는 비율만 모아 초기 state로 — 세션 캐시에 이미 있는 것만(네트워크 호출 없음).
function seedRatios(photos) {
  const seed = {};
  (photos || []).forEach(p => {
    const u = ratioKey(p);
    if (u && _arCache.has(u)) seed[u] = _arCache.get(u);
  });
  return seed;
}

// ★미디어 한 장의 박스 높이 — '그 장의 비율'로만 계산한다(이웃 사진 값을 절대 쓰지 않는다).
//   비율을 아직 모르면 사진=화면 전체(SH), 영상=VIDEO_H. 둘 다 contain이라 비율이 늦게 도착해도
//   그려지는 그림 크기가 같아 튀지 않는다(사진 폴백이 SH인 이유).
const VIDEO_FALLBACK_H = Math.min(SH, Math.max(Math.round(SW * 1.2), Math.round(SH * 0.8)));
function mediaHeightOf(item, arMap) {
  const k = ratioKey(item);
  const ar = k ? arMap[k] : null;
  if (ar) return Math.min(SH, Math.round(SW / ar));
  return item?.type === 'video' ? VIDEO_FALLBACK_H : SH;
}

function VideoItem({ uri, poster, active, width, height, muted = true, onRatio, onZoomChange }) {
  const player = useVideoPlayer(uri, p => {
    p.loop = false;
    p.muted = muted;                 // 기본 음소거(부모 토글로 켬)
    p.timeUpdateEventInterval = 0.2; // timeUpdate 이벤트 활성화 — 첫 프레임 렌더 감지용
  });
  useEffect(() => { player.muted = muted; }, [muted, player]);
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

  // 단일 탭 — 뷰어 닫기. 더블탭(확대)이 우선이라 Exclusive로 묶어 더블탭이 아닐 때만 발화한다.
  //   ★확대 중엔 무시 — 사진을 크게 보며 옮기다 툭 건드려 닫히면 짜증난다. 확대 해제는 더블탭.
  const singleTap = Gesture.Tap().numberOfTaps(1)
    .onEnd((_e, success) => {
      if (!success || !onSingleTap) return;
      if (scale.value > 1.05) return;
      runOnJS(onSingleTap)();
    });
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
          onLoad={(e) => { const w = e?.source?.width, h = e?.source?.height; if (w && h && onRatio) onRatio(uri, w / h); }}
          onError={() => { if (__DEV__) console.warn('[photoViewer] 로드 실패', uri); }} />
      </Animated.View>
    </GestureDetector>
  );
}

// 사진은 항상 화면 가운데에 꽉 차게(contain) 띄운다. 예전엔 친구 피드에서 글(caption)을 사진 아래 붙였는데
//   사진을 위로 올려붙이고 높이를 절반으로 잡느라, 실비율이 늦게 도착하면 사진이 위로 튀어 '들썩'였다.
//   글은 카드의 '더보기/기록 보기'로 이미 볼 수 있어 뷰어에서는 걷어냄 (사용자 2026-08-02).
export function PhotoViewer({ photos, startIndex, onClose, allowSave = false, onGoToPost = null }) {
  const [idx, setIdx] = useState(startIndex);
  const [zoomed, setZoomed] = useState(false); // 현재 사진 확대 여부 — 확대 중 가로 페이저 잠금
  const [savedToast, setSavedToast] = useState('');     // 저장 피드백(잠깐 표시)
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [muted, setMuted] = useState(true);   // 동영상 기본 음소거(스크롤·자동재생 톤). 우상단 토글로 켜기
  const current = photos[idx];
  const isVideo = current?.type === 'video';

  // 사진 실제 비율 — 캐시(_arCache)에 있으면 그 값으로 박스 높이를 정하고, 없으면 각 이미지 onLoad로 받는다.
  //   ★캐시 반영을 useEffect로 하면 첫 프레임은 무조건 폴백 크기 → 다음 프레임에 실제 크기로 '툭' 바뀐다.
  //    (특히 영상은 폴백 VIDEO_H와 실측 차이가 커서 작게 떴다가 커져 보였다.) 그래서 state 초기값으로 바로 심는다.
  const [arMap, setArMap] = useState(() => seedRatios(photos));
  useEffect(() => { setArMap(m => ({ ...seedRatios(photos), ...m })); }, [photos]);
  const handleRatio = (u, ar) => {
    if (!ar) return;
    _arCache.set(u, ar);
    setArMap(m => (m[u] ? m : { ...m, [u]: ar }));
  };
  // 박스 높이는 장마다 따로 — mediaHeightOf(item, arMap). 여기서 '현재 사진 하나'로 정하지 말 것.
  //   예전에 그렇게 했다가 넘기는 중인 사진이 앞 사진 박스에 갇혀 작게 그려졌다(2026-08-03 실측).
  const curUri = !isVideo && current ? resolvePhotoUri(current.uri || current) : null;
  const curVideoUri = isVideo && current ? resolvePhotoUri(current.uri) : null;   // 영상 저장용 원본 URI

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

  // ★animationType='none' — 페이드로 열면 반투명한 모달 너머로 '뒤에 있던 피드 카드의 사진'이 비친다.
  //   ※단, '작았다가 갑자기 커짐'의 진짜 원인은 이게 아니었다(아래 페이저 주석 참고).
  //   ★2026-08-02에 "레이아웃 무죄, 모달 전환이 범인"이라고 적어뒀던 것은 오진이다.
  //    08-03 실측 결과 탭→뷰어 58ms·그림 33ms로 전환은 충분히 빨랐고,
  //    범인은 페이저가 높이 하나를 공유하던 것이었다. 같은 증상이 또 나오면 숫자부터 찍어볼 것.
  //   즉시 띄우면 카드가 곧바로 가려져 morph가 안 보인다. 사진은 피드와 캐시를 공유해 깜빡임도 없다.
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      {/* 안드로이드에서 Modal은 별도 윈도우 — 앱 루트의 GestureHandlerRootView 밖이라 핀치 줌이 안 먹는다.
          ScheduleScreen·WeatherTransportPopup과 동일하게 Modal 안에서 한 번 더 감싼다(2026-06-04 핀치 줌 버그 수정). */}
      <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.97)', justifyContent: 'center' }}>
        <TouchableOpacity style={{ position: 'absolute', top: 52, right: 20, zIndex: 10 }} onPress={onClose}>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: fs(28), lineHeight: 32 }}>✕</Text>
        </TouchableOpacity>
        {/* 동영상 소리 토글 — 기본 꺼짐(muted). 🔇/🔊 이모지는 한눈에 구분이 어려워 라벨 알약으로
            (꺼짐=흐림 / 켜짐=세이지 채움 + 꺼짐↔켜짐 대비). 닫기 버튼 아래 우상단. 탭하면 토글 */}
        {isVideo && (
          <TouchableOpacity onPress={() => setMuted(m => !m)} activeOpacity={0.8}
            style={{ position: 'absolute', top: 100, right: 18, zIndex: 10, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 7,
              backgroundColor: muted ? 'rgba(255,255,255,0.16)' : 'rgba(143,176,107,0.92)' }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(12.5), color: '#fff' }}>{muted ? '소리 꺼짐' : '소리 켜짐'}</Text>
          </TouchableOpacity>
        )}
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
        {/* ★페이저는 늘 화면 전체 높이. 사진 박스는 '장마다 제 비율'로 따로 잡는다(2026-08-03).
            예전엔 5장이 mediaH 하나를 공유했고 그 값이 '지금 보는 사진' 것이라, 넘기는 중인 사진이
            앞 사진의 박스에 갇혀 그려졌다. 가로(302)→세로로 넘기면 세로 사진이 226×302로 작게 그려지다가
            넘김이 끝나 박스가 536이 되는 순간 402×536으로 튀어올랐다 — 이게 '작았다가 갑자기 커짐'의 정체.
            (실측 2026-08-03: 첫 302/1.333 → 변 536/0.750. 크기 점프가 각 변 1.8배)
            ※배경이 검정이라 페이저를 꽉 채워도 보이는 그림은 같다 — 여백이 생기지 않는다. */}
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, height: SH }}
          scrollEnabled={!zoomed}
          contentOffset={{ x: idx * SW, y: 0 }}
          onMomentumScrollEnd={e => { setIdx(Math.round(e.nativeEvent.contentOffset.x / SW)); setZoomed(false); }}>
          {photos.map((item, i) => {
            const itemH = mediaHeightOf(item, arMap); // ★그 사진 제 비율로. 이웃 사진 값을 쓰지 않는다.
            return (
            <View key={i} style={{ width: SW, height: SH, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
              {item.type === 'video' ? (
                i === idx ? (
                  <VideoItem uri={resolvePhotoUri(item.uri)} poster={item.poster ? resolvePhotoUri(item.poster) : null} active width={SW} height={itemH} muted={muted} onRatio={handleRatio} onZoomChange={setZoomed} />
                ) : (
                  <VideoPoster poster={item.poster ? resolvePhotoUri(item.poster) : null} height={itemH} onRatio={handleRatio} />
                )
              ) : (
                // 윈도잉 — 현재±1만 제스처/reanimated PinchableImage, 나머지는 정적 Image(앨범 마운트 비용↓ 버벅임 완화)
                Math.abs(i - idx) <= 1 ? (
                  <PinchableImage uri={resolvePhotoUri(item.uri || item)} width={SW} height={itemH} active={i === idx} onZoomChange={setZoomed} onSingleTap={onClose} onRatio={handleRatio} />
                ) : (
                  <Image source={{ uri: resolvePhotoUri(item.uri || item) }} style={{ width: SW, height: itemH }} contentFit="contain" cachePolicy="memory-disk" recyclingKey={resolvePhotoUri(item.uri || item)}
                    onError={() => { if (__DEV__) console.warn('[photoViewer] 정적 로드 실패', resolvePhotoUri(item.uri || item)); }} />
                )
              )}
            </View>
            );
          })}
        </ScrollView>

        {/* 게시글 보기 — 갤러리에서 연 경우(onGoToPost) 원글(글·댓글)로 이동. 확대 중엔 숨김. */}
        {onGoToPost && !zoomed && current ? (
          <TouchableOpacity onPress={() => onGoToPost(current)} activeOpacity={0.85}
            style={{ position: 'absolute', bottom: 42 + NAV_BOTTOM, alignSelf: 'center', zIndex: 20, flexDirection: 'row', alignItems: 'center', gap: 5,
              backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 22, paddingHorizontal: 18, paddingVertical: 11 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: '#fff' }}>게시글 보기</Text>
            <Text style={{ fontSize: fs(15), color: '#fff', marginTop: -1 }}>›</Text>
          </TouchableOpacity>
        ) : null}

      </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
