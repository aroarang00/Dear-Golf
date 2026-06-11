import React, { useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { C } from '../../constants/colors';
import { Spinner } from './Spinner';

// 초점(focus) 지정 커버 이미지 — resizeMode="cover"는 항상 가운데를 자르지만,
// 이건 focus{x,y}(0..1) 지점이 보이도록 채운 이미지를 평행이동해서 잘라낸다 ([[cover-focal-point]]).
//  - 신규 사진은 크롭에디터로 이미 4:3 잘려 들어와 focus 불필요(center 경로). focus는 기존 데이터 하위호환.
//  - expo-image 사용 → 메모리·디스크 캐시(피드 재스크롤 시 재다운로드 방지) + onLoad로 원본 치수 확보
//    (기존 Image.getSize 별도 호출=이중 다운로드 제거). 6f5da8f 재적용(ec7a584 dev 되돌림이 미복구였음 [[image-load-speed]]).
//  - 로딩 중(특히 원격 친구 사진)엔 검은 칸 대신 스피너로 '불러오는 중' 표시.
const _sizeCache = new Map(); // uri → { w, h }

function isCenter(focus) {
  if (!focus || typeof focus.x !== 'number' || typeof focus.y !== 'number') return true;
  return Math.abs(focus.x - 0.5) < 0.001 && Math.abs(focus.y - 0.5) < 0.001;
}

export function FocalImage({ uri, focus, width, height, style }) {
  const center = isCenter(focus);
  const [src, setSrc] = useState(() => (center ? null : _sizeCache.get(uri) || null));
  const [loading, setLoading] = useState(true);

  // 원본 치수는 onLoad 이벤트로 확보 (별도 getSize 호출 없음 = 이중 다운로드 회피)
  const onLoad = (e) => {
    if (center || src) return;
    const w = e?.source?.width, h = e?.source?.height;
    if (w && h) { const s = { w, h }; _sizeCache.set(uri, s); setSrc(s); }
  };

  // 로딩 오버레이 — 이미지 뜨기 전까지 어두운 칸 위 스피너 (onLoadEnd는 성공·실패 모두 발화해 항상 해제됨)
  const overlay = loading ? (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
      <Spinner size={30} color={C.paleSky} />
    </View>
  ) : null;

  // 정중앙·비율 미확보·크기 미측정 → 기본 cover
  if (center || !src || !width || !height) {
    return (
      <View style={[{ width, height, backgroundColor: '#15171A' }, style]}>
        <Image source={uri} style={{ width, height }} contentFit="cover" cachePolicy="memory-disk" transition={150}
          onLoad={onLoad} onLoadEnd={() => setLoading(false)} />
        {overlay}
      </View>
    );
  }

  // 컨테이너를 cover로 채우는 표시 크기 → focus 지점이 프레임 안에 오도록 평행이동
  const scale = Math.max(width / src.w, height / src.h);
  const dispW = src.w * scale;
  const dispH = src.h * scale;
  const left = -(dispW - width) * focus.x;
  const top = -(dispH - height) * focus.y;

  return (
    <View style={[{ width, height, overflow: 'hidden', backgroundColor: '#15171A' }, style]}>
      <Image source={uri} style={{ position: 'absolute', left, top, width: dispW, height: dispH }} contentFit="cover" cachePolicy="memory-disk"
        onLoad={onLoad} onLoadEnd={() => setLoading(false)} />
      {overlay}
    </View>
  );
}
