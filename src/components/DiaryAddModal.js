import React, { useState, useEffect, useRef } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, Image } from 'react-native';
import AppTextInput from './common/AppTextInput';
import { KeyboardProvider, KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { loadFriendData, resolveGroupAudience, DEFAULT_FRIEND_GROUPS } from '../utils/friendGroups';
import { loadMyFriendsEnriched } from '../utils/friends';   // 동반자 친구 선택용([[companion-design]] Phase A)
import { getScheduleGroup } from '../utils/scheduleShares';  // 전파 단체 일정 → 멤버 전원 동반자 후보 해석
import { FriendSelectModal } from './FriendSelectModal';
import { Icon, GreenFlag } from './common/Icon'; // 라운딩=그린·핀, 일상=사진 커스텀 아이콘
import { Spinner } from './common/Spinner';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { C, F, fs } from '../constants/colors';
import { COURSE_TAGS, COURSE_TAG_COLORS, COURSE_TAG_OPPOSITES, WEEKDAYS } from '../constants/data';
import { searchGolfCourses } from '../utils/golfCourses';
import { addUserCourse, findUserCourseById } from '../utils/userCourses';
import { mS } from '../styles/mS';
import { UserContext } from '../contexts/UserContext';
import { SchedulesContext } from '../contexts/SchedulesContext';
import { persistPhotos, persistPhoto, resolvePhotoUri } from '../utils/photoStorage';
import { compressMedia } from '../utils/imageCompress';
import { useOverlayBackHandler } from '../utils/useOverlayBackHandler';
import { pickScorecardImage, recognizeScorecard, scoreBreakdown } from '../utils/scorecardOcr';
import { ScorecardReviewModal } from './ScorecardReviewModal';
import { createScoreShare } from '../utils/roundScoreShares';   // 동반자 스코어 공유([[companion-design]] §11 Phase C)
import { getUid } from '../utils/firebase';
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

// '더 기록하기' 예시 칩 — 누르면 입력칸에 항목이 삽입돼 글쓰기 시작점이 된다
const GUIDE_CHIPS = ['어느 코스', 'MVP 샷', '아쉬웠던 홀', '코스·잔디 상태', '동반자 소감', '다음에 기억할 것'];

// 폼 섹션 헤더 — 위 구분선(hairline) + 버건디 바 + 제목으로 섹션을 시각적으로 분리. first=첫 섹션(상단 구분선 생략).
function SectionHead({ title, sub, first }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7,
      marginTop: first ? 8 : 22, paddingTop: first ? 0 : 18,
      borderTopWidth: first ? 0 : 0.5, borderTopColor: C.hairline, marginBottom: 10 }}>
      <View style={{ width: 3, height: 14, borderRadius: 2, backgroundColor: C.burgundy }} />
      <Text style={{ fontFamily: F.sysB, fontSize: fs(13.5), color: C.charcoal, letterSpacing: 0.5 }}>
        {title}
        {sub ? <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, letterSpacing: 0 }}> {sub}</Text> : null}
      </Text>
    </View>
  );
}

export function DiaryAddModal({ visible, onClose, onSave, initial, isEdit }) {
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
  const [kakaoResults, setKakaoResults] = useState([]);
  const [kakaoSearching, setKakaoSearching] = useState(false);
  const debounceRef = useRef(null);
  const detailMemoRef = useRef(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [date, setDate] = useState(new Date());

  // 안드로이드 뒤로가기 — 날짜 picker 열려있으면 그것부터 닫기
  useOverlayBackHandler(showDatePicker, () => setShowDatePicker(false));
  const [score, setScore] = useState('');
  const [scoreCardOption, setScoreCardOption] = useState('later');
  // 스코어카드 OCR — holeScores(확정된 18홀), 검토 모달 상태. recognizeScorecard는 현재 스텁.
  const [holeScores, setHoleScores] = useState(null);
  const [holePars, setHolePars] = useState(null); // 스코어카드 par 행(스텁 mock) — 버디 자동집계용
  const [scRows, setScRows] = useState([]);
  const [scFailed, setScFailed] = useState(false); // OCR 인식 실패/숫자 부족 → 직접 입력 안내
  const [scLowConf, setScLowConf] = useState(false); // OCR 저신뢰(인쇄 합계와 안 맞음) → 확인·수정 강조
  const [scReview, setScReview] = useState(false);
  const [scBusy, setScBusy] = useState(false);
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
      // 선택 시 반대쌍(그린 빠름↔느림 등)은 자동 해제 — 다른 속성과는 공존
      const opp = COURSE_TAG_OPPOSITES[tag];
      const base = opp ? prev.filter(t => t !== opp) : prev;
      return [...base, tag];
    });
  };
  // 예시 칩 탭 → '더 기록하기' 입력칸에 '라벨: ' 삽입 + 포커스
  const insertGuideChip = (label) => {
    setDetailMemo(prev => {
      const sep = prev && !prev.endsWith('\n') ? '\n' : '';
      const next = `${prev}${sep}${label}: `;
      return next.length <= 1000 ? next : prev;
    });
    detailMemoRef.current?.focus();
  };
  const [special, setSpecial] = useState(null);
  const [specialHole, setSpecialHole] = useState('');
  const [specialPar, setSpecialPar] = useState('3');
  const [specialDist, setSpecialDist] = useState('');
  const [specialBall, setSpecialBall] = useState('');
  const [specialMemo, setSpecialMemo] = useState('');
  const [addPhotos, setAddPhotos] = useState([]);
  const [photoBusy, setPhotoBusy] = useState(false); // 사진 추가(압축·영속) 처리 중 — 끝나기 전 저장 시 사진 누락되던 경합 방지
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
  const [companionInput, setCompanionInput] = useState('');
  const [friends, setFriends] = useState([]);                 // 동반자 친구 선택 목록
  const [shareScores, setShareScores] = useState(false);      // 동반자에게 스코어 공유(OCR 전체 행) opt-in ([[companion-design]] §11)
  const [showCompanionPicker, setShowCompanionPicker] = useState(false);

  const pickPhoto = async () => {
    const remaining = MAX_PHOTOS - addPhotos.length;
    if (remaining <= 0) return;
    setPhotoBusy(true); // 처리 끝날 때까지 저장 비활성 — 경합으로 사진 누락 방지
    try {
      // 사진첩 접근 권한 — 안드 일부/구버전·릴리즈 빌드에서 권한 없으면 갤러리가 조용히 안 열림.
      //   안드13+ 포토피커는 권한 없이도 동작하므로, 거부여도 일단 시도하고 열기 실패 시에만 안내(작동하는 피커 차단 방지).
      const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) {
        await ImagePicker.requestMediaLibraryPermissionsAsync();
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
      const assets = result.assets.filter(a => !(a.type === 'video' && a.duration && a.duration > MAX_VIDEO_SEC * 1000 + 500));
      if (overLimit.length) {
        setOverlay({ title: '동영상이 너무 길어요', message: `동영상은 최대 ${MAX_VIDEO_SEC}초까지 올릴 수 있어요.\n길이를 넘는 ${overLimit.length}개는 제외했어요.` });
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
      }
    } catch (e) {
      if (__DEV__) console.warn('[DiaryAddModal] pickPhoto failed', e?.message);
      setOverlay({ title: '사진을 불러오지 못했어요', message: '사진 접근 권한을 허용했는지 확인하거나\n잠시 후 다시 시도해주세요.' });
    } finally {
      setPhotoBusy(false);
    }
  };

  // 스코어카드 사진 → 인식(현재 스텁) → 검토 모달 열기. source: 'gallery' | 'camera'
  const handleScorecardPick = async (source) => {
    if (scBusy) return;
    setScBusy(true);
    try {
      const img = await pickScorecardImage(source);
      if (!img) return; // 취소·권한거부
      const res = await recognizeScorecard(img.uri);
      setScRows(res.rows || []);
      setHolePars(Array.isArray(res.pars) ? res.pars : null); // par 행(있으면) — 버디 자동집계
      setScFailed(!!res.error || !(res.rows || []).length);   // 인식 실패/숫자 부족 → 빈 표 직접 입력 안내
      setScLowConf(!!res.lowConfidence);                       // 합계 불일치 → 저신뢰 안내(확인·수정 강조)
      setScReview(true);
    } catch (e) {
      if (__DEV__) console.warn('[DiaryAdd] scorecard pick fail', e?.message);
    } finally {
      setScBusy(false);
    }
  };

  // 검토 모달 확정 — 18홀 저장 + 총타를 스코어 입력란에 자동 채움
  const handleScorecardConfirm = ({ holeScores: hs, total }) => {
    setHoleScores(hs);
    if (Number.isFinite(total) && total > 0) setScore(String(total));
    // par(스텁 mock)가 있으면 버디 자동 집계 → 버디 카운터 자동 입력 (이후 수동 수정 가능)
    const bd = scoreBreakdown(hs, holePars);
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
  };

  // 단체 참여자 목록에서 본인 조 동반자 선택(토글) — friendUid 있으면 그걸로, 없으면 이름으로 동일판정. 최대 3명.
  const sameComp = (a, b) => (a.friendUid && b.friendUid) ? a.friendUid === b.friendUid : a.name === b.name;
  const toggleRosterComp = (p) => {
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
    setDate(new Date());
    setScore(''); setWeather('맑음'); setMemo(''); setBirdieCount(0);
    setSpecial(null); setSpecialHole(''); setSpecialPar('3');
    setSpecialDist(''); setSpecialBall(''); setSpecialMemo('');
    setScoreCardOption('later');
    setHoleScores(null); setHolePars(null); setScRows([]); setScReview(false); setScFailed(false); setScLowConf(false);
    setShowCost(false); setShowCourseDetail(false); setCosts({ field: '', green: '', cart: '', onsite: '', caddie: '', etc: '', bet: '' }); setBetWon(false);
    setAddPhotos([]);
    setStarRating(0); setSelectedTags([]);
    setDetailMemo('');
    setPrivacy(['friends']);
    setCompanions([]); setCompanionInput(''); setShareScores(false); setTeamRoster([]);
    setSubCourse('');
    setOverseas(false); setCountry('');
    setKind('round');
  };

  useEffect(() => {
    if (!visible) return;
    loadFriendData().then(setFriendData).catch(() => {}); // 공개범위 그룹 선택·해석용 ([[friend_groups]])
    loadMyFriendsEnriched().then(f => setFriends(f || [])).catch(() => {}); // 동반자 친구 선택용([[companion-design]] Phase A)
    if (isEdit && initial) {
      setCourseSearch(initial.course || '');
      setSelectedCourse(initial.course || '');
      if (initial.courseId) {
        findUserCourseById(initial.courseId).then(c => { if (c) setSelectedCourseObj(c); });
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
        setPrivacy(v === 'group'
          ? ((Array.isArray(initial.audienceGroupIds) && initial.audienceGroupIds.length) ? initial.audienceGroupIds : ['friends'])
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
        findUserCourseById(initial.courseId).then(c => { if (c) setSelectedCourseObj(c); });
      }
      // 전파 단체 일정 — 그룹(groupId)을 직접 읽어 멤버 전원을 동반자 후보(roster)로(단체 모집과 동일 UX, 2026-06-26).
      //   수신자 파생 일정의 companions엔 초대자 1명만 담겨 그것만으론 같이 친 사람을 못 고름 → 그룹에서 전원 해석.
      //   멤버(나 제외)가 3명 초과면 teamRoster로 본인 조 3명 직접 선택, 이하면 그대로 자동 채움.
      if (initial?.groupId) {
        (async () => {
          try {
            const me = await getUid();
            const g = await getScheduleGroup(initial.groupId);
            if (!g) return;
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
  }, [visible, isEdit, initial]);

  const [saveError, setSaveError] = useState('');

  const isMoment = kind === 'moment';
  const finalCourseLive = selectedCourse || courseSearch.trim();
  const canSave = isMoment
    ? ((!!memo.trim() || addPhotos.length > 0) && !photoBusy) // 일상: 글만/사진만이라도 OK
    : (!!finalCourseLive && !!score && !isNaN(parseInt(score)) && parseInt(score) > 0 && !!memo.trim() && !photoBusy);

  const num = (v) => parseInt(v) || 0;
  const courseAmt = showCourseDetail ? (num(costs.green) + num(costs.cart) + num(costs.onsite)) : num(costs.field); // 골프장 결제(그린피+카트+그늘집)
  const betSigned = (betWon ? -1 : 1) * num(costs.bet); // 내기 — 땄으면 음수(총액 차감), 잃으면 양수 ([[ledger-bet-pnl]])
  const costTotal = courseAmt + num(costs.caddie) + num(costs.etc) + betSigned; // 저장용 — 내기 포함(보기서 total−bet으로 분리, 마이그레이션 불필요 [[ledger-bet-pnl]])
  const costSpend = courseAmt + num(costs.caddie) + num(costs.etc); // 표시용 '총 비용' — 내기 제외(정산 분리, 입력↔보기 일관)
  // 입력 항목이 하나라도 있으면 저장 — 크게 딴 날(총액 0·음수)도 기록되게(총액>0 가드 폐지) ([[ledger-bet-pnl]])
  const anyCost = courseAmt > 0 || num(costs.caddie) > 0 || num(costs.etc) > 0 || num(costs.bet) > 0;
  const won = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  // 공개범위 복수선택 — 친구전체·나만보기는 단독, 그룹은 복수 토글(여러 그룹 동시 공개) ([[friend_groups]])
  const togglePrivacy = (key) => {
    if (key === 'friends' || key === 'private') { setPrivacy([key]); return; }
    setPrivacy(prev => {
      const groupsOnly = prev.filter(k => k !== 'friends' && k !== 'private');
      const next = groupsOnly.includes(key) ? groupsOnly.filter(k => k !== key) : [...groupsOnly, key];
      return next.length ? next : ['friends']; // 그룹을 다 해제하면 친구 전체로 복귀(빈 공개범위 방지)
    });
  };

  const handleSave = () => {
    // 공개범위 해석 — friends/private은 단독, 그룹(복수)이면 group + 선택 그룹들 멤버 합집합 스냅샷 ([[friend_groups]])
    let vis;
    if (privacy.includes('private')) {
      vis = { visibility: 'private' };
    } else if (privacy.includes('friends')) {
      vis = { visibility: 'friends' };
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
      const mPayload = {
        kind: 'moment',
        date: formatDate(date), day: formatDay(date), // 기본 오늘 (캘린더 미표시·작성시각 정렬)
        memo: memo.trim(), detailMemo: '',
        photos: addPhotos,
        ...vis,
        score: null, course: '', courseId: null, courseLoc: null,
        holeScores: null, holePars: null, birdieCount: 0,
        weather: null, special: null, specialHole: null, specialPar: null,
        specialDist: '', specialBall: '', specialMemo: '',
        starRating: 0, tags: [], cost: null,
        companions: [{ name: userProfile.nickname, isMe: true }],
        overseas: false, country: '', scheduleId: null,
      };
      if (isEdit) onSave('diary-edit', { id: initial.id, ...mPayload });
      else onSave('diary', mPayload);
      reset(); onClose();
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
    if (!memo.trim()) {
      setSaveError('한줄 메모를 입력해주세요');
      return;
    }
    setSaveError('');
    const payload = {
      course: finalCourse, date: formatDate(date), day: formatDay(date),
      score: parseInt(score) || 0, holeScores, holePars, weather, memo, birdieCount, ...vis,
      special, specialHole: parseInt(specialHole),
      specialPar: parseInt(specialPar) || null,
      specialDist, specialBall, specialMemo,
      photos: addPhotos,
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
      // 일정 진입 동선이면 initial.scheduleId가 prefill됨. 수정 시도 기존 값 유지.
      // 같은 날 일정 N건 + 다이어리 매칭의 비대칭 차단([[home-multi-schedule-same-day]] 룰3).
      scheduleId: initial?.scheduleId || null,
      overseas,
      country: overseas ? country.trim() : '',
    };
    if (isEdit) {
      onSave('diary-edit', { id: initial.id, ...payload });
    } else {
      onSave('diary', payload);
    }
    // 동반자에게 스코어 공유 — OCR 전체 행(scRows)을 친구 동반자에게. 수신자가 자기 행 골라 본인 기록에 파생.
    //   best-effort(fire-and-forget) — 라운딩 저장 자체는 위에서 끝났으므로 공유 실패가 저장을 막지 않음. ([[companion-design]] §11)
    if (shareScores && Array.isArray(scRows) && scRows.length >= 2) {
      const audienceUids = companions.filter(c => c.friendUid).map(c => c.friendUid);
      if (audienceUids.length) {
        (async () => {
          try {
            const uid = await getUid();
            await createScoreShare({
              authorUid: uid,
              authorName: userProfile.nickname || userProfile.realName || '',
              round: {
                course: finalCourse, date: formatDate(date), day: formatDay(date),
                courseId: payload.courseId, courseLoc: payload.courseLoc, holePars,
                ...(initial?.scheduleId ? { scheduleId: initial.scheduleId } : {}),
              },
              rows: scRows,
              audienceUids,
            });
          } catch (e) { if (__DEV__) console.warn('[scoreShare] create fail', e?.message); }
        })();
      }
    }
    reset(); onClose();
  };


  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { reset(); onClose(); }}>
        {/* KeyboardProvider — RN Modal은 별도 네이티브 윈도우라 모달 안 KAS는 자체 Provider 필요 */}
        <KeyboardProvider>
        <View style={mS.mask}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => { reset(); onClose(); }} />
          <View style={[mS.sheet, { paddingBottom: 20 + insets.bottom }]}>
            <TouchableOpacity onPress={() => { reset(); onClose(); }} activeOpacity={0.7}
              style={{ alignItems: 'center', paddingVertical: 10 }}>
              <View style={mS.handle} />
            </TouchableOpacity>
            {/* KeyboardAwareScrollView — 포커스 입력칸을 키보드 위로 자동 스크롤(iOS·안드 공통) */}
            <KeyboardAwareScrollView style={{ flexShrink: 1, padding: 20, paddingTop: 0 }} showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled" bottomOffset={24}>
              {/* 상위 분기: 라운딩 기록 | 일상 — 아이콘 카드 2개(아이콘+제목+한줄설명).
                  카드형이라 아래 [국내|해외] 작은 칩과 모양·높이가 전혀 달라 안 헷갈리고, 설명으로 차이도 바로 전달.
                  편집은 토글 잠금(round↔moment 전환 금지: 데이터·통계 정합성)이라 제목 텍스트로 표시. */}
              {!isEdit ? (
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4, marginBottom: 12 }}>
                  {[
                    { v: 'round', label: '라운딩 기록', sub: '스코어·코스' },
                    { v: 'moment', label: '일상', sub: '글·사진' },
                  ].map(opt => {
                    const on = kind === opt.v;
                    // 라운딩=세이지그린(골프), 일상=버건디 — 선택 시 박스 액센트색 분기
                    const accent = opt.v === 'round' ? '#6E8F52' : C.burgundy;
                    return (
                      <TouchableOpacity key={opt.v} activeOpacity={0.85} onPress={() => setKind(opt.v)}
                        style={{ flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 14,
                          borderWidth: 1.5,
                          borderColor: on ? accent : C.hairline,
                          backgroundColor: on ? (accent + '12') : C.bgSecondary }}>
                        <View style={{ marginBottom: 5, height: fs(28), justifyContent: 'center' }}>
                          {opt.v === 'round'
                            ? <GreenFlag size={fs(27)} />
                            : <Icon name="pen" size={fs(26)} color={on ? accent : C.charcoal} strokeWidth={1.8} />}
                        </View>
                        <Text style={{ fontFamily: on ? F.sysB : F.sysM, fontSize: fs(14),
                          color: on ? accent : C.charcoal }}>{opt.label}</Text>
                        <Text style={{ fontFamily: F.sys, fontSize: fs(11),
                          color: on ? accent : C.warmGray, marginTop: 2 }}>{opt.sub}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <Text style={mS.title}>{isMoment ? '일상 기록 수정' : '라운딩 기록 수정'}</Text>
              )}
              {kind === 'round' && (<>
              <SectionHead title="라운딩 정보" first />
              {/* 국내 / 해외 */}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                {[['국내', false], ['해외', true]].map(([l, v]) => (
                  <TouchableOpacity key={l} activeOpacity={0.7}
                    onPress={() => { setOverseas(v); setKakaoResults([]); }}
                    style={[mS.chip, overseas === v && mS.chipOn, { flex: 1, alignItems: 'center' }]}>
                    <Text style={[mS.chipTxt, overseas === v && mS.chipTxtOn]}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[mS.bigLabel, { color: '#6B1E2A' }]}>골프장 <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: '#6B1E2A' }}>(필수)</Text></Text>
              <AppTextInput style={[mS.input, { fontSize: fs(16), fontFamily: F.sysSb }]}
                placeholder={overseas ? '골프장 이름 입력' : '골프장 검색 또는 직접 입력...'}
                placeholderTextColor={C.warmGrayLight} value={courseSearch}
                autoCorrect={false} autoCapitalize="none"
                onChangeText={t => { setCourseSearch(t); setSelectedCourse(''); setSelectedCourseObj(null); }} />
              {!overseas && (
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 6, lineHeight: 16 }}>
                  💡 검색 결과에서 선택하면 지역 분류·100대 코스가 정확해져요
                </Text>
              )}
              {!overseas && kakaoSearching && (
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 4 }}>검색 중...</Text>
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
              {showDatePicker && !dateLocked && (
                <DateTimePicker value={date} mode="date" display="spinner"
                  onChange={(e, d) => { setShowDatePicker(false); if (d) setDate(d); }}
                  maximumDate={new Date()} locale="ko" />
              )}
              <Text style={[mS.bigLabel, { color: '#6B1E2A' }]}>스코어 <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: '#6B1E2A' }}>(필수)</Text></Text>
              <AppTextInput style={[mS.input, { fontSize: fs(16), fontFamily: F.sysSb }]} placeholder="타수 입력"
                placeholderTextColor={C.warmGrayLight} value={score}
                onChangeText={setScore} keyboardType="numeric" />

              {/* 스코어카드 등록 — 점수 입력 없이도 노출 (OCR이 점수를 채우므로 선행 입력 불필요) */}
              <View style={{ marginBottom: 10 }}>
                  <Text style={mS.bigLabel}>스코어카드 등록할까요?</Text>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {[
                      { key: 'photo', label: '사진으로 등록' },
                      { key: 'later', label: '나중에' },
                    ].map(opt => (
                      <TouchableOpacity key={opt.key}
                        style={[mS.chip, scoreCardOption === opt.key && mS.chipOn]}
                        onPress={() => setScoreCardOption(opt.key)}>
                        <Text style={[mS.chipTxt, scoreCardOption === opt.key && mS.chipTxtOn]}>{opt.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {/* 사진으로 등록 — 갤러리(권장)/촬영. 인식 결과는 검토 모달에서 확인·수정 후 확정 */}
                  {scoreCardOption === 'photo' && !holeScores && (
                    <View style={{ marginTop: 10 }}>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity disabled={scBusy} activeOpacity={0.85} onPress={() => handleScorecardPick('gallery')}
                          style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
                            backgroundColor: C.burgundy, opacity: scBusy ? 0.6 : 1 }}>
                          <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.butter }}>
                            {scBusy ? '인식 중…' : '갤러리에서 선택'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity disabled={scBusy} activeOpacity={0.85} onPress={() => handleScorecardPick('camera')}
                          style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
                            backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline, opacity: scBusy ? 0.6 : 1 }}>
                          <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.charcoal }}>촬영</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={{ marginTop: 10, backgroundColor: C.bgSecondary, borderRadius: 12,
                        borderWidth: 0.5, borderColor: C.hairline, paddingHorizontal: 14, paddingVertical: 12 }}>
                        <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.burgundy, marginBottom: 7 }}>
                          📷 어떤 스코어카드를 올리나요?
                        </Text>
                        <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.charcoal, lineHeight: 20 }}>
                          PAR(파)와 전·후반 홀이 표로 정렬된{'\n'}스코어카드가 정확히 인식돼요.{'\n'}(스마트스코어 표 · 골프장 스코어카드)
                        </Text>
                        <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, lineHeight: 18, marginTop: 8 }}>
                          · 풍경 배경의 요약 카드는 PAR가 없어 인식되지 않아요.{'\n'}· 돌아간 사진도 자동으로 맞춰 읽어요 — 표만 또렷하게 담기면 돼요.
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* 입력 완료 요약 — 총타·수정·지우기 */}
                  {holeScores && (
                    <View style={{ marginTop: 10, padding: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'center',
                      backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline }}>
                      <Text style={{ fontFamily: F.sysB, fontSize: fs(13), color: C.charcoal, flex: 1 }}>
                        ⛳ 홀별 스코어 입력됨 · 총 {holeScores.reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0)}타
                      </Text>
                      <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        onPress={() => {
                          const t = holeScores.reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0);
                          setScRows([{ label: '입력값', holes: holeScores, total: t }]);
                          setScFailed(false); setScLowConf(false); setScReview(true);
                        }}>
                        <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.burgundy }}>수정</Text>
                      </TouchableOpacity>
                      <Text style={{ color: C.warmGray, marginHorizontal: 8 }}>·</Text>
                      <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => { setHoleScores(null); setHolePars(null); }}>
                        <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.warmGray }}>지우기</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {/* 동반자 점수 공유 — OCR 카드 기반이라 결과 '바로 아래'에 둠(동반자 섹션에 묻혀 못 보던 것 개선, 사용자 제보).
                      여러 명 인식(scRows≥2) + 친구 동반자 있으면 체크박스 / 없으면 동반자 추가 유도. */}
                  {holeScores && Array.isArray(scRows) && scRows.length >= 2 && (
                    companions.some(c => c.friendUid) ? (
                      <TouchableOpacity onPress={() => setShareScores(s => !s)} activeOpacity={0.75}
                        style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 10,
                          backgroundColor: shareScores ? (C.burgundy + '0E') : C.bgSecondary, borderRadius: 11,
                          borderWidth: 1, borderColor: shareScores ? C.burgundy : C.hairline, padding: 12 }}>
                        <Text style={{ fontSize: fs(16), color: shareScores ? C.burgundy : C.warmGrayLight, marginTop: -1 }}>{shareScores ? '☑' : '☐'}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: shareScores ? C.burgundy : C.charcoal }}>동반자에게 스코어 공유</Text>
                          <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 3, lineHeight: 16 }}>
                            친구 동반자에게 이 스코어카드를 보내요.{'\n'}각자 자기 점수를 골라 본인 기록에 바로 추가할 수 있어요.
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ) : (
                      <View style={{ marginTop: 10, backgroundColor: C.bgSecondary, borderRadius: 11, borderWidth: 0.5, borderColor: C.hairline, padding: 12 }}>
                        <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, lineHeight: 17 }}>
                          👥 여러 명이 인식된 카드예요 — 아래 <Text style={{ fontFamily: F.sysSb, color: C.burgundy }}>동반자</Text>에 친구를 넣으면 이 점수를 공유할 수 있어요.
                        </Text>
                      </View>
                    )
                  )}
                </View>
              <SectionHead title="오늘의 기록" />
              <Text style={[mS.bigLabel, { color: '#6B1E2A' }]}>한줄 메모 <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: '#6B1E2A' }}>(필수)</Text></Text>
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
                            <Text style={{ flex: 1, fontFamily: F.sysM, fontSize: fs(13.5), color: C.charcoal }} numberOfLines={1}>
                              {p.friendUid ? '👤 ' : ''}{shown}
                            </Text>
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
              {/* 친구에서 선택 — friendUid 보존(동반자 통계·향후 스코어 공유 전제) ([[companion-design]] Phase A) */}
              <TouchableOpacity onPress={() => setShowCompanionPicker(true)} activeOpacity={0.7}
                style={{ marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.burgundy }}>👥 친구에서 선택</Text>
                {friends.length === 0 && (
                  <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGrayLight }}>(친구를 추가하면 골라서 넣을 수 있어요)</Text>
                )}
              </TouchableOpacity>
              {companions.length === 0 && (
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginBottom: 8 }}>
                  이름을 입력하면 저장할 때 자동으로 반영돼요. 공백으로 띄우면 여러 명도 한 번에 (최대 3명)
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
                      <Text style={{ fontSize: fs(12), color: C.butter }}>{c.friendUid ? '👤 ' : ''}{c.friendUid ? (friends.find(f => f.id === c.friendUid)?.customName || c.name) : c.name}</Text>
                      <Text style={{ fontSize: fs(10), color: 'rgba(245,230,168,0.5)' }}>✕</Text>
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
                      style={{ backgroundColor: C.bgPrimary, borderWidth: 0.5, borderColor: C.hairline,
                        borderRadius: 14, paddingHorizontal: 11, paddingVertical: 6 }}>
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
              </>)}

              {/* 일상(모멘트) — 본문 텍스트(최대 1000자). 사진은 아래 공용 섹션. */}
              {isMoment && (
                <View style={{ marginTop: 4 }}>
                  {/* 일상 날짜 — 기본 오늘, 선택 가능(과거 일상도 기록). 통계·캘린더 미표시는 kind로 격리 ([[moment-feed-extension]]) */}
                  <Text style={mS.bigLabel}>날짜</Text>
                  <TouchableOpacity style={mS.input} activeOpacity={0.7} onPress={() => setShowDatePicker(true)}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(15), color: C.textPrimary }}>
                      {formatDate(date)} ({formatDay(date)})
                    </Text>
                  </TouchableOpacity>
                  {showDatePicker && (
                    <DateTimePicker value={date} mode="date" display="spinner"
                      onChange={(e, d) => { setShowDatePicker(false); if (d) setDate(d); }}
                      maximumDate={new Date()} locale="ko" />
                  )}
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

              <SectionHead title="마무리" />
              <Text style={mS.bigLabel}>공개 범위</Text>
              {/* 친구 전체 / 그룹들(가까운 친구·라운딩 멤버) / 나만 보기 — 단일 선택 ([[friend_groups]]) */}
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {[{ key: 'friends', label: '친구 전체' },
                  ...friendData.friendGroups.map(g => ({ key: g.id, label: g.name })),
                  { key: 'private', label: '나만 보기' }].map(opt => {
                  const on = privacy.includes(opt.key);
                  return (
                    <TouchableOpacity key={opt.key} style={[mS.chip, on && mS.chipOn]} onPress={() => togglePrivacy(opt.key)}>
                      <Text style={[mS.chipTxt, on && mS.chipTxtOn]}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {!privacy.includes('friends') && !privacy.includes('private') && (
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginTop: 6 }}>
                  {privacy.map(id => (friendData.friendGroups.find(g => g.id === id) || {}).name).filter(Boolean).join(' · ')} 그룹 친구에게만 보여요 (여러 그룹 선택 가능)
                </Text>
              )}
              <View style={{ marginBottom: 16 }}>
                <Text style={mS.bigLabel}>사진 · 영상 <Text style={{ color: '#8B8680', fontSize: fs(11), fontFamily: F.sys }}> (선택 · {addPhotos.length}/{MAX_PHOTOS})</Text></Text>
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
              {saveError ? (
                <Text style={{ fontFamily: F.sysM, fontSize: fs(12), color: '#6B1E2A', textAlign: 'center', marginTop: 8 }}>{saveError}</Text>
              ) : null}
              <TouchableOpacity
                style={[mS.saveBtn, { backgroundColor: !canSave ? '#B8B3AB' : (isEdit ? C.charcoal : C.burgundy) }]}
                onPress={handleSave}
                disabled={!canSave}>
                <Text style={mS.saveBtnTxt}>{isEdit ? '수정 완료' : '저장하기'}</Text>
              </TouchableOpacity>
              <View style={{ height: 40 }} />
            </KeyboardAwareScrollView>
          </View>
        </View>
        </KeyboardProvider>
        {/* 인-모달 알럿/메뉴 — 글로벌 showAppAlert는 Modal 위에서 터치 충돌, 오버레이 View로 처리 */}
        <OverlayAlert data={overlay} onClose={() => setOverlay(null)} />
        <ScorecardReviewModal
          visible={scReview}
          rows={scRows}
          failed={scFailed}
          lowConfidence={scLowConf}
          onConfirm={handleScorecardConfirm}
          onClose={() => setScReview(false)} />
        <CropEditorModal
          visible={cropIdx !== null}
          aspect="cover"
          uri={cropIdx !== null ? resolvePhotoUri(typeof addPhotos[cropIdx] === 'object' ? (addPhotos[cropIdx].orig || addPhotos[cropIdx].uri) : addPhotos[cropIdx]) : null}
          onClose={() => setCropIdx(null)}
          onSave={async (croppedUri) => {
            const persisted = await persistPhoto(croppedUri);
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
            const persisted = await persistPhoto(newUri);
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
