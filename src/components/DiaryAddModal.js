import React, { useState, useEffect, useRef } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, Image } from 'react-native';
import { Spinner } from './common/Spinner';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { C, F, fs } from '../constants/colors';
import { COURSE_TAGS, COURSE_TAG_COLORS, WEEKDAYS } from '../constants/data';
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
import { CropEditorModal } from './common/CropEditorModal';
import { showAppAlert } from './AppAlert';

const COST_ITEMS = [
  ['green', '그린피'],
  ['caddie', '캐디피'],
  ['cart', '카트피'],
  ['meal', '식사비'],
  ['etc', '기타'],
];

// 다이어리 사진·영상 첨부 한도 (저장 공간·로딩 성능·UX 균형)
const MAX_PHOTOS = 10;
const MAX_VIDEO_SEC = 30; // 동영상 최대 길이(초) — 과도한 업로드 용량 방지. Storage 규칙(영상 100MB)보다 앞단 차단.

// '더 기록하기' 예시 칩 — 누르면 입력칸에 항목이 삽입돼 글쓰기 시작점이 된다
const GUIDE_CHIPS = ['MVP 샷', '아쉬웠던 홀', '코스·잔디 상태', '동반자 소감', '다음에 기억할 것'];

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
  const [scReview, setScReview] = useState(false);
  const [scBusy, setScBusy] = useState(false);
  const [showCost, setShowCost] = useState(false);
  const [costs, setCosts] = useState({ green: '', caddie: '', cart: '', meal: '', etc: '' });
  const [weather, setWeather] = useState('맑음');
  const [memo, setMemo] = useState('');
  const [birdieCount, setBirdieCount] = useState(0);
  const [privacy, setPrivacy] = useState('friends');
  const [starRating, setStarRating] = useState(0);
  const [selectedTags, setSelectedTags] = useState([]);
  const [detailMemo, setDetailMemo] = useState('');
  const [overseas, setOverseas] = useState(false); // 국내/해외 라운딩
  const [country, setCountry] = useState('');      // 해외일 때 국가·지역
  // 상위 분기 — 'round'(라운딩 기록) | 'moment'(일상). 일상은 글/사진만, 통계·캘린더서 격리([[moment-feed-extension]])
  const [kind, setKind] = useState('round');

  const toggleTag = (tag) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
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
  const [companions, setCompanions] = useState([]);
  const [companionInput, setCompanionInput] = useState('');

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
      });
      if (!result.canceled) {
      // 길이 초과 영상 제외 — duration은 ms. 안드는 videoMaxDuration이 안 먹을 수 있어 여기서 한 번 더 거른다.
      const overLimit = result.assets.filter(a => a.type === 'video' && a.duration && a.duration > MAX_VIDEO_SEC * 1000 + 500);
      const assets = result.assets.filter(a => !(a.type === 'video' && a.duration && a.duration > MAX_VIDEO_SEC * 1000 + 500));
      if (overLimit.length) {
        showAppAlert('동영상이 너무 길어요', `동영상은 최대 ${MAX_VIDEO_SEC}초까지 올릴 수 있어요.\n길이를 넘는 ${overLimit.length}개는 제외했어요.`);
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
      showAppAlert('사진을 불러오지 못했어요', '사진 접근 권한을 허용했는지 확인하거나\n잠시 후 다시 시도해주세요.');
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

  // 동반자 추가 — 공백·쉼표로 여러 명 한 번에 입력 가능 (최대 3명)
  const handleAddCompanions = () => {
    if (companions.length >= 3) return;
    const names = companionInput.trim().split(/[\s,]+/).filter(Boolean);
    if (!names.length) return;
    setCompanions(prev => [...prev, ...names].slice(0, 3));
    setCompanionInput('');
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
    setHoleScores(null); setHolePars(null); setScRows([]); setScReview(false); setScFailed(false);
    setShowCost(false); setCosts({ green: '', caddie: '', cart: '', meal: '', etc: '' });
    setAddPhotos([]);
    setStarRating(0); setSelectedTags([]);
    setDetailMemo('');
    setPrivacy('friends');
    setCompanions([]); setCompanionInput('');
    setOverseas(false); setCountry('');
    setKind('round');
  };

  useEffect(() => {
    if (!visible) return;
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
      // 혹시 남아있는 옛 privacy 값도 폴백으로 인정.
      setPrivacy(initial.visibility || initial.privacy || 'friends');
      setCompanions(
        (initial.companions || [])
          .filter(c => !c.isMe)
          .map(c => c.name)
      );
      setCompanionInput('');
      setOverseas(!!initial.overseas);
      setCountry(initial.country || '');
      setKind(initial.kind === 'moment' ? 'moment' : 'round');
      if (initial.cost) {
        setCosts({
          green: initial.cost.green ? String(initial.cost.green) : '',
          caddie: initial.cost.caddie ? String(initial.cost.caddie) : '',
          cart: initial.cost.cart ? String(initial.cost.cart) : '',
          meal: initial.cost.meal ? String(initial.cost.meal) : '',
          etc: initial.cost.etc ? String(initial.cost.etc) : '',
        });
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
      // 일정(모집확정 포함)에 담긴 동반자를 기록 작성 시 미리 채움 — 이름만(라운드는 name 기준), 본인 제외·최대 3명
      if (Array.isArray(initial?.companions) && initial.companions.length) {
        setCompanions(
          initial.companions
            .filter(c => !(typeof c === 'object' && c.isMe))
            .map(c => (typeof c === 'string' ? c : c?.name))
            .filter(Boolean)
            .slice(0, 3)
        );
      }
      if (initial?.overseas) { setOverseas(true); setCountry(initial.country || ''); }
    }
  }, [visible, isEdit, initial]);

  const [saveError, setSaveError] = useState('');

  const isMoment = kind === 'moment';
  const finalCourseLive = selectedCourse || courseSearch.trim();
  const canSave = isMoment
    ? ((!!memo.trim() || addPhotos.length > 0) && !photoBusy) // 일상: 글만/사진만이라도 OK
    : (!!finalCourseLive && !!score && !isNaN(parseInt(score)) && parseInt(score) > 0 && !!memo.trim() && !photoBusy);

  const costTotal = COST_ITEMS.reduce((sum, [k]) => sum + (parseInt(costs[k]) || 0), 0);
  const won = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  const handleSave = () => {
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
        visibility: privacy,
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
      score: parseInt(score) || 0, holeScores, holePars, weather, memo, birdieCount, visibility: privacy,
      special, specialHole: parseInt(specialHole),
      specialPar: parseInt(specialPar) || null,
      specialDist, specialBall, specialMemo,
      photos: addPhotos,
      starRating,
      tags: selectedTags,
      detailMemo,
      cost: costTotal > 0 ? {
        green: parseInt(costs.green) || 0,
        caddie: parseInt(costs.caddie) || 0,
        cart: parseInt(costs.cart) || 0,
        meal: parseInt(costs.meal) || 0,
        etc: parseInt(costs.etc) || 0,
        total: costTotal,
      } : null,
      companions: [
        { name: userProfile.nickname, isMe: true },
        // 저장 시 입력칸에 남은 이름도 자동 반영 — '추가' 미클릭으로 유실되던 문제 방지 (최대 3명)
        ...[...companions, ...companionInput.trim().split(/[\s,]+/).filter(Boolean)]
          .slice(0, 3)
          .map(name => ({ name, isMe: false })),
      ],
      courseId: selectedCourseObj?.id || (initial && initial.courseId) || null,
      courseLoc: selectedCourseObj?.loc || (initial && initial.courseLoc) || null, // 코스 주소 동봉 — 지역탭 분류용([[region-classification]])
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
    reset(); onClose();
  };


  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { reset(); onClose(); }}>
        <View style={mS.mask}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => { reset(); onClose(); }} />
          <View style={[mS.sheet, { paddingBottom: 20 + insets.bottom }]}>
            <TouchableOpacity onPress={() => { reset(); onClose(); }} activeOpacity={0.7}
              style={{ alignItems: 'center', paddingVertical: 10 }}>
              <View style={mS.handle} />
            </TouchableOpacity>
            <ScrollView style={{ flexShrink: 1, padding: 20, paddingTop: 0 }} showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
              {/* 상위 분기: 라운딩 기록 | 일상 — 아이콘 카드 2개(아이콘+제목+한줄설명).
                  카드형이라 아래 [국내|해외] 작은 칩과 모양·높이가 전혀 달라 안 헷갈리고, 설명으로 차이도 바로 전달.
                  편집은 토글 잠금(round↔moment 전환 금지: 데이터·통계 정합성)이라 제목 텍스트로 표시. */}
              {!isEdit ? (
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4, marginBottom: 12 }}>
                  {[
                    { v: 'round', icon: '⛳', label: '라운딩 기록', sub: '스코어·코스' },
                    { v: 'moment', icon: '📷', label: '일상', sub: '글·사진' },
                  ].map(opt => {
                    const on = kind === opt.v;
                    return (
                      <TouchableOpacity key={opt.v} activeOpacity={0.85} onPress={() => setKind(opt.v)}
                        style={{ flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 14,
                          borderWidth: 1.5,
                          borderColor: on ? C.burgundy : C.hairline,
                          backgroundColor: on ? (C.burgundy + '12') : C.bgSecondary }}>
                        <Text style={{ fontSize: fs(24), marginBottom: 5 }}>{opt.icon}</Text>
                        <Text style={{ fontFamily: on ? F.sysB : F.sysM, fontSize: fs(14),
                          color: on ? C.burgundy : C.charcoal }}>{opt.label}</Text>
                        <Text style={{ fontFamily: F.sys, fontSize: fs(11),
                          color: on ? C.burgundy : C.warmGray, marginTop: 2 }}>{opt.sub}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <Text style={mS.title}>{isMoment ? '일상 기록 수정' : '라운딩 기록 수정'}</Text>
              )}
              {kind === 'round' && (<>
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
              <Text style={mS.bigLabel}>골프장 <Text style={{ color: '#6B1E2A' }}>*</Text></Text>
              <TextInput style={[mS.input, { fontSize: fs(16), fontFamily: F.sysSb }]}
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
                  <TextInput style={[mS.input, { fontSize: fs(16), fontFamily: F.sysSb }]} placeholder="예: 일본, 베트남, 중국"
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
              <Text style={mS.bigLabel}>스코어 <Text style={{ color: '#6B1E2A' }}>*</Text></Text>
              <TextInput style={[mS.input, { fontSize: fs(16), fontFamily: F.sysSb }]} placeholder="타수 입력"
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
                          · 풍경 배경의 요약 카드는 PAR가 없어 인식되지 않아요.{'\n'}· 촬영할 땐 표를 정면에서 또렷하게 담아주세요.
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
                          setScFailed(false); setScReview(true);
                        }}>
                        <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.burgundy }}>수정</Text>
                      </TouchableOpacity>
                      <Text style={{ color: C.warmGray, marginHorizontal: 8 }}>·</Text>
                      <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => { setHoleScores(null); setHolePars(null); }}>
                        <Text style={{ fontFamily: F.sysSb, fontSize: fs(12), color: C.warmGray }}>지우기</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              <Text style={mS.bigLabel}>한줄 메모 <Text style={{ color: '#6B1E2A' }}>*</Text></Text>
              <TextInput style={[mS.input, { fontSize: fs(16), fontFamily: F.sysSb }]} placeholder="오늘 라운딩은..." placeholderTextColor={C.warmGrayLight}
                value={memo} onChangeText={setMemo} />
              <Text style={mS.bigLabel}>
                동반자
                <Text style={{ fontSize: fs(11), fontFamily: F.sys, color: '#8B8680' }}> (선택 · 탭하여 삭제)</Text>
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <TextInput
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
              {companions.length === 0 && (
                <Text style={{ fontFamily: F.sys, fontSize: fs(11), color: C.warmGray, marginBottom: 8 }}>
                  이름을 입력하면 저장할 때 자동으로 반영돼요. 공백으로 띄우면 여러 명도 한 번에 (최대 3명)
                </Text>
              )}
              {companions.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {companions.map((name, i) => (
                    <TouchableOpacity key={i}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 4,
                        backgroundColor: C.charcoal,
                        borderRadius: 20,
                        paddingHorizontal: 10, paddingVertical: 5,
                      }}
                      onPress={() => setCompanions(prev => prev.filter((_, idx) => idx !== i))}>
                      <Text style={{ fontSize: fs(12), color: C.butter }}>{name}</Text>
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
                  <TextInput style={mS.input} placeholder="7" placeholderTextColor={C.warmGrayLight}
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
                  <TextInput style={mS.input} placeholder="156m" placeholderTextColor={C.warmGrayLight}
                    value={specialDist} onChangeText={setSpecialDist} />
                  <Text style={mS.bigLabel}>사용한 볼</Text>
                  <TextInput style={mS.input} placeholder="Titleist Pro V1" placeholderTextColor={C.warmGrayLight}
                    value={specialBall} onChangeText={setSpecialBall} />
                  <Text style={mS.bigLabel}>한마디</Text>
                  <TextInput style={mS.input} placeholder="그 순간을 기억하며..." placeholderTextColor={C.warmGrayLight}
                    value={specialMemo} onChangeText={setSpecialMemo} />
                </View>
              )}
              <Text style={mS.bigLabel}>코스 별점 <Text style={{ color: '#8B8680', fontSize: fs(11), fontFamily: F.sys }}> (이 골프장이 얼마나 좋았나요?)</Text></Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                {[1, 2, 3, 4, 5].map(i => (
                  <TouchableOpacity key={i} onPress={() => setStarRating(i)} activeOpacity={0.6}>
                    <Text style={{ fontSize: fs(28), color: i <= starRating ? '#C9A84C' : '#E8E2D0' }}>★</Text>
                  </TouchableOpacity>
                ))}
                {starRating > 0 && <Text style={{ fontSize: fs(12), color: '#8B8680' }}>{starRating}점</Text>}
              </View>

              <Text style={mS.bigLabel}>코스 태그 <Text style={{ color: '#8B8680', fontSize: fs(11), fontFamily: F.sys }}> (선택 · 중복 가능)</Text></Text>
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
                            onPress={() => toggleTag(tag)}>
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
                  더 기록하기
                  <Text style={{ color: '#8B8680', fontSize: fs(11), fontFamily: F.sys }}> (선택 · 최대 1000자)</Text>
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
                  <TextInput
                    ref={detailMemoRef}
                    style={{
                      fontFamily: F.sys, fontSize: fs(13),
                      color: C.textPrimary,
                      // multiline TextInput에 lineHeight를 주면 첫 줄이 밀리는 버그가 있어 미지정
                      minHeight: 100, textAlignVertical: 'top',
                    }}
                    placeholder="그날의 라운딩을 자유롭게 남겨보세요"
                    placeholderTextColor={C.warmGrayLight}
                    value={detailMemo}
                    onChangeText={(t) => { if (t.length <= 1000) setDetailMemo(t); }}
                    multiline
                    textAlignVertical="top"
                    maxLength={1000}
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
                  {COST_ITEMS.map(([key, label]) => (
                    <View key={key} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                      <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.textSecondary, width: 64 }}>{label}</Text>
                      <TextInput
                        style={{
                          flex: 1, backgroundColor: C.bgPrimary,
                          borderWidth: 0.5, borderColor: C.hairline, borderRadius: 8,
                          paddingHorizontal: 12, paddingVertical: 8,
                          fontFamily: F.sys, fontSize: fs(13), color: C.textPrimary, textAlign: 'right',
                        }}
                        placeholder="0"
                        placeholderTextColor={C.warmGrayLight}
                        keyboardType="numeric"
                        value={costs[key]}
                        onChangeText={(t) => setCosts(prev => ({ ...prev, [key]: t.replace(/[^0-9]/g, '') }))}
                      />
                      <Text style={{ fontFamily: F.sys, fontSize: fs(13), color: C.warmGray, marginLeft: 8 }}>원</Text>
                    </View>
                  ))}
                  <View style={{
                    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                    borderTopWidth: 0.5, borderTopColor: C.hairline, paddingTop: 12, marginTop: 2,
                  }}>
                    <Text style={{ fontFamily: F.sysSb, fontSize: fs(13), color: C.textPrimary }}>합계</Text>
                    <Text style={{ fontFamily: F.sysB, fontSize: fs(16), color: C.burgundy }}>
                      {won(costTotal)}원
                    </Text>
                  </View>
                </View>
              )}
              </>)}

              {/* 일상(모멘트) — 본문 텍스트(최대 1000자). 사진은 아래 공용 섹션. */}
              {isMoment && (
                <View style={{ marginTop: 4 }}>
                  <Text style={mS.bigLabel}>
                    오늘의 한 마디
                    <Text style={{ color: '#8B8680', fontSize: fs(11), fontFamily: F.sys }}> (사진만 올려도 돼요 · 최대 1000자)</Text>
                  </Text>
                  <View style={{ backgroundColor: C.bgSecondary, borderWidth: 0.5, borderColor: C.hairline,
                    borderRadius: 12, padding: 14, minHeight: 140 }}>
                    <TextInput
                      style={{ fontFamily: F.sys, fontSize: fs(14), color: C.textPrimary,
                        minHeight: 100, textAlignVertical: 'top' }}
                      placeholder="밥, 연습장, 풍경... 골프와 함께한 일상을 자유롭게 남겨보세요"
                      placeholderTextColor={C.warmGrayLight}
                      value={memo}
                      onChangeText={(t) => { if (t.length <= 1000) setMemo(t); }}
                      multiline
                      textAlignVertical="top"
                      maxLength={1000}
                    />
                    <Text style={{ fontSize: fs(10), color: C.warmGray, textAlign: 'right', marginTop: 8 }}>
                      {memo.length} / 1000
                    </Text>
                  </View>
                </View>
              )}

              <Text style={mS.bigLabel}>공개 범위</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[mS.chip, privacy === 'friends' && mS.chipOn]} onPress={() => setPrivacy('friends')}>
                  <Text style={[mS.chipTxt, privacy === 'friends' && mS.chipTxtOn]}>친구공개</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[mS.chip, privacy === 'private' && mS.chipOn]} onPress={() => setPrivacy('private')}>
                  <Text style={[mS.chipTxt, privacy === 'private' && mS.chipTxtOn]}>나만보기</Text>
                </TouchableOpacity>
              </View>
              <View style={{ marginTop: 16, marginBottom: 16 }}>
                <Text style={{ fontFamily: F.sys, fontSize: fs(12), color: C.warmGray, marginBottom: 8 }}>
                  사진 · 영상 (선택 · {addPhotos.length}/{MAX_PHOTOS})
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {addPhotos.map((item, i) => (
                    <AddPhotoThumb key={i} item={item}
                      onRemove={() => setAddPhotos(prev => prev.filter((_, idx) => idx !== i))}
                      onAdjust={() => setCropIdx(i)} />
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
            </ScrollView>
          </View>
        </View>
        <ScorecardReviewModal
          visible={scReview}
          rows={scRows}
          failed={scFailed}
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
    </Modal>
  );
}

function AddPhotoThumb({ item, onRemove, onAdjust }) {
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
    <View style={{ width: 80, height: 80, marginRight: 8 }}>
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
      ) : onAdjust ? (
        // 사진 탭 = 자르기(크롭) 편집. 하단에 작은 안내 칩으로 가능함을 인지 ([[cover-focal-point]])
        <TouchableOpacity activeOpacity={0.85} onPress={onAdjust} style={imgStyle}>
          <Image source={{ uri: src }} style={imgStyle} />
          <View style={{ position: 'absolute', bottom: 4, left: 4, flexDirection: 'row', alignItems: 'center',
            backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
            <Text style={{ color: '#fff', fontSize: fs(9) }}>✂ 자르기</Text>
          </View>
        </TouchableOpacity>
      ) : (
        <Image source={{ uri: src }} style={imgStyle} />
      )}
      {onRemove && (
        <TouchableOpacity onPress={onRemove}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{
            position: 'absolute', top: 3, right: 3,
            width: 22, height: 22, borderRadius: 11,
            backgroundColor: 'rgba(0,0,0,0.78)',
            alignItems: 'center', justifyContent: 'center',
          }}>
          <Text style={{ color: '#fff', fontSize: fs(11), lineHeight: 13 }}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
