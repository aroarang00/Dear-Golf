import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { useOverlayBackHandler } from '../utils/useOverlayBackHandler';
import { OverlayAlert } from './common/OverlayAlert';
import { submitEvaluation } from '../utils/mannerEvaluations';

// 라운지 모집 매너 평가 ([[manner-evaluation-policy]]).
// 라운딩 종료 추정 시각(티오프+5h) 기준 48h 윈도우. 강제성 없음 — 무평가 = 보통 자동 처리.
// 전체공개(`scope: 'all'`) 모집만, 친구공개·친구지정은 윈도우 자체 안 열림.
// 평가 옵션 3종: 👍 좋았어요 / 😐 보통 / 👎 (그라데이션 집계는 Phase 2 Cloud Functions).

const OPTIONS = [
  { key: 'good', emoji: '👍', label: '좋았어요', desc: '함께 또 라운딩하고 싶어요' },
  { key: 'normal', emoji: '😐', label: '보통이에요', desc: '특별한 의견 없어요' },
  { key: 'bad', emoji: '👎', label: '아쉬웠어요', desc: '매너에 문제가 있었어요' },
];

export function MannerEvaluationModal({ visible, post, participants = [], onClose, onSubmit }) {
  // participants: [{ id, name }] — 평가 대상 (본인 제외)
  const [picks, setPicks] = useState({}); // { [participantId]: 'good'|'normal'|'bad' }
  const [alert, setAlert] = useState(null);

  useOverlayBackHandler(visible, onClose);

  useEffect(() => { if (visible) { setPicks({}); setAlert(null); } }, [visible]);

  const pick = (pid, key) => setPicks(prev => ({ ...prev, [pid]: key }));
  const evaluatedCount = Object.keys(picks).length;
  const totalCount = participants.length;

  const doSubmit = async () => {
    // 'good'/'bad'만 Firestore 작성 ('normal' 또는 무평가는 doc 안 만듦 = 자동 보통, 정책 §3).
    const entries = Object.entries(picks).filter(([, r]) => r === 'good' || r === 'bad');
    if (post?.id && entries.length > 0) {
      await Promise.all(entries.map(([pid, rating]) =>
        submitEvaluation({ roundupId: post.id, targetUid: pid, rating })
          .catch(e => __DEV__ && console.warn('[MannerEval] submit fail', e?.message))
      ));
    }
    onSubmit?.(picks);
    onClose?.();
  };

  const submit = () => {
    setAlert({
      title: evaluatedCount === 0 ? '평가하지 않고 닫을까요?' : '평가를 제출할까요?',
      message: evaluatedCount === 0
        ? '평가 안 한 동반자는 자동으로 "보통"으로 처리돼요.\n48시간 안에 다시 평가할 수 있어요.'
        : `${evaluatedCount}명 평가 · ${totalCount - evaluatedCount}명 무평가(자동 보통)로 제출돼요.\n제출 후 수정할 수 없어요.`,
      buttons: [
        { text: '취소', style: 'cancel' },
        { text: '제출', style: 'destructive', onPress: doSubmit },
      ],
    });
  };

  if (!visible || !post) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.bgPrimary }} edges={['top', 'bottom', 'left', 'right']}>
          {/* 헤더 */}
          <View style={{ paddingHorizontal: 20, paddingVertical: 13, flexDirection: 'row', alignItems: 'center',
            gap: 14, borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ fontSize: fs(22), color: C.charcoal }}>←</Text>
            </TouchableOpacity>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }}>동반자 평가</Text>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 40 }}>
            <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal }}>{post.course}</Text>
            <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 4 }}>
              {post.date} {post.day ? `(${post.day})` : ''}
            </Text>

            <View style={{ marginTop: 18, padding: 14, backgroundColor: C.bgSecondary, borderRadius: 12 }}>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, lineHeight: 19 }}>
                동반자분들 어떠셨어요?{'\n'}
                강요는 없어요 — 평가하지 않으면 자동으로 "보통"으로 처리돼요.{'\n'}
                개별 평가는 익명으로 집계되어 공개되지 않아요.
              </Text>
            </View>

            {participants.length === 0 ? (
              <View style={{ marginTop: 40, alignItems: 'center' }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray }}>평가 대상자가 없어요</Text>
              </View>
            ) : (
              participants.map(p => {
                const picked = picks[p.id];
                return (
                  <View key={p.id} style={{ marginTop: 22 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: C.bgSecondary,
                        alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }}>
                          {p.name?.charAt(0) || '?'}
                        </Text>
                      </View>
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: C.charcoal }}>{p.name}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {OPTIONS.map(opt => {
                        const on = picked === opt.key;
                        return (
                          <TouchableOpacity key={opt.key} activeOpacity={0.85} onPress={() => pick(p.id, opt.key)}
                            style={{ flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center',
                              backgroundColor: on ? C.charcoal : C.bgSecondary,
                              borderWidth: 0.5, borderColor: on ? C.charcoal : C.hairline }}>
                            <Text style={{ fontSize: fs(20) }}>{opt.emoji}</Text>
                            <Text style={{ fontFamily: F.sysSb, fontSize: fs(11),
                              color: on ? C.butter : C.charcoal, marginTop: 4 }}>{opt.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })
            )}

            <TouchableOpacity onPress={submit} activeOpacity={0.85}
              style={{ marginTop: 30, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
                backgroundColor: C.burgundy }}>
              <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.butter }}>
                {evaluatedCount === 0 ? '평가 없이 닫기' : '평가 제출하기'}
              </Text>
            </TouchableOpacity>

            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGrayLight,
              textAlign: 'center', marginTop: 12, lineHeight: 16 }}>
              48시간 안에 다시 평가할 수 있어요.{'\n'}
              제출 후엔 수정할 수 없어요.
            </Text>
          </ScrollView>

          <OverlayAlert data={alert} onClose={() => setAlert(null)} />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
