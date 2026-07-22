import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Modal, View, Text, TouchableOpacity, Share, Keyboard } from 'react-native';
import { KeyboardProvider, KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import AppTextInput from './common/AppTextInput';
import { Spinner } from './common/Spinner';
import { showToast } from './AppToast';
import { showAppAlert } from './AppAlert';
import { C, F, fs } from '../constants/colors';
import {
  SETTLE_KINDS, settleKindLabel, PAY_PENDING, PAY_CLAIMED, PAY_CONFIRMED,
  splitEvenly, summarize, toggleMemberStatus, buildSettlementText,
  loadMySettlements, createSettlement, updateSettlement, deleteSettlement,
} from '../utils/settlement';

// 모임 '걷기' — 총무가 참가자에게 돈을 걷는 화면. 목록 ↔ 상세 한 모달 안에서 전환.
//
// ★설계 근거(사용자 실제 운영 방식, 2026-07-22)
//   총무는 지금 카톡에 계좌 올리고 각자 금액 정리 → 각자 "입완" 쓰고 방 나감 → 남은 사람이 미납자.
//   그 수동 해법을 그대로 화면으로 옮긴다. 방을 만들 필요도, 나갈 필요도 없이 목록의 ✅/⏳로 보인다.
//   그린피·카트비는 각자 카드 결제라 여기서 안 다룬다 — 걷는 건 캐디피·참가비(선입금)와 식사비뿐.
//
// ★동반자가 앱을 안 깔았어도 총무 혼자 끝까지 쓸 수 있어야 한다(조편성이 죽은 이유 재발 방지).
//   그래서 참가자는 이름만으로 충분하고, 통지는 카톡 정산서 내보내기로 나간다.
//   참가자 앱 내 알림·'보냈어요'는 2차 — 그때도 이 단독 경로는 유지할 것.

const GOLD = '#C9A84C';
const won = (n) => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const pad = (n) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`; };
const label = { fontFamily: F.sysSb, fontSize: fs(12), color: C.warmGray, marginBottom: 8 };
const box = { backgroundColor: C.bgSecondary, borderRadius: 12, borderWidth: 0.5, borderColor: C.hairline };

// 명단 붙여넣기 → 이름 배열. 카톡 명단을 그대로 붙여넣는 걸 전제로 한다(총무는 이미 카톡에 명단이 있다).
//   줄바꿈·쉼표·가운뎃점 모두 구분자로 보고, 숫자만 있는 줄(금액·번호)은 버린다.
function parseNames(text) {
  return String(text || '')
    .split(/[\n,·]/)
    .map(s => s.replace(/^\s*[-•\d]+[.)]?\s*/, '').trim())   // '1. 김이사' → '김이사'
    .filter(s => s && !/^\d+$/.test(s))
    .slice(0, 40)
    .map((name, i) => ({ id: `m${i}_${name.slice(0, 8)}`, name: name.slice(0, 20), amount: 0, status: PAY_PENDING }));
}

export function SettlementModal({ visible, onClose }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState(null);      // null이면 목록, 아니면 상세
  const [composing, setComposing] = useState(false); // 새 걷기 만들기

  const load = useCallback(async () => {
    setLoading(true); setFailed(false);
    try { setList(await loadMySettlements()); }
    catch (e) { console.warn('[정산] 목록 로드 실패', e?.code, e?.message); setFailed(true); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!visible) return;
    setOpenId(null); setComposing(false);
    load();
  }, [visible, load]);

  const current = useMemo(() => list.find(s => s.id === openId) || null, [list, openId]);

  // 낙관적 반영 — 서버 왕복을 기다리면 체크가 굼떠 보인다. 실패하면 되돌리고 알린다.
  const patchLocal = (id, patch) =>
    setList(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)));

  const save = async (id, patch) => {
    const before = list.find(s => s.id === id);
    patchLocal(id, patch);
    try { await updateSettlement(id, patch); }
    catch (e) {
      if (before) patchLocal(id, before);
      showToast('저장하지 못했어요');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'bottom']}>
            {/* 헤더 — 상세/작성 중이면 뒤로, 아니면 닫기 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
              borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
              {/* 뒤로/닫기 — Icon 맵에 chevron·close가 없어 가계부와 같은 기호 문자를 쓴다(이모지 아님) */}
              <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                onPress={() => { if (composing) setComposing(false); else if (openId) setOpenId(null); else onClose(); }}>
                <Text style={{ fontSize: fs(20), color: C.charcoal, width: fs(22) }}>
                  {(composing || openId) ? '‹' : '✕'}
                </Text>
              </TouchableOpacity>
              <Text style={{ flex: 1, textAlign: 'center', fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal }}>
                {composing ? '걷기 만들기' : current ? (current.course || '걷기') : '모임 정산'}
              </Text>
              <View style={{ width: fs(20) }} />
            </View>

            {composing ? (
              <ComposeView onCancel={() => setComposing(false)}
                onCreated={(s) => { setList(prev => [s, ...prev]); setComposing(false); setOpenId(s.id); }} />
            ) : current ? (
              <DetailView s={current} onSave={(patch) => save(current.id, patch)}
                onDeleted={() => { setList(prev => prev.filter(x => x.id !== current.id)); setOpenId(null); }} />
            ) : (
              <ListView list={list} loading={loading} failed={failed} onRetry={load}
                onOpen={setOpenId} onNew={() => setComposing(true)} />
            )}
          </SafeAreaView>
        </KeyboardProvider>
      </SafeAreaProvider>
    </Modal>
  );
}

// ── 목록 ──────────────────────────────────────────────────────
function ListView({ list, loading, failed, onRetry, onOpen, onNew }) {
  if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Spinner /></View>;
  if (failed) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal }}>불러오지 못했어요</Text>
        <TouchableOpacity onPress={onRetry} style={{ marginTop: 14, paddingHorizontal: 20, paddingVertical: 10,
          backgroundColor: C.navy, borderRadius: 10 }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.butter }}>다시 시도</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return (
    <KeyboardAwareScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <TouchableOpacity onPress={onNew} activeOpacity={0.85}
        style={{ backgroundColor: C.navy, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 16 }}>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.butter }}>+ 걷기 만들기</Text>
      </TouchableOpacity>

      {list.length === 0 ? (
        <View style={{ alignItems: 'center', paddingTop: 40, paddingHorizontal: 20 }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal, marginBottom: 8 }}>아직 걷기가 없어요</Text>
          <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, textAlign: 'center', lineHeight: 19 }}>
            이름만 적으면 됩니다{'\n'}동반자가 앱을 안 써도 정산서는 카톡으로 보낼 수 있어요
          </Text>
        </View>
      ) : list.map(s => {
        const sum = summarize(s.members);
        return (
          <TouchableOpacity key={s.id} onPress={() => onOpen(s.id)} activeOpacity={0.8}
            style={[box, { padding: 14, marginBottom: 10 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal, flex: 1 }} numberOfLines={1}>
                {s.course || '이름 없는 걷기'}
              </Text>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: GOLD }}>{settleKindLabel(s.kind)}</Text>
            </View>
            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>{s.date}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal, flex: 1 }}>
                {won(sum.total)}원
              </Text>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(12),
                color: sum.confirmedCount === sum.count ? '#6B8B5E' : '#6B1E2A' }}>
                {sum.confirmedCount}/{sum.count} 입금
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </KeyboardAwareScrollView>
  );
}

// ── 새로 만들기 ───────────────────────────────────────────────
function ComposeView({ onCancel, onCreated }) {
  const [kind, setKind] = useState('prepay');
  const [course, setCourse] = useState('');
  const [date, setDate] = useState(today());
  const [namesText, setNamesText] = useState('');
  const [total, setTotal] = useState('');
  const [perHead, setPerHead] = useState('');      // 1인 고정액(선입금은 보통 이쪽)
  const [account, setAccount] = useState('');
  const [accountName, setAccountName] = useState('');
  const [saving, setSaving] = useState(false);

  const names = useMemo(() => parseNames(namesText), [namesText]);

  // 선입금은 "1인 15만원"처럼 단가가 먼저 정해지고, 식사는 총액을 나눈다.
  //   둘 다 지원하되 입력한 쪽을 기준으로 계산 — 총무가 실제로 생각하는 순서를 그대로 둔다.
  const members = useMemo(() => {
    if (names.length === 0) return [];
    const per = Number(perHead) || 0;
    if (per > 0) return names.map(m => ({ ...m, amount: Math.round(per) }));
    return splitEvenly(names, Number(total) || 0);
  }, [names, perHead, total]);

  const sumAmount = members.reduce((a, m) => a + m.amount, 0);

  const submit = async () => {
    if (saving) return;
    if (names.length === 0) { showToast('참가자 이름을 넣어주세요'); return; }
    if (sumAmount <= 0) { showToast('금액을 넣어주세요'); return; }
    Keyboard.dismiss();
    setSaving(true);
    try {
      const s = await createSettlement({
        kind, course, date, members,
        total: sumAmount, account, accountName,
      });
      onCreated(s);
    } catch (e) {
      showToast('저장하지 못했어요');
    } finally { setSaving(false); }
  };

  return (
    <KeyboardAwareScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} bottomOffset={20}>
      <Text style={label}>무엇을 걷나요</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
        {SETTLE_KINDS.map(k => {
          const on = kind === k.key;
          return (
            <TouchableOpacity key={k.key} onPress={() => setKind(k.key)} activeOpacity={0.8}
              style={{ flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center',
                backgroundColor: on ? C.navy : C.bgSecondary, borderWidth: 0.5, borderColor: on ? C.navy : C.hairline }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(12.5), color: on ? C.butter : C.charcoal }}>{k.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={label}>구장 · 날짜</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
        <AppTextInput value={course} onChangeText={setCourse} placeholder="남서울CC"
          style={[box, { flex: 1.4, paddingHorizontal: 12, paddingVertical: 12, fontFamily: F.sys, fontSize: fs(13.5), color: C.charcoal }]} />
        <AppTextInput value={date} onChangeText={setDate} placeholder="2026.07.26" keyboardType="numbers-and-punctuation"
          style={[box, { flex: 1, paddingHorizontal: 12, paddingVertical: 12, fontFamily: F.sys, fontSize: fs(13.5), color: C.charcoal }]} />
      </View>

      <Text style={label}>참가자 — 카톡 명단을 그대로 붙여넣어도 돼요</Text>
      <AppTextInput value={namesText} onChangeText={setNamesText} multiline
        placeholder={'김이사\n박부장\n최과장'}
        style={[box, { minHeight: fs(96), paddingHorizontal: 12, paddingVertical: 12, textAlignVertical: 'top',
          fontFamily: F.sys, fontSize: fs(13.5), color: C.charcoal, lineHeight: fs(21) }]} />
      {names.length > 0 && (
        <Text style={{ fontFamily: F.sysSb, fontSize: fs(11.5), color: GOLD, marginTop: 7 }}>
          {names.length}명 — {names.map(n => n.name).join(', ')}
        </Text>
      )}

      <View style={{ height: 18 }} />
      <Text style={label}>{kind === 'prepay' ? '1인당 얼마 (또는 아래 총액)' : '총액'}</Text>
      {kind === 'prepay' && (
        <AppTextInput value={perHead} onChangeText={t => { setPerHead(t.replace(/[^0-9]/g, '')); if (t) setTotal(''); }}
          placeholder="150000" keyboardType="number-pad"
          style={[box, { paddingHorizontal: 12, paddingVertical: 12, marginBottom: 8,
            fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }]} />
      )}
      <AppTextInput value={total} onChangeText={t => { setTotal(t.replace(/[^0-9]/g, '')); if (t) setPerHead(''); }}
        placeholder={kind === 'prepay' ? '총액으로 넣으려면 여기' : '312000'} keyboardType="number-pad"
        style={[box, { paddingHorizontal: 12, paddingVertical: 12,
          fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }]} />
      {members.length > 0 && sumAmount > 0 && (
        <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.warmGray, marginTop: 8 }}>
          1인 {won(members[0].amount)}원 · 합계 {won(sumAmount)}원
          {members.some(m => m.amount !== members[0].amount) ? ' (끝자리 조정됨)' : ''}
        </Text>
      )}

      <View style={{ height: 18 }} />
      <Text style={label}>입금 계좌</Text>
      <AppTextInput value={account} onChangeText={setAccount} placeholder="국민 123456-78-901234"
        style={[box, { paddingHorizontal: 12, paddingVertical: 12, marginBottom: 8,
          fontFamily: F.sys, fontSize: fs(13.5), color: C.charcoal }]} />
      <AppTextInput value={accountName} onChangeText={setAccountName} placeholder="예금주"
        style={[box, { paddingHorizontal: 12, paddingVertical: 12,
          fontFamily: F.sys, fontSize: fs(13.5), color: C.charcoal }]} />

      <TouchableOpacity onPress={submit} activeOpacity={0.85} disabled={saving}
        style={{ marginTop: 24, backgroundColor: saving ? C.warmGray : C.navy, borderRadius: 12,
          paddingVertical: 15, alignItems: 'center' }}>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(14.5), color: C.butter }}>
          {saving ? '만드는 중…' : '만들기'}
        </Text>
      </TouchableOpacity>
    </KeyboardAwareScrollView>
  );
}

// ── 상세 (입금 체크) ──────────────────────────────────────────
function DetailView({ s, onSave, onDeleted }) {
  const sum = useMemo(() => summarize(s.members), [s.members]);
  const allDone = sum.count > 0 && sum.confirmedCount === sum.count;

  // 이름 탭 → 입금 확정 토글. 총무가 은행앱 보면서 하나씩 찍는 동작.
  const tapMember = (memberId) => onSave({ members: toggleMemberStatus(s.members, memberId) });

  const sendKakao = async () => {
    try { await Share.share({ message: buildSettlementText(s) }); }
    catch (e) { /* 사용자가 공유 시트를 닫은 경우 — 무시 */ }
  };

  const confirmDelete = () => {
    showAppAlert('이 걷기를 지울까요?', '입금 체크한 내용도 같이 사라져요.', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: async () => {
        try { await deleteSettlement(s.id); onDeleted(); }
        catch (e) { showToast('삭제하지 못했어요'); }
      } },
    ]);
  };

  return (
    <KeyboardAwareScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      {/* 요약 */}
      <View style={[box, { padding: 16, marginBottom: 14 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: GOLD, flex: 1 }}>
            {settleKindLabel(s.kind)}{s.date ? ` · ${s.date}` : ''}
          </Text>
          <TouchableOpacity onPress={confirmDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>삭제</Text>
          </TouchableOpacity>
        </View>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(24), color: C.charcoal }}>{won(sum.total)}원</Text>
        <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), marginTop: 8,
          color: allDone ? '#6B8B5E' : '#6B1E2A' }}>
          {allDone ? '전원 입금 완료' : `${sum.confirmedCount}/${sum.count} 입금 · ${won(sum.remain)}원 남음`}
        </Text>
      </View>

      {/* 명단 — 탭하면 확정 토글 */}
      <Text style={label}>이름을 탭하면 입금 확정으로 바뀝니다</Text>
      <View style={[box, { paddingVertical: 4, marginBottom: 14 }]}>
        {(s.members || []).map((m, i) => {
          const done = m.status === PAY_CONFIRMED;
          const claimed = m.status === PAY_CLAIMED;
          return (
            <TouchableOpacity key={m.id || i} onPress={() => tapMember(m.id)} activeOpacity={0.6}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13,
                borderBottomWidth: i === s.members.length - 1 ? 0 : 0.5, borderBottomColor: C.hairline }}>
              <Text style={{ flex: 1, fontFamily: F.sysSb, fontSize: fs(14),
                color: done ? C.warmGray : C.charcoal }}>{m.name}</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, marginRight: 12 }}>
                {won(m.amount)}
              </Text>
              <Text style={{ fontFamily: F.sysSb, fontSize: fs(11.5), minWidth: fs(52), textAlign: 'right',
                color: done ? '#6B8B5E' : claimed ? GOLD : C.warmGray }}>
                {done ? '✓ 확정' : claimed ? '확인대기' : '대기'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 계좌 */}
      {!!s.account && (
        <View style={[box, { padding: 14, marginBottom: 14 }]}>
          <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.charcoal }}>
            {s.account}{s.accountName ? `  ${s.accountName}` : ''}
          </Text>
        </View>
      )}

      {/* 카톡으로 정산서 — 앱 안 깐 사람에게 가는 경로 */}
      <TouchableOpacity onPress={sendKakao} activeOpacity={0.85}
        style={{ backgroundColor: C.butter, borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}>
        <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal }}>카톡으로 정산서 보내기</Text>
      </TouchableOpacity>
      {!allDone && sum.unpaid.length > 0 && (
        <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: C.warmGray, textAlign: 'center',
          marginTop: 10, lineHeight: 18 }}>
          아직 안 낸 사람: {sum.unpaid.map(m => m.name).join(', ')}
        </Text>
      )}
    </KeyboardAwareScrollView>
  );
}

