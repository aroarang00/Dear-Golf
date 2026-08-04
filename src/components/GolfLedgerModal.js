import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { Icon } from './common/Icon';
import { ExpenseAddSheet } from './ExpenseAddSheet';
import { loadMyExpenses, createExpense, deleteExpense, expenseCatLabel } from '../utils/golfExpense';

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
  const [expenses, setExpenses] = useState([]);   // 직접 입력 지출(golfExpenses) — 라운딩과 별개
  const [addOpen, setAddOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [expanded, setExpanded] = useState(null); // 월 접기/펼치기

  // 지출 로드 — 모달 열릴 때. 실패해도 라운딩은 그대로 보여줌(가벼운 degrade, round.js와 달리 여긴 조용히).
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    loadMyExpenses().then(list => { if (!cancelled) setExpenses(list); }).catch(() => {});
    return () => { cancelled = true; };
  }, [visible]);

  // 비용/내기가 있는 라운딩 — 크게 딴 날(지출 0·내기만)도 포함.
  const costRounds = (diaries || [])
    .filter(d => d && d.cost && (spendOf(d) > 0 || d.cost.bet));

  // 라운딩 + 직접지출을 공통 항목으로 합침 — spend는 '지출액'(라운딩=순지출, 지출=금액).
  const items = [
    ...costRounds.map(d => ({ kind: 'round', id: d.id, date: d.date || '', spend: spendOf(d), data: d })),
    ...expenses.map(e => ({ kind: 'expense', id: e.id, date: e.date || '', spend: e.amount || 0, data: e })),
  ];

  // 월별 그룹 (같은 달 안은 날짜 최신순)
  const byMonth = {};
  items.forEach(it => {
    const m = it.date.slice(0, 7); // "2026.05"
    if (m.length < 7) return;
    (byMonth[m] = byMonth[m] || []).push(it);
  });
  Object.values(byMonth).forEach(arr => arr.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)));
  const months = Object.keys(byMonth).sort((a, b) => b.localeCompare(a));

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const thisMonthKey = `${now.getFullYear()}.${pad(now.getMonth() + 1)}`;
  const thisYear = String(now.getFullYear());

  const monthSum = (list) => (list || []).reduce((s, it) => s + (it.spend || 0), 0);

  // 올해 합계·카테고리 소계 (라운딩 지출 + 직접지출 전부)
  const yearItems = items.filter(it => it.date.startsWith(thisYear));
  const yearTotal = monthSum(yearItems);
  const catTotals = { round: 0, membership: 0, equipment: 0, etc: 0 };
  yearItems.forEach(it => {
    if (it.kind === 'round') catTotals.round += it.spend;
    else catTotals[it.data.category] = (catTotals[it.data.category] || 0) + it.spend;
  });
  const catRows = [
    { key: 'round', label: '라운딩', amt: catTotals.round },
    { key: 'membership', label: '모임회비', amt: catTotals.membership },
    { key: 'equipment', label: '골프장비', amt: catTotals.equipment },
    { key: 'etc', label: '기타', amt: catTotals.etc },
  ];
  const yearRoundCount = yearItems.filter(it => it.kind === 'round').length;
  const yearExpenseCount = yearItems.filter(it => it.kind === 'expense').length;

  const isOpen = (m) => (expanded ? !!expanded[m] : m === thisMonthKey);
  const toggle = (m) => {
    setExpanded(prev => {
      const base = prev || { [thisMonthKey]: true };
      return { ...base, [m]: !base[m] };
    });
  };

  // 지출 저장 — 낙관적 반영. 실패 시 알럿 + throw(시트 유지).
  const handleAddSubmit = async (payload) => {
    try {
      const created = await createExpense(payload);
      setExpenses(prev => [created, ...prev]);
    } catch (e) {
      Alert.alert('저장 실패', '잠시 후 다시 시도해주세요.');
      throw e;
    }
  };

  // 지출 삭제 — 길게 눌러 확인.
  const handleDeleteExpense = (exp) => {
    Alert.alert('지출 삭제', `${expenseCatLabel(exp.category)} ${won(exp.amount)}원을 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: async () => {
        try { await deleteExpense(exp.id); setExpenses(prev => prev.filter(e => e.id !== exp.id)); }
        catch { Alert.alert('삭제 실패', '잠시 후 다시 시도해주세요.'); }
      } },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={{ height: '88%', backgroundColor: C.bgPrimary, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' }}>
          {/* 헤더 — 챠콜딥 배경 + 골드 라벨 / 크림 타이틀 */}
          <View style={{ backgroundColor: C.charcoalDeep, paddingHorizontal: 20, paddingVertical: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
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
            {/* + 지출 추가 (골드 알약) */}
            {/* ＋와 라벨을 한 Text로 — 폰트 크기 달라 줄 어긋나 보이던 것 정리(사용자 2026-07-24) */}
            <TouchableOpacity onPress={() => setAddOpen(true)} activeOpacity={0.85}
              style={{ backgroundColor: GOLD, paddingHorizontal: 13, paddingVertical: 7, borderRadius: 20, marginRight: 12 }}>
              <Text numberOfLines={1} style={{ fontFamily: F.sysB, fontSize: fs(12.5), color: C.charcoalDeep }}>＋ 회비·용품</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: fs(20), color: 'rgba(245,239,222,0.85)' }}>✕</Text>
            </TouchableOpacity>
          </View>

          {items.length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
              <Text style={{ fontSize: fs(36), marginBottom: 14 }}>💰</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, textAlign: 'center', lineHeight: 21 }}>
                라운딩 비용은 기록 입력 시 '비용'에서,{'\n'}회비·용품 지출은 위 <Text style={{ fontFamily: F.sysB, color: GOLD_DEEP }}>＋회비·용품</Text>으로 추가해요
              </Text>
            </View>
          ) : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 16 + insets.bottom }} showsVerticalScrollIndicator={false}>
              {/* 입력 출처 안내 — 데이터 있을 때도 상시(빈 상태에만 있던 걸 끌어냄). '다 여기서 넣나?' 혼동 방지(사용자 2026-07-24) */}
              <View style={{ backgroundColor: C.bgSecondary, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11, marginBottom: 14, gap: 6 }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, lineHeight: 16 }}>
                  · 라운딩 비용은 <Text style={{ fontFamily: F.sysSb, color: C.charcoalDeep }}>기록</Text>에서 자동으로 모여요
                </Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, lineHeight: 16 }}>
                  · 회비·용품은 <Text style={{ fontFamily: F.sysSb, color: GOLD_DEEP }}>＋회비·용품</Text>으로 직접 넣어요
                </Text>
              </View>
              {/* 올해 요약 — 웜 크림 그라데이션 히어로 + 골드 룰 + 하단 브랜드 삼색 */}
              <LinearGradient colors={['#FFFDF8', '#F3EBD9']} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }}
                style={{ borderRadius: 16, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(201,168,76,0.4)', overflow: 'hidden' }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(11.5), letterSpacing: 1.5, color: GOLD_DEEP, marginBottom: 7 }}>{thisYear}년 총 골프 지출</Text>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(28), color: C.charcoalDeep, letterSpacing: 0.3 }}>
                  {won(yearTotal)}<Text style={{ fontFamily: F.sysSb, fontSize: fs(17) }}>원</Text>
                </Text>
                <View style={{ height: 1.5, width: 28, backgroundColor: GOLD, marginTop: 11, marginBottom: 9 }} />
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.textSecondary }}>
                  라운딩 {yearRoundCount}회{yearExpenseCount > 0 ? ` · 회비·용품 ${yearExpenseCount}건` : ''} · 라운딩·용품 전부 포함
                </Text>
                {/* 브랜드 삼색 미니바 — 하단 시그니처 */}
                <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', height: 3 }}>
                  {MS.map((c, i) => <View key={i} style={{ flex: 1, backgroundColor: c }} />)}
                </View>
              </LinearGradient>

              {/* 카테고리별 소계 (올해) — 쓴 카테고리만(0원 회색줄 노이즈 제거). 이번달/지난달 카드는 아래 월별 리스트와 중복이라 제거(사용자 2026-07-24 '정신없다'). */}
              {catRows.some(r => r.amt > 0) && (
                <View style={{ backgroundColor: C.bgSecondary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 4, marginBottom: 20 }}>
                  {catRows.filter(r => r.amt > 0).map((row, i, arr) => (
                    <View key={row.key} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11,
                      borderBottomWidth: i < arr.length - 1 ? 0.5 : 0, borderBottomColor: C.hairline }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: GOLD, marginRight: 9 }} />
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: C.charcoalDeep, flex: 1 }}>{row.label}</Text>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.charcoalDeep }}>{won(row.amt)}원</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* 월별 리스트 */}
              {months.map(m => {
                const open = isOpen(m);
                const list = byMonth[m];
                return (
                  <View key={m} style={{ marginBottom: 14 }}>
                    <TouchableOpacity onPress={() => toggle(m)} activeOpacity={0.7}
                      style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.bgSecondary,
                        borderRadius: 10, padding: 12 }}>
                      <View style={{ width: 3, height: 18, borderRadius: 2, backgroundColor: GOLD, marginRight: 10 }} />
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoalDeep, flex: 1 }}>{monthLabel(m)}</Text>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoalDeep, marginRight: 8 }}>{won(monthSum(list))}원</Text>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: GOLD_DEEP }}>{open ? '▴' : '▾'}</Text>
                    </TouchableOpacity>

                    {open && list.map(it => it.kind === 'expense' ? (
                      // ── 직접 지출 카드 (길게 눌러 삭제) ──
                      <TouchableOpacity key={it.id} activeOpacity={0.8} onLongPress={() => handleDeleteExpense(it.data)}
                        style={{ marginTop: 6, marginLeft: 13, backgroundColor: '#FBF7EC',
                          borderRadius: 10, padding: 12 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <View style={{ flex: 1, marginRight: 8 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              <View style={{ backgroundColor: GOLD, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 }}>
                                <Text style={{ fontFamily: F.sysSb, fontSize: fs(9.5), color: C.charcoalDeep }}>{expenseCatLabel(it.data.category)}</Text>
                              </View>
                              {!!it.data.memo && <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: C.charcoalDeep, flex: 1 }} numberOfLines={1}>{it.data.memo}</Text>}
                            </View>
                            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>{it.date}</Text>
                          </View>
                          <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoalDeep, marginLeft: 8 }}>{won(it.data.amount)}원</Text>
                        </View>
                      </TouchableOpacity>
                    ) : (
                      // ── 라운딩 비용 카드 (기존) ──
                      <View key={it.id} style={{ marginTop: 6, marginLeft: 13, backgroundColor: C.bgSecondary,
                        borderRadius: 10, padding: 12 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 9 }}>
                          <View style={{ flex: 1, marginRight: 8 }}>
                            <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoalDeep }} numberOfLines={1}>{it.data.course}</Text>
                            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 3 }}>{it.date}{it.data.day ? ` (${it.data.day})` : ''}</Text>
                          </View>
                          <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoalDeep, marginLeft: 8 }}>{won(it.spend)}원</Text>
                        </View>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                          {bucketsOf(it.data.cost).map(b => (
                            <View key={b.label} style={{ backgroundColor: '#FBF5E4', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3.5 }}>
                              <Text style={{ fontFamily: F.sys, fontSize: fs(10), color: C.textSecondary }}>
                                {b.label} <Text style={{ fontFamily: F.sysSb, color: C.charcoalDeep }}>{won(b.amt)}</Text>
                              </Text>
                            </View>
                          ))}
                        </View>
                        {/* 내기 정산 — 지출과 분리해 손익 줄로. 땄으면 초록(+)·잃으면 버건디(−). 입력했을 때만 */}
                        {!!it.data.cost.bet && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: C.hairline }}>
                            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: it.data.cost.bet < 0 ? WIN : LOSS }}>
                              내기 {it.data.cost.bet < 0 ? '땄어요' : '잃었어요'}
                            </Text>
                            <View style={{ flex: 1 }} />
                            <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: it.data.cost.bet < 0 ? WIN : LOSS }}>
                              {it.data.cost.bet < 0 ? '+' : '−'}{won(Math.abs(it.data.cost.bet))}원
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

      {/* 지출 직접입력 시트 */}
      <ExpenseAddSheet visible={addOpen} onClose={() => setAddOpen(false)} onSubmit={handleAddSubmit} />

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
                라운딩 비용은 기록 입력 시 '비용' 항목에서,{'\n'}
                회비·용품 지출은 위 <Text style={{ fontFamily: F.sysB, color: GOLD_DEEP }}>＋회비·용품</Text> 버튼으로 바로 넣어요.
              </Text>

              <View style={{ height: 1, backgroundColor: C.hairline, marginVertical: 14 }} />

              <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.charcoalDeep }}>어떻게 합산되나요</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 6, lineHeight: 19 }}>
                라운딩·모임회비·골프장비·기타가 모두 모여{'\n'}올해 총 지출과 카테고리별 소계를 보여드려요.
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
