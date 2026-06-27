// 친구 1:1 DM(다이렉트 메시지) 데이터 레이어 ([[dm-design]]).
//   conversations/{pairId} (메타) + conversations/{pairId}/messages/{msgId} (메시지).
//   pairId = 두 uid 정렬 조합 → 한 쌍당 방 하나(멱등). 친구끼리만, 낯선 사람 DM 없음.
//   비용 통제([[lounge-realtime]]): 1:1이라 관망자=2명, 대화방/목록 열린 동안만 onSnapshot 구독.
//   안 읽음·타이핑은 출시 후(비용 큰 실시간 상태) — 본체는 텍스트 송수신만.
import {
  collection, query, where, orderBy, limit as fsLimit, getDocs, getDoc,
  addDoc, setDoc, updateDoc, deleteDoc, doc, serverTimestamp, onSnapshot, deleteField,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, getUid, storage } from './firebase';
import { resolvePhotoUri } from './photoStorage';
import { compressImage } from './imageCompress';
import * as VideoThumbnails from 'expo-video-thumbnails';

const CONV = 'conversations';

// '나만 목록에서 지움' 판정 — clearedAt.{내uid} 이후로 새 메시지(lastAt)가 없으면 내 목록에서 숨김.
//   상대 문서는 공용이라 실제 삭제 불가(규칙 delete:false) → 내 키만 기록하는 방식(읽음·타이핑과 동일 패턴).
//   숨긴 뒤 새 메시지가 오면 lastAt > clearedAt 이 되어 다시 보임(카톡식). 기록 자체는 보존(명함 💬로 들어가면 그대로).
function isCleared(conv, uid) {
  const cl = conv?.clearedAt?.[uid];
  const clMs = cl?.toMillis ? cl.toMillis() : 0;
  const laMs = conv?.lastAt?.toMillis ? conv.lastAt.toMillis() : 0;
  return clMs > 0 && clMs >= laMs;
}

// 두 uid → 결정적 방 id(정렬 조합). a·b 순서 무관하게 같은 방 ([[data-integrity-principles]] 멱등).
export function pairId(a, b) {
  return [a, b].sort().join('_');
}

// 내 uid 기준 상대 uid 추출 — conversation.participantUids[2]에서 나 아닌 쪽.
export function otherUidOf(conv, myUid) {
  const uids = Array.isArray(conv?.participantUids) ? conv.participantUids : [];
  return uids.find(u => u && u !== myUid) || null;
}

// 대화방 보장 — 없으면 메타 문서 생성, 있으면 그대로. 첫 진입 시 호출(메시지 0건이라도 방은 존재).
export async function ensureConversation(friendUid) {
  const uid = await getUid();
  if (!uid || !friendUid) throw new Error('dm: uid required');
  const id = pairId(uid, friendUid);
  const ref = doc(db, CONV, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      participantUids: [uid, friendUid].sort(),
      lastMessage: '',
      lastSenderUid: null,
      lastAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  return id;
}

// 메시지 전송 — messages에 1건 추가 + 대화방 메타(lastMessage·lastAt) 갱신.
//   방이 없으면 함께 생성(merge). 빈 문자열은 무시. body는 트림 후 저장.
//   replyTo(답장·인용) = {msgId, body, senderUid} 스냅샷 — body는 원본 전문(규칙이 원본과 일치 검증
//   = 인용 위조 차단, 표시부에서 잘라 씀). 없으면 필드 자체를 안 넣음(규칙 'replyTo' in data 분기).
export async function sendMessage(friendUid, text, replyTo = null) {
  const uid = await getUid();
  if (!uid || !friendUid) throw new Error('dm: uid required');
  const body = (text || '').trim();
  if (!body) return null;
  const id = pairId(uid, friendUid);
  // ★메시지를 먼저 씀 — Firestore 로컬 즉시반영(latency compensation)으로 내 화면에 바로 뜸(서버 왕복 안 기다림).
  //   기존엔 conv 메타 setDoc을 먼저 await해서 그 왕복(~0.5~1s)만큼 내 메시지가 늦게 떴음(주고받기 체감 느림 원인).
  //   conv는 입장 시 ensureConversation으로 이미 존재하므로 메시지 먼저 써도 규칙·정합성 안전.
  const msgRef = await addDoc(collection(db, CONV, id, 'messages'), {
    senderUid: uid,
    body,
    ...(replyTo?.msgId ? { replyTo: { msgId: replyTo.msgId, body: replyTo.body || '', senderUid: replyTo.senderUid || '' } } : {}),
    createdAt: serverTimestamp(),
  });
  // 대화 메타(목록 미리보기·lastAt 정렬)는 메시지 표시를 막지 않게 비동기로(await X) — 실패해도 메시지는 이미 전송됨.
  setDoc(doc(db, CONV, id), {
    participantUids: [uid, friendUid].sort(),
    lastMessage: body,
    lastSenderUid: uid,
    lastAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true }).catch((e) => { if (__DEV__) console.warn('[dm] conv meta', e?.message); });
  return msgRef.id;
}

// DM 사진 업로드 — 압축(1200px·80% JPEG, [[image-compression]]) 후 Storage(dmImages/{uid}/…)에 올려 https URL 반환.
//   이미 원격(http) URL이면 그대로 반환(재업로드 방지). 실패 시 throw(호출부에서 안내).
export async function uploadDmImage(imageUri, compressOpts = {}) {
  const uid = await getUid();
  if (!uid || !imageUri) throw new Error('dm: image uri required');
  if (/^https?:\/\//.test(imageUri)) return imageUri;
  const localUri = resolvePhotoUri(imageUri);
  // compressOpts — 카드 공유는 텍스트가 많아 고화질(quality↑)로 넘김. 일반 채팅 사진은 기본(1200·0.8) 유지.
  const compressedUri = await compressImage(localUri, compressOpts);
  const res = await fetch(compressedUri);
  const blob = await res.blob();
  // 공유 카드는 PNG로 올려 투명도 보존(둥근 모서리가 JPEG 흰배경으로 굳는 '하얀 티' 방지). 일반 사진은 jpg.
  const ext = compressOpts.format === 'png' ? 'png' : 'jpg';
  const r = storageRef(storage, `dmImages/${uid}/${Date.now()}_${Math.round(Math.random() * 1e6)}.${ext}`);
  await uploadBytes(r, blob);
  return await getDownloadURL(r);
}

// 이미 업로드된 이미지 URL을 메시지로 전송 — 다중 전송(여러 친구에게 같은 카드)에서 업로드 1회 후 URL 재사용.
//   이미지 메시지는 body='' (규칙: body 또는 imageUrl 중 하나). lastMessage='📷 사진'.
//   owned=true면 이 메시지가 Storage 파일을 '단독 소유'(채팅 사진=1파일:1메시지) → 언센드 시 파일 삭제 안전.
//   공유(여러 친구에 같은 URL)는 owned=false(기본) → 한 메시지 언센드로 파일 지우면 다른 메시지가 깨지므로 삭제 안 함.
export async function sendImageMessageUrl(friendUid, imageUrl, owned = false, extra = null) {
  const uid = await getUid();
  if (!uid || !friendUid || !imageUrl) throw new Error('dm: image msg args');
  const id = pairId(uid, friendUid);
  // extra — 모집 초대 카드 전송 시 { roundupId, roundupHost } 등 부가 필드(수신측 '모집 보러 가기' 딥링크용). 규칙은 추가 필드 허용.
  const msgRef = await addDoc(collection(db, CONV, id, 'messages'), {
    senderUid: uid,
    body: '',
    imageUrl,
    ...(owned ? { imageOwned: true } : {}),
    ...(extra && typeof extra === 'object' ? extra : {}),
    createdAt: serverTimestamp(),
  });
  setDoc(doc(db, CONV, id), {
    participantUids: [uid, friendUid].sort(),
    lastMessage: '📷 사진',
    lastSenderUid: uid,
    lastAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true }).catch((e) => { if (__DEV__) console.warn('[dm] conv meta(img)', e?.message); });
  return msgRef.id;
}

// 단일 전송 — 업로드 후 메시지 생성(채팅 사진 보내기). owned=true(1파일:1메시지) → 언센드 시 Storage 파일도 정리.
export async function sendImageMessage(friendUid, imageUri) {
  const url = await uploadDmImage(imageUri);
  return sendImageMessageUrl(friendUid, url, true);
}

// 앨범 전송(모아보내기) — 여러 장을 모두 업로드해 한 메시지에 imageUrls 배열로(카톡식 묶음). owned=true(이 메시지가 N파일 단독소유 → 언센드 시 모두 정리).
export async function sendImagesMessage(friendUid, uris) {
  const uid = await getUid();
  if (!uid || !friendUid || !Array.isArray(uris) || !uris.length) throw new Error('dm: images args');
  const urls = (await Promise.all(uris.map(u => uploadDmImage(u).catch(() => null)))).filter(Boolean);
  if (!urls.length) throw new Error('dm: upload failed');
  const id = pairId(uid, friendUid);
  const msgRef = await addDoc(collection(db, CONV, id, 'messages'), {
    senderUid: uid,
    body: '',
    imageUrls: urls,
    imageOwned: true,
    createdAt: serverTimestamp(),
  });
  setDoc(doc(db, CONV, id), {
    participantUids: [uid, friendUid].sort(),
    lastMessage: '📷 사진',
    lastSenderUid: uid,
    lastAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true }).catch((e) => { if (__DEV__) console.warn('[dm] conv meta(imgs)', e?.message); });
  return msgRef.id;
}

// DM 동영상 업로드 — 영상 원본 + 첫프레임 포스터(jpg)를 dmImages/{uid}/에 올려 { url, poster } 반환.
//   포스터는 안드 원격 썸네일 안정화용(roundMedia와 동일 패턴). 실패해도 영상은 전송(poster=null).
export async function uploadDmVideo(videoUri) {
  const uid = await getUid();
  if (!uid || !videoUri) throw new Error('dm: video uri required');
  if (/^https?:\/\//.test(videoUri)) return { url: videoUri, poster: null };
  const localUri = resolvePhotoUri(videoUri);
  const ext = (videoUri.split('?')[0].split('.').pop() || 'mp4').toLowerCase().slice(0, 4);
  const contentType = ext === 'mov' ? 'video/quicktime' : 'video/mp4';
  const res = await fetch(localUri);
  const blob = await res.blob();
  const vRef = storageRef(storage, `dmImages/${uid}/${Date.now()}_${Math.round(Math.random() * 1e6)}.${ext}`);
  await uploadBytes(vRef, blob, { contentType }); // contentType 명시 — Storage 규칙 video/* 매칭
  const url = await getDownloadURL(vRef);
  let poster = null;
  try {
    const { uri: thumb } = await VideoThumbnails.getThumbnailAsync(localUri, { time: 0, quality: 0.7 });
    const cThumb = await compressImage(thumb);
    const pres = await fetch(cThumb);
    const pblob = await pres.blob();
    const pRef = storageRef(storage, `dmImages/${uid}/${Date.now()}_${Math.round(Math.random() * 1e6)}_p.jpg`);
    await uploadBytes(pRef, pblob, { contentType: 'image/jpeg' });
    poster = await getDownloadURL(pRef);
  } catch (e) { if (__DEV__) console.warn('[dm] video poster', e?.message); }
  return { url, poster };
}

// DM 동영상 메시지 전송 — 업로드 후 videoUrl(+poster) 메시지. owned=true(언센드 시 영상·포스터 파일 정리). lastMessage='🎬 동영상'.
export async function sendVideoMessage(friendUid, videoUri) {
  const uid = await getUid();
  if (!uid || !friendUid || !videoUri) throw new Error('dm: video msg args');
  const { url, poster } = await uploadDmVideo(videoUri);
  const id = pairId(uid, friendUid);
  const msgRef = await addDoc(collection(db, CONV, id, 'messages'), {
    senderUid: uid,
    body: '',
    videoUrl: url,
    ...(poster ? { poster } : {}),
    imageOwned: true,
    createdAt: serverTimestamp(),
  });
  setDoc(doc(db, CONV, id), {
    participantUids: [uid, friendUid].sort(),
    lastMessage: '🎬 동영상',
    lastSenderUid: uid,
    lastAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true }).catch((e) => { if (__DEV__) console.warn('[dm] conv meta(video)', e?.message); });
  return msgRef.id;
}

// 메시지 삭제(언센드) — 본인 메시지만 완전 삭제(양쪽 화면에서 사라짐). 규칙이 senderUid==나만 허용([[dm-design]]).
//   인용(replyTo)은 보낸 시점 스냅샷이라 원본을 지워도 인용문은 유지(끊기지 않음). 실패는 호출부에서 안내.
export async function deleteMessage(convId, msgId) {
  if (!convId || !msgId) throw new Error('dm: delete args');
  // 이미지 메시지면 Storage 파일도 정리(고아 방지) — 단, 이 메시지가 파일을 단독 소유(imageOwned)할 때만.
  //   공유(여러 친구 같은 URL)는 다른 메시지가 같은 파일을 참조하므로 삭제 X. 본인 메시지=본인 dmImages 경로라 삭제 권한 OK.
  let ownedUrls = [];
  try {
    const ms = await getDoc(doc(db, CONV, convId, 'messages', msgId));
    if (ms.exists() && ms.data().imageOwned) {
      const d = ms.data();
      if (Array.isArray(d.imageUrls)) ownedUrls = d.imageUrls.filter(Boolean);
      else if (d.imageUrl) ownedUrls = [d.imageUrl];
      if (d.videoUrl) ownedUrls.push(d.videoUrl);  // 동영상 본체
      if (d.poster) ownedUrls.push(d.poster);      // 동영상 포스터(jpg)
    }
  } catch { /* 못 읽어도 메시지 삭제는 진행 */ }
  await deleteDoc(doc(db, CONV, convId, 'messages', msgId));
  await Promise.all(ownedUrls.filter(u => /^https?:\/\//.test(u)).map(u =>
    deleteObject(storageRef(storage, u)).catch(e => __DEV__ && console.warn('[dm] storage img delete', e?.message)),
  ));
  // 마지막 메시지를 지우면 목록 미리보기(lastMessage)에 유령으로 남음 → 남은 최신 메시지로 메타 재계산.
  //   (오래된 메시지를 지운 경우엔 최신이 그대로라 같은 값으로 덮어써 무해. 남은 메시지 0건이면 빈 미리보기=목록서 숨김.)
  //   친구해지·차단 상태면 규칙상 이 update는 막히지만 메시지 삭제 자체는 이미 완료됨 → 조용히 무시.
  try {
    const snap = await getDocs(query(
      collection(db, CONV, convId, 'messages'),
      orderBy('createdAt', 'desc'),
      fsLimit(1),
    ));
    const last = snap.docs[0]?.data();
    const preview = last
      ? (last.videoUrl ? '🎬 동영상'
         : ((last.imageUrl || (Array.isArray(last.imageUrls) && last.imageUrls.length)) ? '📷 사진' : (last.body || '')))
      : '';
    await updateDoc(doc(db, CONV, convId), last
      ? { lastMessage: preview, lastSenderUid: last.senderUid || null, lastAt: last.createdAt || serverTimestamp(), updatedAt: serverTimestamp() }
      : { lastMessage: '', lastSenderUid: null, lastAt: serverTimestamp(), updatedAt: serverTimestamp() });
  } catch (e) { if (__DEV__) console.warn('[dm] delete meta recompute', e?.message); }
}

// 대화방 '나만 목록에서 지우기' — clearedAt.{내uid}=서버시간 기록(상대 영향 0, 새 메시지 오면 부활). 규칙은 clearedAt 본인 키만 허용.
export async function clearConversation(convId) {
  const uid = await getUid();
  if (!uid || !convId) return;
  await updateDoc(doc(db, CONV, convId), { [`clearedAt.${uid}`]: serverTimestamp() });
}

// 총 안읽음 수 — 내 대화방 unread.{uid} 합산(명함 💬 진입점 뱃지용). 숨긴(cleared) 방은 loadMyConversations에서 이미 제외됨.
export async function loadUnreadTotal() {
  const uid = await getUid();
  if (!uid) return 0;
  const convs = await loadMyConversations();
  return convs.reduce((s, c) => s + (c.unread?.[uid] || 0), 0);
}

// 공감(리액션) — 메시지 reactions 맵에 '내 uid 키'만 set/제거(보안규칙과 1:1 대응, 본문 불변).
//   emoji=null이면 해제. 실패(차단·친구해지 permission-denied)는 호출부에서 조용히 처리(차단 비노출 정책).
export async function setReaction(convId, msgId, emoji) {
  const uid = await getUid();
  if (!uid || !convId || !msgId) throw new Error('dm: reaction args');
  await updateDoc(doc(db, CONV, convId, 'messages', msgId), {
    [`reactions.${uid}`]: emoji || deleteField(),
  });
}

// 읽음 표시 — 내가 이 방을 본 시각(lastRead.{내uid})을 서버시간으로 갱신. 대화방 열림·새 메시지 수신 시 호출.
//   상대는 conversation 문서를 구독 중이라 자기 화면의 내 말풍선에 '읽음(✓✓)'이 실시간 반영됨.
//   실패(차단·친구해지 등)는 조용히 무시 — 읽음표시는 부가 정보라 막혀도 대화엔 영향 없음.
export async function markConversationRead(convId) {
  const uid = await getUid();
  if (!uid || !convId) return;
  try { await updateDoc(doc(db, CONV, convId), { [`lastRead.${uid}`]: serverTimestamp(), [`unread.${uid}`]: 0 }); }
  catch (e) { if (__DEV__) console.warn('[dm] markRead', e?.message); }
}

// 입력 중(타이핑) 표시 — conv 문서 typing.{uid} 갱신(true=serverTimestamp)/해제(deleteField). 디바운스는 호출부(컴포넌트).
export async function setTyping(convId, isTyping) {
  const uid = await getUid();
  if (!uid || !convId) return;
  try { await updateDoc(doc(db, CONV, convId), { [`typing.${uid}`]: isTyping ? serverTimestamp() : deleteField() }); }
  catch (e) { if (__DEV__) console.warn('[dm] typing', e?.message); }
}

// 대화방 메타(conversation) 1건 실시간 구독 — lastRead 맵으로 상대의 읽음 시각을 받기 위함(대화방 열린 동안만, 1문서라 저렴).
export function subscribeConversation(convId, cb) {
  if (!convId) return () => {};
  return onSnapshot(doc(db, CONV, convId), (snap) => {
    cb(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }, (err) => { if (__DEV__) console.warn('[dm] conversation snapshot', err?.message); });
}

// 대화방 메시지 실시간 구독 — 최근 limitN개. 대화방 열린 동안만(닫을 때 반환된 unsub 호출해 비용 차단).
//   createdAt desc로 받아 화면용으로 오래된→최신 순서로 뒤집어 전달.
export function subscribeMessages(convId, cb, limitN = 40) {
  if (!convId) return () => {};
  const q = query(
    collection(db, CONV, convId, 'messages'),
    orderBy('createdAt', 'desc'),
    fsLimit(limitN),
  );
  return onSnapshot(q, (snap) => {
    const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    msgs.reverse();
    cb(msgs);
  }, (err) => { if (__DEV__) console.warn('[dm] messages snapshot', err?.message); });
}

// 내 대화방 목록 1회 로드 — 참여 중 conversations, 최근 활동(lastAt)순. 빈 방(메시지 없음) 제외.
export async function loadMyConversations() {
  const uid = await getUid();
  if (!uid) return [];
  const q = query(
    collection(db, CONV),
    where('participantUids', 'array-contains', uid),
    orderBy('lastAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.lastMessage && !isCleared(c, uid));
}

// 내 대화방 목록 실시간 구독 — 목록 화면 열린 동안만. uid는 호출부에서(getUid는 async).
export function subscribeConversations(uid, cb) {
  if (!uid) return () => {};
  const q = query(
    collection(db, CONV),
    where('participantUids', 'array-contains', uid),
    orderBy('lastAt', 'desc'),
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.lastMessage && !isCleared(c, uid)));
  }, (err) => { if (__DEV__) console.warn('[dm] conversations snapshot', err?.message); });
}
