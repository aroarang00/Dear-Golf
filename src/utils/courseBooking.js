// 구장 예약 링크 — 어느 구장이 '홈페이지 예약'이고 어디가 '부킹앱 예약'인지는 AI로 판별 불가(불안정·환각 위험,
//   제휴도 수시로 바뀜)라 사용자가 직접 고르게 한다(홈페이지·전화·골팡·카카오VX). 사용자 2026-07-23.
//   - 홈페이지 URL만 수동 큐레이션(카카오·공개 API가 공식 홈피 주소를 안 줌). 없으면 네이버 검색 폴백.
//   - 부킹앱은 구장별 딥링크가 불확실해 각 앱/웹의 '예약 홈'만 연다(설치 시 앱으로 연결). 유저가 자기 앱 선택.
import { normalizeCourseName } from './top100';

// 부킹앱 — 모바일 웹(앱 설치 시 앱으로 연결). 구장 검색 없이 홈으로.
export const BOOKING_SITES = {
  kakaovx: 'https://www.kakao.golf/',                                 // 카카오골프예약(카카오VX) — 티타임 검색·임박특가
  teescanner: 'https://m.teescanner.com/booking/list?tab=golfcourse', // 골프존 티스캐너 — 전국 특가 티타임·조인
  // 골팡 제거(2026-07-23) — 앱 딥링크 비공개 + 모바일웹이 '앱 설치' nag. 골프존=티스캐너와 한 회사(중복), 스마트스코어는 웹 부킹 약함 → 보류.
};

// 구장 공식 홈페이지(예약) — 정규화된 구장명 → URL. 하나씩 수동 큐레이션(채워질수록 '바로가기'가 늘어남).
//   ★키는 normalizeCourseName로 — 예약문자 AI 등록 등으로 표기가 달라도 매칭되게(top100과 같은 기준).
const HOMEPAGES = {
  // 예) [normalizeCourseName('사우스스프링스')]: 'https://www.southsprings.co.kr',
};

// 구장 홈페이지 URL — 큐레이션에 있으면 그 URL, 없으면 null(호출부가 웹 검색으로 폴백).
export function getCourseHomepage(courseName) {
  if (!courseName) return null;
  return HOMEPAGES[normalizeCourseName(courseName)] || null;
}

// 홈페이지 미큐레이션 시 폴백 — 네이버 '웹' 검색(★지도 아님. map.naver는 지도앱 설치를 띄운다). top 결과가 대개 구장 홈피.
export function courseSearchUrl(courseName) {
  return `https://search.naver.com/search.naver?query=${encodeURIComponent(`${courseName || ''} 예약`.trim())}`;
}
