// 1회성 공지 팝업 — 홈 진입 시 안 본 공지를 순서대로 하나씩 띄운다(사용자 요청 2026-08-27).
// ⛔모달 위 모달 금지: 항상 한 번에 하나만 렌더, 닫힌 뒤 450ms 지나서 다음 공지를 연다.
// 신규 설치(홈 툴팁도 아직 안 본 사용자)에겐 개편·기능 공지가 무의미 — 조용히 본 것으로 처리.
import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, Pressable } from 'react-native';
import { storage, STORAGE_KEYS } from '../utils/storage';
import { Icon } from './common/Icon';
import { C, F, fs } from '../constants/colors';

// 공지 정의 — 다 본 공지는 여기서 지워도 무방(플래그는 남아 무해). 새 공지는 뒤에 추가.
const NOTICES = [
  {
    storageKey: STORAGE_KEYS.noticeRedesignSeen,
    icon: 'sparkle', ic: '#8A6A33', tint: '#FAEDB8', // butter 톤
    title: '디어골프가 새로워졌어요',
    items: [
      { icon: 'pin', ic: '#3A5A78', text: '코스 탭 — 전국 지도에서 골프장을 바로 둘러보세요. 금색 핀은 100대 코스예요' },
      { icon: 'people', ic: '#4A4038', text: '모임 탭 — 친구·라운딩 모집·크루가 한곳에 모였어요' },
      { icon: 'home', ic: '#6B1E2A', text: '홈 — 최근 라운딩 사진과 골프 가계부를 한눈에' },
    ],
  },
  {
    storageKey: STORAGE_KEYS.noticeScorecardParSeen,
    icon: 'camera', ic: '#2E5A7A', tint: '#D6E4EF', // paleSky 톤
    title: '스코어카드, 더 잘 읽어요',
    body: 'PAR 줄이 없는 요약 스코어카드 사진도 이제 홀별로 읽어 자동입력해요. 다녀온 라운딩의 스코어카드를 올려보세요.',
  },
];

export function OneTimeNotices() {
  const [queue, setQueue] = useState([]);   // 아직 안 띄운 공지들
  const [cur, setCur] = useState(null);     // 지금 떠 있는 공지 (한 번에 하나)

  useEffect(() => {
    let alive = true;
    (async () => {
      // 신규 설치 판별 — 홈 첫 툴팁도 아직인 사용자는 "바뀐 걸" 모른다. 공지 없이 플래그만 심음.
      const fresh = !(await storage.load(STORAGE_KEYS.homeTooltipDone, false));
      const pend = [];
      for (const n of NOTICES) {
        const seen = await storage.load(n.storageKey, false);
        if (seen) continue;
        if (fresh) { storage.save(n.storageKey, true); continue; }
        pend.push(n);
      }
      if (!alive || !pend.length) return;
      // 홈 초기 로드(일정·날씨 fetch)와 겹치지 않게 잠깐 뒤에
      setTimeout(() => { if (alive) { setQueue(pend); setCur(pend[0]); } }, 900);
    })();
    return () => { alive = false; };
  }, []);

  const closeCur = () => {
    if (!cur) return;
    storage.save(cur.storageKey, true);
    const rest = queue.slice(1);
    setCur(null); setQueue(rest);
    if (rest.length) setTimeout(() => setCur(rest[0]), 450); // 완전히 닫힌 뒤 다음 공지
  };

  if (!cur) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={closeCur}>
      {/* 배경 탭으로도 닫힘 — 공지는 붙잡지 않는다 */}
      <Pressable onPress={closeCur} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
        alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>
        <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 400, backgroundColor: '#fff', borderRadius: 20,
          paddingHorizontal: 22, paddingTop: 24, paddingBottom: 18,
          shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 }}>
          {/* 헤더 — 컬러 타일 아이콘 + 제목 (HomeIntroModal 카드 톤) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <View style={{ width: 46, height: 46, borderRadius: 13, backgroundColor: cur.tint,
              alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={cur.icon} size={fs(24)} color={cur.ic} strokeWidth={1.8} />
            </View>
            <Text style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(17), color: C.charcoal, lineHeight: 24 }}>{cur.title}</Text>
          </View>

          {cur.body ? (
            <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: C.textPrimary, lineHeight: 21 }}>{cur.body}</Text>
          ) : null}

          {cur.items ? (
            <View style={{ gap: 12 }}>
              {cur.items.map((it, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9 }}>
                  <View style={{ marginTop: 2 }}>
                    <Icon name={it.icon} size={fs(16)} color={it.ic} strokeWidth={1.8} />
                  </View>
                  <Text style={{ flex: 1, fontFamily: F.sys, fontSize: fs(13.5), color: C.textPrimary, lineHeight: 20 }}>{it.text}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <TouchableOpacity onPress={closeCur} activeOpacity={0.85}
            style={{ backgroundColor: C.charcoal, borderRadius: 13, paddingVertical: 14, alignItems: 'center', marginTop: 20 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(14.5), color: C.butter }}>확인</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
