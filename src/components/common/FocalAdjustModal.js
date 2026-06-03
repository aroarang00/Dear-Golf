import React, { useState, useRef, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, Image, Dimensions, PanResponder } from 'react-native';
import { C, F, fs } from '../../constants/colors';

const { width: SW } = Dimensions.get('window');

// 대표사진 "보여줄 부분" 조정 — 4:3 커버 프레임 안에서 사진을 드래그해 초점을 맞춘다 ([[cover-focal-point]]).
//   카드 커버(photoHero43)와 같은 4:3 비율로 미리보기 = 실제 노출과 일치.
//   onSave(focus{x,y} 0..1) — 기본 중앙(0.5/0.5). 원본은 건드리지 않음.
export function FocalAdjustModal({ visible, uri, focus, onSave, onClose }) {
  const frameW = SW * 0.9;
  const frameH = frameW * 3 / 4;
  const [size, setSize] = useState(null); // 원본 { w, h }
  const focusRef = useRef({ x: 0.5, y: 0.5 });
  const [, force] = useState(0);

  useEffect(() => {
    if (!visible || !uri) return;
    focusRef.current = {
      x: focus && typeof focus.x === 'number' ? focus.x : 0.5,
      y: focus && typeof focus.y === 'number' ? focus.y : 0.5,
    };
    setSize(null);
    Image.getSize(uri, (w, h) => setSize({ w, h }), () => setSize(null));
  }, [visible, uri]);

  // cover로 프레임을 채우는 표시 크기 + 축별 넘침(overflow) — 드래그 범위
  const scale = size ? Math.max(frameW / size.w, frameH / size.h) : 1;
  const dispW = size ? size.w * scale : frameW;
  const dispH = size ? size.h * scale : frameH;
  const overX = Math.max(0, dispW - frameW);
  const overY = Math.max(0, dispH - frameH);

  const startRef = useRef({ x: 0.5, y: 0.5 }); // 제스처 시작 시점 focus 스냅샷
  const overRef = useRef({ x: 0, y: 0 });      // 축별 넘침(px) — 드래그 매핑용, 매 렌더 갱신
  overRef.current = { x: overX, y: overY };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => { startRef.current = { ...focusRef.current }; },
      onPanResponderMove: (_, g) => {
        const oX = overRef.current.x, oY = overRef.current.y;
        const nx = oX > 0 ? clamp(startRef.current.x - g.dx / oX, 0, 1) : 0.5;
        const ny = oY > 0 ? clamp(startRef.current.y - g.dy / oY, 0, 1) : 0.5;
        focusRef.current = { x: nx, y: ny };
        force(v => v + 1);
      },
    }),
  ).current;

  if (!visible || !uri) return null;

  const f = focusRef.current;
  const left = -overX * f.x;
  const top = -overY * f.y;
  const movable = overX > 1 || overY > 1;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'space-between', paddingTop: 60, paddingBottom: 32 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20 }}>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ fontFamily: F.sys, fontSize: fs(15), color: '#fff' }}>취소</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onSave && onSave({ x: round3(f.x), y: round3(f.y) })}>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: C.butter }}>저장</Text>
          </TouchableOpacity>
        </View>

        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: '#fff', marginBottom: 14 }}>대표사진 — 보여줄 부분</Text>
          <View
            {...pan.panHandlers}
            style={{ width: frameW, height: frameH, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' }}>
            <Image source={{ uri }} style={{ position: 'absolute', left, top, width: dispW, height: dispH }} />
            {/* 4:3 가이드 — 카드 커버와 동일 비율임을 인지 */}
            <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', borderRadius: 12 }} />
          </View>
          <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: 'rgba(255,255,255,0.8)', marginTop: 14, textAlign: 'center', lineHeight: 18 }}>
            {movable
              ? '사진을 드래그해\n보여줄 부분을 맞춰주세요'
              : '이 비율에선 사진 전체가\n그대로 보여져요'}
          </Text>
        </View>

        <View style={{ alignItems: 'center' }}>
          <TouchableOpacity onPress={() => { focusRef.current = { x: 0.5, y: 0.5 }; force(v => v + 1); }}
            style={{ paddingVertical: 8, paddingHorizontal: 16 }}>
            <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: 'rgba(255,255,255,0.7)' }}>가운데로 초기화</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function round3(v) { return Math.round(v * 1000) / 1000; }
