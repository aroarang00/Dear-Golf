import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, useAnimatedReaction, withSpring, withTiming, runOnJS,
} from 'react-native-reanimated';

// 고정 높이 행들의 드래그 순서변경 리스트 (크루 목록 등). 드래그는 renderItem이 넘겨주는 핸들 제스처로만 시작
//  → 행 본문의 탭/길게누르기와 충돌 없음. 화면에 다 보이는 짧은 목록 기준(드래그 중 자동 스크롤 없음).
//  items: [{ id, ... }] (이미 원하는 순서). rowHeight: 행 높이(px). onReorder(orderedIds): 드롭 시 호출.
//  renderItem: (item, dragGesture) => JSX  — dragGesture를 핸들의 <GestureDetector>에 연결.
export function DraggableRows({ items, rowHeight, onReorder, renderItem }) {
  const ids = items.map((i) => i.id);
  const idsKey = ids.join(',');
  const positions = useSharedValue(Object.fromEntries(ids.map((id, i) => [id, i])));
  const activeId = useSharedValue('');

  // 항목 집합(추가·삭제·외부 순서변경)이 바뀌면 위치 재동기화 — 드래그 중이 아닐 때만(드래그 중 들어오는 실시간 업데이트 무시).
  useEffect(() => {
    if (activeId.value) return;
    positions.value = Object.fromEntries(ids.map((id, i) => [id, i]));
  }, [idsKey]);

  // commit은 안정 참조(useCallback) + 최신 ids/onReorder는 ref로 — 드래그 중 리렌더에도 제스처가 안 끊기게.
  const idsRef = useRef(ids); idsRef.current = ids;
  const onReorderRef = useRef(onReorder); onReorderRef.current = onReorder;
  const commit = useCallback(() => {
    const pos = positions.value;
    const curIds = idsRef.current;
    // pos에 없는 id(드래그 도중 추가된 크루)는 맨 뒤로 — 0번(맨 위)으로 튀지 않게.
    const orderedIds = [...curIds].sort((a, b) => (pos[a] ?? 1e6) - (pos[b] ?? 1e6));
    onReorderRef.current(orderedIds);
  }, []);

  return (
    <View style={{ height: items.length * rowHeight }}>
      {items.map((item) => (
        <DragRow key={item.id} item={item} count={items.length} rowHeight={rowHeight}
          positions={positions} activeId={activeId} onCommit={commit} renderItem={renderItem} />
      ))}
    </View>
  );
}

function DragRow({ item, count, rowHeight, positions, activeId, onCommit, renderItem }) {
  const top = useSharedValue((positions.value[item.id] ?? 0) * rowHeight);
  const startTop = useSharedValue(0);

  // 다른 행이 밀려날 때(내가 드래그 중 아님) 새 자리로 스프링 이동
  useAnimatedReaction(
    () => positions.value[item.id],
    (idx) => { if (idx != null && activeId.value !== item.id) top.value = withSpring(idx * rowHeight, { damping: 22, stiffness: 220 }); },
  );

  // ★제스처 메모이즈 — 매 렌더마다 재생성하면 GestureDetector가 진행 중 팬을 떨굼(드래그 중 실시간 업데이트 도착 시 끊김).
  //   item.id/count/rowHeight 바뀔 때만 재생성(일반적인 _ts 변동 등엔 불변). positions·activeId·top·startTop·onCommit은 안정 참조.
  const drag = useMemo(() => Gesture.Pan()
    .onStart(() => { activeId.value = item.id; startTop.value = (positions.value[item.id] ?? 0) * rowHeight; })
    .onUpdate((e) => {
      top.value = startTop.value + e.translationY;
      const newIndex = Math.min(Math.max(Math.round(top.value / rowHeight), 0), count - 1);
      const curIndex = positions.value[item.id];
      if (newIndex !== curIndex) {
        const np = { ...positions.value };
        for (const k in np) { if (np[k] === newIndex) np[k] = curIndex; }   // 자리 차지하던 행을 내 옛 자리로
        np[item.id] = newIndex;
        positions.value = np;
      }
    })
    .onEnd(() => {
      top.value = withSpring((positions.value[item.id] ?? 0) * rowHeight);
      activeId.value = '';
      runOnJS(onCommit)();
    }),
  [item.id, count, rowHeight]); // eslint-disable-line react-hooks/exhaustive-deps

  const aStyle = useAnimatedStyle(() => {
    const dragging = activeId.value === item.id;
    return {
      position: 'absolute', left: 0, right: 0, top: top.value, height: rowHeight,
      zIndex: dragging ? 20 : 1,
      transform: [{ scale: withTiming(dragging ? 1.02 : 1, { duration: 120 }) }],
      shadowColor: '#1A3D52', shadowOpacity: withTiming(dragging ? 0.18 : 0, { duration: 120 }),
      shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: dragging ? 6 : 0,
    };
  });

  return (
    <Animated.View style={aStyle}>
      {renderItem(item, drag, GestureDetector)}
    </Animated.View>
  );
}
