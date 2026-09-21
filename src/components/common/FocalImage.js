import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Platform } from 'react-native';
import { Image } from 'expo-image';
import { C } from '../../constants/colors';
import { Spinner } from './Spinner';
import { primePhotoRatio } from './PhotoViewer';
import { setPhotoRatio } from '../../utils/photoRatio';
import { useDiag } from '../../utils/diag';   // ★임시 진단 — 화면 오버레이 스위치

// 초점(focus) 지정 커버 이미지 — resizeMode="cover"는 항상 가운데를 자르지만,
// 이건 focus{x,y}(0..1) 지점이 보이도록 채운 이미지를 평행이동해서 잘라낸다 ([[cover-focal-point]]).
//  - 크롭에디터로 4:3 잘라 넣은 사진은 focus 불필요(가운데 경로). focus는 기존 데이터 하위호환.
//    크롭 없이 그냥 저장한 세로 사진은 아래 '세로 자동 초점'이 위쪽 기준으로 잡아준다.
//  - expo-image 사용 → 메모리·디스크 캐시(피드 재스크롤 시 재다운로드 방지) + onLoad로 원본 치수 확보
//    (기존 Image.getSize 별도 호출=이중 다운로드 제거). 6f5da8f 재적용(ec7a584 dev 되돌림이 미복구였음 [[image-load-speed]]).
//  - 로딩 중(특히 원격 친구 사진)엔 검은 칸 대신 스피너로 '불러오는 중' 표시.
const _sizeCache = new Map(); // uri → { w, h }
// ★임시 진단(2026-09-17) — 친구 피드 첫 카드만 흐린 문제 추적. 원인 잡으면 제거. dev 전용.
const DIAG = __DEV__;
const _tail = (u) => (typeof u === 'string' ? u.split('?')[0].slice(-22) : String(u));

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

// sharp — 공유 카드 캡처용(2026-08-26): allowDownscaling을 꺼 원본 해상도로 디코드(pixelRatio 3 캡처 선명도).
//   피드에선 기본 false(다운스케일 허용) 유지 — 전역으로 끄면 피드 메모리가 치솟는다.
// forceFocus — 공유 카드 '사진 위치 조정'용(2026-08-26): focus가 정중앙이어도 명시 초점으로 취급해
//   자동 상단초점·fitWhole(블러+통짜) 분기를 건너뛴다 → 조정 전엔 기존과 동일한 중앙 크롭, 드래그하면 평행이동.
export function FocalImage({ uri, focus, width, height, style, onRatio, sharp = false, forceFocus = false }) {
  const explicit = forceFocus ? !!focus : !isCenter(focus);   // 사용자가 크롭·초점을 직접 지정한 사진
  const [src, setSrc] = useState(() => _sizeCache.get(uri) || null);
  // ★2026-09-21 실험 — 캐시 유무와 무관하게 모든 사진이 같은 상태 흐름(loading true → onLoad → false)을 탄다.
  //   진단 결과 '첫 카드만 흐림'의 유일한 차이가 "치수 캐시가 있어 스피너·로드 후 재렌더 없이 마운트"였다
  //   (경로·틀·원본·로드 횟수 전부 동일). 스피너 깜빡임은 아래 slow(120ms 지연)로 막는다.
  const [loading, setLoading] = useState(true);
  const [slow, setSlow] = useState(false);   // 로딩이 120ms를 넘길 때만 스피너 — 캐시된 사진은 그 전에 끝나 깜빡임 없음
  // ★임시 진단 — 마운트 틀·로드 이력을 모아 오버레이로 보여준다(프로덕션 확인용)
  const diagOn = useDiag();
  const diagRef = useRef({ mountW: width, mountH: height, mountCached: !!_sizeCache.get(uri), loads: 0, displays: 0, cache: '-', srcTxt: '-', urlMatch: '-' });
  const [, bumpDiag] = useState(0);

  // uri가 바뀌어 이 컴포넌트 인스턴스가 재사용되면(캐러셀 ±1 윈도잉·스크롤) 상태를 새 uri에 맞춰 초기화한다.
  //   안 하면 옛 loading/src가 남아 ①스피너 고착(onLoadEnd 누락 케이스) ②옛 사진 잔상.
  //   + 안전 타임아웃 — 어떤 이유로 로드 이벤트가 다 누락돼도 스피너가 영영 안 도는 일이 없게(무한로딩 근본 차단).
  useEffect(() => {
    const cached = _sizeCache.get(uri) || null;
    if (DIAG) console.log('[FocalImage] mount', _tail(uri), 'frame', Math.round(width), 'x', Math.round(height), 'cachedSrc', cached ? `${cached.w}x${cached.h}` : 'none', 'focus', focus ? `${focus.x},${focus.y}` : '-');
    setSrc(cached);
    setLoading(true);
    const t = setTimeout(() => setLoading(false), 8000);
    return () => clearTimeout(t);
  }, [uri]);
  useEffect(() => {
    if (!loading) { setSlow(false); return undefined; }
    const t = setTimeout(() => setSlow(true), 120);
    return () => clearTimeout(t);
  }, [loading]);
  // 진단 — 틀 크기 변화 추적(마운트 후 바뀌면 네이티브가 재디코드해야 함)
  useEffect(() => {
    if (DIAG) console.log('[FocalImage] frame', _tail(uri), Math.round(width), 'x', Math.round(height));
  }, [uri, width, height]);

  // 원본 치수는 onLoad 이벤트로 확보 (별도 getSize 호출 없음 = 이중 다운로드 회피)
  const onLoad = (e) => {
    setLoading(false);   // 성공 로드 = 스피너 해제 (onLoadEnd가 누락돼도 여기서 확실히 꺼짐)
    const w = e?.source?.width, h = e?.source?.height;
    if (DIAG) console.log('[FocalImage] load', _tail(uri), 'src', `${w}x${h}`, 'cache', e?.cacheType, 'frame', Math.round(width), 'x', Math.round(height));
    diagRef.current.loads += 1;
    diagRef.current.cache = String(e?.cacheType || '?');
    diagRef.current.srcTxt = `${w}x${h}`;
    // 진단 — onLoad가 '이 uri'의 것인지(네이티브 뷰 재활용으로 옛 소스 이벤트가 섞이는지) 확인
    const loadedUrl = String(e?.source?.url || '');
    diagRef.current.urlMatch = !loadedUrl ? '?' : (loadedUrl === uri ? 'same' : `DIFF ${_tail(loadedUrl).slice(-10)}`);
    bumpDiag((n) => n + 1);
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
  // 진단 — 네이티브가 실제로 화면에 그린 횟수(onDisplay)
  const onDisplay = () => { diagRef.current.displays += 1; bumpDiag((n) => n + 1); };

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
  // 진단 — 어느 렌더 경로인지(whole=블러배경+통짜 / cover / focal=평행이동)
  const path = fitWhole ? 'whole' : (!eff || !src || !width || !height) ? 'cover' : 'focal';
  useEffect(() => {
    if (DIAG) console.log('[FocalImage] path', _tail(uri), path, eff ? `eff=${eff.x},${eff.y}` : '');
  }, [uri, path]);
  // ★임시 진단 오버레이 — 프로덕션에서 첫 카드가 왜 흐린지 눈으로 확인. 숨김 스위치(useDiag) 켜졌을 때만.
  //   P=렌더경로 F=지금 틀 M=마운트 틀(캐시 여부) S=원본 px L=로드 횟수(캐시종류)
  const d = diagRef.current;
  const diagNode = diagOn ? (
    <View pointerEvents="none" style={{ position: 'absolute', top: 4, left: 4, backgroundColor: 'rgba(0,0,0,0.72)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 }}>
      <Text style={{ color: '#9EF59E', fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
        {`P:${path} F:${Math.round(width)}x${Math.round(height)}\nM:${Math.round(d.mountW)}x${Math.round(d.mountH)}${d.mountCached ? '*' : ''} S:${d.srcTxt}\nL:${d.loads}(${d.cache}) D:${d.displays} U:${d.urlMatch}\n${Platform.OS === 'ios' ? 'i' : 'a'} v2 ${_tail(uri).slice(-10)}`}
      </Text>
    </View>
  ) : null;

  // 로딩 오버레이 — 이미지 뜨기 전까지 어두운 칸 위 스피너 (onLoadEnd는 성공·실패 모두 발화해 항상 해제됨)
  const overlay = (loading && slow) ? (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
      <Spinner size={30} color={C.paleSky} />
    </View>
  ) : null;

  // 비율이 크게 다른 사진 → 흐린 배경(cover) 위에 사진 전체(contain). 잘림 없음.
  if (fitWhole) {
    return (
      <View style={[{ width, height, backgroundColor: '#15171A', overflow: 'hidden' }, style]}>
        {/* ★흐린 배경과 선명한 앞 레이어의 recyclingKey를 분리(#bg) — 같은 키면 첫 로드 때 앞 레이어가
            안 덮이고 흐린 배경만 남아 '첫 사진 흐림'이 재마운트 전까지 지속되던 것 수정. 앞 레이어는 전환 없이 즉시. */}
        <Image source={uri} style={{ position: 'absolute', left: 0, top: 0, width, height }} contentFit="cover"
          blurRadius={18} cachePolicy="memory-disk" allowDownscaling={!sharp} recyclingKey={`${uri}#bg`} />
        <Image source={uri} style={{ width, height }} contentFit="contain" cachePolicy="memory-disk" allowDownscaling={!sharp}
          transition={0}
          onLoad={onLoad} onDisplay={onDisplay} onLoadEnd={() => setLoading(false)} onError={() => setLoading(false)} recyclingKey={uri} />
        {overlay}
        {diagNode}
      </View>
    );
  }

  // 가운데(가로 사진 등)·비율 미확보·크기 미측정 → 기본 cover
  if (!eff || !src || !width || !height) {
    return (
      <View style={[{ width, height, backgroundColor: '#15171A' }, style]}>
        <Image source={uri} style={{ width, height }} contentFit="cover" cachePolicy="memory-disk" allowDownscaling={!sharp} transition={Platform.OS === 'android' ? 0 : 150}
          onLoad={onLoad} onDisplay={onDisplay} onLoadEnd={() => setLoading(false)} onError={() => setLoading(false)} recyclingKey={uri} />
        {overlay}
        {diagNode}
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
      <Image source={uri} style={{ position: 'absolute', left, top, width: dispW, height: dispH }} contentFit="cover" cachePolicy="memory-disk" allowDownscaling={!sharp}
        onLoad={onLoad} onDisplay={onDisplay} onLoadEnd={() => setLoading(false)} onError={() => setLoading(false)} recyclingKey={uri} />
      {overlay}
      {diagNode}
    </View>
  );
}
