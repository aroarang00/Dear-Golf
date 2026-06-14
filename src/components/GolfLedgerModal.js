import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';

// 팔레트: 챠콜 / 골드 / 웜크림 — 셰어 카드(폴라로이드·매거진) 결과 통일(2026-06-15 사용자 "더 예쁘게")
const GOLD = '#C9A84C';        // 골드 — 강조 룰·라벨
const GOLD_DEEP = '#A9854A';   // 깊은 골드 — 작은 라벨
// 브랜드 삼색 — 하단 시그니처(랜딩·초대카드·폴라로이드 동일 톤)
const MS = ['#ECD884', '#B2CADD', '#6B1E2A'];
// 가계부 표시 — 입력이 세부(그린피·카트비·그늘집)든 묶음(field)이든 항상 3묶음으로 정리(2026-06-15 사용자):
//  골프장 결제 = field+그린피+카트비+그늘집(카드 정산분 전부) / 캐디피(현금) / 기타 = etc+옛 식사비(meal)
const bucketsOf = (cost = {}) => ([
  { label: '골프장 결제', amt: (cost.field || 0) + (cost.green || 0) + (cost.cart || 0) + (cost.onsite || 0) },
  { label: '캐디피', amt: cost.caddie || 0 },
  { label: '기타', amt: (cost.etc || 0) + (cost.meal || 0) },
].filter(b => b.amt > 0));

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
          {/* 헤더 — 챠콜딥 배경 + 골드 라벨 / 크림 타이틀 */}
          <View style={{ backgroundColor: C.charcoalDeep, paddingHorizontal: 20, paddingVertical: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: GOLD, letterSpacing: 3, marginBottom: 4 }}>MY GOLF LEDGER</Text>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(20), color: '#F5EFDE' }}>골프 가계부</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: fs(20), color: 'rgba(245,239,222,0.85)' }}>✕</Text>
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
              {/* 올해 요약 — 웜 크림 그라데이션 히어로 + 골드 룰 + 하단 브랜드 삼색 */}
              <LinearGradient colors={['#FFFDF8', '#F3EBD9']} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }}
                style={{ borderRadius: 16, padding: 18, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(201,168,76,0.4)', overflow: 'hidden' }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(10), letterSpacing: 2, color: GOLD_DEEP, marginBottom: 7 }}>{thisYear}년 총 지출</Text>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(28), color: C.charcoalDeep, letterSpacing: 0.3 }}>
                  {won(yearTotal)}<Text style={{ fontFamily: F.sysSb, fontSize: fs(17) }}>원</Text>
                </Text>
                <View style={{ height: 1.5, width: 28, backgroundColor: GOLD, marginTop: 11, marginBottom: 9 }} />
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary }}>
                  {yearRounds.length}라운딩 · 라운딩당 평균 {won(yearAvg)}원
                </Text>
                {/* 브랜드 삼색 미니바 — 하단 시그니처 */}
                <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', height: 3 }}>
                  {MS.map((c, i) => <View key={i} style={{ flex: 1, backgroundColor: c }} />)}
                </View>
              </LinearGradient>

              {/* 이번달 / 지난달 / 총 라운딩 */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24 }}>
                {cards.map(card => (
                  <View key={card.label} style={{
                    flex: 1, backgroundColor: C.bgSecondary, borderRadius: 12,
                    paddingVertical: 14, paddingHorizontal: 6, alignItems: 'center',
                    borderWidth: 0.5, borderColor: C.hairline,
                  }}>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: GOLD_DEEP, letterSpacing: 0.5, marginBottom: 6 }}>{card.label}</Text>
                    <Text numberOfLines={1} adjustsFontSizeToFit
                      style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoalDeep }}>
                      {won(sumOf(card.list))}원
                    </Text>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.warmGray, marginTop: 4 }}>{card.list.length}라운딩</Text>
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
                      <View style={{ width: 3, height: 18, borderRadius: 2, backgroundColor: GOLD, marginRight: 10 }} />
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoalDeep, flex: 1 }}>{monthLabel(m)}</Text>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoalDeep, marginRight: 8 }}>{won(sumOf(rounds))}원</Text>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: GOLD_DEEP }}>{open ? '▴' : '▾'}</Text>
                    </TouchableOpacity>
                    {open && rounds.map(d => (
                      <View key={d.id} style={{ marginTop: 6, marginLeft: 13, backgroundColor: C.bgSecondary,
                        borderRadius: 10, borderWidth: 0.5, borderColor: C.hairline, padding: 12 }}>
                        {/* 코스 + 날짜(코스 아래로 올려 눈에 띄게) / 총액(우) — 사용자 2026-06-15 정돈 */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 9 }}>
                          <View style={{ flex: 1, marginRight: 8 }}>
                            <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoalDeep }} numberOfLines={1}>{d.course}</Text>
                            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 3 }}>{d.date}{d.day ? ` (${d.day})` : ''}</Text>
                          </View>
                          <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoalDeep, marginLeft: 8 }}>{won(d.cost.total)}원</Text>
                        </View>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                          {bucketsOf(d.cost).map(b => (
                            <View key={b.label} style={{ backgroundColor: '#FBF5E4', borderRadius: 7, borderWidth: 0.5, borderColor: 'rgba(201,168,76,0.35)', paddingHorizontal: 8, paddingVertical: 3.5 }}>
                              <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.textSecondary }}>
                                {b.label} <Text style={{ fontFamily: F.sysSb, color: C.charcoalDeep }}>{won(b.amt)}</Text>
                              </Text>
                            </View>
                          ))}
                        </View>
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
