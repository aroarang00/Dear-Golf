import React, { useState, useEffect } from 'react';
import { View, Image } from 'react-native';
import { C } from '../../constants/colors';
import { Spinner } from './Spinner';

// 초점(focus) 지정 커버 이미지 — resizeMode="cover"는 항상 가운데를 자르지만,
// 이건 focus{x,y}(0..1) 지점이 보이도록 채운 이미지를 평행이동해서 잘라낸다 ([[cover-focal-point]]).
//  - focus 없거나 정중앙(0.5/0.5)이면 기존과 동일한 cover (싼 경로, getSize 안 함).
//  - 그 외엔 원본 비율이 필요해 Image.getSize 1회 → 모듈 캐시. 비율 알기 전엔 cover 폴백.
//  - 로딩 중(특히 원격 친구 사진 다운로드)엔 검은 칸→팝업 대신 스피너로 '불러오는 중' 표시(2026-06-04).
const _sizeCache = new Map(); // uri → { w, h }

function isCenter(focus) {
  if (!focus || typeof focus.x !== 'number' || typeof focus.y !== 'number') return true;
  return Math.abs(focus.x - 0.5) < 0.001 && Math.abs(focus.y - 0.5) < 0.001;
}

export function FocalImage({ uri, focus, width, height, style }) {
  const center = isCenter(focus);
  const [src, setSrc] = useState(() => (center ? null : _sizeCache.get(uri) || null));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (center || !uri) return;
    const cached = _sizeCache.get(uri);
    if (cached) { setSrc(cached); return; }
    let cancelled = false;
    Image.getSize(
      uri,
      (w, h) => { const s = { w, h }; _sizeCache.set(uri, s); if (!cancelled) setSrc(s); },
      () => {}, // 실패 시 cover 폴백 유지
    );
    return () => { cancelled = true; };
  }, [uri, center]);

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
        <Image source={{ uri }} style={{ width, height }} resizeMode="cover" onLoadEnd={() => setLoading(false)} />
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
      <Image source={{ uri }} style={{ position: 'absolute', left, top, width: dispW, height: dispH }} onLoadEnd={() => setLoading(false)} />
      {overlay}
    </View>
  );
}
