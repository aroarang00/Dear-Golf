import React from 'react';
import { Text, Linking } from 'react-native';

// 본문 텍스트 안의 URL을 자동 감지해 '탭하면 열리는' 링크로 렌더. (모집 댓글·DM 등 평문 Text 대체)
//  - http(s)://… 와 www.… 모두 인식. 끝의 마침표·괄호 등 문장부호는 링크에서 제외(오인식 방지).
//  - 부모 Text 안에 자식 Text span으로 끼워 인라인 유지(줄바꿈·정렬 그대로). 링크 span만 onPress.
const URL_RE = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
const TRAIL_RE = /[)\]}.,!?;:'"·]+$/;   // 링크 끝에 붙은 문장부호는 링크에서 떼어냄

// onLinkPress(url) 를 주면 그 콜백으로 연다(앱내 웹뷰 등). 없으면 기존대로 시스템 브라우저.
export function LinkText({ children, style, linkColor = '#1565C0', numberOfLines, onTextLayout, onLinkPress }) {
  const text = typeof children === 'string' ? children : (children == null ? '' : String(children));
  if (!text) return <Text style={style} numberOfLines={numberOfLines} onTextLayout={onTextLayout}>{text}</Text>;

  const parts = [];
  let last = 0;
  let m;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text)) !== null) {
    if (m.index > last) parts.push({ t: text.slice(last, m.index), link: false });
    let url = m[0];
    let trail = '';
    const tm = url.match(TRAIL_RE);
    if (tm) { trail = tm[0]; url = url.slice(0, url.length - trail.length); }
    if (url) parts.push({ t: url, link: true });
    if (trail) parts.push({ t: trail, link: false });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ t: text.slice(last), link: false });

  // 링크가 없으면 그냥 평문(불필요한 span 분리 회피)
  if (!parts.some(p => p.link)) return <Text style={style} numberOfLines={numberOfLines} onTextLayout={onTextLayout}>{text}</Text>;

  const open = (raw) => {
    const u = /^www\./i.test(raw) ? `https://${raw}` : raw;
    if (onLinkPress) { onLinkPress(u); return; } // 앱내 웹뷰 등 커스텀 처리
    Linking.openURL(u).catch(() => {});
  };

  return (
    <Text style={style} numberOfLines={numberOfLines} onTextLayout={onTextLayout}>
      {parts.map((p, i) => p.link
        ? <Text key={i} onPress={() => open(p.t)} suppressHighlighting
            style={{ color: linkColor, textDecorationLine: 'underline' }}>{p.t}</Text>
        : p.t)}
    </Text>
  );
}
