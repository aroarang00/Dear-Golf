import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, Dimensions, ActivityIndicator, Image } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Sentry from '@sentry/react-native';
import { initialWindowMetrics } from 'react-native-safe-area-context';
import { C, F, fs } from '../../constants/colors';

// 사진 크롭 에디터 (B안, 파괴적) — 고정 프레임 안에서 핀치 줌 + 자유 드래그로 구도를 잡아
//   실제로 잘라낸 새 이미지를 만든다([[cover-focal-point]]). expo-image-manipulator만 사용(네이티브 추가 없음).
//   - aspect: 'cover'(4:3, 다이어리/구장 대표사진) | 'avatar'(1:1, 프로필)
//   - 안드·iOS 동일 동작 (안드는 그동안 없던 크롭이 생김)
//   - onSave(croppedUri): 잘린 JPEG 임시 uri. 영구저장/업로드는 호출부 책임(기존 압축 파이프라인 통과).
const { width: SW, height: SH } = Dimensions.get('window');
const MAX_SCALE = 5;
// 하단 안전영역 — 이 모달은 전체화면이라 제스처 바·내비바 아래로 버튼·안내가 깔리면 가려지거나 눌리지 않는다.
//   Modal 안에서는 useSafeAreaInsets가 0을 주는 경우가 있어 PhotoViewer와 같이 initialWindowMetrics를 쓴다.
const BOTTOM_SAFE = initialWindowMetrics?.insets?.bottom || 0;

const ASPECTS = {
  cover:  { ratio: 3 / 4, frameW: SW * 0.92, maxOut: 1600 }, // h/w = 3/4 (4:3 가로)
  avatar: { ratio: 1,     frameW: SW * 0.8,  maxOut: 600  }, // 1:1 원형 가이드(프로필)
  square: { ratio: 1,     frameW: SW * 0.92, maxOut: 1600 }, // 1:1 정사각(크루 사진 등) — 원형 아님
};

export function CropEditorModal({ visible, uri, aspect = 'cover', onSave, onClose, onUseWhole }) {
  const cfg = ASPECTS[aspect] || ASPECTS.cover;
  const frameW = cfg.frameW;
  const frameH = frameW * cfg.ratio;
  const isAvatar = aspect === 'avatar';

  const [imgSize, setImgSize] = useState(null); // 작업본 { w, h }(픽셀, EXIF 적용 후)
  const [workUri, setWorkUri] = useState(null); // EXIF 정규화한 작업본 uri — 표시·crop 좌표계 일치용
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState(false);
  // 프레임 위치는 화면상수(SH) 대신 실측 컨테이너 크기로 — 안드 상태바 차이로 인한 수직 어긋남(크롭 오차) 방지
  const [layout, setLayout] = useState({ w: SW, h: SH });

  // 표시 기준 크기 — scale=1 일 때 프레임을 꽉 채우는(cover) 크기
  const baseScale = imgSize ? Math.max(frameW / imgSize.w, frameH / imgSize.h) : 1;
  const dw0 = imgSize ? imgSize.w * baseScale : frameW; // 표시 너비(px) @scale1
  const dh0 = imgSize ? imgSize.h * baseScale : frameH;

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  // 워클릿에서 참조할 표시 크기(이미지 로드 후 갱신)
  const sdw = useSharedValue(frameW);
  const sdh = useSharedValue(frameH);

  // 열릴 때마다 원본 치수 측정 + 변환 초기화
  useEffect(() => {
    if (!visible || !uri) return;
    setImgSize(null);
    setWorkUri(null);
    setSaveErr(false);
    scale.value = 1; savedScale.value = 1;
    tx.value = 0; ty.value = 0; savedTx.value = 0; savedTy.value = 0;
    // EXIF 정규화 — 안드 Image.getSize가 EXIF 회전을 무시한 raw 크기를 줘서, 표시(회전 적용)와 crop 좌표계가
    //   어긋나 '선택은 맞는데 저장은 엉뚱'하던 버그 수정(2026-06-14). manipulateAsync가 EXIF orientation을
    //   적용한 작업본을 만들어 표시·크기측정·crop을 모두 같은 좌표계로 통일. 실패 시 원본+Image.getSize 폴백.
    let alive = true;
    ImageManipulator.manipulateAsync(uri, [], { compress: 1, format: ImageManipulator.SaveFormat.JPEG })
      .then(r => { if (alive) { setWorkUri(r.uri); setImgSize({ w: r.width, h: r.height }); } })
      .catch(() => {
        if (!alive) return;
        setWorkUri(uri);
        Image.getSize(uri, (w, h) => { if (alive) setImgSize({ w, h }); }, () => { if (alive) setImgSize(null); });
      });
    return () => { alive = false; };
  }, [visible, uri]);

  useEffect(() => { sdw.value = dw0; sdh.value = dh0; }, [dw0, dh0]);

  // 이미지가 항상 프레임을 덮도록 pan 범위 제한 (빈 여백 노출 방지)
  const clampPan = () => {
    'worklet';
    const maxTx = Math.max(0, (sdw.value * scale.value - frameW) / 2);
    const maxTy = Math.max(0, (sdh.value * scale.value - frameH) / 2);
    tx.value = Math.min(maxTx, Math.max(-maxTx, tx.value));
    ty.value = Math.min(maxTy, Math.max(-maxTy, ty.value));
  };

  const pan = Gesture.Pan()
    .onUpdate(e => {
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
      clampPan();
    })
    .onEnd(() => { savedTx.value = tx.value; savedTy.value = ty.value; });

  const pinch = Gesture.Pinch()
    .onUpdate(e => {
      scale.value = Math.min(MAX_SCALE, Math.max(1, savedScale.value * e.scale));
      clampPan();
    })
    .onEnd(() => { savedScale.value = scale.value; });

  const gesture = Gesture.Simultaneous(pan, pinch);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  const handleSave = async () => {
    if (!workUri || !imgSize || saving) return;
    setSaving(true);
    setSaveErr(false);
    try {
      const s = scale.value;
      const displayScale = baseScale * s; // 화면 px / 원본 px
      let cropW = frameW / displayScale;
      let cropH = frameH / displayScale;
      let originX = (dw0 * s) / 2 - frameW / 2 - tx.value;
      let originY = (dh0 * s) / 2 - frameH / 2 - ty.value;
      originX /= displayScale;
      originY /= displayScale;
      // 원본 경계 내로 정수 클램프 + 최소 1px 보장 — 줌·제스처 값에 따라 0/범위초과가 되면
      //   renderAsync가 거부해 간헐 실패하던 것 방지.
      cropW = Math.max(1, Math.min(imgSize.w, Math.round(cropW)));
      cropH = Math.max(1, Math.min(imgSize.h, Math.round(cropH)));
      originX = Math.min(imgSize.w - cropW, Math.max(0, Math.round(originX)));
      originY = Math.min(imgSize.h - cropH, Math.max(0, Math.round(originY)));

      const actions = [{ crop: { originX, originY, width: cropW, height: cropH } }];
      if (cropW > cfg.maxOut) actions.push({ resize: { width: cfg.maxOut } });

      const opts = { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG };
      // ★자를 원본은 workUri(EXIF 정규화 임시본)가 아니라 원본 uri — iOS 정식앱에서 '저장에 실패했어요'가
      //   재시도해도 계속 나던 원인(2026-07-21). 임시본은 캐시에 있어 저장 시점엔 이미 정리됐을 수 있는데,
      //   화면 이미지는 RN이 디코드해 들고 있어 멀쩡해 보이니 '보이는데 저장만 실패'가 됐다.
      //   manipulateAsync는 디코드 시 EXIF 회전을 적용하므로 원본에서 잘라도 좌표계는 imgSize와 같다.
      //   원본이 실패할 때만 임시본으로 한 번 더(옛 동작 폴백 — 원본이 원격/특수 URI인 경우 대비).
      let result;
      try {
        result = await ImageManipulator.manipulateAsync(uri, actions, opts);
      } catch (e1) {
        if (__DEV__) console.warn('[CropEditor] 원본 크롭 실패 → 정규화본으로 재시도', e1?.message);
        result = await ImageManipulator.manipulateAsync(workUri, actions, opts);
      }
      onSave && onSave(result.uri);
    } catch (e) {
      console.warn('[CropEditor] 크롭 실패', e?.message);
      // 정식앱에서만 재현되던 실패라 원인 추적 경로를 남긴다 — 로컬 재현이 안 되면 Sentry가 유일한 단서.
      try { Sentry.captureException(e, { extra: { where: 'CropEditorModal.handleSave', aspect, imgSize } }); } catch { /* noop */ }
      setSaveErr(true); // 사용자에게 안내(조용한 실패 방지)
    } finally {
      setSaving(false); // 성공·실패 모두 스피너 해제(무한 '저장 중' 방지)
    }
  };

  if (!visible || !uri) return null;

  // 프레임 바깥 어둡게 — 실측 컨테이너 중앙 기준 프레임 위치 (이미지도 같은 컨테이너에서 flex 중앙정렬 → 정확히 일치)
  const frameLeft = (layout.w - frameW) / 2;
  const frameTop = (layout.h - frameH) / 2;
  const mask = 'rgba(0,0,0,0.62)';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View
          style={{ flex: 1, backgroundColor: '#000' }}
          onLayout={e => {
            const { width, height } = e.nativeEvent.layout;
            if (width !== layout.w || height !== layout.h) setLayout({ w: width, h: height });
          }}>
          {/* 이미지 (화면 중앙, 프레임보다 크게 — 바깥 부분도 보이며 잘릴 영역 인지) */}
          {imgSize ? (
            <GestureDetector gesture={gesture}>
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Animated.Image
                  source={{ uri: workUri }}
                  style={[{ width: dw0, height: dh0 }, animStyle]}
                  resizeMode="cover"
                />
              </View>
            </GestureDetector>
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={C.paleSky} />
            </View>
          )}

          {/* 프레임 바깥 마스크 (4면) */}
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: frameTop, backgroundColor: mask }} />
          <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, top: frameTop + frameH, backgroundColor: mask }} />
          <View pointerEvents="none" style={{ position: 'absolute', top: frameTop, left: 0, width: frameLeft, height: frameH, backgroundColor: mask }} />
          <View pointerEvents="none" style={{ position: 'absolute', top: frameTop, right: 0, width: frameLeft, height: frameH, backgroundColor: mask }} />
          {/* 프레임 테두리 (아바타는 원형 가이드) */}
          <View pointerEvents="none" style={{
            position: 'absolute', top: frameTop, left: frameLeft, width: frameW, height: frameH,
            borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.9)',
            borderRadius: isAvatar ? frameW / 2 : 8,
          }} />

          {/* 상단 바 */}
          <View style={{ position: 'absolute', top: 52, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20 }}>
            <TouchableOpacity onPress={onClose} disabled={saving} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(15), color: '#fff' }}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} disabled={saving || !imgSize} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: saving ? 'rgba(255,255,255,0.5)' : C.butter }}>
                {saving ? '저장 중…' : '저장'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* 저장 실패 안내 — 조용한 실패 방지 */}
          {saveErr && (
            <View pointerEvents="none" style={{ position: 'absolute', top: 86, left: 0, right: 0, alignItems: 'center' }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: '#fff',
                backgroundColor: 'rgba(150,40,40,0.92)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, overflow: 'hidden' }}>
                저장에 실패했어요. 다시 시도해 주세요.
              </Text>
            </View>
          )}

          {/* 안내 — 전체담기 버튼이 있으면 그 위로 충분히 띄운다(겹침 방지). 하단 안전영역도 함께 반영. */}
          <View pointerEvents="none" style={{ position: 'absolute', bottom: (onUseWhole ? 124 : 48) + BOTTOM_SAFE, left: 0, right: 0, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: 'rgba(255,255,255,0.85)', textAlign: 'center', lineHeight: 19 }}>
              두 손가락으로 확대하고{'\n'}끌어서 보여줄 부분을 맞춰주세요
            </Text>
          </View>

          {/* 전체 담기 — 축소는 프레임을 꽉 채워야 해서 1배 미만으로 못 줄인다(줄이면 빈 공간이 생기는데
              잘라낸 결과물에 여백을 넣을 수 없음). 대신 '자르지 않고 원본 그대로 쓰기'를 제공한다.
              피드가 비율이 다른 사진을 흐린 배경 위에 통째로 보여주므로, 결과적으로 사진이 다 보인다.
              호출부가 onUseWhole을 줄 때만 노출(아바타·크루 사진처럼 반드시 잘라야 하는 곳은 미노출). */}
          {onUseWhole && (
            <View style={{ position: 'absolute', bottom: 26 + BOTTOM_SAFE, left: 0, right: 0, alignItems: 'center' }}>
              <TouchableOpacity onPress={onUseWhole} disabled={saving} activeOpacity={0.8}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)',
                  borderRadius: 22, paddingHorizontal: 18, paddingVertical: 10 }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(13.5), color: '#fff' }}>사진 전체 담기</Text>
              </TouchableOpacity>
              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: 'rgba(255,255,255,0.6)', marginTop: 7 }}>
                자르지 않고 원본 그대로 써요
              </Text>
            </View>
          )}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
