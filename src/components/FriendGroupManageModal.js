import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import AppTextInput from './common/AppTextInput';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, fs } from '../constants/colors';
import { OverlayAlert } from './common/OverlayAlert';
import { LoadingState } from './common/LoadingState';
import { useAndroidBack } from '../hooks/useAndroidBack';
import {
  loadFriendData, saveFriendGroups, groupColor, groupMemberCount,
  newGroupId, nextGroupColor, MAX_FRIEND_GROUPS, GROUP_NAME_MAX,
} from '../utils/friendGroups';
import { loadMyUsedGroupIds } from '../utils/round';

// 친구 그룹 관리 — MyPage 설정 진입. 추가·이름변경·삭제(빈 그룹만)·순서. 최대 MAX_FRIEND_GROUPS개.
//   삭제 가드(c안): 멤버 0 + 이 그룹으로 올린 글 0 일 때만. (피드 동적이라 글 있는 그룹 삭제 시 과거글 숨겨짐 회피)
//   그룹·소속은 owner-only(친구에겐 안 보임). ([[friend_groups]])
export function FriendGroupManageModal({ visible, onClose, hiddenFriends = [], onUnhide }) {
  const insets = useSafeAreaInsets();
  const [groups, setGroups] = useState([]);
  const [friendMeta, setFriendMeta] = useState({});
  const [usedIds, setUsedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);   // 이름 편집 중 그룹 id
  const [editingName, setEditingName] = useState('');
  const [alert, setAlert] = useState(null);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setEditingId(null); setNewName('');
    Promise.all([loadFriendData(), loadMyUsedGroupIds()])
      .then(([fd, used]) => { setGroups(fd.friendGroups); setFriendMeta(fd.friendMeta); setUsedIds(used); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [visible]);

  useAndroidBack(visible, () => { if (alert) setAlert(null); else onClose(); });

  // 낙관적 업데이트 + 저장 (그룹 목록 통째 merge)
  const persist = (next) => { setGroups(next); saveFriendGroups(next); };

  const addGroup = () => {
    const nm = newName.trim().slice(0, GROUP_NAME_MAX);
    if (!nm) return;
    if (groups.length >= MAX_FRIEND_GROUPS) {
      setAlert({ title: `그룹은 최대 ${MAX_FRIEND_GROUPS}개예요`,
        message: '기존 그룹을 정리한 뒤 추가해주세요.', buttons: [{ text: '확인' }] });
      return;
    }
    setNewName('');
    persist([...groups, { id: newGroupId(), name: nm, order: groups.length, color: nextGroupColor(groups) }]);
  };

  const startRename = (g) => { setEditingId(g.id); setEditingName(g.name); };
  const commitRename = () => {
    if (!editingId) return;
    const nm = editingName.trim().slice(0, GROUP_NAME_MAX);
    const id = editingId;
    setEditingId(null);
    if (!nm) return;                                  // 비우면 변경 취소(기존 이름 유지)
    persist(groups.map(g => g.id === id ? { ...g, name: nm } : g));
  };

  const deleteGroup = (g) => {
    const members = groupMemberCount(friendMeta, g.id);
    const hasPosts = usedIds.has(g.id);
    if (members > 0 || hasPosts) {
      setAlert({
        title: `'${g.name}'은 비어있지 않아요`,
        message: [
          members > 0 ? `· 이 그룹 친구 ${members}명이 있어요` : null,
          hasPosts ? '· 이 그룹으로 공개한 글이 있어요' : null,
          '',
          '친구를 다른 그룹으로 옮기거나\n글 공개 범위를 바꾼 뒤 삭제할 수 있어요.',
        ].filter(x => x !== null).join('\n'),
        buttons: [{ text: '확인' }],
      });
      return;
    }
    setAlert({
      title: `'${g.name}' 그룹을 삭제할까요?`,
      message: '비어 있는 그룹이라 삭제해도 영향이 없어요.',
      buttons: [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive',
          onPress: () => persist(groups.filter(x => x.id !== g.id).map((x, i) => ({ ...x, order: i }))) },
      ],
    });
  };

  const move = (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= groups.length) return;
    const next = [...groups];
    [next[idx], next[j]] = [next[j], next[idx]];
    persist(next.map((x, i) => ({ ...x, order: i })));
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: C.bgPrimary, paddingTop: insets.top }}>
        {/* 헤더 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
          borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ fontSize: fs(26), color: C.charcoal, lineHeight: 28 }}>‹</Text>
          </TouchableOpacity>
          <Text style={{ flex: 1, textAlign: 'center', fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal }}>친구 관리</Text>
          <View style={{ width: 24 }} />
        </View>

        {loading ? <LoadingState /> : (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
            <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, lineHeight: 18, marginBottom: 16 }}>
              친구를 그룹으로 묶어 글·모집 공개 범위를 좁힐 수 있어요.{'\n'}그룹·소속은 나만 보이고 친구에겐 안 보여요.
            </Text>

            {groups.map((g, i) => {
              const members = groupMemberCount(friendMeta, g.id);
              const locked = members > 0 || usedIds.has(g.id);
              const isEditing = editingId === g.id;
              return (
                <View key={g.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12,
                  borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: groupColor(groups, g.id) }} />
                  {isEditing ? (
                    <AppTextInput value={editingName} onChangeText={(t) => setEditingName(t.slice(0, GROUP_NAME_MAX))} autoFocus
                      onSubmitEditing={commitRename} onBlur={commitRename} returnKeyType="done"
                      style={{ flex: 1, fontFamily: F.sysSb, fontSize: fs(14), color: C.charcoal,
                        borderBottomWidth: 1, borderBottomColor: C.burgundy, paddingVertical: 3 }} />
                  ) : (
                    <TouchableOpacity style={{ flex: 1 }} activeOpacity={0.7} onPress={() => startRename(g)}>
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.charcoal }}>{g.name}</Text>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 2 }}>친구 {members}명</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => move(i, -1)} disabled={i === 0} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                    <Text style={{ fontSize: fs(18), color: i === 0 ? C.warmGrayLight : C.warmGray }}>↑</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => move(i, 1)} disabled={i === groups.length - 1} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                    <Text style={{ fontSize: fs(18), color: i === groups.length - 1 ? C.warmGrayLight : C.warmGray }}>↓</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteGroup(g)} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                    <Text style={{ fontSize: fs(15), color: locked ? C.warmGrayLight : C.burgundy }}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              );
            })}

            {groups.length < MAX_FRIEND_GROUPS ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18 }}>
                {/* maxLength 금지 — 한글 조합 충돌(마지막 글자 막힘). onChangeText에서 컷 + addGroup/commitRename 저장 시 slice 백스톱 */}
                <AppTextInput value={newName} onChangeText={(t) => setNewName(t.slice(0, GROUP_NAME_MAX))} placeholder="새 그룹 이름"
                  placeholderTextColor={C.warmGrayLight} onSubmitEditing={addGroup} returnKeyType="done"
                  style={{ flex: 1, fontFamily: F.sys, fontSize: fs(14), color: C.charcoal, backgroundColor: C.bgSecondary,
                    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 0.5, borderColor: C.hairline }} />
                <TouchableOpacity onPress={addGroup} activeOpacity={0.85}
                  style={{ backgroundColor: C.burgundy, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 11 }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.butter }}>추가</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 18 }}>
                그룹은 최대 {MAX_FRIEND_GROUPS}개까지 만들 수 있어요.
              </Text>
            )}

            <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 20, lineHeight: 17 }}>
              {'· 이름을 탭하면 바꿀 수 있어요.\n· 친구가 있거나 이 그룹으로 올린 글이 있으면\n   삭제할 수 없어요 (비운 뒤 삭제).'}
            </Text>

            {/* 숨긴 친구 — 친구 목록 메인에서 빼고 여기서만 관리(노출 0). 해제하면 목록에 다시 보임 ([[project_fullscroll_profile]]) */}
            {hiddenFriends.length > 0 && (
              <View style={{ marginTop: 26, borderTopWidth: 0.5, borderTopColor: C.hairline, paddingTop: 18 }}>
                <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.charcoal, marginBottom: 4 }}>숨긴 친구 {hiddenFriends.length}</Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginBottom: 12, lineHeight: 16 }}>
                  {'숨긴 친구는 목록에 안 보여요. 상대방은 알 수 없어요.\n숨김 해제하면 목록에 다시 보여요.'}
                </Text>
                {hiddenFriends.map(f => (
                  <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9,
                    borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
                    <Text style={{ flex: 1, fontFamily: F.sysSb, fontSize: fs(14), color: C.charcoal }} numberOfLines={1}>{f.name}</Text>
                    <TouchableOpacity activeOpacity={0.7} onPress={() => onUnhide && onUnhide(f.id)}
                      style={{ borderWidth: 1, borderColor: C.hairline, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 6 }}>
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: C.charcoal }}>숨김 해제</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        )}
        <OverlayAlert data={alert} onClose={() => setAlert(null)} />
      </View>
    </Modal>
  );
}
