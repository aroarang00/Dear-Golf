import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, Keyboard } from 'react-native';
import { KeyboardProvider, KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import AppTextInput from './common/AppTextInput';
import { SpinnerPicker } from './common/SpinnerPicker';
import { Icon } from './common/Icon';
import { Spinner } from './common/Spinner';
import { C, F, fs } from '../constants/colors';
import { EXPENSE_CATEGORIES, extractExpenseFromText, extractExpenseFromImage } from '../utils/golfExpense';

// 골프 가계부 '직접 지출' 입력 시트 — 금액·분류·날짜·메모. 라운딩과 무관한 지출(회비·용품).
//   onSubmit({ category, amount, date:'YYYY.MM.DD', memo }) → 부모(GolfLedgerModal)가 createExpense 저장.
//   가계부 톤(차콜딥+골드) 통일. RN Modal은 별도 네이티브 윈도우라 자체 KeyboardProvider 필요.
//   ★핸들·헤더는 고정, 입력부는 KeyboardAwareScrollView — 키보드가 시트를 통째로 밀어 금액칸이 화면 밖으로
//    나가던 문제 해결(포커스된 칸만 키보드 위로 자동 스크롤). ScheduleModal과 동일 패턴.
const GOLD = '#C9A84C';
const GOLD_DEEP = '#8A6A33';
const won = (n) => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
const label = { fontFamily: F.sysSb, fontSize: fs(12), color: C.warmGray, marginBottom: 8 };
const boxBase = { backgroundColor: C.bgSecondary, borderRadius: 12, borderWidth: 0.5, borderColor: C.hairline };

export function ExpenseAddSheet({ visible, onClose, onSubmit }) {
  const [amount, setAmount] = useState('');    // raw 숫자 문자열(콤마 없음)
  const [category, setCategory] = useState('etc');
  const [date, setDate] = useState(new Date());
  const [memo, setMemo] = useState('');
  const [showDate, setShowDate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiText, setAiText] = useState('');    // 카드문자/한줄 붙여넣기 → AI 자동입력
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [showPaste, setShowPaste] = useState(false); // '붙여넣기' 입력칸 펼침

  // 열릴 때마다 초기화(날짜=오늘). 닫히는 애니메이션 중엔 안 건드림.
  useEffect(() => {
    if (!visible) return;
    setAmount(''); setCategory('etc'); setDate(new Date()); setMemo(''); setShowDate(false); setSaving(false);
    setAiText(''); setAiBusy(false); setAiError(''); setShowPaste(false);
  }, [visible]);

  // AI 결과 → 필드 프리필(텍스트·영수증 공통). 사용자가 이후 확인·수정.
  const applyResult = (r) => {
    if (r.error) { setAiError(r.error); return; }
    if (r.amount > 0) setAmount(String(r.amount));
    if (r.category) setCategory(r.category);
    if (r.date) {
      const p = r.date.split('.').map(n => parseInt(n, 10));
      if (p.length === 3 && p.every(Number.isFinite)) setDate(new Date(p[0], p[1] - 1, p[2]));
    }
    if (r.memo) setMemo(r.memo);
    setAiText('');   // 채운 뒤 입력창 비움 — 아래 프리필된 값 확인 유도
  };

  // 텍스트(카드문자/한 줄) 자동입력
  const handleAiFill = async () => {
    const t = aiText.trim();
    if (!t || aiBusy) return;
    Keyboard.dismiss();
    setAiBusy(true); setAiError('');
    const r = await extractExpenseFromText(t);
    setAiBusy(false);
    applyResult(r);
  };

  // 영수증 사진 자동입력 — 카메라/갤러리 → 이미지 → 같은 extractExpense CF(이미지 경로)
  const handlePickReceipt = async (source) => {
    if (aiBusy) return;
    Keyboard.dismiss();
    let uri = null;
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { setAiError('카메라 권한이 필요해요'); return; }
        const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
        if (res.canceled || !res.assets?.length) return;
        uri = res.assets[0].uri;
      } else {
        let perm = await ImagePicker.getMediaLibraryPermissionsAsync();
        if (!perm.granted && perm.canAskAgain) perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { setAiError('사진 접근 권한이 필요해요'); return; }
        const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
        if (res.canceled || !res.assets?.length) return;
        uri = res.assets[0].uri;
      }
    } catch (e) { setAiError('사진을 불러오지 못했어요'); return; }
    setAiBusy(true); setAiError('');
    const r = await extractExpenseFromImage(uri);
    setAiBusy(false);
    applyResult(r);
  };


  const amountNum = parseInt(amount || '0', 10) || 0;
  const canSave = amountNum > 0 && !saving;
  const onAmount = (v) => setAmount(v.replace(/[^0-9]/g, '').slice(0, 9)); // 최대 9자리(억 단위)

  const close = () => { Keyboard.dismiss(); onClose && onClose(); };

  const handleSave = async () => {
    if (!canSave) return;
    Keyboard.dismiss();
    setSaving(true);
    try {
      await (onSubmit && onSubmit({ category, amount: amountNum, date: fmtDate(date), memo: memo.trim() }));
      onClose && onClose();
    } catch (e) {
      setSaving(false); // 실패 시 시트 유지 — 부모가 알럿 처리
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <SafeAreaProvider>
      <KeyboardProvider>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          {/* 위 여백 탭 → 닫기 */}
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={close} />

          <SafeAreaView edges={['bottom']} style={{ backgroundColor: C.bgPrimary,
            borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%' }}>
            {/* 고정: 핸들 + 헤더 */}
            <View style={{ paddingTop: 10, paddingHorizontal: 20 }}>
              <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.hairline, marginBottom: 14 }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(17), color: C.charcoalDeep, flex: 1 }}>지출 추가</Text>
                <TouchableOpacity onPress={close} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={{ fontSize: fs(20), color: C.warmGray }}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* 스크롤: 금액~저장. 포커스 칸을 키보드 위로 자동 스크롤 */}
            <KeyboardAwareScrollView
              style={{ flexShrink: 1 }}
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 20 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="always"
              keyboardDismissMode="on-drag"
              bottomOffset={24}>

              {/* AI 자동입력 — 촬영/갤러리/붙여넣기 한 카드(예정 라운딩 추가와 같은 패턴, 골드 톤) */}
              <View style={{ marginBottom: 20, borderRadius: 16, borderWidth: 0.5, borderColor: 'rgba(201,168,76,0.4)',
                backgroundColor: 'rgba(201,168,76,0.08)', padding: 12 }}>
                {/* 헤더 */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: GOLD_DEEP, alignItems: 'center', justifyContent: 'center' }}>
                    {aiBusy ? <Spinner size={16} color="#FFFFFF" /> : <Icon name="sparkle" size={15} color="#FFFFFF" strokeWidth={1.8} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoalDeep }}>AI로 자동입력</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 1 }}>
                      {aiBusy ? 'AI가 내용을 읽고 있어요...' : '금액·분류·날짜를 알아서 채워드려요'}
                    </Text>
                  </View>
                </View>

                {/* 방법 3개 — 촬영 / 갤러리 / 붙여넣기. AI 판별 중엔 로딩 스트립. */}
                {aiBusy ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 12,
                    paddingVertical: 22, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 0.5, borderColor: GOLD }}>
                    <Spinner size={20} color={GOLD_DEEP} />
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: GOLD_DEEP }}>AI가 내용을 읽고 있어요...</Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                    {[
                      { key: 'camera', icon: 'camera', label: '촬영', onPress: () => handlePickReceipt('camera') },
                      { key: 'gallery', icon: 'image', label: '갤러리', onPress: () => handlePickReceipt('gallery') },
                      { key: 'paste', icon: 'clipboard', label: '붙여넣기', onPress: () => setShowPaste(v => !v) },
                    ].map(m => {
                      const active = m.key === 'paste' && showPaste;
                      return (
                        <TouchableOpacity key={m.key} activeOpacity={0.8} onPress={m.onPress}
                          style={{ flex: 1, alignItems: 'center', gap: 6, paddingVertical: 12, borderRadius: 12,
                            backgroundColor: active ? 'rgba(201,168,76,0.16)' : '#FFFFFF',
                            borderWidth: 0.5, borderColor: active ? GOLD : C.hairline }}>
                          <Icon name={m.icon} size={21} color={GOLD_DEEP} strokeWidth={1.8} />
                          <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.charcoalDeep }}>{m.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {/* 붙여넣기 펼침 — 카드 안에서 */}
                {showPaste && !aiBusy && (
                  <View style={{ marginTop: 10 }}>
                    <AppTextInput value={aiText} onChangeText={(v) => { setAiText(v); if (aiError) setAiError(''); }} multiline
                      placeholder={'카드결제 문자나 “골프공 3만원”처럼 복사해서 붙여넣어 주세요'}
                      placeholderTextColor={C.warmGray}
                      style={{ minHeight: 70, maxHeight: 150, backgroundColor: C.bgPrimary, borderWidth: 0.5, borderColor: C.hairline,
                        borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontFamily: F.sys, fontSize: fs(13), color: C.charcoalDeep, textAlignVertical: 'top' }} />
                    <TouchableOpacity activeOpacity={0.85} disabled={!aiText.trim()} onPress={handleAiFill}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8,
                        backgroundColor: aiText.trim() ? GOLD_DEEP : C.hairline, borderRadius: 12, paddingVertical: 12 }}>
                      <Icon name="sparkle" size={16} color={aiText.trim() ? '#FFFFFF' : C.warmGray} strokeWidth={1.8} />
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(13.5), color: aiText.trim() ? '#FFFFFF' : C.warmGray }}>붙여넣은 내용으로 자동입력</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* 에러 (촬영·갤러리·붙여넣기 공통) */}
                {!!aiError && !aiBusy && (
                  <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.burgundy, marginTop: 9 }}>{aiError}</Text>
                )}
              </View>

              {/* 금액 */}
              <Text style={label}>금액</Text>
              <View style={[boxBase, { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginBottom: 18 }]}>
                <AppTextInput value={amount ? won(amountNum) : ''} onChangeText={onAmount}
                  keyboardType="numeric" placeholder="0" placeholderTextColor={C.warmGray}
                  style={{ flex: 1, fontFamily: F.sysB, fontSize: fs(22), color: C.charcoalDeep, paddingVertical: 12 }} />
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(16), color: C.warmGray }}>원</Text>
              </View>

              {/* 분류 */}
              <Text style={label}>분류</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
                {EXPENSE_CATEGORIES.map(c => {
                  const on = category === c.key;
                  return (
                    <TouchableOpacity key={c.key} onPress={() => setCategory(c.key)} activeOpacity={0.8}
                      style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
                        backgroundColor: on ? C.charcoalDeep : C.bgSecondary,
                        borderWidth: 0.5, borderColor: on ? C.charcoalDeep : C.hairline }}>
                      <Text style={{ fontFamily: on ? F.sysB : F.sysSb, fontSize: fs(13), color: on ? GOLD : C.textSecondary }}>{c.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* 날짜 */}
              <Text style={label}>날짜</Text>
              <TouchableOpacity onPress={() => { Keyboard.dismiss(); setShowDate(true); }} activeOpacity={0.7}
                style={[boxBase, { paddingHorizontal: 14, paddingVertical: 13, marginBottom: 18 }]}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: C.charcoalDeep }}>{fmtDate(date)}</Text>
              </TouchableOpacity>
              <SpinnerPicker visible={showDate} value={date} mode="date" maximumDate={new Date()}
                onPick={setDate} onClose={() => setShowDate(false)} />

              {/* 메모 */}
              <Text style={label}>메모 <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>(선택 · 예: 드라이버, 골프공)</Text></Text>
              <AppTextInput value={memo} onChangeText={setMemo} maxLength={200}
                placeholder="세부 내용을 적어두면 내역에 함께 보여요" placeholderTextColor={C.warmGray}
                style={[boxBase, { paddingHorizontal: 14, paddingVertical: 12, fontFamily: F.sys, fontSize: fs(14), color: C.charcoalDeep, marginBottom: 22 }]} />

              {/* 저장 */}
              <TouchableOpacity onPress={handleSave} activeOpacity={0.85} disabled={!canSave}
                style={{ paddingVertical: 15, borderRadius: 12, alignItems: 'center', backgroundColor: canSave ? C.charcoalDeep : C.hairline }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: canSave ? GOLD : C.warmGray }}>{saving ? '저장 중…' : '저장'}</Text>
              </TouchableOpacity>
            </KeyboardAwareScrollView>
          </SafeAreaView>
        </View>
      </KeyboardProvider>
      </SafeAreaProvider>
    </Modal>
  );
}
