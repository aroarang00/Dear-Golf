import React, { useState, useEffect, useRef } from 'react';
import { Animated, View, Image, StyleSheet } from 'react-native';

const BG_IMAGES = [
  'https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?w=800',
  'https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=800',
  'https://images.unsplash.com/photo-1593111774240-d529f12cf4bb?w=800',
  'https://images.unsplash.com/photo-1592919505780-303950717480?w=800',
];

export function HomeBgSlider() {
  const [bgIdx, setBgIdx] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const interval = setInterval(() => {
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]).start();
      setBgIdx(i => (i + 1) % BG_IMAGES.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);
  return (
    <Animated.View style={{ ...StyleSheet.absoluteFillObject, opacity: fadeAnim }}>
      <Image source={{ uri: BG_IMAGES[bgIdx] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,30,16,0.72)' }} />
    </Animated.View>
  );
}
