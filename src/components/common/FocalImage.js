import React, { useState } from 'react';
import { View, Platform } from 'react-native';
import { Image } from 'expo-image';
import { C } from '../../constants/colors';
import { Spinner } from './Spinner';
import { primePhotoRatio } from './PhotoViewer';
import { setPhotoRatio } from '../../utils/photoRatio';

// 초점(focus) 지정 커버 이미지 — resizeMode="cover"는 항상 가운데를 자르지만,
// 이건 focus{x,y}(0..1) 지점이 보이도록 채운 이미지를 평행이동해서 잘라낸다 ([[cover-focal-point]]).
//  - 크롭에디터로 4:3 잘라 넣은 사진은 focus 불필요(가운데 경로). focus는 기존 데이터 하위호환.
//    크롭 없이 그냥 저장한 세로 사진은 아래 '세로 자동 초점'이 위쪽 기준으로 잡아준다.
//  - expo-image 사용 → 메모리·디스크 캐시(피드 재스크롤 시 재다운로드 방지) + onLoad로 원본 치수 확보
//    (기존 Image.getSize 별도 호출=이중 다운로드 제거). 6f5da8f 재적용(ec7a584 dev 되돌림이 미복구였음 [[image-load-speed]]).
//  - 로딩 중(특히 원격 친구 사진)엔 검은 칸 대신 스피너로 '불러오는 중' 표시.
const _sizeCache = new Map(); // uri → { w, h }

// 세로 사진 자동 초점 — 초점이 따로 없는 '세로' 사진만 위쪽 기준으로 잡아준다(2026-07-21).
//   ※카드 틀이 사진 비율에 맞춰 3단계(4:3·1:1·4:5)로 스냅된 뒤로는([[photoRatio]]) 세로 사진도 94%가 보여
//    이 보정은 4:5보다 더 긴 사진(9:16 등)에만 실질적으로 작동한다. 가로·직접 크롭한 사진은 손대지 않는다.
//   저장 데이터를 안 바꾸므로 옛 기록에도 그대로 적용된다.
const AUTO_Y = 0.25;          // 0=맨위, 0.5=가운데. 3:4 사진이면 세로 11%~67% 구간이 보여 얼굴·상반신이 들어옴
const AUTO_MIN_RATIO = 1.05;  // 세로 판정 — 정사각(1.0) 근처는 가운데가 자연스러워 제외

function isCenter(focus) {
  if (!focus || typeof focus.x !== 'number' || typeof focus.y !== 'number') return true;
  return Math.abs(focus.x - 0.5) < 0.001 && Math.abs(focus.y - 0.5) < 0.001;
}

export function FocalImage({ uri, focus, width, height, style, onRatio }) {
  const explicit = !isCenter(focus);   // 사용자가 크롭·초점을 직접 지정한 사진
  const [src, setSrc] = useState(() => _sizeCache.get(uri) || null);
  const [loading, setLoading] = useState(true);

  // 원본 치수는 onLoad 이벤트로 확보 (별도 getSize 호출 없음 = 이중 다운로드 회피)
  const onLoad = (e) => {
    const w = e?.source?.width, h = e?.source?.height;
    // 실비율을 뷰어 캐시에 심어둠 — 탭해서 열 때 첫 프레임부터 정확한 높이로 그려짐(폴백 4:5 → 실측 스냅 = '갑자기 커짐' 제거).
    if (w && h) {
      primePhotoRatio(uri, w / h);
      // 피드 카드가 '사진에 맞는 틀'(4:3·1:1·4:5)을 고르는 데 쓰는 공용 캐시 — 다음부터는 잰 값이 바로 쓰여
      //   카드 높이가 처음부터 정확하다(같은 사진을 다시 그릴 때 높이가 튀지 않음).
      setPhotoRatio(uri, w / h);
      onRatio && onRatio(w / h);
    }
    if (src) return;   // 초점 없는 사진도 치수를 재둔다 — 세로 자동 초점 판정에 필요
    if (w && h) { const s = { w, h }; _sizeCache.set(uri, s); setSrc(s); }
  };

  // 실제로 적용할 초점 — ①직접 지정한 값이 최우선 ②없으면 '프레임보다 길쭉한 세로'만 자동 상단 기준 ③그 외 가운데
  let eff = null;
  if (explicit) eff = focus;
  else if (src && width && height) {
    const imgRatio = src.h / src.w;
    const frameRatio = height / width;
    if (imgRatio >= AUTO_MIN_RATIO && imgRatio > frameRatio) eff = { x: 0.5, y: AUTO_Y };
  }

  // 틀과 비율이 크게 다른 사진 — 잘라내지 않고 흐린 배경 위에 통째로 얹는다(사용자 2026-07-22).
  //   카드 틀은 '첫 장' 기준이라, 여러 장 올릴 때 뒤 장이 가로↔세로로 다르면 cover로는 절반 가까이 잘린다.
  //   영상 슬라이드가 이미 쓰는 방식이라 앱 안에서 낯설지 않고, 카드 높이도 그대로 유지된다.
  //   기준: cover로 넣었을 때 남는 면적이 80% 미만이면(=20% 넘게 잘리면) 통째로 보여준다.
  //   ★직접 초점을 준 사진(크롭·구도 지정)은 사용자의 의도라 이 규칙보다 우선한다.
  const coverVisible = (src && width && height)
    ? Math.min(src.w / src.h, width / height) / Math.max(src.w / src.h, width / height)
    : 1;
  const fitWhole = !explicit && coverVisible < 0.8;

  // 로딩 오버레이 — 이미지 뜨기 전까지 어두운 칸 위 스피너 (onLoadEnd는 성공·실패 모두 발화해 항상 해제됨)
  const overlay = loading ? (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
      <Spinner size={30} color={C.paleSky} />
    </View>
  ) : null;

  // 비율이 크게 다른 사진 → 흐린 배경(cover) 위에 사진 전체(contain). 잘림 없음.
  if (fitWhole) {
    return (
      <View style={[{ width, height, backgroundColor: '#15171A', overflow: 'hidden' }, style]}>
        <Image source={uri} style={{ position: 'absolute', left: 0, top: 0, width, height }} contentFit="cover"
          blurRadius={18} cachePolicy="memory-disk" />
        <Image source={uri} style={{ width, height }} contentFit="contain" cachePolicy="memory-disk"
          transition={Platform.OS === 'android' ? 0 : 150}
          onLoad={onLoad} onLoadEnd={() => setLoading(false)} />
        {overlay}
      </View>
    );
  }

  // 가운데(가로 사진 등)·비율 미확보·크기 미측정 → 기본 cover
  if (!eff || !src || !width || !height) {
    return (
      <View style={[{ width, height, backgroundColor: '#15171A' }, style]}>
        <Image source={uri} style={{ width, height }} contentFit="cover" cachePolicy="memory-disk" transition={Platform.OS === 'android' ? 0 : 150}
          onLoad={onLoad} onLoadEnd={() => setLoading(false)} />
        {overlay}
      </View>
    );
  }

  // 컨테이너를 cover로 채우는 표시 크기 → focus 지점이 프레임 안에 오도록 평행이동
  const scale = Math.max(width / src.w, height / src.h);
  const dispW = src.w * scale;
  const dispH = src.h * scale;
  const left = -(dispW - width) * eff.x;
  const top = -(dispH - height) * eff.y;

  return (
    <View style={[{ width, height, overflow: 'hidden', backgroundColor: '#15171A' }, style]}>
      <Image source={uri} style={{ position: 'absolute', left, top, width: dispW, height: dispH }} contentFit="cover" cachePolicy="memory-disk"
        onLoad={onLoad} onLoadEnd={() => setLoading(false)} />
      {overlay}
    </View>
  );
}
