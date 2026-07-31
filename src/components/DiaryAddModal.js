import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, Image } from 'react-native';
import AppTextInput from './common/AppTextInput';
import { KeyboardProvider, KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { loadFriendData, resolveGroupAudience, DEFAULT_FRIEND_GROUPS } from '../utils/friendGroups';
import { loadMyFriendsEnriched } from '../utils/friends';   // 동반자 친구 선택용([[companion-design]] Phase A)
import { getScheduleGroup } from '../utils/scheduleShares';  // 전파 단체 일정 → 멤버 전원 동반자 후보 해석
import { FriendSelectModal } from './FriendSelectModal';
import { Icon } from './common/Icon'; // 커스텀 SVG 아이콘
import { Spinner } from './common/Spinner';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SpinnerPicker } from './common/SpinnerPicker';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { isVideoOverLimit, VIDEO_MAX_MB } from '../utils/mediaLimits';
import { C, F, fs } from '../constants/colors';
import { COURSE_TAGS, COURSE_TAG_COLORS, COURSE_TAG_OPPOSITES, WEEKDAYS } from '../constants/data';
import { searchGolfCourses } from '../utils/golfCourses';
import { addUserCourse, findUserCourseById } from '../utils/userCourses';
import { getRecentCourses, addRecentCourse } from '../utils/recentCourses'; // 최근 검색한 골프장(일정 추가와 동일 UX)
import { getSubCoursesForCourse } from '../utils/golfCourses';   // 세부코스 칩 제안(시드된 구장)
import { SubCourseChips } from './common/SubCourseChips';
import { mS } from '../styles/mS';
import { UserContext } from '../contexts/UserContext';
import { SchedulesContext } from '../contexts/SchedulesContext';
import { persistPhotos, persistPhoto, resolvePhotoUri } from '../utils/photoStorage';
import { compressMedia } from '../utils/imageCompress';
import { useOverlayBackHandler } from '../utils/useOverlayBackHandler';
import { scoreBreakdown } from '../utils/scorecardOcr';
import { pickScorecardImages, extractScorecardAI } from '../utils/scorecardAI'; // OCR 대체 — Gemini 비전(태블릿 전후반 병합 + 카드, 최대 2장·단체는 나눠 담기)
import { ScorecardReviewModal } from './ScorecardReviewModal';
import { CalendarImportModal } from './CalendarImportModal'; // 폰 캘린더에서 지난 라운딩 가져오기(기록하기 — 과거)
import { ScorecardPreviewModal } from './ScorecardPreviewModal';   // 읽기 전 방향 확인·회전(AI 1회)
import { createScoreShare } from '../utils/roundScoreShares';   // 동반자 스코어 공유([[companion-design]] §11 Phase C)
import { normalizeScoreRow } from '../utils/scorecardOcr';   // 공유 전 총타 정규화(오버파 오독 방지)
import { getUid } from '../utils/firebase';
import { sameCourseName } from '../utils/courseNameKey';   // 구장명 비교 — 앱 전체가 쓰는 같은 기준(길이 추측 금지)
import { showAppAlert } from './AppAlert';   // 모달이 닫힌 뒤 알림용(스코어 공유 실패 등)
import { uploadRoundMedia, deleteRoundMediaFiles } from '../utils/roundMedia';   // 사진 미리 업로드(저장 즉시화)
import * as ImageManipulator from 'expo-image-manipulator';   // 스코어카드 사진 회전(옆으로 누운 카드 재인식)
import * as MediaLibrary from 'expo-media-library';   // 촬영한 스코어카드 원본을 갤러리에 보관
import { CropEditorModal } from './common/CropEditorModal';
import { PhotoEditModal } from './PhotoEditModal';
import { OverlayAlert } from './common/OverlayAlert';

// 비용 입력 — 결제 방식대로: 골프장 결제(카드, 그린피+카트비) / 캐디피(현금) / 기타(식사 등) / 내기(손익 ±, [[ledger-bet-pnl]]).
// 골프장 결제는 보통 한 줄, '세부'를 펼치면 그린피·카트비 따로. 사용자 2026-06-15 ([[golf-ledger]])
const costRowS = { flexDirection: 'row', alignItems: 'center', marginBottom: 10 };
// 라벨은 남는 폭을 차지(flex:1) — 입력칸을 고정폭으로 줄여 '골프장 결제' 등 라벨이 눌리지 않게 (사용자 2026-06-17).
const costLabelS = { fontFamily: F.sys, fontSize: fs(13), color: C.textSecondary, flex: 1, paddingRight: 8 };
// 금액 입력칸 — 고정폭. 백만원대(7자리)까지 우측정렬로 넉넉. 예전 flex:1은 라벨을 좁혀 답답했음.
const costInputS = {
  width: 120, backgroundColor: C.bgPrimary, borderWidth: 0.5, borderColor: C.hairline, borderRadius: 8,
  paddingHorizontal: 12, paddingVertical: 8, fontFamily: F.sys, fontSize: fs(13), color: C.textPrimary, textAlign: 'right',
};
const costWonS = { fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, marginLeft: 8 };
const costHintS = { fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 5, marginBottom: 13, marginLeft: 2 };

// 다이어리 사진·영상 첨부 한도 (저장 공간·로딩 성능·UX 균형)
const MAX_PHOTOS = 10;
const MAX_VIDEO_SEC = 30; // 동영상 최대 길이(초) — 과도한 업로드 용량 방지. Storage 규칙(영상 100MB)보다 앞단 차단.
const MAX_VIDEOS = 2;     // 다이어리당 영상 개수 — 전량 계정 백업([[diary-media-backup-plan]]) 도입에 따른 용량 통제(2026-07-04)

// '더 기록하기' 예시 칩 — 누르면 입력칸에 항목이 삽입돼 글쓰기 시작점이 된다
const GUIDE_CHIPS = ['어느 코스', 'MVP 샷', '아쉬웠던 홀', '코스·잔디 상태', '동반자 소감', '다음에 기억할 것'];

// 폼 섹션 헤더 — 위 구분선(hairline) + 버건디 바 + 제목으로 섹션을 시각적으로 분리. first=첫 섹션(상단 구분선 생략).
// 섹션을 하얀 카드로 감싼다(일정 시트와 동일 패턴, 사용자 2026-07-27: "여기는 필수, 이건 라운딩정보, 더남기기"가
//   한눈에 보이게). SectionHead는 그 카드 '안'의 헤더. 필수 = 버건디 막대 + '필수' 뱃지.
const cardBox = { backgroundColor: '#FFFFFF', borderRadius: 16,
  paddingHorizontal: 14, paddingTop: 15, paddingBottom: 16, marginTop: 14 };
function SectionHead({ title, sub, required }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 13 }}>
      <View style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: required ? C.burgundy : C.warmGrayLight }} />
      <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.charcoal, letterSpacing: 0.2 }}>{title}</Text>
      {required ? (
        <View style={{ backgroundColor: C.burgundy, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
          <Text style={{ fontFamily: F.sysB, fontSize: fs(9.5), color: C.butter, letterSpacing: 0.3 }}>필수</Text>
        </View>
      ) : null}
      {sub ? <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: C.warmGray, letterSpacing: 0 }}>{sub}</Text> : null}
    </View>
  );
}

// 같은 라운딩 찾기 — 같은 날 + 같은 구장 (+ 양쪽 다 티오프가 있으면 그 시각까지 같아야).
//   왜 필요한가: 친구가 보낸 스코어로 파생된 기록이 틀렸을 때 '제대로 다시 입력'하면 기록이 둘로 늘었다.
//   본인이 만든 기억이 없는 기록이라 왜 2개인지도 알기 어렵다(사용자 제보 2026-07-31).
//   ★티오프(time)는 선택 입력이라 비어 있는 기록이 많다 → 한쪽이라도 없으면 날짜·구장만으로 '후보'로만 본다.
//     같은 구장에서 하루 36홀(2라운드)을 도는 경우가 있어 이 판정만으로 덮어쓰면 안 된다 → 호출부는 반드시 확인창을 띄운다.
//   ★구장 비교는 sameCourseName(courseNameKey)로 — 앱 전체가 쓰는 기준과 같아야 하고,
//     길이 기반 '앞부분 같으면 같은 구장' 규칙은 금지다('세인트포'/'세인트포레스트'가 합쳐진 적 있음).
export function findSameRound(rounds, p) {
  if (!Array.isArray(rounds) || !p?.date) return null;
  return rounds.find(r => {
    if (!r?.id) return false;
    if ((r.kind || 'round') === 'moment') return false;        // 일상글은 대상 아님
    if (r.date !== p.date) return false;
    if (!!r.overseas !== !!p.overseas) return false;           // 국내/해외 도메인 분리
    // 구장 ID가 양쪽 다 있으면 그게 가장 확실. 하나라도 없으면(직접 입력·해외) 이름으로.
    const sameCourse = (r.courseId && p.courseId)
      ? r.courseId === p.courseId
      : sameCourseName(r.course, p.course);
    if (!sameCourse) return false;
    if (r.time && p.time) return r.time === p.time;            // 둘 다 있으면 시각까지 같아야 같은 라운딩
    return true;                                               // 한쪽이라도 없으면 후보 → 확인창에서 사용자가 판단
  }) || null;
}

export function DiaryAddModal({ visible, onClose, onSave, initial, isEdit, loadableRounds = [], existingRounds = [] }) {
  const insets = useSafeAreaInsets();
  const { userProfile } = React.useContext(UserContext);
  const { schedules } = React.useContext(SchedulesContext);
  // 라운지에서 확정된 라운딩에 연결된 기록은 날짜 변경 잠금 — 모집 확정 날짜는 동반자와 공유된
  // 데이터라 개인이 못 바꿈. 다른 필드(스코어·메모 등)는 자유 수정. ([[diary-schedule-orphan-fix]])
  const dateLocked = !!(isEdit && initial?.scheduleId
    && (schedules || []).find(s => s.id === initial.scheduleId)?.roundupId);
  const [courseSearch, setCourseSearch] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedCourseObj, setSelectedCourseObj] = useState(null); // USER_COURSES 항목
  const [recentCourses, setRecentCourses] = useState([]); // 최근 검색한 골프장(입력 전 3개 빠른 선택)
  const [kakaoResults, setKakaoResults] = useState([]);
  const [kakaoSearching, setKakaoSearching] = useState(false);
  const debounceRef = useRef(null);
  const detailMemoRef = useRef(null);
  const visibleRef = useRef(visible); visibleRef.current = visible; // 비동기(OCR 등) 완료 시 '아직 열려있나' 확인용
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [date, setDate] = useState(new Date());
  // '일정에서 불러오기'(신규 기록) — 미기록 라운딩을 골라 골프장·날짜·동반자 채움. scheduleId는 저장 시 1:1 연결에 씀.
  //   전엔 진입 시점(선택 시트)에만 있고 폼 안엔 없어서 '그냥 기록하기'로 들어오면 불러올 방법이 없었다(사용자 2026-07-27).
  const [loadPickerOpen, setLoadPickerOpen] = useState(false);
  const [calImportOpen, setCalImportOpen] = useState(false);   // 폰 캘린더(지난 라운딩) 가져오기
  const [pickedScheduleId, setPickedScheduleId] = useState(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [teeTime, setTeeTime] = useState(''); // 티오프 시간('HH:MM') — 선택. 일정 자동채움(단체 제외)/직접 입력, 비우면 저장·표시 안 함

  // 안드로이드 뒤로가기 — 날짜/시간 picker 열려있으면 그것부터 닫기
  useOverlayBackHandler(showDatePicker, () => setShowDatePicker(false));
  useOverlayBackHandler(showTimePicker, () => setShowTimePicker(false));
  const [score, setScore] = useState('');
  // 스코어카드 AI(Gemini 비전) — holeScores(확정된 18홀), 검토 모달 상태. 사진 1~2장(전/후반)에서 par·score 추출.
  const [holeScores, setHoleScores] = useState(null);
  const [holePars, setHolePars] = useState(null); // 스코어카드 par 행(스텁 mock) — 버디 자동집계용
  const [scRows, setScRows] = useState([]);
  // OCR 원본 행(공유용 보존) — '수정' 버튼이 scRows를 1행 '입력값'으로 교체해도 동반자 공유는 원본 카드로.
  //   scRows만 쓰면 수정 순간 공유 체크박스가 사라지고 저장 시 공유가 무음 생략되던 버그(2026-07-10 실사용 제보).
  const [shareRows, setShareRows] = useState([]);
  const [scFailed, setScFailed] = useState(false); // OCR 인식 실패/숫자 부족 → 직접 입력 안내
  // 실패 사유 — 서버가 이유를 말해주는 경우(AI 사용량 초과 등)가 있는데 그동안 버려서
  //   전부 '사진을 못 읽었다'로만 보였다. 사진 문제가 아니라 잠시 후 되는 상황이면 그걸 알려야 한다.
  const [scFailReason, setScFailReason] = useState('');
  const [scLowConf, setScLowConf] = useState(false); // OCR 저신뢰(인쇄 합계와 안 맞음) → 확인·수정 강조
  const [scNotes, setScNotes] = useState([]);        // 저신뢰 사유(order=전/후반 순서 미확정, par/total/half) — 안내 문구 분기
  const [scReview, setScReview] = useState(false);
  const [scBusy, setScBusy] = useState(false);
  const [scPreviewUris, setScPreviewUris] = useState(null); // 읽기 전 방향 확인 대상 사진(있으면 미리보기 모달)
  const [scRotating, setScRotating] = useState(false); // 스코어카드 사진 회전 후 재인식 중
  const scOrigUrisRef = useRef([]);                    // 마지막 인식에 쓴 원본 사진 uri(회전 재시도용)
  const scRotationRef = useRef(0);                      // 누적 회전각(원본 기준 0/90/180/270)
  const [showCost, setShowCost] = useState(false);
  const [showCourseDetail, setShowCourseDetail] = useState(false); // 골프장 결제 그린피·카트비 세부 펼침
  const [costs, setCosts] = useState({ field: '', green: '', cart: '', onsite: '', caddie: '', etc: '', bet: '' });
  const [betWon, setBetWon] = useState(false); // 내기 방향 — false=잃었어요(+지출) / true=땄어요(−차감) ([[ledger-bet-pnl]])
  const [weather, setWeather] = useState('맑음');
  const [memo, setMemo] = useState('');
  const [birdieCount, setBirdieCount] = useState(0);
  const [privacy, setPrivacy] = useState(['friends']); // 배열: ['friends'](전체) | ['private'](나만) | [그룹id…](복수 그룹 공개) ([[friend_groups]])
  const [friendData, setFriendData] = useState({ friendGroups: DEFAULT_FRIEND_GROUPS, friendMeta: {} });
  const [starRating, setStarRating] = useState(0);
  const [selectedTags, setSelectedTags] = useState([]);
  const [detailMemo, setDetailMemo] = useState('');
  const [detailSel, setDetailSel] = useState(undefined);
  const [overseas, setOverseas] = useState(false); // 국내/해외 라운딩
  const [country, setCountry] = useState('');      // 해외일 때 국가·지역
  // 상위 분기 — 'round'(라운딩 기록) | 'moment'(일상). 일상은 글/사진만, 통계·캘린더서 격리([[moment-feed-extension]])
  const [kind, setKind] = useState('round');

  // 코스 관리(관리 최상/보통/아쉬움)는 등급이라 카테고리 내 단일 선택 — 하나 누르면 같은 그룹 나머지는 해제.
  // 그 외 카테고리는 독립 속성이라 다중 선택 유지.
  const SINGLE_SELECT_TAG_CATEGORIES = ['코스 관리'];
  const toggleTag = (tag, category) => {
    setSelectedTags(prev => {
      const has = prev.includes(tag);
      if (SINGLE_SELECT_TAG_CATEGORIES.includes(category)) {
        const group = COURSE_TAGS[category] || [];
        const rest = prev.filter(t => !group.includes(t)); // 같은 그룹 기존 선택 제거
        return has ? rest : [...rest, tag];               // 누른 게 켜져 있었으면 해제, 아니면 그룹 내 단일 선택
      }
      if (has) return prev.filter(t => t !== tag);
      // 선택 시 모순 태그(그린 빠름/보통/느림 등)는 자동 해제 — 다른 속성과는 공존. 값은 배열.
      const opp = COURSE_TAG_OPPOSITES[tag];
      const base = opp ? prev.filter(t => !opp.includes(t)) : prev;
      return [...base, tag];
    });
  };
  // 예시 칩 탭 → '더 기록하기' 입력칸에 '라벨: ' 삽입 + 포커스
  const insertGuideChip = (label) => {
    let endPos;
    setDetailMemo(prev => {
      const sep = prev && !prev.endsWith('\n') ? '\n' : '';
      const next = `${prev}${sep}${label}: `;
      if (next.length > 1000) return prev;
      endPos = next.length;
      return next;
    });
    if (endPos != null) {
      setTimeout(() => {
        setDetailSel({ start: endPos, end: endPos });
        detailMemoRef.current?.focus();
      }, 50);
    }
  };
  const [special, setSpecial] = useState(null);
  const [specialHole, setSpecialHole] = useState('');
  const [specialPar, setSpecialPar] = useState('3');
  const [specialDist, setSpecialDist] = useState('');
  const [specialBall, setSpecialBall] = useState('');
  const [specialMemo, setSpecialMemo] = useState('');
  const [addPhotos, setAddPhotos] = useState([]);
  const [photoBusy, setPhotoBusy] = useState(false); // 사진 추가(압축·영속) 처리 중 — 끝나기 전 저장 시 사진 누락되던 경합 방지

  // ── 사진 미리 업로드 — 친구 공개+사진 저장 즉시화 ────────────────────────────────
  //   사진을 고르는 즉시 백그라운드로 Storage 업로드(저장 때와 같은 uploadRoundMedia). 저장 시 그 결과(https)로
  //   치환하면 createRound의 업로드가 https라 건너뛰어 저장이 즉시 끝난다. ★저장 데이터는 기존과 동일 —
  //   같은 uploadRoundMedia를 쓰고 결과만 앞당겨 재사용하므로 타이밍만 달라지고 결과물은 바이트 동일.
  //   맵: 로컬 uri(key) → Promise<업로드된 항목|null>. 동영상은 제외(저장 시 스트리밍·poster 처리). 크롭/편집으로
  //   uri가 바뀐 사진은 맵에 없어 저장 때 그 한 장만 업로드된다(폴백). 실패분도 로컬 유지→createRound가 올림.
  const preUpRef = useRef(new Map());
  const mediaKey = (item) => (item && typeof item === 'object' ? item.uri : item) || '';
  const preUploadMedia = (items) => {
    for (const item of (Array.isArray(items) ? items : [items])) {
      if (item && typeof item === 'object' && item.type === 'video') continue; // 동영상 제외
      const key = mediaKey(item);
      if (!key || /^https?:\/\//.test(key) || preUpRef.current.has(key)) continue;
      preUpRef.current.set(key, (async () => {
        try {
          const uid = await getUid();
          if (!uid) return null;
          const [res] = await uploadRoundMedia(uid, [item]);
          return res || null;
        } catch { return null; }
      })());
    }
  };
  // 저장에 안 쓰인(삭제·재크롭·취소된) 미리 업로드분을 Storage에서 정리. keepKeys에 든 것만 남긴다.
  const cleanupPreUploads = (keepKeys = []) => {
    const keep = new Set(keepKeys);
    for (const [k, promise] of preUpRef.current) {
      if (keep.has(k)) continue;
      promise.then(u => u && deleteRoundMediaFiles([u])).catch(() => {});
      preUpRef.current.delete(k);
    }
  };
  // 저장 시 addPhotos를 '가능한 https'로 치환 + 최종 목록 밖 고아 정리. 미완/실패분은 로컬 유지(createRound가 업로드).
  const resolveFinalPhotos = async () => {
    if (!addPhotos.length) return addPhotos;
    const out = await Promise.all(addPhotos.map(async (item) => {
      const p = preUpRef.current.get(mediaKey(item));
      if (!p) return item;
      const up = await p;
      if (!up) return item;
      // focus(대표사진 초점) 등 현재 아이템 메타 보존 — 업로드 결과엔 orig가 없으니 focus만 이어붙임
      return (item && typeof item === 'object' && item.focus != null && up && typeof up === 'object')
        ? { ...up, focus: item.focus } : up;
    }));
    cleanupPreUploads(addPhotos.map(mediaKey));
    return out;
  };
  const [cropIdx, setCropIdx] = useState(null); // 자르기(크롭) 대상 사진 인덱스
  const [editorIndex, setEditorIndex] = useState(null); // 회전 편집 대상 사진 인덱스 (PhotoEditModal)
  // 인-모달 알럿/메뉴 — 글로벌 showAppAlert는 Modal 위 Modal 터치 충돌로 안 먹혀, 오버레이 View(OverlayAlert) 사용.
  const [overlay, setOverlay] = useState(null);
  // 사진 탭 → 편집 메뉴(대표지정·회전·자르기·삭제). 상세의 '편집' 모드를 수정/추가 한 곳으로 통합.
  const handleThumbMenu = (i) => {
    const it = addPhotos[i];
    const isVideo = typeof it === 'object' && it?.type === 'video';
    setOverlay({ title: '사진 편집', buttons: [
      ...(i === 0 ? [] : [{ text: '대표사진으로 지정', onPress: () => setAddPhotos(prev => {
        const n = [...prev]; const [p] = n.splice(i, 1); n.unshift(p); return n;
      }) }]),
      // 순서 바꾸기 — 앞/뒤로 한 칸씩 이동(드래그 라이브러리 없이). 첫 장이 대표사진.
      ...(i === 0 ? [] : [{ text: '⬅ 앞으로 이동', onPress: () => setAddPhotos(prev => {
        const n = [...prev]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n;
      }) }]),
      ...(i >= addPhotos.length - 1 ? [] : [{ text: '➡ 뒤로 이동', onPress: () => setAddPhotos(prev => {
        const n = [...prev]; [n[i], n[i + 1]] = [n[i + 1], n[i]]; return n;
      }) }]),
      // 영상은 회전·자르기 제외(첫프레임 포스터 기반)
      ...(isVideo ? [] : [
        { text: '회전', onPress: () => setEditorIndex(i) },
        { text: '자르기', onPress: () => setCropIdx(i) },
      ]),
      { text: '삭제', style: 'destructive', onPress: () => setAddPhotos(prev => prev.filter((_, idx) => idx !== i)) },
      { text: '취소', style: 'cancel' },
    ] });
  };
  const [companions, setCompanions] = useState([]); // [{ name, friendUid? }] — 친구 선택 시 friendUid 보존([[companion-design]] Phase A)
  const [teamRoster, setTeamRoster] = useState([]); // 단체(한 조 4명 초과) 일정의 참여자 전체 — 본인 조 3명을 직접 고르게(앞 3명 자동 X)
  const [subCourse, setSubCourse] = useState(''); // 코스(세부코스 라벨) — 구장 매칭과 무관·자유 입력. 연결된 일정에서 자동채움 ([[schedule-booker]])
  const [subCourseOpts, setSubCourseOpts] = useState([]); // 선택 구장의 세부코스 칩 제안(시드된 구장만, 없으면 자유입력)
  // 선택 구장 바뀌면 세부코스 칩 제안 로드 — 시드된 구장만 채워짐(없으면 []=칩 미표시, 자유입력 유지)
  useEffect(() => {
    const kid = selectedCourseObj?.kakaoId;
    if (!kid) { setSubCourseOpts([]); return; }
    let alive = true;
    getSubCoursesForCourse(kid).then(o => { if (alive) setSubCourseOpts(o); }).catch(() => {});
    return () => { alive = false; };
  }, [selectedCourseObj?.kakaoId]);
  const [companionInput, setCompanionInput] = useState('');
  const [friends, setFriends] = useState([]);                 // 동반자 친구 선택 목록
  const [shareScores, setShareScores] = useState(false);      // 동반자에게 스코어 공유(OCR 전체 행) opt-in ([[companion-design]] §11)
  const [showCompanionPicker, setShowCompanionPicker] = useState(false);

  const pickPhoto = async () => {
    const remaining = MAX_PHOTOS - addPhotos.length;
    if (remaining <= 0) return;
    setPhotoBusy(true); // 처리 끝날 때까지 저장 비활성 — 경합으로 사진 누락 방지
    try {
      // 사진첩 접근 권한 — 요청 결과까지 확인. 영구거부 상태로 launch를 강행하면 iOS·구안드에서
      //   빈 피커가 떴다 닫혀 '선택해도 안 됨'(조용한 실패)이 됐다 — 크루글 영상 경로와 동일 패턴으로 안내 후 중단.
      let perm = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) {
        perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      }
      if (!perm.granted) {
        setOverlay({ title: '사진 접근 권한이 필요해요', message: '설정 > 권한에서 사진·동영상 접근을 허용해주세요.' });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        quality: 0.8,
        videoMaxDuration: MAX_VIDEO_SEC, // iOS는 선택 단계에서 제한 (안드는 아래 duration 재검증)
        // iOS 영상 export 720p — AVFoundation이 faststart(moov 앞으로)로 내보내 재생이 즉시 시작되고 용량도 크게↓.
        //   ★iOS 전용 효과(안드는 picker가 변환 안 해 무시) → 안드 faststart는 업로드 Cloud Function 리먹스로 다음 빌드 처리. [[video-playback-faststart]]
        videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
      });
      if (!result.canceled) {
      // 길이 초과 영상 제외 — duration은 ms. 안드는 videoMaxDuration이 안 먹을 수 있어 여기서 한 번 더 거른다.
      const overLimit = result.assets.filter(a => a.type === 'video' && a.duration && a.duration > MAX_VIDEO_SEC * 1000 + 500);
      let assets = result.assets.filter(a => !(a.type === 'video' && a.duration && a.duration > MAX_VIDEO_SEC * 1000 + 500));
      if (overLimit.length) {
        setOverlay({ title: '동영상이 너무 길어요', message: `동영상은 최대 ${MAX_VIDEO_SEC}초까지 올릴 수 있어요.\n길이를 넘는 ${overLimit.length}개는 제외했어요.` });
      }
      // 용량 초과 영상 제외 — 안드는 원본 그대로라 큰 영상이 업로드 규칙(100MB)서 거절·크래시됨. 선택 단계에서 미리 거른다([[video-upload-oom]]).
      const sizeChecked = await Promise.all(assets.map(async (a) => ({
        a, over: a.type === 'video' ? (await isVideoOverLimit(a.uri, VIDEO_MAX_MB.rounds, a.fileSize)).over : false,
      })));
      const oversize = sizeChecked.filter((s) => s.over);
      assets = sizeChecked.filter((s) => !s.over).map((s) => s.a);
      if (oversize.length) {
        setOverlay({ title: '동영상 용량이 너무 커요', message: `동영상은 최대 ${VIDEO_MAX_MB.rounds}MB까지 올릴 수 있어요.\n용량을 넘는 ${oversize.length}개는 제외했어요.` });
      }
      // 영상 개수 제한(MAX_VIDEOS) — 기존 첨부 영상 + 이번 선택 영상 합산. 초과분은 제외하고 이유를 안내(어리둥절 방지).
      const videosNow = addPhotos.filter(p => p && typeof p === 'object' && p.type === 'video').length;
      let videoRoom = Math.max(0, MAX_VIDEOS - videosNow);
      const videoDropped = [];
      assets = assets.filter(a => {
        if (a.type !== 'video') return true;
        if (videoRoom > 0) { videoRoom--; return true; }
        videoDropped.push(a); return false;
      });
      if (videoDropped.length) {
        setOverlay({ title: '동영상은 2개까지 올릴 수 있어요', message: `기록 하나에 동영상은 최대 ${MAX_VIDEOS}개까지 담을 수 있어요.\n개수를 넘는 동영상 ${videoDropped.length}개는 제외했어요. (사진은 계속 추가 가능)` });
      }
      if (assets.length === 0) return;
      const rawItems = assets.map(a =>
        a.type === 'video' ? { uri: a.uri, type: 'video' } : a.uri
      );
      // 영상은 첫 프레임 poster를 로컬에 미리 만들어 붙인다 — MY/나만보기 피드가 매번 기기 추출하지 않도록
      //   ([[video-poster-thumbnail]]). 친구공개 업로드 시엔 roundMedia가 Storage poster URL로 덮어씀.
      const posterItems = await Promise.all(rawItems.map(async (it) => {
        if (!(it && typeof it === 'object' && it.type === 'video')) return it;
        try {
          const { uri: thumb } = await VideoThumbnails.getThumbnailAsync(it.uri, { time: 0, quality: 0.6 });
          const poster = await persistPhoto(thumb); // dgphoto: 로 영속
          return { ...it, poster };
        } catch (e) {
          if (__DEV__) console.warn('[DiaryAddModal] poster gen failed', e?.message);
          return it; // 실패해도 영상은 유지 — 기존 기기 생성 폴백
        }
      }));
      // 1) 압축·리사이즈 (1200px·80% JPEG, EXIF GPS 자동 제거)
      // 2) 영구 폴더로 복사 — 앱 업데이트 후에도 사진이 유지되도록
      const compressed = await compressMedia(posterItems);
      const items = await persistPhotos(compressed);
      setAddPhotos(prev => [...prev, ...items].slice(0, MAX_PHOTOS));
      preUploadMedia(items); // 고르는 즉시 백그라운드 업로드 시작 → 저장을 즉시 끝나게(친구 공개 사진)
      // 영구 저장 실패로 드롭된 사진이 있으면 안내 — iCloud 원본 미다운로드가 흔한 원인(조용한 데이터 손실 방지)
      if (items.length < compressed.length) {
        setOverlay({ title: '일부 사진을 저장하지 못했어요', message: 'iCloud 사진은 기기에 원본이 없을 수 있어요.\n설정 ▸ 사진 ▸ "원본 다운로드 및 보관" 후 다시 시도하거나 다른 사진을 선택해주세요.' });
      }
      }
    } catch (e) {
      if (__DEV__) console.warn('[DiaryAddModal] pickPhoto failed', e?.message);
      setOverlay({ title: '사진을 불러오지 못했어요', message: '사진 접근 권한을 허용했는지 확인하거나\n잠시 후 다시 시도해주세요.' });
    } finally {
      setPhotoBusy(false);
    }
  };

  // 스코어카드 사진(1~2장) → AI 인식(Gemini 비전) → 검토 모달. 갤러리/촬영 공용 마무리.
  //   opts.fromRotate=회전 재시도 호출(원본·회전각 유지). 신규 인식이면 원본 uri 저장 + 회전각 리셋.
  const runScorecardExtract = async (uris, opts = {}) => {
    if (!uris?.length || !visibleRef.current) { setScBusy(false); return; }
    if (!opts.fromRotate) { scOrigUrisRef.current = uris; scRotationRef.current = 0; } // 회전 재시도의 기준 원본
    setScFailReason('');   // 새 시도 — 지난 실패 사유가 남아 보이지 않게
    setScBusy(true);
    try {
      const res = await extractScorecardAI(uris);
      // ★인식 중(수 초) 기록 모달을 닫았으면 결과 폐기 — 닫힌 모달에 scReview=true가 남으면 다음 오픈 시 모달 스택 꼬임.
      if (!visibleRef.current) return;
      if (res.error || !Array.isArray(res.rows) || !res.rows.length) {
        // 인식 실패 → 빈 표 직접 입력 안내. 서버가 준 사유(사용량 초과 등)는 그대로 전달해 보여준다.
        setScRows([]); setShareRows([]); setHolePars(null);
        setScFailReason(res.error || ''); setScFailed(true); setScLowConf(false); setScReview(true);
        return;
      }
      // 플레이어(행) 전부 → 검토 모달. 여러 명이면 모달이 '본인 행 선택'부터 띄움.
      setScRows(res.rows);
      // ★공유용은 정규화 — AI가 오버파(예:19)를 total로 오독해도 홀 합(실타수)으로 총타를 맞춘다.
      //   리뷰 모달이 보여주는 총타와 동반자에게 전달되는 총타를 일치시킴([[project_scorecard_ai]]).
      const normRows = res.rows.map(r => normalizeScoreRow(r, res.holePars || null));
      setShareRows(normRows);
      // ★동반자를 먼저 넣고 사진을 나중에 읽는 순서에서도 자동으로 켜지게 — 친구가 이미 들어 있고
      //   여러 명이 인식됐다면 공유가 기본이다(고르는 순서에 따라 결과가 달라지면 안 된다).
      if (normRows.length >= 2 && companions.some(c => c.friendUid)) setShareScores(true);
      setHolePars(res.holePars || null);       // par(있으면) — 버디 자동집계
      setScFailed(false); setScFailReason('');
      // ★CF 산술 검산 결과 반영 — 전/후반 순서를 소계로 못 가렸거나 홀 누락·합계 불일치면 저신뢰.
      //   전에는 무조건 false라 '틀렸는데 맞은 척' 보였다(2026-07-31).
      setScLowConf(!!res.lowConfidence);
      setScNotes(res.notes || []);
      setScReview(true);
    } catch (e) {
      if (__DEV__) console.warn('[DiaryAdd] scorecard AI fail', e?.message);
    } finally {
      setScBusy(false);
    }
  };

  // 사진이 옆으로 누워(90°) AI가 못 읽는 태블릿 카드용 — 원본을 90°씩 돌려 다시 인식(방향은 사용자가 눈으로 맞춤).
  //   원본에서 누적각으로 회전(반복해도 화질 저하 없음). AI 호출 1회만 늘어 비용·속도 부담 적음.
  const handleRotateScorecard = async () => {
    const origs = scOrigUrisRef.current;
    if (!origs?.length || scRotating) return;
    setScRotating(true);
    scRotationRef.current = (scRotationRef.current + 90) % 360;
    try {
      const rotated = await Promise.all(origs.map(async (u) => {
        try {
          const r = await ImageManipulator.manipulateAsync(u, [{ rotate: scRotationRef.current }],
            { compress: 1, format: ImageManipulator.SaveFormat.JPEG });
          return r.uri;
        } catch { return u; } // 회전 실패한 장은 원본 그대로 시도
      }));
      await runScorecardExtract(rotated, { fromRotate: true });
    } finally {
      setScRotating(false);
    }
  };
  // 촬영한 스코어카드 원본을 갤러리에 보관 — best-effort(fire-and-forget). 반사·그림자로 인식 실패해도 원본은 남게.
  //   갤러리에서 고른 사진은 이미 갤러리에 있으니 대상 아님(카메라 촬영분만). 권한 없으면 조용히 스킵.
  const saveScorecardShots = async (uris) => {
    if (!Array.isArray(uris) || !uris.length) return;
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) return;
      for (const u of uris) { try { await MediaLibrary.saveToLibraryAsync(u); } catch {} }
    } catch (e) { if (__DEV__) console.warn('[scorecard] gallery save', e?.message); }
  };
  // source: 'gallery'(최대 2장 전/후반 한 번에) | 'camera'(카메라는 1회=1장 → 태블릿 전/후반을 위해 '후반도 촬영' 물어봄, 사용자 2026-07-23)
  const handleScorecardPick = async (source) => {
    if (scBusy) return;
    setScBusy(true);
    let picked;
    try { picked = await pickScorecardImages(source); }
    catch (e) { if (__DEV__) console.warn('[DiaryAdd] scorecard pick', e?.message); setScBusy(false); return; }
    if (picked?.denied) { setOverlay({ title: '접근 권한이 필요해요', message: '설정에서 사진/카메라 접근을 허용한 뒤 다시 시도해 주세요.' }); setScBusy(false); return; }
    if (!picked?.uris?.length || !visibleRef.current) { setScBusy(false); return; } // 취소·닫힘
    // 실물 촬영 — 태블릿은 전반·후반이 따로 나와 2장 필요. 1장 찍은 뒤 '후반도 촬영'을 물어 최대 2장까지 모은다.
    if (source === 'camera') {
      saveScorecardShots(picked.uris); // 찍은 원본을 갤러리에 보관(반사로 인식 실패해도 원본 안 잃게)
      setScBusy(false); // 결정(오버레이) 동안은 스피너 숨김 — 오버레이가 재탭을 막음
      setOverlay({
        title: '후반 카드도 찍을까요?',
        message: '스마트스코어 태블릿은 전반·후반이 따로 나와요. 후반(뒤 9홀) 카드가 있으면 한 장 더 찍고, 없으면 이대로 인식할게요.\n(찍은 사진은 갤러리에 저장돼요)',
        buttons: [
          { text: '후반도 촬영', onPress: async () => {
            const second = await pickScorecardImages('camera').catch(() => null);
            if (second?.uris?.length) saveScorecardShots(second.uris);
            setScPreviewUris(second?.uris?.length ? [...picked.uris, ...second.uris] : picked.uris); // 읽기 전 방향 확인
          } },
          { text: '이대로 인식', onPress: () => setScPreviewUris(picked.uris) },
          { text: '취소', style: 'cancel' },
        ],
      });
      return;
    }
    // 갤러리 — 최대 2장 한 번에 → 읽기 전 방향 확인 모달
    setScBusy(false);
    setScPreviewUris(picked.uris);
  };

  // 검토 모달 확정 — 18홀 저장 + 총타를 스코어 입력란에 자동 채움
  const handleScorecardConfirm = ({ holeScores: hs, total, holePars: fixedPars }) => {
    setHoleScores(hs);
    if (Number.isFinite(total) && total > 0) setScore(String(total));
    // 검토 화면에서 파를 고쳤으면 그 값을 쓴다(잘못 읽은 파로 버디를 세지 않게)
    const parsNow = Array.isArray(fixedPars) ? fixedPars : holePars;
    if (Array.isArray(fixedPars)) setHolePars(fixedPars);
    // par(스텁 mock)가 있으면 버디 자동 집계 → 버디 카운터 자동 입력 (이후 수동 수정 가능)
    const bd = scoreBreakdown(hs, parsNow);
    if (bd) setBirdieCount(bd.birdie);
    setScReview(false);
  };

  // 동반자 추가 — 공백·쉼표로 여러 명 한 번에 입력 가능 (최대 3명). 자유 입력은 {name}만(친구 아님)
  const handleAddCompanions = () => {
    if (companions.length >= 3) return;
    const names = companionInput.trim().split(/[\s,]+/).filter(Boolean);
    if (!names.length) return;
    setCompanions(prev => [...prev, ...names.map(name => ({ name }))].slice(0, 3));
    setCompanionInput('');
  };
  // 친구에서 선택 — friendUid 보존. 자유 입력 중 같은 이름은 친구로 대체(중복 방지), 최대 3명 ([[companion-design]] Phase A)
  const onPickCompanionFriends = ({ selectedUids }) => {
    const fromFriends = (selectedUids || []).map(uid => {
      const fr = friends.find(f => f.id === uid);
      return { name: fr?.name || '친구', friendUid: uid };
    });
    const pickedNames = new Set(fromFriends.map(c => c.name));
    const freeText = companions.filter(c => !c.friendUid && !pickedNames.has(c.name));
    setCompanions([...fromFriends, ...freeText].slice(0, 3));
    // ★친구를 고르면 스코어 공유도 자동으로 켠다 — '친구 선택'과 '공유 체크'를 따로 하는 건 이중 작업이고,
    //   친구만 고르고 체크를 안 해서 아무것도 안 보내진 채 끝나는 일이 실제로 있었다(사용자 제보 2026-07-31).
    //   여러 명이 인식된 카드가 있을 때만 의미가 있으므로 그때만. 켠 뒤 사용자가 다시 끄는 건 그대로 존중된다.
    if (fromFriends.length && Array.isArray(shareRows) && shareRows.length >= 2) setShareScores(true);
  };

  // 단체 참여자 목록에서 본인 조 동반자 선택(토글) — friendUid 있으면 그걸로, 없으면 이름으로 동일판정. 최대 3명.
  const sameComp = (a, b) => (a.friendUid && b.friendUid) ? a.friendUid === b.friendUid : a.name === b.name;
  const toggleRosterComp = (p) => {
    // 친구를 '새로 넣는' 순간이면 스코어 공유도 자동으로 켠다(onPickCompanionFriends와 같은 이유).
    const already = companions.some(c => sameComp(c, p));
    if (!already && p.friendUid && companions.length < 3 && Array.isArray(shareRows) && shareRows.length >= 2) {
      setShareScores(true);
    }
    setCompanions(prev => {
      const i = prev.findIndex(c => sameComp(c, p));
      if (i >= 0) return prev.filter((_, idx) => idx !== i);   // 이미 선택 → 빼기
      if (prev.length >= 3) return prev;                        // 캡(나 포함 4명)
      return [...prev, p.friendUid ? { name: p.name, friendUid: p.friendUid } : { name: p.name }];
    });
  };

  const DAYS = WEEKDAYS;
  const formatDate = (d) => `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
  const formatDay = (d) => DAYS[d.getDay()];

  // 카카오 API debounce 검색
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (overseas || !courseSearch || courseSearch === selectedCourse) {
      setKakaoResults([]);
      setKakaoSearching(false);
      return;
    }
    setKakaoSearching(true);
    debounceRef.current = setTimeout(async () => {
      const results = await searchGolfCourses(courseSearch);
      setKakaoResults(results);
      setKakaoSearching(false);
    }, 300);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [courseSearch, selectedCourse, overseas]);

  const handleSelectKakaoResult = async (r) => {
    const saved = await addUserCourse({ name: r.name, loc: r.loc, x: r.x, y: r.y, kakaoId: r.kakaoId });
    setSelectedCourseObj(saved);
    setSelectedCourse(saved.name);
    setCourseSearch(saved.name);
    setKakaoResults([]);
    addRecentCourse({ name: r.name, loc: r.loc, x: r.x, y: r.y, kakaoId: r.kakaoId }).then(list => setRecentCourses(list || []));
  };

  // 최근 검색한 골프장 탭 → 바로 자동 입력(일정 추가와 동일)
  const handleSelectRecent = async (rc) => {
    const saved = await addUserCourse({ name: rc.name, loc: rc.loc, x: rc.x, y: rc.y, kakaoId: rc.kakaoId });
    setSelectedCourseObj(saved);
    setSelectedCourse(saved.name);
    setCourseSearch(saved.name);
    setKakaoResults([]);
    addRecentCourse(rc).then(list => setRecentCourses(list || []));
  };

  const handleSelectManual = async () => {
    const name = courseSearch.trim();
    if (!name) return;
    const saved = await addUserCourse({ name, loc: '', x: null, y: null, kakaoId: null });
    setSelectedCourseObj(saved);
    setSelectedCourse(saved.name);
    setKakaoResults([]);
  };

  const reset = () => {
    setCourseSearch(''); setSelectedCourse(''); setSelectedCourseObj(null); setKakaoResults([]);
    setDate(new Date()); setTeeTime(''); setShowTimePicker(false);
    setScore(''); setWeather('맑음'); setMemo(''); setBirdieCount(0);
    setSpecial(null); setSpecialHole(''); setSpecialPar('3');
    setSpecialDist(''); setSpecialBall(''); setSpecialMemo('');
    setHoleScores(null); setHolePars(null); setScRows([]); setShareRows([]); setScReview(false); setScFailed(false); setScFailReason(''); setScLowConf(false);
    setShowCost(false); setShowCourseDetail(false); setCosts({ field: '', green: '', cart: '', onsite: '', caddie: '', etc: '', bet: '' }); setBetWon(false);
    setAddPhotos([]);
    setStarRating(0); setSelectedTags([]);
    setDetailMemo(''); setDetailSel(undefined);
    setPrivacy(['friends']);
    setCompanions([]); setCompanionInput(''); setShareScores(false); setTeamRoster([]);
    setSubCourse('');
    setOverseas(false); setCountry('');
    setKind('round');
  };

  // 폼 안에서 미기록 라운딩을 골라 적용 — pickRoundToRecord seed와 같은 필드(골프장·날짜·동반자·세부코스·티오프·scheduleId).
  const applySchedule = (s) => {
    const dParts = String(s.date || '').split('.').map(Number);
    if (dParts.length === 3 && dParts.every(Number.isFinite)) setDate(new Date(dParts[0], dParts[1] - 1, dParts[2]));
    setOverseas(!!s.overseas);
    if (s.course) { setCourseSearch(s.course); setSelectedCourse(s.course); }
    const cid = s.courseLogId || s.courseId || null;
    if (cid) findUserCourseById(cid).then(c => { if (c) setSelectedCourseObj(c); }).catch(() => {});
    else setSelectedCourseObj(null);
    setCompanions(
      (Array.isArray(s.companions) ? s.companions : [])
        .filter(c => !(typeof c === 'object' && c.isMe))
        .map(c => (typeof c === 'string' ? { name: c } : { name: c.name, ...(c.friendUid ? { friendUid: c.friendUid } : {}) }))
        .filter(c => c.name)
    );
    setSubCourse(s.subCourse || '');
    // 티오프 — 단체 모집(teams>1)은 조별로 달라 빈칸(pickRoundToRecord와 동일 규칙)
    setTeeTime((s.roundupId && (s.teams || 1) > 1) ? '' : (s.time || ''));
    setPickedScheduleId(s.id || null);
    setLoadPickerOpen(false);
  };

  // 폰 캘린더 이벤트(지난 라운딩)를 폼에 적용 — 앱 일정이 아니라 scheduleId 연결은 없다(구장은 텍스트만 채우고 확정은 사용자).
  const applyCalendarEvent = (ev) => {
    if (!ev) return;
    if (ev.start instanceof Date && !isNaN(ev.start.getTime())) {
      setDate(new Date(ev.start.getFullYear(), ev.start.getMonth(), ev.start.getDate()));
      if (!ev.allDay) setTeeTime(`${String(ev.start.getHours()).padStart(2, '0')}:${String(ev.start.getMinutes()).padStart(2, '0')}`);
    }
    const name = ev.course?.name || ev.title || ev.location || '';
    if (name) { setCourseSearch(name); setSelectedCourse(name); }
    setSelectedCourseObj(null);   // 구장은 검색 결과에서 확정하게(지역·100대 정확도) — ScheduleModal과 동일 방침
    setOverseas(false);
    setPickedScheduleId(null);    // 캘린더 이벤트는 디어골프 예정 일정이 아니라 1:1 연결 없음
    setCalImportOpen(false);
    setLoadPickerOpen(false);
  };

  useEffect(() => {
    if (!visible) return;
    setPickedScheduleId(null);   // 매 오픈 초기화 — 이전 선택이 다른 기록 저장에 새지 않게(수정 진입 포함)
    let cancelled = false;   // 비동기 resolve가 닫힌/재오픈된 폼을 덮어쓰지 않게 가드(2026-06-26 감사)
    loadFriendData().then(d => { if (!cancelled) setFriendData(d); }).catch(() => {}); // 공개범위 그룹 선택·해석용 ([[friend_groups]])
    loadMyFriendsEnriched().then(f => { if (!cancelled) setFriends(f || []); }).catch(() => {}); // 동반자 친구 선택용([[companion-design]] Phase A)
    getRecentCourses().then(r => { if (!cancelled) setRecentCourses(r || []); }).catch(() => {}); // 입력 전 최근 검색 구장 3개
    if (isEdit && initial) {
      setCourseSearch(initial.course || '');
      setSelectedCourse(initial.course || '');
      if (initial.courseId) {
        findUserCourseById(initial.courseId).then(c => { if (!cancelled && c) setSelectedCourseObj(c); });
      }
      const dParts = (initial.date || '').split('.').map(Number);
      if (dParts.length === 3 && dParts.every(Number.isFinite)) {
        setDate(new Date(dParts[0], dParts[1] - 1, dParts[2]));
      }
      setScore(String(initial.score || ''));
      setHoleScores(Array.isArray(initial.holeScores) ? initial.holeScores : null);
      setHolePars(Array.isArray(initial.holePars) ? initial.holePars : null);
      setWeather(initial.weather || '맑음');
      setMemo(initial.memo || '');
      setDetailMemo(initial.detailMemo || '');
      setBirdieCount(initial.birdieCount || 0);
      setSpecial(initial.special || null);
      setSpecialHole(String(initial.specialHole || ''));
      setSpecialPar(String(initial.specialPar || '3'));
      setSpecialDist(initial.specialDist || '');
      setSpecialBall(initial.specialBall || '');
      setSpecialMemo(initial.specialMemo || '');
      setStarRating(initial.starRating || 0);
      setSelectedTags(initial.tags || []);
      setAddPhotos(initial.photos || []);
      // 저장 필드는 visibility — 옛 코드가 privacy로 내보내 visibility가 안 바뀌던 버그 수정.
      // 혹시 남아있는 옛 privacy 값도 폴백으로 인정. group이면 그룹 칩(첫 audienceGroupId) 복원 ([[friend_groups]]).
      {
        const v = initial.visibility || initial.privacy || 'friends';
        // 동반자 공개도 저장은 group이라, audienceKind로 구분해 '동반자만' 칩을 되살린다(안 그러면 친구 전체로 뒤바뀜).
        setPrivacy(v === 'group'
          ? (initial.audienceKind === 'companions' ? ['companions']
            : ((Array.isArray(initial.audienceGroupIds) && initial.audienceGroupIds.length) ? initial.audienceGroupIds : ['friends']))
          : [v]);
      }
      setCompanions(
        (initial.companions || [])
          .filter(c => !(typeof c === 'object' && c.isMe))
          .map(c => (typeof c === 'string' ? { name: c } : { name: c.name, ...(c.friendUid ? { friendUid: c.friendUid } : {}) }))
          .filter(c => c.name)
      );
      setCompanionInput('');
      setSubCourse(initial.subCourse || '');
      setTeeTime(initial.time || '');   // 기존 기록의 티오프 시간 복원(없으면 빈칸)
      setOverseas(!!initial.overseas);
      setCountry(initial.country || '');
      setKind(initial.kind === 'moment' ? 'moment' : 'round');
      if (initial.cost) {
        const c = initial.cost;
        const hasDetail = !!(c.green || c.cart || c.onsite); // 옛/세부 기록 → 그린피·카트비·그늘집 펼쳐서 표시
        const etcSum = (c.etc || 0) + (c.meal || 0); // 옛 식사비는 기타로 합산(필드 폐지)
        const betSigned = c.bet || 0; // 내기 손익(부호) — 음수=땄음, 양수=잃음 ([[ledger-bet-pnl]])
        setCosts({
          field: c.field ? String(c.field) : '',
          green: c.green ? String(c.green) : '',
          cart: c.cart ? String(c.cart) : '',
          onsite: c.onsite ? String(c.onsite) : '',
          caddie: c.caddie ? String(c.caddie) : '',
          etc: etcSum ? String(etcSum) : '',
          bet: betSigned ? String(Math.abs(betSigned)) : '',
        });
        setBetWon(betSigned < 0);
        setShowCourseDetail(hasDetail);
        setShowCost(true);
      }
    } else {
      reset();
      // 일정 캘린더·내 코스기록에서 넘어온 날짜·골프장 미리 채움
      if (initial?.date) {
        const dParts = String(initial.date).split('.').map(Number);
        if (dParts.length === 3 && dParts.every(Number.isFinite)) {
          setDate(new Date(dParts[0], dParts[1] - 1, dParts[2]));
        }
      }
      if (initial?.course) {
        setCourseSearch(initial.course);
        setSelectedCourse(initial.course);
      }
      if (initial?.courseId) {
        findUserCourseById(initial.courseId).then(c => { if (!cancelled && c) setSelectedCourseObj(c); });
      }
      if (initial?.time) setTeeTime(initial.time); // 일정에서 자동채운 티오프(단체는 seed 단계서 제외됨)
      // 전파 단체 일정 — 그룹(groupId)을 직접 읽어 멤버 전원을 동반자 후보(roster)로(단체 모집과 동일 UX, 2026-06-26).
      //   수신자 파생 일정의 companions엔 초대자 1명만 담겨 그것만으론 같이 친 사람을 못 고름 → 그룹에서 전원 해석.
      //   멤버(나 제외)가 3명 초과면 teamRoster로 본인 조 3명 직접 선택, 이하면 그대로 자동 채움.
      if (initial?.groupId) {
        (async () => {
          try {
            const me = await getUid();
            const g = await getScheduleGroup(initial.groupId);
            if (cancelled || !g) return;   // 늦게 도착한 그룹 데이터가 닫힌/재오픈 폼을 덮지 않게
            const names = g.names || {};
            const declined = new Set(g.declinedUids || []);
            const uids = [...new Set([...(g.memberUids || []), ...(g.audienceUids || [])])]
              .filter(u => u && u !== me && !declined.has(u));
            const roster = uids.map(u => ({ name: (names[u] || '').trim() || '동반자', friendUid: u }));
            if (roster.length > 3) { setCompanions([]); setTeamRoster(roster); }
            else { setCompanions(roster.slice(0, 3)); setTeamRoster([]); }
          } catch (e) { if (__DEV__) console.warn('[diary] group roster resolve', e?.message); }
        })();
      } else if (Array.isArray(initial?.companions) && initial.companions.length) {
        // 일정(모집확정 포함)에 담긴 동반자를 기록 작성 시 미리 채움 — friendUid 보존(본인 제외).
        const mapped = initial.companions
          .filter(c => !(typeof c === 'object' && c.isMe))
          .map(c => (typeof c === 'string' ? { name: c } : { name: c?.name, ...(c?.friendUid ? { friendUid: c.friendUid } : {}) }))
          .filter(c => c.name);
        if (mapped.length > 3) {
          // 단체(한 조 4명 초과) — '앞 3명' 자동 채움은 엉뚱한 조를 끌어옴(조 배정 데이터 없음).
          //   자동으로 안 넣고, 참여자 목록에서 본인 조에서 함께 친 3명을 직접 고르게(아래 teamRoster 선택 박스).
          setCompanions([]);
          setTeamRoster(mapped);
        } else {
          setCompanions(mapped.slice(0, 3));   // 개별 라운딩(한 조)은 그대로 자동 채움
          setTeamRoster([]);
        }
      }
      // 연결된 일정에 입력된 코스(세부코스)를 기록에도 자동 채움 — addSeed가 일정에서 끌어옴 ([[schedule-booker]])
      setSubCourse(initial?.subCourse || '');
      if (initial?.overseas) { setOverseas(true); setCountry(initial.country || ''); }
    }
    return () => { cancelled = true; };
  }, [visible, isEdit, initial]);

  const [saveError, setSaveError] = useState('');

  const isMoment = kind === 'moment';
  const finalCourseLive = selectedCourse || courseSearch.trim();
  const canSave = isMoment
    ? ((!!memo.trim() || addPhotos.length > 0) && !photoBusy) // 일상: 글만/사진만이라도 OK
    : (!!finalCourseLive && !!score && !isNaN(parseInt(score)) && parseInt(score) > 0 && !photoBusy); // 메모는 선택 — 점수+구장이 기록의 본체

  const num = (v) => parseInt(v) || 0;
  const courseAmt = showCourseDetail ? (num(costs.green) + num(costs.cart) + num(costs.onsite)) : num(costs.field); // 골프장 결제(그린피+카트+그늘집)
  const betSigned = (betWon ? -1 : 1) * num(costs.bet); // 내기 — 땄으면 음수(총액 차감), 잃으면 양수 ([[ledger-bet-pnl]])
  const costTotal = courseAmt + num(costs.caddie) + num(costs.etc) + betSigned; // 저장용 — 내기 포함(보기서 total−bet으로 분리, 마이그레이션 불필요 [[ledger-bet-pnl]])
  const costSpend = courseAmt + num(costs.caddie) + num(costs.etc); // 표시용 '총 비용' — 내기 제외(정산 분리, 입력↔보기 일관)
  // 입력 항목이 하나라도 있으면 저장 — 크게 딴 날(총액 0·음수)도 기록되게(총액>0 가드 폐지) ([[ledger-bet-pnl]])
  const anyCost = courseAmt > 0 || num(costs.caddie) > 0 || num(costs.etc) > 0 || num(costs.bet) > 0;
  const won = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  // 공개범위 복수선택 — 친구전체·나만보기는 단독, 그룹은 복수 토글(여러 그룹 동시 공개) ([[friend_groups]])
  // 이번 라운딩 동반자 중 '친구로 등록된' 사람 uid — '동반자만' 공개의 대상(사용자 2026-07-22 요청).
  //   이름만 직접 입력한 동반자는 uid가 없어 앱에서 볼 방법이 없다 → 대상에서 빠지고 아래 안내로 알린다.
  const companionUids = useMemo(
    () => Array.from(new Set((companions || []).map(c => c && c.friendUid).filter(Boolean))),
    [companions]);

  const togglePrivacy = (key) => {
    // 'companions'도 단독 선택 — 그룹과 섞으면 '동반자 + 그룹'이라 공개 범위가 모호해진다.
    if (key === 'friends' || key === 'private' || key === 'companions') { setPrivacy([key]); return; }
    setPrivacy(prev => {
      const groupsOnly = prev.filter(k => k !== 'friends' && k !== 'private');
      const next = groupsOnly.includes(key) ? groupsOnly.filter(k => k !== key) : [...groupsOnly, key];
      return next.length ? next : ['friends']; // 그룹을 다 해제하면 친구 전체로 복귀(빈 공개범위 방지)
    });
  };

  const savingRef = useRef(false); // 저장 중 연타 가드
  const [saving, setSaving] = useState(false); // 저장 중 버튼 표시('저장 중…') — 업로드가 길어도 죽은 버튼으로 안 보이게
  const handleSave = async () => {
    if (savingRef.current) return;
    // 공개범위 해석 — friends/private은 단독, 그룹(복수)이면 group + 선택 그룹들 멤버 합집합 스냅샷 ([[friend_groups]])
    let vis;
    if (privacy.includes('private')) {
      vis = { visibility: 'private' };
    } else if (privacy.includes('friends')) {
      vis = { visibility: 'friends' };
    } else if (privacy.includes('companions')) {
      // 동반자만 — 그룹 공개 구조를 그대로 재사용한다(규칙은 audienceUids만 검사하므로 규칙 변경 불필요).
      //   audienceGroupIds는 비우고 audienceKind로 표시 — ★recomputeMyGroupAudiences가 그룹 기준으로 재계산할 때
      //   이 글을 건너뛰게 하는 표식이기도 하다(안 그러면 audienceUids가 빈 배열로 밀려 아무도 못 본다).
      if (companionUids.length === 0) {
        setOverlay({
          title: '친구로 등록된 동반자가 없어요',
          message: '동반자를 친구 목록에서 선택하면\n그 동반자에게만 공개할 수 있어요.',
          buttons: [{ text: '확인' }],
        });
        return;
      }
      vis = { visibility: 'group', audienceUids: companionUids, audienceGroupIds: [], audienceKind: 'companions' };
    } else {
      const gids = privacy;
      const uids = resolveGroupAudience(friendData.friendMeta, gids);
      if (uids.length === 0) {
        const names = gids.map(id => (friendData.friendGroups.find(g => g.id === id) || {}).name).filter(Boolean).join(' · ') || '그룹';
        setOverlay({
          title: `'${names}'에 지정된 친구가 없어요`,
          message: '친구 프로필 ⋯ → 그룹·별명 설정에서\n이 그룹에 친구를 먼저 지정해주세요.',
          buttons: [{ text: '확인' }],
        });
        return;
      }
      vis = { visibility: 'group', audienceUids: uids, audienceGroupIds: gids };
    }
    // 일상(모멘트) — 글/사진만. 라운딩 전용 필드는 비워서 저장(통계 격리는 kind로 보장, 데이터도 깔끔히).
    if (isMoment) {
      if (!memo.trim() && addPhotos.length === 0) {
        setSaveError('내용이나 사진을 남겨주세요');
        return;
      }
      setSaveError('');
      savingRef.current = true; setSaving(true); // 미리 업로드 대기 동안도 연타/버튼 상태 반영
      const mFinalPhotos = await resolveFinalPhotos(); // 미리 업로드된 것 https로 치환(대개 이미 완료 → 즉시)
      const mPayload = {
        kind: 'moment',
        date: formatDate(date), day: formatDay(date), // 기본 오늘 (캘린더 미표시·작성시각 정렬)
        memo: memo.trim(), detailMemo: '',
        photos: mFinalPhotos,
        ...vis,
        score: null, course: '', courseId: null, courseLoc: null,
        holeScores: null, holePars: null, birdieCount: 0,
        weather: null, special: null, specialHole: null, specialPar: null,
        specialDist: '', specialBall: '', specialMemo: '',
        starRating: 0, tags: [], cost: null,
        companions: [{ name: userProfile.nickname, isMe: true }],
        overseas: false, country: '', scheduleId: null,
      };
      // 저장을 await — 실패 시 모달을 닫지 않고 입력 보존 + 안내(전역 알럿은 RN Modal 아래 깔림, [[ios-modal-stacking]])
      try {
        const ok = isEdit ? await onSave('diary-edit', { id: initial.id, ...mPayload }) : await onSave('diary', mPayload);
        if (ok === false) {
          setOverlay({ title: '저장에 실패했어요', message: '네트워크 상태를 확인하고 다시 시도해주세요.\n작성한 내용은 그대로 남아 있어요.' });
          return;
        }
        preUpRef.current.clear(); // 저장된 파일 참조는 버림(삭제 아님) — 취소 정리가 저장분을 지우지 않게
        reset(); onClose();
      } finally { savingRef.current = false; setSaving(false); }
      return;
    }
    const finalCourse = selectedCourse || courseSearch.trim();
    if (!finalCourse) {
      setSaveError('골프장을 입력해주세요');
      return;
    }
    if (!score || isNaN(parseInt(score)) || parseInt(score) <= 0) {
      setSaveError('스코어를 입력해주세요');
      return;
    }
    // 메모는 선택 — 점수+구장만으로 저장 허용(일상글이 사진만으로 저장되는 것과 일관, 사용자 2026-06-29).
    setSaveError('');
    // OCR 홀별(holeScores)이 있는데 총타수를 손으로 바꿔 합계와 어긋나면, 직접 입력한 총타수를 신뢰하고
    //   더는 맞지 않는 홀별 집계는 저장에서 제외(보기 화면 '총 N타'와 홀별 합 불일치 방지).
    let finalHoleScores = holeScores, finalHolePars = holePars;
    if (finalHoleScores) {
      const holeSum = finalHoleScores.reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0);
      if (holeSum !== (parseInt(score) || 0)) { finalHoleScores = null; finalHolePars = null; }
    }
    savingRef.current = true; setSaving(true); // 미리 업로드 대기 동안도 연타/버튼 상태 반영
    const finalPhotos = await resolveFinalPhotos(); // 미리 업로드된 것 https로 치환(대개 이미 완료 → 즉시)
    const payload = {
      course: finalCourse, date: formatDate(date), day: formatDay(date), time: teeTime || null,
      score: parseInt(score) || 0, holeScores: finalHoleScores, holePars: finalHolePars, weather, memo, birdieCount, ...vis,
      special, specialHole: parseInt(specialHole) || null,
      specialPar: parseInt(specialPar) || null,
      specialDist, specialBall, specialMemo,
      photos: finalPhotos,
      starRating,
      tags: selectedTags,
      detailMemo,
      cost: anyCost ? {
        // 골프장 결제: 세부 펼쳤으면 그린피·카트비로, 아니면 묶음(field)으로 저장
        ...(showCourseDetail
          ? { green: num(costs.green), cart: num(costs.cart), onsite: num(costs.onsite) }
          : { field: num(costs.field) }),
        caddie: num(costs.caddie),
        etc: num(costs.etc),
        ...(num(costs.bet) > 0 ? { bet: betSigned } : {}), // 내기 손익(부호) — 입력했을 때만 ([[ledger-bet-pnl]])
        total: costTotal,
      } : null,
      companions: [
        { name: userProfile.nickname, isMe: true },
        // 저장 시 입력칸에 남은 이름도 자동 반영 — '추가' 미클릭으로 유실되던 문제 방지 (최대 3명). friendUid 보존([[companion-design]] Phase A)
        ...[...companions, ...companionInput.trim().split(/[\s,]+/).filter(Boolean).map(name => ({ name }))]
          .slice(0, 3)
          .map(c => ({ name: c.name, isMe: false, ...(c.friendUid ? { friendUid: c.friendUid } : {}) })),
      ],
      courseId: selectedCourseObj?.id || (initial && initial.courseId) || null,
      courseLoc: selectedCourseObj?.loc || (initial && initial.courseLoc) || null, // 코스 주소 동봉 — 지역탭 분류용([[region-classification]])
      subCourse: (subCourse || '').trim(), // 코스(세부코스 라벨) — 선택 입력, 구장 매칭과 무관 ([[schedule-booker]])
      // 일정 진입 동선이면 initial.scheduleId가 prefill됨. 폼 안 '불러오기'로 고른 경우 pickedScheduleId 우선.
      // 같은 날 일정 N건 + 다이어리 매칭의 비대칭 차단([[home-multi-schedule-same-day]] 룰3).
      scheduleId: pickedScheduleId || initial?.scheduleId || null,
      overseas,
      country: overseas ? country.trim() : '',
    };
    // 저장 성공 뒤 마무리 — 임시 파일 참조 정리 + 동반자 스코어 공유 + 모달 닫기.
    //   신규 저장과 덮어쓰기가 완전히 같은 뒷정리를 타도록 한 곳에 모아둔다.
    const finishSave = async () => {
      preUpRef.current.clear(); // 저장된 파일 참조는 버림(삭제 아님) — 취소 정리가 저장분을 지우지 않게
      // 동반자에게 스코어 공유 — OCR 전체 행(scRows)을 친구 동반자에게. 수신자가 자기 행 골라 본인 기록에 파생.
      //   ★2026-07-31: 예전엔 fire-and-forget + __DEV__ 로그뿐이라, 안 보내졌는데도 앱이 아무 말을 안 했다.
      //     '공유를 눌렀는데 친구에게 안 간다'는 제보가 왔을 때 사용자도 개발자도 원인을 알 수 없었다(서버엔 문서 0건).
      //     → 결과를 기다렸다가 못 보냈으면 반드시 알린다. 단 저장 자체는 이미 끝났으므로 공유 실패가 기록을 되돌리진 않는다.
      let shareWarn = null;
      if (shareScores && Array.isArray(shareRows) && shareRows.length >= 2) {
        const audienceUids = companions.filter(c => c.friendUid).map(c => c.friendUid);
        if (!audienceUids.length) {
          // 이름을 직접 적은 동반자는 앱 친구가 아니라 '받을 사람'을 특정할 수 없다 → 보낼 곳이 없음.
          shareWarn = {
            title: '스코어는 보내지 못했어요',
            message: '동반자를 친구 목록에서 고른 경우에만 보낼 수 있어요.\n직접 적은 이름은 앱 친구가 아니라 받을 사람을 알 수 없어요.\n\n기록은 저장됐어요 — 수정에서 친구를 넣고 다시 시도해주세요.',
          };
        } else {
          try {
            const uid = await getUid();
            const shareId = await createScoreShare({
              authorUid: uid,
              authorName: userProfile.nickname || userProfile.realName || '',
              round: {
                course: finalCourse, date: formatDate(date), day: formatDay(date),
                courseId: payload.courseId, courseLoc: payload.courseLoc, holePars,
                ...((pickedScheduleId || initial?.scheduleId) ? { scheduleId: pickedScheduleId || initial?.scheduleId } : {}),
              },
              rows: shareRows,
              audienceUids,
            });
            if (!shareId) {
              shareWarn = { title: '스코어는 보내지 못했어요', message: '받을 친구를 확인하지 못했어요.\n기록은 저장됐어요 — 수정에서 동반자를 다시 넣고 시도해주세요.' };
            }
          } catch (e) {
            if (__DEV__) console.warn('[scoreShare] create fail', e?.message);
            shareWarn = { title: '스코어는 보내지 못했어요', message: '네트워크 상태를 확인해주세요.\n기록은 저장됐어요 — 수정에서 다시 시도할 수 있어요.' };
          }
        }
      }
      reset(); onClose();
      // 모달이 닫힌 뒤에 띄운다 — 글로벌 알럿은 RN Modal 위에서 터치가 안 먹어 닫힘 애니메이션 후로 미룬다.
      if (shareWarn) setTimeout(() => showAppAlert(shareWarn.title, shareWarn.message), 350);
    };

    // 저장 실행부 — 신규 저장과 '기존 기록 덮어쓰기'가 뒷정리·공유까지 똑같이 흐르도록 하나로 묶는다.
    //   overwriteId가 있으면 그 기록을 수정한다(=덮어쓰기).
    const commit = async (overwriteId) => {
      // 저장을 await — 실패 시 모달을 닫지 않고 입력(코스·스코어·사진·메모) 보존 + 안내
      let saveOk;
      savingRef.current = true; setSaving(true);
      try {
        const editId = isEdit ? initial.id : overwriteId;
        saveOk = editId ? await onSave('diary-edit', { id: editId, ...payload }) : await onSave('diary', payload);
      } finally { savingRef.current = false; setSaving(false); }
      if (saveOk === false) {
        setOverlay({ title: '저장에 실패했어요', message: '네트워크 상태를 확인하고 다시 시도해주세요.\n작성한 내용은 그대로 남아 있어요.' });
        return;
      }
      await finishSave();
    };

    // ★같은 날·같은 구장 기록이 이미 있으면 조용히 둘로 늘리지 않고 고르게 한다.
    //   자동 덮어쓰기는 금지 — 같은 구장 하루 36홀(2라운드)이 실제로 있고, 티오프가 안 적힌 기록이 많아
    //   '같은 라운딩'을 기계가 확정할 수 없다. 판단은 사용자가.
    const dup = isEdit ? null : findSameRound(existingRounds, payload);
    if (dup) {
      savingRef.current = false; setSaving(false);   // 확인 동안은 저장 상태 해제(오버레이가 재탭을 막음)
      setOverlay({
        title: '이 날 기록이 이미 있어요',
        message: `${payload.date} · ${dup.course}${dup.time ? ` · ${dup.time}` : ''} · 총 ${dup.score || 0}타\n하루에 두 라운드를 도셨다면 따로 저장하세요.`,
        buttons: [
          { text: '이 기록 고치기', onPress: () => { commit(dup.id); } },
          { text: '따로 저장', onPress: () => { commit(null); } },
          { text: '취소', style: 'cancel' },
        ],
      });
      return;
    }
    await commit(null);
  };


  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { cleanupPreUploads(); reset(); onClose(); }}>
        {/* KeyboardProvider — RN Modal은 별도 네이티브 윈도우라 모달 안 KAS는 자체 Provider 필요 */}
        <KeyboardProvider>
        <View style={mS.mask}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => { cleanupPreUploads(); reset(); onClose(); }} />
          <View style={[mS.sheet, { paddingBottom: 0 }]}>
            <TouchableOpacity onPress={() => { cleanupPreUploads(); reset(); onClose(); }} activeOpacity={0.7}
              style={{ alignItems: 'center', paddingVertical: 10 }}>
              <View style={mS.handle} />
            </TouchableOpacity>
            {/* A. 고정 헤더 — 제목 + 항상 보이는 ✕ 닫기(iOS 백버튼 부재·긴 내용서 닫기 어려움 대응) */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 4 }}>
              <Text style={[mS.title, { fontSize: fs(21), flex: 1, marginBottom: 0 }]}>{isEdit ? '기록 수정' : '기록하기'}</Text>
              <TouchableOpacity onPress={() => { cleanupPreUploads(); reset(); onClose(); }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginRight: -8 }}>
                <Text style={{ fontSize: fs(22), color: C.warmGray }}>✕</Text>
              </TouchableOpacity>
            </View>
            {/* KeyboardAwareScrollView — 포커스 입력칸을 키보드 위로 자동 스크롤(iOS·안드 공통).
                ★keyboardShouldPersistTaps="always" — 안드에서 키보드가 떠 있을 때 'handled'가 칩·버튼 첫 탭을 키보드 닫기에
                 먹히게 하던 이슈(react-native-keyboard-controller KAS) 회피. 탭이 항상 자식에 도달(공개범위 칩 등). (2026-06-29) */}
            <KeyboardAwareScrollView style={{ flexShrink: 1, padding: 20, paddingTop: 0 }} showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="always" keyboardDismissMode="on-drag" bottomOffset={24}>
              {/* 상위 분기: 라운딩 기록 | 일상 — 아이콘 카드 2개(아이콘+제목+한줄설명).
                  카드형이라 아래 [국내|해외] 작은 칩과 모양·높이가 전혀 달라 안 헷갈리고, 설명으로 차이도 바로 전달.
                  편집은 토글 잠금(round↔moment 전환 금지: 데이터·통계 정합성)이라 제목 텍스트로 표시. */}
              {!isEdit ? (
                // 상위 분기 — 밑줄 텍스트 탭 2개(심플). 선택 탭만 액센트색+굵게+밑줄. 라운딩=그린, 일상=버건디.
                <View style={{ flexDirection: 'row', gap: 22, marginTop: 2, marginBottom: 14,
                  borderBottomWidth: 0.5, borderBottomColor: C.hairline }}>
                  {[
                    { v: 'round', label: '라운딩 기록' },
                    { v: 'moment', label: '일상' },
                  ].map(opt => {
                    const on = kind === opt.v;
                    const accent = opt.v === 'round' ? '#6E8F52' : C.burgundy;
                    return (
                      <TouchableOpacity key={opt.v} activeOpacity={0.7} onPress={() => setKind(opt.v)}
                        style={{ paddingVertical: 10, borderBottomWidth: 2, marginBottom: -0.5,
                          borderBottomColor: on ? accent : 'transparent' }}>
                        <Text style={{ fontFamily: on ? F.sysB : F.sysM, fontSize: fs(16), letterSpacing: 0.3,
                          color: on ? accent : C.warmGray }}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <Text style={mS.title}>{isMoment ? '일상 기록 수정' : '라운딩 기록 수정'}</Text>
              )}
              {kind === 'round' && (<>
              <View style={[cardBox, { marginTop: 6 }]}>
              <SectionHead title="스코어" required />

              {/* ★총타수 직접 입력을 1순위로(사용자 2026-07-27) — 중장년은 그냥 총타만 적는 게 제일 쉽다.
                  사진 자동입력(홀별·버디)은 아래 보조 경로로 내린다. OCR 인식 시 이 값도 자동으로 채워진다(위 setScore). */}
              <Text style={[mS.bigLabel, { marginTop: 4, color: '#6B1E2A' }]}>총타수 <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: '#6B1E2A', letterSpacing: 0 }}>(필수)</Text></Text>
              <AppTextInput style={[mS.input, { fontSize: fs(18), fontFamily: F.sysB }]} placeholder="총타수 입력 (예: 88)"
                placeholderTextColor={C.warmGrayLight} value={score}
                onChangeText={setScore} keyboardType="numeric" />
              <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.warmGray, marginTop: 6, lineHeight: 18 }}>
                사진 없이 <Text style={{ fontFamily: F.sysSb, color: C.charcoal }}>총타수만 적어도 충분히 기록</Text>돼요.
              </Text>

              {/* 사진으로 자동입력 — 홀별·버디까지 자동 집계(선택·보조). 인식되면 요약으로 대체. */}
              <Text style={[mS.bigLabel, { marginTop: 20 }]}>사진으로 자동입력 <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, letterSpacing: 0 }}>(선택 · 홀별·버디까지)</Text></Text>
              <View style={{ marginBottom: 10 }}>
                  {/* 사진으로 등록 — 갤러리(권장)/촬영. 인식 결과는 검토 모달에서 확인·수정 후 확정 */}
                  {/* 추출 중 — 공용 Spinner(JS타이머 회전, 안드 애니메이션 꺼짐에도 돎). 버튼/안내는 숨김.
                      ★holeScores 유무와 무관하게 띄운다 — 예전엔 `!holeScores &&` 조건이 붙어 있어서,
                        이미 홀별이 있는 기록에서 '사진으로 다시 읽기'를 누르면 그 버튼은 사라지고(holeScores && !scBusy)
                        스피너는 안 떠서, 10~25초 동안 화면에 아무 반응이 없었다. 누른 사람은 '안 눌렸나' 싶다
                        (사용자 제보 2026-07-31 — 잘못된 기록을 고치려고 재인식할 때가 바로 이 경로다). */}
                  {scBusy && (
                    <View style={{ paddingVertical: 30, alignItems: 'center', backgroundColor: C.bgSecondary,
                      borderRadius: 12, borderWidth: 0.5, borderColor: C.hairline }}>
                      <Spinner size={30} color={C.burgundy} />
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.charcoal, marginTop: 12 }}>AI가 스코어를 읽고 있어요…</Text>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: C.warmGray, marginTop: 4 }}>사진이 많으면 조금 걸릴 수 있어요</Text>
                    </View>
                  )}
                  {!holeScores && !scBusy && (
                    <View>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity activeOpacity={0.85} onPress={() => handleScorecardPick('gallery')}
                          style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
                            backgroundColor: C.burgundy }}>
                          <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.butter }}>사진 올리기</Text>
                        </TouchableOpacity>
                        <TouchableOpacity activeOpacity={0.85} onPress={() => handleScorecardPick('camera')}
                          style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
                            backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline }}>
                          <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal }}>실물 촬영</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={{ marginTop: 10, backgroundColor: C.bgSecondary, borderRadius: 12,
                        borderWidth: 0.5, borderColor: C.hairline, paddingHorizontal: 14, paddingVertical: 12 }}>
                        <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.burgundy, marginBottom: 8 }}>
                          AI가 홀별 스코어를 자동으로 읽어요
                        </Text>
                      {/* 핵심 3가지만 — 텍스트 벽 지양(사용자 2026-07-27, [[feedback_concise_scannable_copy]]).
                          '· + 텍스트' 행, flex:1 hanging indent로 줄바꿈돼도 글머리 아래로 안 튀어나옴 */}
                      <View style={{ gap: 6 }}>
                        {[
                          { k: 'best', pre: '', em: '스마트스코어 화면 캡처', emColor: true, post: '가 가장 정확해요' },
                          { k: 'c', pre: '실물 사진은 ', em: '반사·그림자 없게', emB: true, post: '' },
                          { k: 'a2', pre: '', em: '최대 2장', emB: true, post: '(전·후반) · 여러 명은 본인 행만 골라요' },
                        ].map(b => (
                          <View key={b.k} style={{ flexDirection: 'row' }}>
                            <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.warmGray, lineHeight: 19, width: 12 }}>·</Text>
                            <Text style={{ flex: 1, fontFamily: F.sys, fontSize: fs(12.5), color: C.charcoal, lineHeight: 19 }}>
                              {b.pre}
                              {b.em ? <Text style={{ fontFamily: b.emB ? F.sysSb : F.sysB, color: b.emColor ? C.burgundy : C.charcoal }}>{b.em}</Text> : null}
                              {b.post || ''}
                            </Text>
                          </View>
                        ))}
                      </View>
                      </View>
                    </View>
                  )}

                  {/* 입력 완료 요약 — 총타·수정·지우기 */}
                  {holeScores && (
                    <View style={{ marginTop: 10, padding: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'center',
                      backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 }}>
                        <Icon name="flag" size={fs(16)} color={C.burgundy} strokeWidth={1.8} />
                        {/* ★flexShrink:1 필수 — RN은 flexShrink 기본값이 0(웹은 1)이라 이게 없으면 긴 글씨가
                            줄지도 줄바꿈되지도 않고 그대로 넘쳐 오른쪽 '수정·지우기' 위에 겹쳐 그려진다.
                            안드는 BODY_BUMP(+3pt)로 글씨가 더 커서 먼저 터짐(사용자 제보 2026-07-31). */}
                        <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.charcoal, flexShrink: 1 }}>
                          홀별 입력됨 · 총 {holeScores.reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0)}타
                        </Text>
                      </View>
                      {/* 우측 액션은 안 줄어들게(flexShrink:0) — 줄어들 쪽은 왼쪽 설명 글씨다 */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 0, marginLeft: 8 }}>
                        <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          onPress={() => {
                            const t = holeScores.reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0);
                            setScRows([{ label: '입력값', holes: holeScores, total: t }]);
                            setScFailed(false); setScLowConf(false); setScReview(true);
                          }}>
                          <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.burgundy }}>수정</Text>
                        </TouchableOpacity>
                        <Text style={{ color: C.warmGray, marginHorizontal: 8 }}>·</Text>
                        <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => { setHoleScores(null); setHolePars(null); setShareRows([]); setShareScores(false); }}>
                          <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.warmGray }}>지우기</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                  {/* 사진으로 다시 읽기 — 이미 홀별이 있어도(수정모드에서 총타만 있던 기록에 홀별 추가 등) 사진 AI 재인식 진입.
                      총타만 있는 기록(holeScores=null)은 위 '사진 올리기/실물 촬영' 버튼이 그대로 뜬다. */}
                  {holeScores && !scBusy && (
                    <TouchableOpacity onPress={() => handleScorecardPick('gallery')} activeOpacity={0.85}
                      style={{ marginTop: 8, paddingVertical: 11, borderRadius: 10, alignItems: 'center',
                        backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline }}>
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: C.burgundy }}>사진으로 다시 읽기</Text>
                    </TouchableOpacity>
                  )}
                  {/* 동반자 점수 공유 — OCR 카드 기반이라 결과 '바로 아래'에 둠(동반자 섹션에 묻혀 못 보던 것 개선, 사용자 제보).
                      여러 명 인식(shareRows≥2, 수정해도 원본 유지) + 친구 동반자 있으면 체크박스 / 없으면 동반자 추가 유도. */}
                  {holeScores && Array.isArray(shareRows) && shareRows.length >= 2 && (
                    companions.some(c => c.friendUid) ? (
                      // 친구 동반자 있음 — 크고 눈에 띄는 공유 카드(버건디 틴트). 체크박스는 커스텀 SVG(Icon check).
                      <TouchableOpacity onPress={() => setShareScores(s => !s)} activeOpacity={0.8}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 12,
                          backgroundColor: shareScores ? (C.burgundy + '16') : (C.burgundy + '08'), borderRadius: 13,
                          borderWidth: 1.2, borderColor: shareScores ? C.burgundy : (C.burgundy + '44'),
                          paddingVertical: 13, paddingHorizontal: 13 }}>
                        <Icon name="people" size={fs(22)} color={C.burgundy} strokeWidth={1.8} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: F.sysB, fontSize: fs(13.5), color: C.burgundy }}>동반자에게 스코어 함께 공유</Text>
                          <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: C.charcoal, marginTop: 3, lineHeight: 16 }}>
                            {shareRows.length}명이 함께 인식됐어요.{'\n'}친구가 각자 본인 점수를 골라 바로 기록돼요.
                          </Text>
                        </View>
                        <View style={{ width: fs(24), height: fs(24), borderRadius: 7, borderWidth: 1.5,
                          borderColor: shareScores ? C.burgundy : C.warmGrayLight,
                          backgroundColor: shareScores ? C.burgundy : 'transparent',
                          alignItems: 'center', justifyContent: 'center' }}>
                          {shareScores && <Icon name="check" size={fs(15)} color={C.butter} strokeWidth={2.6} />}
                        </View>
                      </TouchableOpacity>
                    ) : (
                      // 친구 동반자가 아직 없으면 — 탭하면 바로 친구 선택 picker(왕복 제거). 친구 넣으면 위 체크박스로 전환.
                      <TouchableOpacity onPress={() => setShowCompanionPicker(true)} activeOpacity={0.8}
                        style={{ marginTop: 12, backgroundColor: C.burgundy + '08', borderRadius: 13,
                          borderWidth: 1.2, borderColor: C.burgundy + '44',
                          paddingVertical: 13, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 11 }}>
                        <Icon name="people" size={fs(22)} color={C.burgundy} strokeWidth={1.8} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: F.sysB, fontSize: fs(13.5), color: C.burgundy }}>함께 친 친구에게 공유하기</Text>
                          <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: C.charcoal, marginTop: 3, lineHeight: 16 }}>
                            {shareRows.length}명이 인식된 카드예요.{'\n'}친구를 넣으면 이 점수를 바로 공유해요.
                          </Text>
                        </View>
                        <Text style={{ fontFamily: F.sysSb, fontSize: fs(12.5), color: C.burgundy }}>친구 선택 ›</Text>
                      </TouchableOpacity>
                    )
                  )}
                </View>
              </View>
              <View style={cardBox}>
              <SectionHead title="라운딩 정보" required />
              {/* ★불러오기 — 미기록 라운딩(디어골프) + 폰 캘린더의 지난 라운딩을 골라 골프장·날짜·동반자 자동 채움
                  (신규 기록만, 사용자 2026-07-27). 예정 라운딩으로 등록 안 한 과거도 캘린더에서 가져오게. */}
              {!isEdit && (
                <TouchableOpacity onPress={() => setLoadPickerOpen(true)} activeOpacity={0.85}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2, marginBottom: 10,
                    backgroundColor: 'rgba(107,30,42,0.06)', borderRadius: 12, paddingHorizontal: 13, paddingVertical: 12 }}>
                  <Icon name="calendar" size={20} color={C.burgundy} strokeWidth={1.9} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(14), color: C.burgundy }}>일정·캘린더에서 불러오기</Text>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: C.warmGray, marginTop: 2 }}>
                      골프장·날짜·동반자 자동 채우기
                    </Text>
                  </View>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.burgundy }}>
                    {loadableRounds.length > 0 ? `${loadableRounds.length}개 ›` : '›'}
                  </Text>
                </TouchableOpacity>
              )}
              {/* 국내 / 해외 — 알약형 세그먼트 토글(축소·좌측 정렬). 선택 세그먼트만 버건디 채움. */}
              <View style={{ flexDirection: 'row', alignSelf: 'flex-start', marginTop: 4,
                backgroundColor: C.bgSecondary, borderRadius: 999, padding: 3,
                borderWidth: 0.5, borderColor: C.hairline }}>
                {[['국내', false], ['해외', true]].map(([l, v]) => {
                  const on = overseas === v;
                  return (
                    <TouchableOpacity key={l} activeOpacity={0.8}
                      onPress={() => { setOverseas(v); setKakaoResults([]); }}
                      style={{ paddingVertical: 6, paddingHorizontal: 18, borderRadius: 999,
                        backgroundColor: on ? C.burgundy : 'transparent' }}>
                      <Text style={{ fontFamily: on ? F.sysB : F.sysM, fontSize: fs(13),
                        color: on ? C.butter : C.warmGray }}>{l}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={[mS.bigLabel, { color: '#6B1E2A' }]}>골프장 <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: '#6B1E2A' }}>(필수)</Text></Text>
              <AppTextInput style={[mS.input, { fontSize: fs(16), fontFamily: F.sysSb }]}
                placeholder={overseas ? '골프장 이름 입력' : '골프장 검색 또는 직접 입력...'}
                placeholderTextColor={C.warmGrayLight} value={courseSearch}
                autoCorrect={false} autoCapitalize="none"
                onChangeText={t => { setCourseSearch(t); setSelectedCourse(''); setSelectedCourseObj(null); }} />
              {!overseas && (
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 6, lineHeight: 16 }}>
                  검색 결과에서 고르면 지역·100대 코스가 정확해요
                </Text>
              )}
              {!overseas && kakaoSearching && (
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 4 }}>검색 중...</Text>
              )}
              {/* 입력 전 — 최근 검색한 골프장 3개 빠른 선택(일정 추가와 동일 UX, 사용자 요청) */}
              {!overseas && !selectedCourse && !courseSearch && recentCourses.length > 0 && (
                <View style={{ marginTop: 8 }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.warmGray, marginBottom: 6 }}>🕘 최근 검색</Text>
                  <View style={mS.searchDrop}>
                    {recentCourses.slice(0, 3).map((rc, i) => (
                      <TouchableOpacity key={rc.kakaoId || `${rc.name}_${i}`} style={mS.searchItem}
                        onPress={() => handleSelectRecent(rc)}>
                        <Text style={mS.searchName}>{rc.name}</Text>
                        {!!rc.loc && <Text style={mS.searchLoc}>{rc.loc}</Text>}
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
              {overseas && (
                <>
                  <Text style={mS.bigLabel}>국가</Text>
                  <AppTextInput style={[mS.input, { fontSize: fs(16), fontFamily: F.sysSb }]} placeholder="예: 일본, 베트남, 중국"
                    placeholderTextColor={C.warmGrayLight} value={country} onChangeText={setCountry}
                    autoCorrect={false} />
                </>
              )}
              {!overseas && courseSearch.length > 0 && courseSearch !== selectedCourse && !kakaoSearching && (
                <View style={mS.searchDrop}>
                  {kakaoResults.map(r => (
                    <TouchableOpacity key={r.kakaoId} style={mS.searchItem}
                      onPress={() => handleSelectKakaoResult(r)}>
                      <Text style={mS.searchName}>{r.name}</Text>
                      <Text style={mS.searchLoc}>{r.loc}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity style={[mS.searchItem, { borderBottomWidth: 0, backgroundColor: C.butter + '33' }]}
                    onPress={handleSelectManual}>
                    <Text style={[mS.searchName, { color: C.burgundy }]}>+ "{courseSearch.trim()}" 직접 입력</Text>
                    <Text style={mS.searchLoc}>목록에 없는 골프장도 등록 가능</Text>
                  </TouchableOpacity>
                </View>
              )}
              {/* 코스 (선택) — 골프장 내 세부코스 라벨. 구장 검색·매칭과 무관한 자유 입력. 연결된 일정에 있으면 자동 채움 ([[schedule-booker]]) */}
              <Text style={mS.bigLabel}>코스 <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray }}>(선택)</Text></Text>
              <AppTextInput style={[mS.input, { fontSize: fs(16), fontFamily: F.sysSb }]} value={subCourse} onChangeText={setSubCourse}
                placeholder="예: 레이크코스 / 동→서" placeholderTextColor={C.warmGrayLight} autoCorrect={false} />
              <SubCourseChips options={subCourseOpts} value={subCourse} onPick={setSubCourse} />

              <Text style={mS.bigLabel}>날짜</Text>
              <TouchableOpacity style={[mS.input, dateLocked && { opacity: 0.55 }]}
                activeOpacity={dateLocked ? 1 : 0.7}
                onPress={() => { if (!dateLocked) setShowDatePicker(true); }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: C.textPrimary }}>
                  {formatDate(date)} ({formatDay(date)})
                </Text>
              </TouchableOpacity>
              {dateLocked && (
                <Text style={{ fontFamily: F.sysM, fontSize: fs(13), color: C.navy, marginTop: 7, lineHeight: 19 }}>
                  라운지에서 확정된 라운딩이라{'\n'}날짜는 변경할 수 없어요.
                </Text>
              )}
              <SpinnerPicker visible={showDatePicker && !dateLocked} value={date} mode="date" maximumDate={new Date()}
                onPick={setDate} onClose={() => setShowDatePicker(false)} />

              {/* 티오프 시간 — 선택 입력. 일정에서 왔으면 자동채움(단체 모집 제외), 비우면 저장·표시 안 함 ([[teeoff-time-optional]]) */}
              <Text style={mS.bigLabel}>티오프 시간 <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>(선택)</Text></Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TouchableOpacity style={[mS.input, { flex: 1 }]} activeOpacity={0.7} onPress={() => setShowTimePicker(true)}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: teeTime ? C.textPrimary : C.warmGray }}>
                    {teeTime || '입력 안 함'}
                  </Text>
                </TouchableOpacity>
                {!!teeTime && (
                  <TouchableOpacity onPress={() => setTeeTime('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
                    <Text style={{ fontFamily: F.sysM, fontSize: fs(13), color: C.warmGray }}>지우기</Text>
                  </TouchableOpacity>
                )}
              </View>
              <SpinnerPicker visible={showTimePicker} mode="time" is24Hour title="티오프 시간"
                value={(() => { const [h, m] = (teeTime || '07:00').split(':').map(Number); const d = new Date(); d.setHours(Number.isFinite(h) ? h : 7, Number.isFinite(m) ? m : 0, 0, 0); return d; })()}
                onPick={(d) => setTeeTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)}
                onClose={() => setShowTimePicker(false)} />

              </View>
              <View style={cardBox}>
              <SectionHead title="오늘의 기록" />
              <Text style={[mS.bigLabel, { color: '#6B1E2A' }]}>한줄 메모 <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>(선택)</Text></Text>
              <AppTextInput style={[mS.input, { fontSize: fs(16), fontFamily: F.sysSb }]} placeholder="오늘 라운딩은..." placeholderTextColor={C.warmGrayLight}
                value={memo} onChangeText={setMemo} />
              <Text style={mS.bigLabel}>
                동반자
                <Text style={{ fontSize: fs(11), fontFamily: F.sys, color: '#8B8680' }}> (선택 · 탭하여 삭제)</Text>
              </Text>
              {/* 단체 라운딩 — 참여자(비친구 포함)에서 같은 조 동반자 3명을 직접 선택(앞 3명 자동 X). 친구 목록이 아니라 '이 단체 사람들'에서 고름. */}
              {teamRoster.length > 0 && (
                <View style={{ marginBottom: 10 }}>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginBottom: 6 }}>
                    단체 라운딩이에요 — 같은 조에서 함께 친 동반자를 골라주세요 (최대 3명)
                  </Text>
                  <View style={{ maxHeight: 168, borderWidth: 0.5, borderColor: C.hairline, borderRadius: 10, backgroundColor: C.bgSecondary }}>
                    <ScrollView nestedScrollEnabled showsVerticalScrollIndicator>
                      {teamRoster.map((p, i) => {
                        const on = companions.some(c => sameComp(c, p));
                        const disabled = !on && companions.length >= 3;
                        const shown = p.friendUid ? (friends.find(f => f.id === p.friendUid)?.customName || p.name) : p.name;
                        return (
                          <TouchableOpacity key={(p.friendUid || p.name) + '_' + i} activeOpacity={0.7} onPress={() => toggleRosterComp(p)} disabled={disabled}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, paddingVertical: 11,
                              borderTopWidth: i === 0 ? 0 : 0.5, borderTopColor: C.hairline, opacity: disabled ? 0.4 : 1 }}>
                            <Text style={{ fontSize: fs(15), color: on ? C.burgundy : C.warmGrayLight }}>{on ? '☑' : '☐'}</Text>
                            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              {p.friendUid && <Icon name="person" size={fs(13)} color={C.charcoal} />}
                              <Text style={{ flex: 1, fontFamily: F.sysM, fontSize: fs(13.5), color: C.charcoal }} numberOfLines={1}>{shown}</Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                </View>
              )}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <AppTextInput
                  style={[mS.input, { flex: 1, fontSize: fs(16), fontFamily: F.sysSb }]}
                  placeholder="이름 입력 (공백으로 여러 명)"
                  placeholderTextColor={C.warmGrayLight}
                  value={companionInput}
                  onChangeText={setCompanionInput}
                  returnKeyType="done"
                  onSubmitEditing={handleAddCompanions}
                />
                <TouchableOpacity
                  style={{
                    backgroundColor: C.charcoal,
                    borderRadius: 10,
                    paddingHorizontal: 16,
                    justifyContent: 'center',
                  }}
                  onPress={handleAddCompanions}>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.butter }}>추가</Text>
                </TouchableOpacity>
              </View>
              {/* 친구에서 선택 — friendUid 보존(동반자 통계·향후 스코어 공유 전제) ([[companion-design]] Phase A)
                  pill(테두리+배경+›)로 '눌러서 고를 수 있다'를 명확히(그냥 글씨라 탭 가능 힌트가 없다는 사용자 제보).
                  이미 친구 동반자가 있으면 '선택·수정'으로 — 다시 눌러 바꿀 수 있음을 알림. */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <TouchableOpacity onPress={() => setShowCompanionPicker(true)} activeOpacity={0.7}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: C.burgundy,
                    borderRadius: 20, paddingHorizontal: 13, paddingVertical: 7, backgroundColor: C.burgundy + '0E' }}>
                  <Icon name="people" size={fs(15)} color={C.burgundy} />
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.burgundy }}>
                    {companions.some(c => c.friendUid) ? '친구 선택·수정' : '친구에서 선택'} ›
                  </Text>
                </TouchableOpacity>
                {friends.length === 0 && (
                  <Text style={{ flex: 1, fontFamily: F.sys, fontSize: fs(11), color: C.warmGrayLight }}>친구를 추가하면 골라서 넣을 수 있어요</Text>
                )}
              </View>
              {companions.length === 0 && (
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginBottom: 8 }}>
                  이름만 적어도 돼요 · 최대 3명
                </Text>
              )}
              {companions.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {companions.map((c, i) => (
                    <TouchableOpacity key={i}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 4,
                        backgroundColor: C.charcoal,
                        borderRadius: 20,
                        paddingHorizontal: 10, paddingVertical: 5,
                      }}
                      onPress={() => setCompanions(prev => prev.filter((_, idx) => idx !== i))}>
                      {/* 친구 동반자는 화면에서만 별명 우선 표시(저장은 닉네임) ([[friend_groups]]) */}
                      {c.friendUid && <Icon name="person" size={fs(12)} color={C.butter} />}
                      <Text style={{ fontSize: fs(12), color: C.butter }}>{c.friendUid ? (friends.find(f => f.id === c.friendUid)?.customName || c.name) : c.name}</Text>
                      <Icon name="close" size={fs(10)} color="rgba(245,230,168,0.5)" />
                    </TouchableOpacity>
                  ))}
                  {companions.length < 3 && (
                    <Text style={{ fontSize: fs(10), color: C.warmGray, alignSelf: 'center' }}>
                      최대 3명 (나 포함 4명)
                    </Text>
                  )}
                </View>
              )}
              {/* 동반자 스코어 공유 옵션은 스코어카드(OCR) 결과 바로 아래로 이동 — 거기서 묻히지 않게(사용자 제보). */}
              <Text style={mS.bigLabel}>날씨</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {['맑음','흐림','바람','비'].map(w => (
                  <TouchableOpacity key={w} style={[mS.chip, weather === w && mS.chipOn]} onPress={() => setWeather(w)}>
                    <Text style={[mS.chipTxt, weather === w && mS.chipTxtOn]}>{w}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={mS.bigLabel}>버디</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <TouchableOpacity onPress={() => setBirdieCount(Math.max(0, birdieCount - 1))} style={mS.countBtn}>
                  <Text style={mS.countBtnTxt}>−</Text>
                </TouchableOpacity>
                <Text style={mS.countVal}>{birdieCount}개</Text>
                <TouchableOpacity onPress={() => setBirdieCount(Math.min(18, birdieCount + 1))} style={mS.countBtn}>
                  <Text style={mS.countBtnTxt}>+</Text>
                </TouchableOpacity>
                {birdieCount === 0 && <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>버디 없음</Text>}
              </View>
              <Text style={mS.bigLabel}>특별한 순간</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {['HOLE IN ONE','EAGLE','ALBATROSS','없음'].map(s => (
                  <TouchableOpacity key={s}
                    style={[mS.chip, (special === s || (s === '없음' && !special)) && mS.chipOn]}
                    onPress={() => setSpecial(s === '없음' ? null : s)}>
                    <Text style={[mS.chipTxt, (special === s || (s === '없음' && !special)) && mS.chipTxtOn]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {special && (
                <View style={mS.specialBox}>
                  <Text style={mS.specialBoxTitle}>{special} 기록</Text>
                  <Text style={mS.bigLabel}>몇번 홀?</Text>
                  <AppTextInput style={mS.input} placeholder="7" placeholderTextColor={C.warmGrayLight}
                    value={specialHole} onChangeText={setSpecialHole} keyboardType="numeric" />
                  <Text style={mS.bigLabel}>파(Par)?</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {['3','4','5'].map(p => (
                      <TouchableOpacity key={p} style={[mS.chip, specialPar === p && mS.chipOn]} onPress={() => setSpecialPar(p)}>
                        <Text style={[mS.chipTxt, specialPar === p && mS.chipTxtOn]}>파{p}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={mS.bigLabel}>거리</Text>
                  <AppTextInput style={mS.input} placeholder="156m" placeholderTextColor={C.warmGrayLight}
                    value={specialDist} onChangeText={setSpecialDist} />
                  <Text style={mS.bigLabel}>사용한 볼</Text>
                  <AppTextInput style={mS.input} placeholder="Titleist Pro V1" placeholderTextColor={C.warmGrayLight}
                    value={specialBall} onChangeText={setSpecialBall} />
                  <Text style={mS.bigLabel}>한마디</Text>
                  <AppTextInput style={mS.input} placeholder="그 순간을 기억하며..." placeholderTextColor={C.warmGrayLight}
                    value={specialMemo} onChangeText={setSpecialMemo} />
                </View>
              )}
              {/* 만족도 — 반성/회고 모먼트라 라벨을 따뜻하게 어필(다른 건조한 라벨과 차별) */}
              <Text style={[mS.bigLabel, { fontSize: fs(13.5), letterSpacing: 0.3, color: C.charcoal, marginBottom: 3 }]}>이번 라운딩, 만족하셨나요?</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: C.warmGray, marginBottom: 8 }}>별점으로 오늘의 만족도를 남겨보세요</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                {[1, 2, 3, 4, 5].map(i => (
                  <TouchableOpacity key={i} onPress={() => setStarRating(i)} activeOpacity={0.6}>
                    <Text style={{ fontSize: fs(28), color: i <= starRating ? '#C9A84C' : '#E8E2D0' }}>★</Text>
                  </TouchableOpacity>
                ))}
                {starRating > 0 && <Text style={{ fontSize: fs(12), color: '#8B8680' }}>{starRating}점</Text>}
              </View>

              </View>
              <View style={cardBox}>
              <SectionHead title="더 남기기" sub="· 선택" />
              <Text style={mS.bigLabel}>코스 태그<Text style={{ color: '#8B8680', fontSize: fs(11), fontFamily: F.sys }}> (중복 가능)</Text></Text>
              {Object.entries(COURSE_TAGS)
                .filter(([category]) => overseas || category !== '해외 특화')
                .map(([category, tags]) => {
                const catColor = COURSE_TAG_COLORS[category];
                return (
                  <View key={category} style={{ marginBottom: 10 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: '#8B8680', marginBottom: 6, letterSpacing: 1 }}>{category}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {tags.map(tag => {
                        const on = selectedTags.includes(tag);
                        return (
                          <TouchableOpacity key={tag} activeOpacity={0.7}
                            style={{
                              borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
                              backgroundColor: on ? catColor.bg : C.bgSecondary,
                              borderWidth: 0.5,
                              borderColor: on ? catColor.bg : C.hairline,
                            }}
                            onPress={() => toggleTag(tag, category)}>
                            <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: on ? catColor.text : C.warmGrayLight }}>{tag}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })}

              <View style={{ marginTop: 6 }}>
                <Text style={mS.bigLabel}>
                  자세한 기록
                  <Text style={{ color: '#8B8680', fontSize: fs(11), fontFamily: F.sys }}> (최대 1000자)</Text>
                </Text>
                {/* 예시 칩 — 누르면 입력칸에 항목이 추가돼 글쓰기 시작점이 된다 */}
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginBottom: 6 }}>
                  뭘 쓸지 막막하면 눌러서 시작해보세요
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {GUIDE_CHIPS.map(c => (
                    <TouchableOpacity key={c} onPress={() => insertGuideChip(c)} activeOpacity={0.7}
                      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                      style={{ backgroundColor: C.bgPrimary, borderWidth: 0.5, borderColor: C.hairline,
                        borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 }}>
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.burgundy }}>+ {c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={{
                  backgroundColor: C.bgSecondary,
                  borderWidth: 0.5, borderColor: C.hairline,
                  borderRadius: 12, padding: 14,
                  minHeight: 140,
                }}>
                  <AppTextInput
                    ref={detailMemoRef}
                    style={{
                      fontFamily: F.sys, fontSize: fs(15),
                      color: C.textPrimary,
                      // multiline TextInput에 lineHeight를 주면 첫 줄이 밀리는 버그가 있어 미지정
                      minHeight: 100, textAlignVertical: 'top',
                    }}
                    placeholder="그날의 라운딩을 자유롭게 남겨보세요"
                    placeholderTextColor={C.warmGrayLight}
                    value={detailMemo}
                    onChangeText={(t) => setDetailMemo(t.slice(0, 1000))}
                    selection={detailSel}
                    onSelectionChange={() => { if (detailSel) setDetailSel(undefined); }}
                    multiline
                    textAlignVertical="top"
                  />
                  <Text style={{ fontSize: fs(10), color: C.warmGray, textAlign: 'right', marginTop: 8 }}>
                    {detailMemo.length} / 1000
                  </Text>
                </View>
              </View>

              {/* 비용 기록 — 접기/펼치기 (선택) */}
              <TouchableOpacity
                onPress={() => setShowCost(v => !v)}
                activeOpacity={0.7}
                style={{
                  marginTop: 14,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  backgroundColor: C.bgSecondary,
                  borderWidth: 0.5, borderColor: C.hairline,
                  borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
                }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.textPrimary }}>
                  💰 비용 기록하기 <Text style={{ color: '#8B8680', fontSize: fs(10), fontWeight: '400' }}>(선택)</Text>
                </Text>
                <Text style={{ fontFamily: F.sys, fontSize: fs(18), color: C.warmGray }}>{showCost ? '−' : '+'}</Text>
              </TouchableOpacity>
              {showCost && (
                <View style={{
                  marginTop: 8, backgroundColor: C.bgSecondary,
                  borderWidth: 0.5, borderColor: C.hairline, borderRadius: 10, padding: 14,
                }}>
                  {/* ① 골프장 결제 — 카드 묶음(그린피+카트비). 보통 한 줄, '세부'는 박스 아래에서 펼침 */}
                  <View style={{ ...costRowS, marginBottom: 0 }}>
                    <Text style={costLabelS}>골프장 결제</Text>
                    {showCourseDetail ? (
                      <Text style={{ width: 120, textAlign: 'right', fontFamily: F.sysSb, fontSize: fs(13), color: C.textPrimary, paddingVertical: 8 }}>
                        {won(num(costs.green) + num(costs.cart) + num(costs.onsite))}
                      </Text>
                    ) : (
                      <AppTextInput
                        style={costInputS} placeholder="0" placeholderTextColor={C.warmGrayLight} keyboardType="numeric"
                        value={costs.field}
                        onChangeText={(t) => setCosts(prev => ({ ...prev, field: t.replace(/[^0-9]/g, '') }))}
                      />
                    )}
                    <Text style={costWonS}>원</Text>
                  </View>
                  {/* 안내 + 세부 토글 — 박스 아래 줄(안내는 왼쪽, 세부는 오른쪽) */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 5, marginBottom: 13, marginLeft: 2 }}>
                    <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray }}>
                      {showCourseDetail ? '그린피·카트비 따로 입력 중' : '그린피·카트비 함께 결제'}
                    </Text>
                    <TouchableOpacity onPress={() => setShowCourseDetail(v => !v)} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}>
                      <Text style={{ fontFamily: F.sysSb, fontSize: fs(11), color: '#A9854A' }}>{showCourseDetail ? '세부 닫기 ▴' : '세부 입력 ▾'}</Text>
                    </TouchableOpacity>
                  </View>
                  {showCourseDetail && (
                    <View style={{ marginLeft: 12, marginBottom: 13 }}>
                      <View style={costRowS}>
                        <Text style={{ ...costLabelS, fontSize: fs(12) }}>그린피</Text>
                        <AppTextInput style={costInputS} placeholder="0" placeholderTextColor={C.warmGrayLight} keyboardType="numeric"
                          value={costs.green} onChangeText={(t) => setCosts(prev => ({ ...prev, green: t.replace(/[^0-9]/g, '') }))} />
                        <Text style={costWonS}>원</Text>
                      </View>
                      <View style={costRowS}>
                        <Text style={{ ...costLabelS, fontSize: fs(12) }}>카트비</Text>
                        <AppTextInput style={costInputS} placeholder="0" placeholderTextColor={C.warmGrayLight} keyboardType="numeric"
                          value={costs.cart} onChangeText={(t) => setCosts(prev => ({ ...prev, cart: t.replace(/[^0-9]/g, '') }))} />
                        <Text style={costWonS}>원</Text>
                      </View>
                      <View style={{ ...costRowS, marginBottom: 0 }}>
                        <Text style={{ ...costLabelS, fontSize: fs(12) }}>그늘집</Text>
                        <AppTextInput style={costInputS} placeholder="0" placeholderTextColor={C.warmGrayLight} keyboardType="numeric"
                          value={costs.onsite} onChangeText={(t) => setCosts(prev => ({ ...prev, onsite: t.replace(/[^0-9]/g, '') }))} />
                        <Text style={costWonS}>원</Text>
                      </View>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 5, marginLeft: 2 }}>음료·간식 등 골프장 카드 정산분</Text>
                    </View>
                  )}
                  {/* ② 캐디피 — 현금 */}
                  <View style={{ ...costRowS, marginBottom: 2 }}>
                    <Text style={costLabelS}>캐디피</Text>
                    <AppTextInput style={costInputS} placeholder="0" placeholderTextColor={C.warmGrayLight} keyboardType="numeric"
                      value={costs.caddie} onChangeText={(t) => setCosts(prev => ({ ...prev, caddie: t.replace(/[^0-9]/g, '') }))} />
                    <Text style={costWonS}>원</Text>
                  </View>
                  <Text style={costHintS}>현금으로 낸 캐디피</Text>
                  {/* ③ 기타 — 식사 등 (내기는 손익이라 아래 별도 줄로 분리) */}
                  <View style={{ ...costRowS, marginBottom: 2 }}>
                    <Text style={costLabelS}>기타</Text>
                    <AppTextInput style={costInputS} placeholder="0" placeholderTextColor={C.warmGrayLight} keyboardType="numeric"
                      value={costs.etc} onChangeText={(t) => setCosts(prev => ({ ...prev, etc: t.replace(/[^0-9]/g, '') }))} />
                    <Text style={costWonS}>원</Text>
                  </View>
                  <Text style={costHintS}>식사 등</Text>
                  {/* ④ 내기 — 손익. 잃었으면 지출(+), 땄으면 총액에서 차감(−). 키보드 마이너스 대신 방향 토글 ([[ledger-bet-pnl]]) */}
                  <View style={{ ...costRowS, marginBottom: 2 }}>
                    <Text style={costLabelS}>내기</Text>
                    <View style={{ flexDirection: 'row', borderWidth: 0.5, borderColor: C.hairline, borderRadius: 7, overflow: 'hidden', marginRight: 8 }}>
                      {[['잃었어요', false], ['땄어요', true]].map(([label, w]) => {
                        const on = betWon === w;
                        return (
                          <TouchableOpacity key={label} onPress={() => setBetWon(w)} activeOpacity={0.7}
                            style={{ paddingHorizontal: 8, paddingVertical: 7, backgroundColor: on ? (w ? '#2E7D5B' : C.burgundy) : 'transparent' }}>
                            <Text style={{ fontFamily: on ? F.sysB : F.sysM, fontSize: fs(11), color: on ? '#fff' : C.warmGray }}>{label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <AppTextInput style={costInputS} placeholder="0" placeholderTextColor={C.warmGrayLight} keyboardType="numeric"
                      value={costs.bet} onChangeText={(t) => setCosts(prev => ({ ...prev, bet: t.replace(/[^0-9]/g, '') }))} />
                    <Text style={costWonS}>원</Text>
                  </View>
                  <Text style={costHintS}>내기는 총 비용에 넣지 않고{'\n'}가계부에서 따로 보여줘요</Text>
                  <View style={{
                    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                    borderTopWidth: 0.5, borderTopColor: C.hairline, paddingTop: 12, marginTop: 2, paddingBottom: 2,
                  }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.textPrimary, lineHeight: fs(22) }}>총 비용</Text>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.burgundy, lineHeight: fs(22) }}>
                      {won(costSpend)}원
                    </Text>
                  </View>
                </View>
              )}
              </View>
              </>)}

              {/* 일상(모멘트) — 본문 텍스트(최대 1000자). 사진은 아래 공용 섹션. */}
              {isMoment && (
                <View style={[cardBox, { marginTop: 6 }]}>
                  {/* 일상 날짜 — 기본 오늘, 선택 가능(과거 일상도 기록). 통계·캘린더 미표시는 kind로 격리 ([[moment-feed-extension]]) */}
                  <Text style={mS.bigLabel}>날짜</Text>
                  <TouchableOpacity style={mS.input} activeOpacity={0.7} onPress={() => setShowDatePicker(true)}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: C.textPrimary }}>
                      {formatDate(date)} ({formatDay(date)})
                    </Text>
                  </TouchableOpacity>
                  <SpinnerPicker visible={showDatePicker} value={date} mode="date" maximumDate={new Date()}
                    onPick={setDate} onClose={() => setShowDatePicker(false)} />
                  <Text style={[mS.bigLabel, { marginTop: 14 }]}>
                    일상 기록
                    <Text style={{ color: '#8B8680', fontSize: fs(11), fontFamily: F.sys }}> (사진만 올려도 돼요 · 최대 1000자)</Text>
                  </Text>
                  <View style={{ backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline,
                    borderRadius: 12, padding: 14, minHeight: 140 }}>
                    <AppTextInput
                      style={{ fontFamily: F.sys, fontSize: fs(15), color: C.textPrimary,
                        minHeight: 100, textAlignVertical: 'top' }}
                      placeholder="스크린 기록과 사진, 연습장 기록, 그 외 친구들과 공유할 일상을 남겨보세요"
                      placeholderTextColor={C.warmGrayLight}
                      value={memo}
                      onChangeText={(t) => setMemo(t.slice(0, 1000))}
                      multiline
                      textAlignVertical="top"
                    />
                    <Text style={{ fontSize: fs(10), color: C.warmGray, textAlign: 'right', marginTop: 8 }}>
                      {memo.length} / 1000
                    </Text>
                  </View>
                </View>
              )}

              {/* 공개 범위 — 라운딩·일상 공용(두 분기 바깥). 위로 올리려다 일상 기록과 공유되는 문제가 있어
                  원래 자리(하단 공용)에 유지(사용자 2026-07-27: 위치는 중요치 않다고 함). 글씨·칩만 키움. */}
              <View style={cardBox}>
              <SectionHead title="공개 범위" sub="· 누가 볼 수 있나요" />
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                {[{ key: 'friends', label: '친구 전체' },
                  ...(companionUids.length ? [{ key: 'companions', label: '동반자만' }] : []),
                  ...friendData.friendGroups.map(g => ({ key: g.id, label: g.name })),
                  { key: 'private', label: '나만 보기' }].map(opt => {
                  const on = privacy.includes(opt.key);
                  return (
                    <TouchableOpacity key={opt.key} style={[mS.chip, { paddingVertical: 9, paddingHorizontal: 16 }, on && mS.chipOn]} onPress={() => togglePrivacy(opt.key)}>
                      <Text style={[mS.chipTxt, { fontSize: fs(13.5) }, on && mS.chipTxtOn]}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {privacy.includes('companions') ? (
                <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: C.warmGray, marginTop: 7, lineHeight: 17 }}>
                  이번 라운딩 동반자 중 <Text style={{ fontFamily: F.sysB, color: C.charcoal }}>친구로 등록된 {companionUids.length}명</Text>에게만 보여요
                  {companions.length > companionUids.length ? ` (이름만 적은 ${companions.length - companionUids.length}명은 볼 수 없어요)` : ''}
                </Text>
              ) : (!privacy.includes('friends') && !privacy.includes('private') && (
                <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: C.warmGray, marginTop: 7, lineHeight: 17 }}>
                  {privacy.map(id => (friendData.friendGroups.find(g => g.id === id) || {}).name).filter(Boolean).join(' · ')} 그룹 친구에게만 보여요 (여러 그룹 선택 가능)
                </Text>
              ))}

              </View>
              <View style={cardBox}>
              <SectionHead title="사진 · 영상" sub="· 선택" />
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(11.5), color: C.warmGray, marginTop: -2, marginBottom: 8 }}>사진 {addPhotos.length}/{MAX_PHOTOS} · 영상은 {MAX_VIDEOS}개까지</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {addPhotos.map((item, i) => (
                    <AddPhotoThumb key={i} item={item} isCover={i === 0}
                      onMenu={() => handleThumbMenu(i)} />
                  ))}
                  {addPhotos.length < MAX_PHOTOS && (
                    <TouchableOpacity onPress={pickPhoto} disabled={photoBusy}
                      style={{ width: 80, height: 80, borderRadius: 8, backgroundColor: C.bgSecondary,
                        borderWidth: 0.5, borderColor: C.hairline,
                        alignItems: 'center', justifyContent: 'center' }}>
                      {photoBusy
                        ? <Spinner size={22} color={C.warmGray} />
                        : <Text style={{ fontSize: fs(24), color: C.warmGray }}>+</Text>}
                    </TouchableOpacity>
                  )}
                </ScrollView>
              </View>
              </View>
            </KeyboardAwareScrollView>
            {/* C. 고정 하단 바 — 항상 보이는 취소/저장 + 검증 에러(스크롤 끝까지 안 내려가도 닫기·저장 가능) */}
            <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: insets.bottom + 8, borderTopWidth: 0.5, borderTopColor: C.hairline }}>
              {saveError ? (
                <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: '#6B1E2A', textAlign: 'center', marginBottom: 8 }}>{saveError}</Text>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity onPress={() => { cleanupPreUploads(); reset(); onClose(); }} activeOpacity={0.8}
                  style={{ paddingVertical: 15, paddingHorizontal: 22, borderRadius: 12, borderWidth: 1, borderColor: C.hairline, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.warmGray }}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[mS.saveBtn, { flex: 1, marginTop: 0, backgroundColor: (!canSave || saving) ? '#B8B3AB' : (isEdit ? C.charcoal : C.burgundy) }]}
                  onPress={handleSave} disabled={!canSave || saving} activeOpacity={0.85}>
                  <Text style={mS.saveBtnTxt}>{saving ? '저장 중…' : (isEdit ? '수정 완료' : '저장하기')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
        </KeyboardProvider>
        {/* 인-모달 알럿/메뉴 — 글로벌 showAppAlert는 Modal 위에서 터치 충돌, 오버레이 View로 처리 */}
        <OverlayAlert data={overlay} onClose={() => setOverlay(null)} />
        <ScorecardPreviewModal
          visible={!!scPreviewUris}
          uris={scPreviewUris || []}
          onCancel={() => setScPreviewUris(null)}
          onConfirm={(rotatedUris) => { setScPreviewUris(null); runScorecardExtract(rotatedUris); }} />
        <ScorecardReviewModal
          visible={scReview}
          rows={scRows}
          holePars={holePars}
          failed={scFailed}
          failedReason={scFailReason}
          lowConfidence={scLowConf}
          lowReasons={scNotes}
          rotating={scRotating}
          onRotate={scOrigUrisRef.current.length ? handleRotateScorecard : null}
          onConfirm={handleScorecardConfirm}
          onClose={() => setScReview(false)} />
        <CropEditorModal
          visible={cropIdx !== null}
          aspect="cover"
          uri={cropIdx !== null ? resolvePhotoUri(typeof addPhotos[cropIdx] === 'object' ? (addPhotos[cropIdx].orig || addPhotos[cropIdx].uri) : addPhotos[cropIdx]) : null}
          onClose={() => setCropIdx(null)}
          /* 사진 전체 담기 — 자르기를 취소하고 원본 그대로 되돌린다(크롭·초점 정보 제거).
             피드가 사진 비율에 맞는 틀을 고르고, 안 맞으면 흐린 배경 위에 통째로 보여주므로 사진이 다 보인다.
             크롭 결과물은 버리고 보관해둔 orig(원본 식별자)를 그대로 쓰므로 재저장·용량 증가가 없다. */
          onUseWhole={() => {
            setAddPhotos(prev => {
              const next = [...prev];
              const cur = next[cropIdx];
              next[cropIdx] = typeof cur === 'object' ? (cur.orig || cur.uri) : cur;
              return next;
            });
            setCropIdx(null);
          }}
          onSave={async (croppedUri) => {
            let persisted;
            try { persisted = await persistPhoto(croppedUri); }
            catch (e) { setCropIdx(null); setOverlay({ title: '사진 저장에 실패했어요', message: '잠시 후 다시 시도해주세요.' }); return; }
            setAddPhotos(prev => {
              const next = [...prev];
              const cur = next[cropIdx];
              const origStored = typeof cur === 'object' ? (cur.orig || cur.uri) : cur; // 재편집용 원본 보관
              next[cropIdx] = { uri: persisted, orig: origStored };
              return next;
            });
            setCropIdx(null);
          }} />
        <PhotoEditModal
          visible={editorIndex !== null}
          uri={editorIndex !== null ? resolvePhotoUri(typeof addPhotos[editorIndex] === 'object' ? addPhotos[editorIndex].uri : addPhotos[editorIndex]) : null}
          onClose={() => setEditorIndex(null)}
          onSave={async (newUri) => {
            let persisted;
            try { persisted = await persistPhoto(newUri); }
            catch (e) { setEditorIndex(null); setOverlay({ title: '사진 저장에 실패했어요', message: '잠시 후 다시 시도해주세요.' }); return; }
            setAddPhotos(prev => {
              const next = [...prev];
              const orig = next[editorIndex];
              next[editorIndex] = typeof orig === 'object' ? { ...orig, uri: persisted } : persisted;
              return next;
            });
            setEditorIndex(null);
          }} />
        {/* 동반자 친구 선택 — 본명 마스킹 표시, 다중선택. friendUid 캡처([[companion-design]] Phase A) */}
        <FriendSelectModal
          visible={showCompanionPicker}
          mode="companion"
          friends={friends}
          initial={{ selectedUids: companions.filter(c => c.friendUid).map(c => c.friendUid) }}
          onClose={() => setShowCompanionPicker(false)}
          onConfirm={onPickCompanionFriends}
        />
        {/* 일정에서 불러오기 — 미기록 라운딩 선택(카드형, 진입 선택 시트와 동일 룩). 고르면 applySchedule로 폼 채움. */}
        <Modal visible={loadPickerOpen} transparent animationType="fade" onRequestClose={() => setLoadPickerOpen(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setLoadPickerOpen(false)} />
            <View style={{ backgroundColor: C.bgPrimary, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 10, paddingBottom: 24 + insets.bottom }}>
              <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.hairline, marginBottom: 12 }} />
              <Text style={{ fontFamily: F.sysB, fontSize: fs(17), color: C.charcoal, paddingHorizontal: 20, marginBottom: 4 }}>어떤 라운딩인가요</Text>
              <Text style={{ fontFamily: F.sys, fontSize: fs(12.5), color: C.warmGray, paddingHorizontal: 20, marginBottom: 14 }}>
                고르면 자동으로 채워져요
              </Text>
              <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={{ paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
                {loadableRounds.length > 0 ? loadableRounds.map((s, i) => (
                  <TouchableOpacity key={s.id || i} activeOpacity={0.85} onPress={() => applySchedule(s)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 10,
                      backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 0.5, borderColor: C.hairline,
                      paddingVertical: 14, paddingHorizontal: 15 }}>
                    <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(107,30,42,0.08)',
                      alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="flag" size={20} color={C.burgundy} strokeWidth={1.8} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(15.5), color: C.charcoal }} numberOfLines={1}>{s.course}</Text>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, marginTop: 3 }}>
                        {s.date} {s.day}{s.time ? ` · ${s.time}` : ''}{s.members ? ` · ${s.members}명` : ''}
                      </Text>
                    </View>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.burgundy }}>선택</Text>
                  </TouchableOpacity>
                )) : (
                  <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, textAlign: 'center', paddingVertical: 16 }}>
                    미기록으로 잡힌 라운딩이 없어요
                  </Text>
                )}
              </ScrollView>
              {/* 폰 캘린더에서 가져오기 — 예정 라운딩으로 등록 안 한 지난 라운딩(과거). 열 때 이 시트는 닫아 2단 모달로 유지. */}
              <TouchableOpacity onPress={() => { setLoadPickerOpen(false); setCalImportOpen(true); }} activeOpacity={0.85}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 11, marginHorizontal: 20, marginTop: 10,
                  backgroundColor: C.bgSecondary, borderRadius: 14,
                  paddingVertical: 14, paddingHorizontal: 15 }}>
                <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(26,61,82,0.08)',
                  alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="calendar" size={20} color={C.navy} strokeWidth={1.8} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.sysB, fontSize: fs(15), color: C.charcoal }}>폰 캘린더에서 가져오기</Text>
                  <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginTop: 2 }}>등록 안 한 지난 라운딩</Text>
                </View>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(14), color: C.navy }}>›</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
        {/* 폰 캘린더(지난 라운딩) 가져오기 — mode='past'로 오늘 포함 과거만 읽음. onPick→폼 채움. */}
        <CalendarImportModal visible={calImportOpen} mode="past"
          onClose={() => setCalImportOpen(false)} onPick={applyCalendarEvent} />
    </Modal>
  );
}

function AddPhotoThumb({ item, isCover, onMenu }) {
  const isVideo = typeof item === 'object' && item?.type === 'video';
  const src = resolvePhotoUri(typeof item === 'object' ? item.uri : item);
  const [thumb, setThumb] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!isVideo) return;
    (async () => {
      try {
        const { uri } = await VideoThumbnails.getThumbnailAsync(src, { time: 0, quality: 0.6 });
        if (!cancelled) setThumb(uri);
      } catch (e) {
        if (!cancelled) console.warn('thumbnail failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [isVideo, src]);

  const imgStyle = { width: 80, height: 80, borderRadius: 8 };

  return (
    // 사진 탭 → 편집 메뉴(대표지정·회전·자르기·삭제). 상세 '편집'을 수정/추가 한 곳으로 통합.
    <TouchableOpacity activeOpacity={0.85} onPress={onMenu} style={{ width: 80, height: 80, marginRight: 8 }}>
      {isVideo ? (
        <View style={imgStyle}>
          {thumb ? (
            <Image source={{ uri: thumb }} style={imgStyle} />
          ) : (
            <View style={[imgStyle, { backgroundColor: '#2A2622' }]} />
          )}
          <View style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <View style={{
              width: 28, height: 28, borderRadius: 14,
              backgroundColor: 'rgba(0,0,0,0.55)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ color: '#fff', fontSize: fs(12), marginLeft: 2 }}>▶</Text>
            </View>
          </View>
        </View>
      ) : (
        <Image source={{ uri: src }} style={imgStyle} />
      )}
      {/* 대표사진 배지(첫 장) */}
      {isCover && (
        <View style={{ position: 'absolute', top: 3, left: 3, backgroundColor: C.burgundy,
          borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
          <Text style={{ fontFamily: F.sys, fontSize: fs(8), color: '#fff' }}>대표</Text>
        </View>
      )}
      {/* 탭하여 편집 안내 */}
      <View style={{ position: 'absolute', bottom: 4, left: 4,
        backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
        <Text style={{ color: '#fff', fontSize: fs(9) }}>✎ 편집</Text>
      </View>
    </TouchableOpacity>
  );
}
