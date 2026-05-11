import React, { useState, useRef } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, Image, Dimensions } from 'react-native';
import { Video } from 'expo-av';
import { F } from '../../constants/colors';

const { width: SW } = Dimensions.get('window');

export function PhotoViewer({ photos, startIndex, onClose }) {
  const [idx, setIdx] = useState(startIndex);
  const videoRef = useRef(null);
  const current = photos[idx];
  const isVideo = current?.type === 'video';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.97)', justifyContent: 'center' }}>
        <TouchableOpacity style={{ position: 'absolute', top: 52, right: 20, zIndex: 10 }} onPress={onClose}>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 28, lineHeight: 32 }}>✕</Text>
        </TouchableOpacity>
        <View style={{ position: 'absolute', top: 56, left: 0, right: 0, alignItems: 'center' }}>
          <Text style={{ fontFamily: F.sys, fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
            {idx + 1} / {photos.length} {isVideo ? '· 영상' : ''}
          </Text>
        </View>
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}
          contentOffset={{ x: idx * SW, y: 0 }}
          onMomentumScrollEnd={e => setIdx(Math.round(e.nativeEvent.contentOffset.x / SW))}>
          {photos.map((item, i) => (
            <View key={i} style={{ width: SW, justifyContent: 'center', alignItems: 'center' }}>
              {item.type === 'video' ? (
                <Video ref={i === idx ? videoRef : null} source={{ uri: item.uri }}
                  style={{ width: SW, height: SW * 1.2 }} useNativeControls resizeMode="contain" shouldPlay={i === idx} />
              ) : (
                <Image source={{ uri: item.uri || item }} style={{ width: SW, height: SW * 1.2 }} resizeMode="contain" />
              )}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}
