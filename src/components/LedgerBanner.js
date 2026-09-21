import React, { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { SurfaceLight, PressScale } from './common/Surface';   // 카드 표면 빛 + 눌림 반응(2026-09-21)
import { C, F, fs } from '../constants/colors';
import { Icon } from './common/Icon';
import { loadMyExpenses } from '../utils/golfExpense';

// 홈 '골프 가계부' 요약 카드(2026-08-26, 스코어 추이 아래) — 이번 달 지출 크게 + 올해 합계·라운드당 평균 한 줄.
//   탭 → GolfLedgerModal. 집계는 가계부와 동일 규칙: 순지출=total−bet(내기 제외), 직접입력 지출(golfExpenses) 포함.
//   톤도 가계부 모달과 통일(차콜딥+골드) — 홈의 크림(내 기록)·네이비(스코어) 카드와 구분.
const spendOf = (d) => ((d?.cost?.total || 0) - (d?.cost?.bet || 0));
const won = (n) => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const GOLD = '#D9B23A';

export function LedgerBanner({ diaries = [], onPress, style }) {
  // 직접입력 지출(회비·용품) — 카드 뜰 때 1회 로드. 실패해도 라운딩 지출만으로 조용히 동작.
  const [expenses, setExpenses] = useState([]);
  useEffect(() => { loadMyExpenses().then(l => setExpenses(l || [])).catch(() => {}); }, []);

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const monthKey = `${now.getFullYear()}.${pad(now.getMonth() + 1)}`; // 날짜 포맷 "2026.08.12"
  const yearKey = String(now.getFullYear());

  const items = [
    ...(diaries || []).filter(d => d && d.cost && (spendOf(d) > 0 || d.cost.bet))
      .map(d => ({ kind: 'round', date: d.date || '', spend: spendOf(d) })),
    ...expenses.map(e => ({ kind: 'expense', date: e.date || '', spend: e.amount || 0 })),
  ];
  const monthTotal = items.filter(it => it.date.startsWith(monthKey)).reduce((s, it) => s + (it.spend || 0), 0);
  const yearItems = items.filter(it => it.date.startsWith(yearKey));
  const yearTotal = yearItems.reduce((s, it) => s + (it.spend || 0), 0);
  const roundItems = yearItems.filter(it => it.kind === 'round');
  const perRound = roundItems.length ? roundItems.reduce((s, it) => s + (it.spend || 0), 0) / roundItems.length : 0;

  return (
    <PressScale onPress={onPress}
      style={style} shadow={{ radius: 16, bg: C.charcoalDeep }} contentStyle={{ padding: 18 }}>
      <SurfaceLight radius={16} tone="dark" />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="wallet" size={fs(15)} color={GOLD} strokeWidth={1.9} />
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(11.5), letterSpacing: 1.5, color: GOLD }}>이번 달 골프 지출</Text>
        </View>
        <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: 'rgba(250,246,236,0.55)' }}>자세히 ›</Text>
      </View>
      {(yearTotal > 0 || monthTotal > 0) ? (
        <>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(26), color: C.bgPrimary, marginTop: 10 }}>{won(monthTotal)}원</Text>
          <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: 'rgba(250,246,236,0.62)', marginTop: 6 }}>
            올해 {won(yearTotal)}원{perRound > 0 ? ` · 라운드당 평균 ${won(perRound)}원` : ''}
          </Text>
        </>
      ) : (
        /* 빈 상태에도 카드는 노출 — 가계부 기능 발견용. 탭하면 가계부가 열려 입력 방법이 보인다 */
        <Text style={{ fontFamily: F.sysM, fontSize: fs(12.5), color: 'rgba(250,246,236,0.66)', marginTop: 10, lineHeight: 18 }}>
          라운딩 기록에 비용을 적거나{'\n'}회비·용품 지출을 더하면 여기에 모여요
        </Text>
      )}
    </PressScale>
  );
}
