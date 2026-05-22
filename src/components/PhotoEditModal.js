import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, Image, ActivityIndicator, Dimensions } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { C, F, fs } from '../constants/colors';

const { width: SW } = Dimensions.get('window');

export function PhotoEditModal({ visible, uri, onSave, onClose }) {
  const [rotation, setRotation] = useState(0);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setRotation(0);
    setSaving(false);
  };

  const handleClose = () => {
    reset();
    onClose && onClose();
  };

  const handleSave = async () => {
    if (!uri) return;
    setSaving(true);
    try {
      if (rotation === 0) {
        handleClose();
        return;
      }
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ rotate: rotation }],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG },
      );
      onSave && onSave(result.uri);
      reset();
    } catch (e) {
      console.warn('Edit failed:', e);
      setSaving(false);
    }
  };

  if (!visible || !uri) return null;

  const previewStyle = {
    width: SW * 0.85,
    height: SW * 0.85,
    transform: [{ rotate: `${rotation}deg` }],
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'space-between', paddingTop: 60, paddingBottom: 32 }}>
        {/* Top bar */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20 }}>
          <TouchableOpacity onPress={handleClose} disabled={saving}>
            <Text style={{ fontFamily: F.sys, fontSize: fs(15), color: '#fff' }}>취소</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: C.butter }}>
              {saving ? '저장 중…' : '저장'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Preview */}
        <View style={{ alignItems: 'center' }}>
          <View style={{ width: SW * 0.85, height: SW * 0.85, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
            <Image source={{ uri }} style={previewStyle} resizeMode="contain" />
          </View>
        </View>

        {/* Controls */}
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <ToolBtn label="↺ 좌회전" onPress={() => setRotation(r => (r - 90) % 360)} />
            <ToolBtn label="↻ 우회전" onPress={() => setRotation(r => (r + 90) % 360)} />
          </View>
          {saving && <ActivityIndicator color={C.butter} />}
        </View>
      </View>
    </Modal>
  );
}

function ToolBtn({ label, onPress }) {
  return (
    <TouchableOpacity onPress={onPress}
      style={{
        flex: 1,
        height: 48,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text style={{ fontFamily: F.sys, fontSize: fs(14), color: '#fff' }}>{label}</Text>
    </TouchableOpacity>
  );
}
