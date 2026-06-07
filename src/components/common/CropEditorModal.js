import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, Dimensions, ActivityIndicator, Image } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';
import * as ImageManipulator from 'expo-image-manipulator';
import { C, F, fs } from '../../constants/colors';

// 사진 크롭 에디터 (B안, 파괴적) — 고정 프레임 안에서 핀치 줌 + 자유 드래그로 구도를 잡아
//   실제로 잘라낸 새 이미지를 만든다([[cover-focal-point]]). expo-image-manipulator만 사용(네이티브 추가 없음).
//   - aspect: 'cover'(4:3, 다이어리/구장 대표사진) | 'avatar'(1:1, 프로필)
//   - 안드·iOS 동일 동작 (안드는 그동안 없던 크롭이 생김)
//   - onSave(croppedUri): 잘린 JPEG 임시 uri. 영구저장/업로드는 호출부 책임(기존 압축 파이프라인 통과).
const { width: SW, height: SH } = Dimensions.get('window');
const MAX_SCALE = 5;

const ASPECTS = {
  cover:  { ratio: 3 / 4, frameW: SW * 0.92, maxOut: 1600 }, // h/w = 3/4 (4:3 가로)
  avatar: { ratio: 1,     frameW: SW * 0.8,  maxOut: 600  },
};

export function CropEditorModal({ visible, uri, aspect = 'cover', onSave, onClose }) {
  const cfg = ASPECTS[aspect] || ASPECTS.cover;
  const frameW = cfg.frameW;
  const frameH = frameW * cfg.ratio;
  const isAvatar = aspect === 'avatar';

  const [imgSize, setImgSize] = useState(null); // 원본 { w, h }(픽셀)
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
    setSaveErr(false);
    scale.value = 1; savedScale.value = 1;
    tx.value = 0; ty.value = 0; savedTx.value = 0; savedTy.value = 0;
    Image.getSize(uri, (w, h) => setImgSize({ w, h }), () => setImgSize(null));
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
    if (!uri || !imgSize || saving) return;
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
      // renderAsync가 간헐적으로 실패(expo-image-manipulator)해 1회 재시도.
      let result;
      try {
        result = await ImageManipulator.manipulateAsync(uri, actions, opts);
      } catch (e1) {
        if (__DEV__) console.warn('[CropEditor] 1차 실패 → 재시도', e1?.message);
        result = await ImageManipulator.manipulateAsync(uri, actions, opts);
      }
      onSave && onSave(result.uri);
    } catch (e) {
      console.warn('[CropEditor] 크롭 실패', e?.message);
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
                  source={{ uri }}
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

          {/* 안내 */}
          <View pointerEvents="none" style={{ position: 'absolute', bottom: 48, left: 0, right: 0, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: 'rgba(255,255,255,0.85)', textAlign: 'center', lineHeight: 19 }}>
              두 손가락으로 확대하고{'\n'}끌어서 보여줄 부분을 맞춰주세요
            </Text>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
