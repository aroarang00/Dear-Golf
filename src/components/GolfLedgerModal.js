import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { Icon } from './common/Icon';

// 팔레트: 챠콜 / 골드 / 웜크림 — 셰어 카드(폴라로이드·매거진) 결과 통일(2026-06-15 사용자 "더 예쁘게")
const GOLD = '#C9A84C';        // 골드 — 강조 룰·라벨
const GOLD_DEEP = '#8A6A33';   // 깊은 골드 — 작은 라벨. 크림·흰 배경 위 대비 위해 진하게(2026-06-24)
// 브랜드 삼색 — 하단 시그니처(랜딩·초대카드·폴라로이드 동일 톤)
const MS = ['#ECD884', '#B2CADD', '#6B1E2A'];
// 내기 손익 색 — 땄으면(이득) 초록, 잃으면(손실) 버건디. 총 지출과 별도 '정산'으로 분리(테스터 요청 2026-06-17 [[ledger-bet-pnl]])
const WIN = '#3F7A4E';   // 딴 돈(이득)
const LOSS = '#9B3A3A';  // 잃은 돈(손실)
// 가계부 표시 — 입력이 세부(그린피·카트비·그늘집)든 묶음(field)이든 항상 묶음으로 정리(2026-06-15 사용자):
//  골프장 결제 = field+그린피+카트비+그늘집(카드 정산분 전부) / 캐디피(현금) / 기타 = etc+옛 식사비(meal).
//  ★내기는 버킷(지출)에서 제외 — 총합산에 안 들어가고 아래 '내기 정산' 줄로 별도 표시(테스터 요청).
const bucketsOf = (cost = {}) => {
  return [
    { label: '골프장 결제', amt: (cost.field || 0) + (cost.green || 0) + (cost.cart || 0) + (cost.onsite || 0) },
    { label: '캐디피', amt: cost.caddie || 0 },
    { label: '기타', amt: (cost.etc || 0) + (cost.meal || 0) },
  ].filter(b => b.amt > 0);
};

// 순수 지출 = 저장된 total에서 내기(부호)를 뺀 값. total은 지출+betSigned로 저장돼 있어 total−bet=지출. (마이그레이션 불필요)
const spendOf = (d) => ((d?.cost?.total || 0) - (d?.cost?.bet || 0));

const won = (n) => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const monthLabel = (m) => {
  const [y, mm] = m.split('.');
  return `${y}년 ${parseInt(mm, 10)}월`;
};

export function GolfLedgerModal({ visible, onClose, diaries = [] }) {
  const insets = useSafeAreaInsets();
  // 비용 또는 내기가 기록된 라운딩만 (최신순). 크게 딴 날(지출 0·내기만)도 정산에 잡히도록 bet도 포함.
  const costRounds = (diaries || [])
    .filter(d => d && d.cost && (spendOf(d) > 0 || d.cost.bet))
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

  // ★합계는 '지출'(spendOf)만 — 내기는 총합산에서 제외(테스터 요청). 내기는 netBetOf로 별도 정산.
  const sumOf = (list) => (list || []).reduce((s, d) => s + spendOf(d), 0);
  const yearRounds = costRounds.filter(d => (d.date || '').startsWith(thisYear));
  const yearTotal = sumOf(yearRounds);
  // 지출 평균은 '지출이 있는' 라운딩 기준(내기만 있는 0원 라운딩은 평균 왜곡 방지로 제외)
  const yearSpendRounds = yearRounds.filter(d => spendOf(d) > 0);
  const yearAvg = yearSpendRounds.length ? Math.round(yearTotal / yearSpendRounds.length) : 0;

  const cards = [
    { label: '이번달', list: byMonth[thisMonthKey] || [] },
    { label: '지난달', list: byMonth[lastMonthKey] || [] },
    { label: '총 라운딩', list: costRounds },
  ];

  const [infoOpen, setInfoOpen] = useState(false); // 가계부 안내 모달
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(20), color: '#F5EFDE' }}>골프 가계부</Text>
                {/* 안내 — 일정·라운지 헤더와 같은 원형 느낌표(라운지 헤더 스타일 참조) */}
                <TouchableOpacity onPress={() => setInfoOpen(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={{ padding: 4 }}>
                  <Icon name="book" size={fs(21)} color={GOLD} strokeWidth={1.8} />
                </TouchableOpacity>
              </View>
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
                {/* 크림 배경 위 옅은 골드+작은 regular라 흐렸음 → 키우고 진한 골드(GOLD_DEEP)+semibold로 또렷하게(2026-06-24). */}
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(11.5), letterSpacing: 1.5, color: GOLD_DEEP, marginBottom: 7 }}>{thisYear}년 총 지출</Text>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(28), color: C.charcoalDeep, letterSpacing: 0.3 }}>
                  {won(yearTotal)}<Text style={{ fontFamily: F.sysSb, fontSize: fs(17) }}>원</Text>
                </Text>
                <View style={{ height: 1.5, width: 28, backgroundColor: GOLD, marginTop: 11, marginBottom: 9 }} />
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary }}>
                  {yearSpendRounds.length}라운딩 · 라운딩당 평균 {won(yearAvg)}원
                </Text>
                {/* ★올해 내기 정산(net 합계)은 제거 — 내기는 합계 미포함 + 라운딩별 개별 손익만 표시(사용자 2026-06-17) */}
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
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(10), color: GOLD_DEEP, letterSpacing: 0.5, marginBottom: 6 }}>{card.label}</Text>
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
                          <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoalDeep, marginLeft: 8 }}>{won(spendOf(d))}원</Text>
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
                        {/* 내기 정산 — 지출(버킷)과 분리해 손익 줄로. 땄으면 초록(+)·잃으면 버건디(−). 입력했을 때만 */}
                        {!!d.cost.bet && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: C.hairline }}>
                            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: d.cost.bet < 0 ? WIN : LOSS }}>
                              내기 {d.cost.bet < 0 ? '땄어요' : '잃었어요'}
                            </Text>
                            <View style={{ flex: 1 }} />
                            <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: d.cost.bet < 0 ? WIN : LOSS }}>
                              {d.cost.bet < 0 ? '+' : '−'}{won(Math.abs(d.cost.bet))}원
                            </Text>
                          </View>
                        )}
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

      {/* 가계부 안내 — 기록 위치·합산·내기 별도 정산 설명. 가계부 톤(차콜딥+골드). 빌드로만 확인되니 줄정리 깔끔히. */}
      <Modal visible={infoOpen} transparent animationType="fade" onRequestClose={() => setInfoOpen(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 30 }}
          activeOpacity={1} onPress={() => setInfoOpen(false)}>
          <View style={{ backgroundColor: C.bgPrimary, borderRadius: 16, overflow: 'hidden' }}>
            <View style={{ backgroundColor: C.charcoalDeep, paddingVertical: 16, paddingHorizontal: 20 }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: GOLD, letterSpacing: 2, marginBottom: 4 }}>가계부 안내</Text>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: '#F5EFDE' }}>이렇게 쓰면 돼요</Text>
            </View>
            <View style={{ paddingHorizontal: 20, paddingVertical: 18 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.charcoalDeep }}>어디서 기록하나요</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 6, lineHeight: 19 }}>
                라운딩 기록을 남길 때 '비용' 항목에서{'\n'}그린피·카트비·캐디피·기타를 입력해요.
              </Text>

              <View style={{ height: 1, backgroundColor: C.hairline, marginVertical: 14 }} />

              <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.charcoalDeep }}>어떻게 합산되나요</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 6, lineHeight: 19 }}>
                입력한 지출은 자동으로 모여{'\n'}이번달·지난달·올해 총 지출과{'\n'}라운딩당 평균을 보여드려요.
              </Text>

              <View style={{ height: 1, backgroundColor: C.hairline, marginVertical: 14 }} />

              <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.charcoalDeep }}>내기는 따로 표시해요</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 6, lineHeight: 19 }}>
                내기는 쓴 돈이 아니라 손익이라{'\n'}총 지출에는 넣지 않아요.{'\n'}
                라운딩마다 딴 날은 <Text style={{ fontFamily: F.sysB, color: WIN }}>+</Text>, 잃은 날은 <Text style={{ fontFamily: F.sysB, color: LOSS }}>−</Text>로{'\n'}그 라운딩에만 따로 보여줘요.
              </Text>
            </View>
            <TouchableOpacity onPress={() => setInfoOpen(false)} activeOpacity={0.7}
              style={{ paddingVertical: 13, borderTopWidth: 0.5, borderTopColor: C.hairline }}>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.charcoal, textAlign: 'center' }}>확인</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </Modal>
  );
}
