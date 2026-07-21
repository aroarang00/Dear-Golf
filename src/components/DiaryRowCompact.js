import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { C, F, fs } from '../constants/colors';

// 내 기록 '요약보기' 한 줄 — 기록이 쌓이면 사진 카드 피드가 무거워 훑어보기가 힘들어지는 문제([[rn-list-perf-patterns]]).
//   ★사진을 아예 안 그린다 — 렉의 주원인이 이미지 디코드라 썸네일을 넣으면 목적이 반감된다.
//   구성: 일(日) + 구장·세부코스 + 타수. 월은 위쪽 월 헤더(DiaryScreen)가 담당하므로 행에서 반복하지 않는다.
//   ★파대비(+10)는 표시 안 함 — 요약은 '언제 어디서 몇 타'만 훑는 화면(사용자 2026-07-21). 필요하면 탭해서 상세로.
//   ★색점·구분선 없이 여백으로만 나눈다(심플 모던, 사용자 2026-07-21). 베스트·특별한 순간만 작은 글자로 표시.
function DiaryRowCompactBase({ item, onPress }) {
  const isMoment = item.kind === 'moment';
  const hasScore = typeof item.score === 'number';
  const dayNum = (item.date || '').split('.')[2] || '';   // 'YYYY.MM.DD' → 'DD'

  // 일상은 메모가 제목 자리 — 라운딩(구장명)보다 한 톤 흐리게 둬서 스코어 목록의 흐름을 방해하지 않게 한다.
  const title = isMoment
    ? ((item.memo || '').replace(/\s+/g, ' ').trim() || '일상')
    : [item.course, item.subCourse].filter(Boolean).join(' · ');

  // 강조는 둘만 — 특별한 순간(금색)·베스트(버건디). 버디 등은 생략해 목록을 조용하게 유지.
  const mark = item.special ? { txt: item.special, color: '#C9A84C' }
    : item.badge === '베스트' ? { txt: 'BEST', color: '#6B1E2A' }
    : null;

  return (
    <TouchableOpacity activeOpacity={0.6} onPress={() => onPress && onPress(item)}
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13 }}>
      <Text style={{ fontFamily: F.en, fontSize: fs(14), color: C.warmGray, width: 30 }}>{dayNum}</Text>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', marginRight: 10 }}>
        <Text style={{ fontFamily: F.sysM, fontSize: fs(13.5), color: isMoment ? C.textSecondary : C.charcoal, flexShrink: 1 }}
          numberOfLines={1}>
          {title}
        </Text>
        {!!mark && (
          <Text style={{ fontFamily: F.sysB, fontSize: fs(9), color: mark.color, letterSpacing: 0.6, marginLeft: 7 }}
            numberOfLines={1}>
            {mark.txt}
          </Text>
        )}
      </View>
      {/* 타수 — 일상처럼 타수가 없는 기록은 '—' 같은 자리표시를 두지 않는다(사용자 2026-07-21).
          대시가 있으면 '타수가 빠진 라운딩'처럼 보여 목록이 어색해짐. 자리(minWidth)만 비워 정렬은 유지. */}
      {hasScore ? (
        <Text style={{ fontFamily: F.en, fontSize: fs(21), color: C.charcoal, minWidth: 46, textAlign: 'right' }}>
          {item.score}
        </Text>
      ) : (
        <View style={{ minWidth: 46 }} />
      )}
    </TouchableOpacity>
  );
}

// 부모 리렌더(스크롤 feedLimit·검색)마다 props 안 바뀐 행은 건너뜀 — DiaryCard와 같은 이유
export const DiaryRowCompact = React.memo(DiaryRowCompactBase);
