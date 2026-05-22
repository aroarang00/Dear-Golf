import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';

// 팔레트: 챠콜 / 버터 / 크림
const COST_LABELS = { green: '그린피', caddie: '캐디피', cart: '카트피', meal: '식사비', etc: '기타' };
const COST_KEYS = ['green', 'caddie', 'cart', 'meal', 'etc'];

const won = (n) => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const monthLabel = (m) => {
  const [y, mm] = m.split('.');
  return `${y}년 ${parseInt(mm, 10)}월`;
};

export function GolfLedgerModal({ visible, onClose, diaries = [] }) {
  const insets = useSafeAreaInsets();
  // 비용이 기록된 라운딩만 (최신순)
  const costRounds = (diaries || [])
    .filter(d => d && d.cost && (d.cost.total || 0) > 0)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // 월별 그룹
  const byMonth = {};
  costRounds.forEach(d => {
    const m = (d.date || '').slice(0, 7); // "2026.05"
    if (m.length < 7) return;
    (byMonth[m] = byMonth[m] || []).push(d);
  });
  const months = Object.keys(byMonth).sort((a, b) => b.localeCompare(a));

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const thisMonthKey = `${now.getFullYear()}.${pad(now.getMonth() + 1)}`;
  const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthKey = `${lm.getFullYear()}.${pad(lm.getMonth() + 1)}`;
  const thisYear = String(now.getFullYear());

  const sumOf = (list) => (list || []).reduce((s, d) => s + (d.cost.total || 0), 0);
  const yearRounds = costRounds.filter(d => (d.date || '').startsWith(thisYear));
  const yearTotal = sumOf(yearRounds);
  const yearAvg = yearRounds.length ? Math.round(yearTotal / yearRounds.length) : 0;

  const cards = [
    { label: '이번달', list: byMonth[thisMonthKey] || [] },
    { label: '지난달', list: byMonth[lastMonthKey] || [] },
    { label: '총 라운딩', list: costRounds },
  ];

  // 접기/펼치기 — 기본은 이번달만 펼침 (expanded === null이면 이번달만 열림)
  const [expanded, setExpanded] = useState(null);
  const isOpen = (m) => (expanded ? !!expanded[m] : m === thisMonthKey);
  const toggle = (m) => {
    setExpanded(prev => {
      const base = prev || { [thisMonthKey]: true };
      return { ...base, [m]: !base[m] };
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={{ height: '88%', backgroundColor: C.bgPrimary, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' }}>
          {/* 헤더 — 챠콜 배경 + 버터 텍스트 */}
          <View style={{ backgroundColor: C.charcoal, paddingHorizontal: 20, paddingVertical: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: 'rgba(245,230,168,0.6)', letterSpacing: 2, marginBottom: 3 }}>나의 골프 지출</Text>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(20), color: C.butter }}>골프 가계부</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: fs(20), color: C.butter }}>✕</Text>
            </TouchableOpacity>
          </View>

          {costRounds.length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
              <Text style={{ fontSize: fs(36), marginBottom: 14 }}>💰</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, textAlign: 'center', lineHeight: 21 }}>
                비용 기록은 라운딩 기록 입력 시{'\n'}비용 항목에서 추가할 수 있어요
              </Text>
            </View>
          ) : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 16 + insets.bottom }} showsVerticalScrollIndicator={false}>
              {/* 올해 요약 — 버터 박스 */}
              <View style={{ backgroundColor: C.butter, borderRadius: 14, padding: 16, marginBottom: 20 }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.charcoal, opacity: 0.65, marginBottom: 4 }}>{thisYear}년 총 지출</Text>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(26), color: C.charcoal }}>{won(yearTotal)}원</Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.charcoal, opacity: 0.8, marginTop: 4 }}>
                  라운딩당 평균 {won(yearAvg)}원
                </Text>
              </View>

              {/* 이번달 / 지난달 / 총 라운딩 */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24 }}>
                {cards.map(card => (
                  <View key={card.label} style={{
                    flex: 1, backgroundColor: C.bgSecondary, borderRadius: 12,
                    paddingVertical: 14, paddingHorizontal: 6, alignItems: 'center',
                    borderWidth: 0.5, borderColor: C.hairline,
                  }}>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGray, marginBottom: 6 }}>{card.label}</Text>
                    <Text numberOfLines={1} adjustsFontSizeToFit
                      style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }}>
                      {won(sumOf(card.list))}원
                    </Text>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGrayLight, marginTop: 4 }}>{card.list.length}라운딩</Text>
                  </View>
                ))}
              </View>

              {/* 월별 리스트 */}
              {months.map(m => {
                const open = isOpen(m);
                const rounds = byMonth[m];
                return (
                  <View key={m} style={{ marginBottom: 14 }}>
                    <TouchableOpacity onPress={() => toggle(m)} activeOpacity={0.7}
                      style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.bgSecondary,
                        borderRadius: 10, borderWidth: 0.5, borderColor: C.hairline, padding: 12 }}>
                      <View style={{ width: 3, height: 18, borderRadius: 2, backgroundColor: C.charcoal, marginRight: 10 }} />
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal, flex: 1 }}>{monthLabel(m)}</Text>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal, marginRight: 8 }}>{won(sumOf(rounds))}원</Text>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGrayLight }}>{open ? '▴' : '▾'}</Text>
                    </TouchableOpacity>
                    {open && rounds.map(d => (
                      <View key={d.id} style={{ marginTop: 6, marginLeft: 13, backgroundColor: C.bgSecondary,
                        borderRadius: 10, borderWidth: 0.5, borderColor: C.hairline, padding: 12 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal, flex: 1 }} numberOfLines={1}>
                            {d.course}
                          </Text>
                          <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.charcoal, marginLeft: 8 }}>{won(d.cost.total)}원</Text>
                        </View>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                          {COST_KEYS.filter(k => (d.cost[k] || 0) > 0).map(k => (
                            <View key={k} style={{ backgroundColor: C.butter + '55', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
                              <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.charcoal }}>{COST_LABELS[k]} {won(d.cost[k])}</Text>
                            </View>
                          ))}
                        </View>
                        <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGrayLight, marginTop: 6 }}>{d.date}</Text>
                      </View>
                    ))}
                  </View>
                );
              })}
              <View style={{ height: 20 }} />
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
