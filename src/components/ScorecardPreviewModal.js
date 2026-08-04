import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, PanResponder,
  ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import { C, F, fs } from '../constants/colors';

// 스코어카드 '읽기 전' 방향 확인 + 담을 부분 선택 — 크게 보여주고, 이미 그려진 박스의 모서리만 끌어 조절(중장년 친화).
//   ★AI 1회만 호출. 회전=원본 누적각 로컬 처리(열화 없음). 크롭=박스를 이미지 픽셀 좌표로 변환해 잘라냄
//    (배경·광고·테두리 반사 제거로 정확도↑). 박스가 전체면 그대로 읽음. 사진 여러 장은 한 장씩 넘어가며 처리.
//   onConfirm(uris): 회전·크롭 적용된 uri 배열. (너나픽 ImageCropModal 방식 이식)
const MIN_SIZE = 56;
const HANDLE = 32;

export function ScorecardPreviewModal({ visible, uris = [], onConfirm, onCancel }) {
  const { width: winW, height: winH } = useWindowDimensions();
  const [photos, setPhotos] = useState([]); // [{ orig, uri, angle, iw, ih }]
  const [idx, setIdx] = useState(0);
  const [container, setContainer] = useState(null); // { w, h }
  const [box, setBox] = useState(null);             // 크롭 박스(뷰 좌표)
  const [busy, setBusy] = useState(false);          // 회전/처리 중

  const rectRef = useRef(null);   // { offX, offY, dispW, dispH, scale }
  const boxRef = useRef(null);
  const startBox = useRef(null);
  const resultsRef = useRef([]);
  boxRef.current = box;

  // 열릴 때 원본 로드 — manipulate([])로 EXIF 방향 정규화 + 픽셀 크기 확보
  useEffect(() => {
    if (!visible) { setPhotos([]); setIdx(0); setBox(null); setBusy(false); resultsRef.current = []; return; }
    let cancelled = false;
    (async () => {
      const init = [];
      for (const u of uris) {
        try {
          const r = await ImageManipulator.manipulateAsync(u, [], { compress: 1, format: ImageManipulator.SaveFormat.JPEG });
          init.push({ orig: r.uri, uri: r.uri, angle: 0, iw: r.width, ih: r.height });
        } catch { init.push({ orig: u, uri: u, angle: 0, iw: 0, ih: 0 }); }
      }
      if (!cancelled) { setPhotos(init); setIdx(0); setBox(null); resultsRef.current = []; }
    })();
    return () => { cancelled = true; };
  }, [visible, uris]);

  // 컨테이너 + 현재 사진 크기 → 표시 사각형 계산. 박스가 없으면(초기/회전/다음사진) '전체'로 채움.
  useEffect(() => {
    const p = photos[idx];
    if (!p || !p.iw || !p.ih || !container) return;
    const scale = Math.min(container.w / p.iw, container.h / p.ih);
    const dispW = p.iw * scale, dispH = p.ih * scale;
    const offX = (container.w - dispW) / 2, offY = (container.h - dispH) / 2;
    rectRef.current = { offX, offY, dispW, dispH, scale };
    // 초기 박스는 살짝 안쪽(6%) — 모서리 핸들이 사진 안에 보여 '조절 가능'이 직관적. 거의 전체라 안 만지면 전체로 읽힘(applyCrop 스킵).
    if (box === null) {
      const m = 0.06;
      setBox({ x: offX + dispW * m, y: offY + dispH * m, w: dispW * (1 - m * 2), h: dispH * (1 - m * 2) });
    }
  }, [photos, idx, container, box]);

  const clampBox = (b) => {
    const r = rectRef.current;
    if (!r) return b;
    let { x, y, w, h } = b;
    w = Math.max(MIN_SIZE, Math.min(w, r.dispW));
    h = Math.max(MIN_SIZE, Math.min(h, r.dispH));
    if (x < r.offX) x = r.offX;
    if (y < r.offY) y = r.offY;
    if (x + w > r.offX + r.dispW) x = r.offX + r.dispW - w;
    if (y + h > r.offY + r.dispH) y = r.offY + r.dispH - h;
    return { x, y, w, h };
  };

  // 박스 전체 이동
  const movePan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { startBox.current = boxRef.current; },
    onPanResponderMove: (_e, g) => {
      const s = startBox.current; if (!s) return;
      setBox(clampBox({ ...s, x: s.x + g.dx, y: s.y + g.dy }));
    },
  })).current;

  // 모서리 리사이즈
  const makeCorner = (corner) => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { startBox.current = boxRef.current; },
    onPanResponderMove: (_e, g) => {
      const s = startBox.current; if (!s) return;
      let { x, y, w, h } = s;
      if (corner === 'tl') { x = s.x + g.dx; y = s.y + g.dy; w = s.w - g.dx; h = s.h - g.dy; }
      else if (corner === 'tr') { y = s.y + g.dy; w = s.w + g.dx; h = s.h - g.dy; }
      else if (corner === 'bl') { x = s.x + g.dx; w = s.w - g.dx; h = s.h + g.dy; }
      else { w = s.w + g.dx; h = s.h + g.dy; }
      if (w < MIN_SIZE) { if (corner === 'tl' || corner === 'bl') x = s.x + s.w - MIN_SIZE; w = MIN_SIZE; }
      if (h < MIN_SIZE) { if (corner === 'tl' || corner === 'tr') y = s.y + s.h - MIN_SIZE; h = MIN_SIZE; }
      setBox(clampBox({ x, y, w, h }));
    },
  });
  const corners = useRef({ tl: makeCorner('tl'), tr: makeCorner('tr'), bl: makeCorner('bl'), br: makeCorner('br') }).current;

  // 90° 회전 — 원본에서 누적각으로. 회전하면 좌표계가 바뀌므로 박스는 초기화(전체로 다시 채워짐).
  const rotate = async () => {
    const p = photos[idx];
    if (!p || busy) return;
    const angle = ((p.angle || 0) + 90) % 360;
    setBusy(true);
    try {
      const r = await ImageManipulator.manipulateAsync(p.orig, [{ rotate: angle }], { compress: 1, format: ImageManipulator.SaveFormat.JPEG });
      setPhotos(prev => prev.map((q, k) => (k === idx ? { ...q, uri: r.uri, angle, iw: r.width, ih: r.height } : q)));
      setBox(null);
    } catch {} finally { setBusy(false); }
  };

  // 현재 사진에 박스 크롭 적용 → uri 반환(전체 선택이면 원본 그대로)
  const applyCrop = async () => {
    const p = photos[idx], r = rectRef.current, b = boxRef.current;
    if (!p || !r || !b) return p?.uri;
    if (b.w >= r.dispW * 0.85 && b.h >= r.dispH * 0.85) return p.uri; // 거의 전체(안 만짐/조금만) = 크롭 스킵 → 전체 읽기
    const originX = Math.max(0, Math.round((b.x - r.offX) / r.scale));
    const originY = Math.max(0, Math.round((b.y - r.offY) / r.scale));
    const width = Math.max(1, Math.min(Math.round(b.w / r.scale), p.iw - originX));
    const height = Math.max(1, Math.min(Math.round(b.h / r.scale), p.ih - originY));
    try {
      const cr = await ImageManipulator.manipulateAsync(p.uri, [{ crop: { originX, originY, width, height } }], { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG });
      return cr.uri;
    } catch { return p.uri; }
  };

  const next = async () => {
    if (busy || !photos.length) return;
    setBusy(true);
    try {
      const uri = await applyCrop();
      const results = [...resultsRef.current];
      results[idx] = uri;
      resultsRef.current = results;
      if (idx < photos.length - 1) { setIdx(idx + 1); setBox(null); }
      else onConfirm && onConfirm(photos.map((p, k) => results[k] || p.uri));
    } finally { setBusy(false); }
  };

  const last = idx >= photos.length - 1;
  const cur = photos[idx];
  const cropH = Math.min(winH * 0.56, winW * 1.15);

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Text style={styles.title}>방향 확인 · 담을 부분 선택{photos.length > 1 ? `  (${idx + 1}/${photos.length})` : ''}</Text>
        <Text style={styles.sub}>누웠으면 <Text style={styles.em}>회전</Text>, 모서리를 끌어 <Text style={styles.em}>표만</Text> 감싸면 정확해요{'\n'}그대로 둬도 전체를 읽어요</Text>

        <View
          style={[styles.cropArea, { width: winW - 48, height: cropH }]}
          onLayout={(e) => { const { width, height } = e.nativeEvent.layout; setContainer(prev => (prev && prev.w === width && prev.h === height) ? prev : { w: width, h: height }); }}>
          {cur ? <Image source={{ uri: cur.uri }} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} /> : null}

          {cur && box && rectRef.current && (
            <>
              <View style={[styles.dim, { left: 0, right: 0, top: 0, height: box.y }]} pointerEvents="none" />
              <View style={[styles.dim, { left: 0, right: 0, top: box.y + box.h, bottom: 0 }]} pointerEvents="none" />
              <View style={[styles.dim, { left: 0, width: box.x, top: box.y, height: box.h }]} pointerEvents="none" />
              <View style={[styles.dim, { right: 0, left: box.x + box.w, top: box.y, height: box.h }]} pointerEvents="none" />
              <View style={[styles.box, { left: box.x, top: box.y, width: box.w, height: box.h }]} {...movePan.panHandlers}>
                <View style={styles.grid} pointerEvents="none">
                  <View style={[styles.gridV, { left: '33.33%' }]} /><View style={[styles.gridV, { left: '66.66%' }]} />
                  <View style={[styles.gridH, { top: '33.33%' }]} /><View style={[styles.gridH, { top: '66.66%' }]} />
                </View>
              </View>
              <View style={[styles.handle, { left: box.x - HANDLE / 2, top: box.y - HANDLE / 2 }]} {...corners.tl.panHandlers} />
              <View style={[styles.handle, { left: box.x + box.w - HANDLE / 2, top: box.y - HANDLE / 2 }]} {...corners.tr.panHandlers} />
              <View style={[styles.handle, { left: box.x - HANDLE / 2, top: box.y + box.h - HANDLE / 2 }]} {...corners.bl.panHandlers} />
              <View style={[styles.handle, { left: box.x + box.w - HANDLE / 2, top: box.y + box.h - HANDLE / 2 }]} {...corners.br.panHandlers} />
            </>
          )}
          {(!cur || busy) && (
            <View style={styles.loading}><ActivityIndicator color="#fff" /></View>
          )}
        </View>

        {/* 회전 버튼 — 크게, 크롭 영역 바로 아래 */}
        <TouchableOpacity onPress={rotate} disabled={busy} activeOpacity={0.85} style={[styles.rotateBtn, { opacity: busy ? 0.5 : 1 }]}>
          <Text style={styles.rotateText}>90° 회전</Text>
        </TouchableOpacity>

        <View style={styles.actions}>
          <TouchableOpacity style={[styles.btn, styles.btnCancel]} onPress={onCancel} disabled={busy} activeOpacity={0.85}>
            <Text style={styles.btnCancelText}>취소</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnConfirm, { opacity: busy ? 0.6 : 1 }]} onPress={next} disabled={busy} activeOpacity={0.85}>
            {busy ? <ActivityIndicator color={C.butter} size="small" /> : <Text style={styles.btnConfirmText}>{last ? '이대로 읽기' : '다음 사진 →'}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', paddingVertical: 40 },
  title: { fontSize: fs(18), fontFamily: F.sysB, color: '#fff', textAlign: 'center', paddingHorizontal: 20 },
  sub: { fontSize: fs(13), fontFamily: F.sys, color: 'rgba(255,255,255,0.65)', textAlign: 'center', lineHeight: 20, marginTop: 8, marginBottom: 16, paddingHorizontal: 20 },
  em: { fontFamily: F.sysSb, color: C.butter },
  cropArea: { alignSelf: 'center', overflow: 'visible', backgroundColor: '#000' },
  dim: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.6)' },
  box: { position: 'absolute', borderWidth: 2, borderColor: '#fff' },
  grid: { ...StyleSheet.absoluteFillObject },
  gridV: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.4)' },
  gridH: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.4)' },
  handle: { position: 'absolute', width: HANDLE, height: HANDLE, borderRadius: HANDLE / 2, backgroundColor: C.butter, borderWidth: 2, borderColor: '#fff' },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  rotateBtn: { alignSelf: 'center', marginTop: 14, paddingVertical: 11, paddingHorizontal: 28, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.15)' },
  rotateText: { fontSize: fs(14), fontFamily: F.sysSb, color: '#fff' },
  actions: { flexDirection: 'row', gap: 12, paddingHorizontal: 24, marginTop: 20 },
  btn: { flex: 1, paddingVertical: 15, borderRadius: 50, alignItems: 'center', justifyContent: 'center' },
  btnCancel: { backgroundColor: 'rgba(255,255,255,0.15)' },
  btnCancelText: { fontSize: fs(15), fontFamily: F.sysM, color: '#fff' },
  btnConfirm: { flex: 1.6, backgroundColor: C.burgundy },
  btnConfirmText: { fontSize: fs(15), fontFamily: F.sysB, color: C.butter },
});
