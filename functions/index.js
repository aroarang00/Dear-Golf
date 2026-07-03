// =============================================================
// Dear Golf — Cloud Functions (2nd gen)
//
// 트리거 영역:
//   §A 라운지 자동 처리   — 만석 전환 알림, 대기자 자동 승격, D-7 취소 매너 평가
//   §B 노쇼 SLA          — 7일 grace, 48h 소명, 48h 검토
//   §C 매너 평가         — 48h 윈도우 후 익명 일괄 집계
//   §D 콘텐츠 신고 SLA   — 3일 자동 거부, 골퍼코멘트 3건 누적 자동 가림
//   §E 푸시 발송         — Expo Push API 통해 알림 발송
//   §F 스케줄            — banned_users 만료, 12개월 카운트 -1
//
// 각 영역은 별도 파일로 분리 권장 (현재는 스켈레톤만).
// =============================================================

const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { onDocumentCreated, onDocumentUpdated, onDocumentDeleted } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');

initializeApp();
const db = getFirestore();

// =============================================================
// §E 푸시 발송 — Expo Push API
// 알림 문서 생성 시 자동 발송. 사용자 settings.roundupNotifyPrefs로 일반 알림 토글 가능.
// 중요 알림(priority='important')은 토글 무시하고 항상 발송.
// =============================================================

// ownerUid — 이 토큰의 주인. DeviceNotRegistered(앱 삭제·토큰 만료) 티켓이 오면 그 토큰을 정리해
//   다음부터 헛발송을 막고 '테스터별 안 옴'을 진단 가능하게 한다(주면 정리, 없으면 로깅만).
async function sendExpoPush(token, title, body, data = {}, ownerUid = null) {
  if (!token) return;
  try {
    const fetch = (await import('node-fetch')).default;
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: token,
        sound: 'default',
        title,
        body,
        data,
        channelId: 'default',   // Android — 클라가 만든 고중요도 채널로 라우팅(heads-up·소리)
        priority: 'high',       // 도즈/저전력에서도 지연 없이(FCM high priority)
      }),
    });
    if (!res.ok) {
      logger.warn('[push] expo api non-ok', res.status);
      return;
    }
    // 티켓 검사 — 200이어도 개별 티켓에 DeviceNotRegistered 등 오류가 담김. 무시하면 조용한 미수신 진단 불가.
    const json = await res.json().catch(() => null);
    const ticket = Array.isArray(json?.data) ? json.data[0] : json?.data;
    if (ticket && ticket.status === 'error') {
      logger.warn('[push] ticket error', ticket.message || '', ticket.details?.error || '');
      // 죽은 토큰 정리 — 더는 유효하지 않은 토큰은 users 문서에서 제거(다음 발송부터 스킵)
      if (ownerUid && ticket.details?.error === 'DeviceNotRegistered') {
        await db.doc(`users/${ownerUid}`).update({ pushToken: FieldValue.delete() }).catch(() => {});
      }
    }
  } catch (e) {
    logger.warn('[push] send fail', e?.message);
  }
}

// 팬아웃 상한 — audience(초대·공유) 푸시 대상 수 제한. 악의적으로 audienceUids를 크게 넣어
//   user read·푸시를 폭증시키는 남용 방어. 정상 사용(소수 동반자·친구 소그룹)은 한참 못 미침.
//   초과 시 앞 MAX_FANOUT명에만 발송하고 경고 로그(조용한 누락 금지). 룰 단의 배열 크기 제한과 별개 방어선.
const MAX_FANOUT = 50;
function capFanout(targets, ctx) {
  if (targets.length > MAX_FANOUT) {
    logger.warn('[fanout] capped', ctx, 'requested=', targets.length, 'sent=', MAX_FANOUT);
    return targets.slice(0, MAX_FANOUT);
  }
  return targets;
}

// roundupNotifications 생성 시 푸시 발송 (인앱은 클라이언트가 직접 읽음)
exports.onNotificationCreated = onDocumentCreated('roundupNotifications/{notiId}', async (event) => {
  const data = event.data?.data();
  if (!data) return;
  const { recipientUid, type, postTitle, actorName, priority, scheduleDate, scheduleTime } = data;
  if (!recipientUid) return;

  // 수신자 settings 조회 — 일반 알림이면 토글 체크, 중요 알림은 무시
  const userSnap = await db.doc(`users/${recipientUid}`).get();
  if (!userSnap.exists) return;
  const user = userSnap.data();
  // 라운지 알림(roundupNotifyPrefs) + 마이페이지 알림(notifyPrefs: friendRequest 등) 양쪽 토글 병합
  const prefs = { ...(user.settings?.roundupNotifyPrefs || {}), ...(user.settings?.notifyPrefs || {}) };
  const isImportant = priority === 'important';
  // 일반 알림은 type별 토글 체크
  if (!isImportant && prefs[type] === false) return;

  const token = user.pushToken;
  if (!token) return;

  const title = titleFor(type);
  const body = bodyFor(type, { postTitle, actorName, scheduleDate, scheduleTime });
  await sendExpoPush(token, title, body, { type, postId: data.postId, notiId: event.params.notiId }, recipientUid);
});

// DM 메시지 생성 시 상대에게 푸시 — 마이페이지 'DM 알림' 토글(settings.notifyPrefs.dm) 기본 ON, false면 차단.
//   친구 1:1이라 수신자=상대 1명. 인앱 알림함(roundupNotifications)은 안 거치고 푸시만 보냄(알림함 오염 방지).
//   안 읽음·대화방별 음소거는 출시 후([[dm-design]]). 수신자가 방을 열어둔 경우의 중복은 감수(presence 미구현).
exports.onDmMessageCreated = onDocumentCreated('conversations/{pairId}/messages/{msgId}', async (event) => {
  const msg = event.data?.data();
  if (!msg || !msg.senderUid) return;
  const senderUid = msg.senderUid;
  // 미디어 메시지(사진·영상)는 body=''라 미리보기 텍스트로 대체 — 없으면(빈 메시지) 스킵.
  const hasImage = msg.imageUrl || (Array.isArray(msg.imageUrls) && msg.imageUrls.length);
  const preview = msg.body
    ? (msg.body.length > 80 ? `${msg.body.slice(0, 80)}…` : msg.body)
    : (msg.videoUrl ? '🎬 동영상' : (hasImage ? '📷 사진' : ''));
  if (!preview) return;
  try {
    const convSnap = await db.doc(`conversations/${event.params.pairId}`).get();
    const participants = convSnap.exists ? (convSnap.data().participantUids || []) : [];
    const recipientUid = participants.find(u => u && u !== senderUid);
    if (!recipientUid) return;
    // 안읽음 카운트 +1 (수신자) — DM 목록 뱃지용. 수신자가 방을 열어 읽으면 markConversationRead가 본인 unread를 0으로 리셋.
    //   ★멱등 — Firestore 트리거는 at-least-once라 같은 메시지 이벤트가 재전송되면 중복 +1(유령 안읽음). 메시지에
    //     unreadCounted 표식을 트랜잭션으로 달아 1회만 증가(contentReports countedAt와 동일 패턴).
    const msgRef = event.data.ref;
    const convRef = db.doc(`conversations/${event.params.pairId}`);
    await db.runTransaction(async (tx) => {
      const m = await tx.get(msgRef);
      if (!m.exists || m.data().unreadCounted) return;   // 이미 카운트된 메시지(재전송) → 스킵
      tx.update(msgRef, { unreadCounted: true });
      tx.update(convRef, { [`unread.${recipientUid}`]: FieldValue.increment(1) });
    }).catch((e) => logger.warn('[dm] unread inc', e?.message));
    const [rSnap, sSnap] = await Promise.all([
      db.doc(`users/${recipientUid}`).get(),
      db.doc(`users/${senderUid}`).get(),
    ]);
    if (!rSnap.exists) return;
    const r = rSnap.data();
    if (r.settings?.notifyPrefs?.dm === false) return;   // 마이페이지에서 DM 알림 OFF
    // 수신자가 발신자를 차단 — 푸시 차단(규칙이 전송을 막지만, 규칙 배포 전 잔존 메시지·우회 방어)
    if (Array.isArray(r.blockedUids) && r.blockedUids.includes(senderUid)) return;
    const token = r.pushToken;
    if (!token) return;
    const senderName = (sSnap.exists && sSnap.data().nickname) ? sSnap.data().nickname : '친구';
    await sendExpoPush(token, senderName, preview, { type: 'dm', pairId: event.params.pairId, senderUid }, recipientUid);
  } catch (e) {
    logger.warn('[dm] push fail', e?.message);
  }
});

// 일정 전파 초대 생성 시 audience(초대받은 친구)에게 푸시 — 홈 배너가 인앱 담당, 푸시만(알림함 미오염, DM과 동일 패턴).
//   audienceUids 다수라 병렬 발송. 본인·토큰없음·토글 OFF는 건너뜀. ([[schedule-propagation-spec]])
exports.onScheduleGroupCreated = onDocumentCreated('scheduleGroups/{groupId}', async (event) => {
  const g = event.data?.data();
  if (!g || !g.initiatorUid || !Array.isArray(g.audienceUids)) return;
  const targets = g.audienceUids.filter(u => u && u !== g.initiatorUid);
  if (!targets.length) return;
  const courseT = g.course ? `'${g.course}'` : '라운딩';
  const body = `${g.initiatorName ? g.initiatorName + '님이 ' : ''}${courseT} 일정에 초대했어요${g.date ? ` — ${g.date}` : ''}`;
  await Promise.all(capFanout(targets, 'scheduleInvite').map(async (uid) => {
    try {
      const snap = await db.doc(`users/${uid}`).get();
      if (!snap.exists) return;
      const u = snap.data();
      if (u.settings?.notifyPrefs?.scheduleInvite === false) return;
      if (!u.pushToken) return;
      await sendExpoPush(u.pushToken, '일정 초대', body, { type: 'scheduleInvite', groupId: event.params.groupId }, uid);
    } catch (e) { logger.warn('[scheduleInvite] push fail', e?.message); }
  }));
});

// 일정 전파 — 추가 초대/재초대(업데이트)에도 푸시. onCreate는 최초 생성만 잡으므로, 친구를 나중에 더 부르거나
//   예전 거절/탈퇴자를 다시 부르면(declinedUids에서 제거=재초대) 새로 'pending'이 된 사람에게만 발송.
//   (수락·거절 등 다른 업데이트엔 targets=0이라 무발송 — 중복 푸시 방지) ([[schedule-propagation-spec]])
exports.onScheduleGroupUpdated = onDocumentUpdated('scheduleGroups/{groupId}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after || !after.initiatorUid || !Array.isArray(after.audienceUids)) return;
  const beforeAud = Array.isArray(before.audienceUids) ? before.audienceUids : [];
  const beforeDeclined = Array.isArray(before.declinedUids) ? before.declinedUids : [];
  const afterMembers = Array.isArray(after.memberUids) ? after.memberUids : [];
  const afterDeclined = Array.isArray(after.declinedUids) ? after.declinedUids : [];
  // 새로 초대 가능해진 사람 = audience에 있고, 아직 멤버/거절 아니며, (신규 추가 OR 예전 declined에서 풀림=재초대)
  const targets = after.audienceUids.filter(u =>
    u && u !== after.initiatorUid &&
    !afterMembers.includes(u) &&
    !afterDeclined.includes(u) &&
    (!beforeAud.includes(u) || beforeDeclined.includes(u))
  );
  if (!targets.length) return;
  const courseT = after.course ? `'${after.course}'` : '라운딩';
  const body = `${after.initiatorName ? after.initiatorName + '님이 ' : ''}${courseT} 일정에 초대했어요${after.date ? ` — ${after.date}` : ''}`;
  await Promise.all(capFanout(targets, 'scheduleInvite/update').map(async (uid) => {
    try {
      const snap = await db.doc(`users/${uid}`).get();
      if (!snap.exists) return;
      const u = snap.data();
      if (u.settings?.notifyPrefs?.scheduleInvite === false) return;
      if (!u.pushToken) return;
      await sendExpoPush(u.pushToken, '일정 초대', body, { type: 'scheduleInvite', groupId: event.params.groupId }, uid);
    } catch (e) { logger.warn('[scheduleInvite update] push fail', e?.message); }
  }));
});

// 크루(친구 소수그룹 공유앨범) 생성 시 초대받은 친구(audienceUids)에게 푸시 — 홈 글로우가 인앱 담당, 푸시만(알림함 미오염).
//   crews 생성 = createCrew(creator + 초대 audience). 일정 전파와 동일 패턴. ([[crew-space-design]])
exports.onCrewInvited = onDocumentCreated('crews/{crewId}', async (event) => {
  const c = event.data?.data();
  if (!c || !c.creatorUid || !Array.isArray(c.audienceUids)) return;
  const targets = c.audienceUids.filter(u => u && u !== c.creatorUid);
  if (!targets.length) return;
  const creatorName = (c.names && c.names[c.creatorUid]) || '';
  const crewT = c.name ? `'${c.name}'` : '크루';
  const body = `${creatorName ? creatorName + '님이 ' : ''}${crewT} 크루에 초대했어요`;
  await Promise.all(capFanout(targets, 'crewInvite').map(async (uid) => {
    try {
      const snap = await db.doc(`users/${uid}`).get();
      if (!snap.exists) return;
      const u = snap.data();
      if (u.settings?.notifyPrefs?.crewInvite === false) return;
      if (!u.pushToken) return;
      await sendExpoPush(u.pushToken, '크루 초대', body, { type: 'crewInvite', crewId: event.params.crewId }, uid);
    } catch (e) { logger.warn('[crewInvite] push fail', e?.message); }
  }));
});

// 크루 — 추가 초대/재초대(업데이트)에도 푸시. onCreate는 최초만 잡으므로, 멤버가 친구를 더 부르거나(inviteToCrew)
//   예전 거절자를 재초대(declinedUids에서 제거)하면 새로 audience가 된 사람에게만 발송.
//   (수락·탈퇴·이름변경·공지·게시 등 다른 업데이트엔 targets=0이라 무발송 — 중복 푸시 방지)
exports.onCrewInviteUpdated = onDocumentUpdated('crews/{crewId}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after || !after.creatorUid || !Array.isArray(after.audienceUids)) return;
  const beforeAud = Array.isArray(before.audienceUids) ? before.audienceUids : [];
  const beforeDeclined = Array.isArray(before.declinedUids) ? before.declinedUids : [];
  const afterMembers = Array.isArray(after.memberUids) ? after.memberUids : [];
  const afterDeclined = Array.isArray(after.declinedUids) ? after.declinedUids : [];
  const targets = after.audienceUids.filter(u =>
    u && u !== after.creatorUid &&
    !afterMembers.includes(u) &&
    !afterDeclined.includes(u) &&
    (!beforeAud.includes(u) || beforeDeclined.includes(u))
  );
  if (!targets.length) return;
  const crewT = after.name ? `'${after.name}'` : '크루';
  const body = `${crewT} 크루에 초대받았어요`;   // 초대자=임의 멤버라 이름 생략(정확성 우선)
  await Promise.all(capFanout(targets, 'crewInvite/update').map(async (uid) => {
    try {
      const snap = await db.doc(`users/${uid}`).get();
      if (!snap.exists) return;
      const u = snap.data();
      if (u.settings?.notifyPrefs?.crewInvite === false) return;
      if (!u.pushToken) return;
      await sendExpoPush(u.pushToken, '크루 초대', body, { type: 'crewInvite', crewId: event.params.crewId }, uid);
    } catch (e) { logger.warn('[crewInvite update] push fail', e?.message); }
  }));
});

// 크루 — 마지막 멤버가 나가 memberUids가 빈 배열이 되면 즉시 크루 문서 삭제.
//   (읽기=멤버 한정이라 아무도 못 보는 죽은 데이터 → 개인정보 최소화. 실제 정리는 onCrewDeleted가 처리)
exports.onCrewEmptied = onDocumentUpdated('crews/{crewId}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after) return;
  const beforeMembers = Array.isArray(before.memberUids) ? before.memberUids : [];
  const afterMembers = Array.isArray(after.memberUids) ? after.memberUids : [];
  if (beforeMembers.length === 0 || afterMembers.length !== 0) return;   // '있다가 0' 전이만
  try {
    await db.doc(`crews/${event.params.crewId}`).delete();   // → onCrewDeleted가 하위 정리
    logger.info('[crewEmptied] last member left, crew deleted', event.params.crewId);
  } catch (e) { logger.error('[crewEmptied] delete fail', event.params.crewId, e?.message); }
});

// Firebase 다운로드 URL → Storage 객체 경로 (rounds/{uid}/m_....jpg)
function storagePathFromUrl(url) {
  try {
    const m = String(url || '').match(/\/o\/([^?]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch (e) { return null; }
}

// 크루 문서 삭제 시(빈 크루 정리 또는 생성자 수동삭제) — 하위 posts·comments(recursiveDelete) + Storage 미디어 제거.
//   ★활발한 크루(게시물·미디어 많음)도 타임아웃 안 나게: Firestore는 recursiveDelete 일괄, Storage는 10개씩 병렬.
//   timeout/memory 상향(기본 60s론 부족할 수 있음).
exports.onCrewDeleted = onDocumentDeleted(
  { document: 'crews/{crewId}', timeoutSeconds: 540, memory: '512MiB' },
  async (event) => {
    const crewId = event.params.crewId;
    // ★단계별 독립 처리 — 한 단계가 실패해도 나머지는 진행(예전엔 단일 try라 recursiveDelete 실패 시
    //   Storage 정리가 통째로 스킵돼 미디어가 고아로 남았다). URL은 1)에서 먼저 확보해 2) 실패와 무관하게 3) 수행.
    // 1) 삭제 전에 Storage 미디어 URL 수집
    let urls = [];
    try {
      const postsSnap = await db.collection(`crews/${crewId}/posts`).get();
      postsSnap.forEach((d) => {
        (Array.isArray(d.data().media) ? d.data().media : []).forEach((m) => {
          if (m?.uri) urls.push(m.uri);
          if (m?.poster) urls.push(m.poster);
        });
      });
      logger.info('[crewDeleted] media collected', crewId, 'posts=', postsSnap.size, 'media=', urls.length);
    } catch (e) { logger.error('[crewDeleted] posts read fail', crewId, e?.message); }
    // 2) Firestore 하위(posts + 그 안 comments) 일괄 삭제 — Admin recursiveDelete(서브컬렉션까지)
    try {
      await db.recursiveDelete(db.doc(`crews/${crewId}`));
    } catch (e) { logger.error('[crewDeleted] recursiveDelete fail', crewId, e?.message); }
    // 3) Storage 미디어 삭제 — 10개씩 묶어 병렬. recursiveDelete 성패와 무관하게 수집된 urls로 정리(개별 실패는 무시·로깅).
    const bucket = getStorage().bucket();
    for (let i = 0; i < urls.length; i += 10) {
      await Promise.all(urls.slice(i, i + 10).map(async (u) => {
        const path = storagePathFromUrl(u);
        if (!path) return;
        try { await bucket.file(path).delete(); } catch (e) { logger.warn('[crewDeleted] media del', path, e?.message); }
      }));
    }
    logger.info('[crewDeleted] done', crewId, 'media=', urls.length);
  },
);

// 스코어 공유 생성 시 audience(동반자)에게 푸시 — MY 배너가 인앱 담당, 푸시로 발견성 보강(사용자 요청 2026-06-17).
exports.onScoreShareCreated = onDocumentCreated('roundScoreShares/{shareId}', async (event) => {
  const s = event.data?.data();
  if (!s || !s.authorUid || !Array.isArray(s.audienceUids)) return;
  const targets = s.audienceUids.filter(u => u && u !== s.authorUid);
  if (!targets.length) return;
  const courseT = s.course ? `'${s.course}'` : '라운딩';
  const body = `${s.authorName ? s.authorName + '님이 ' : ''}${courseT} 스코어를 공유했어요 — 내 점수를 추가해보세요`;
  await Promise.all(capFanout(targets, 'scoreShare').map(async (uid) => {
    try {
      const snap = await db.doc(`users/${uid}`).get();
      if (!snap.exists) return;
      const u = snap.data();
      if (u.settings?.notifyPrefs?.scoreShare === false) return;
      if (!u.pushToken) return;
      await sendExpoPush(u.pushToken, '스코어 공유', body, { type: 'scoreShare', shareId: event.params.shareId }, uid);
    } catch (e) { logger.warn('[scoreShare] push fail', e?.message); }
  }));
});

// 뒤풀이 결정 생성 시 동반자(audience)에게 푸시 — 홈 카드/시트가 인앱 담당, 푸시로 알림. ([[afterround-meal-decision]])
//   제안=결정 단순화(2026-06-18): 최초 제안 = decided. 장소 변경은 update라 아래 onMealSuggestionUpdated가 별도 푸시.
exports.onMealSuggestionCreated = onDocumentCreated('mealSuggestions/{id}', async (event) => {
  const m = event.data?.data();
  if (!m || !m.authorUid || !Array.isArray(m.audienceUids)) return;
  const targets = m.audienceUids.filter(u => u && u !== m.authorUid);
  if (!targets.length) return;
  const placeName = m.place?.name || '식당';
  const body = `${m.authorName ? m.authorName + '님이 ' : ''}식사 장소를 '${placeName}'(으)로 정했어요${m.course ? ` — ${m.course}` : ''}`;
  await Promise.all(capFanout(targets, 'meal').map(async (uid) => {
    try {
      const snap = await db.doc(`users/${uid}`).get();
      if (!snap.exists) return;
      const u = snap.data();
      if (u.settings?.notifyPrefs?.mealSuggestion === false) return;
      if (!u.pushToken) return;
      await sendExpoPush(u.pushToken, '함께 식사', body, { type: 'mealSuggestion', mealId: event.params.id }, uid);
    } catch (e) { logger.warn('[meal] push fail', e?.message); }
  }));
});

// 뒤풀이 장소 변경 시 동반자에게 재푸시 — 총대가 식당을 바꾸면 동반자도 알아야 함(엉뚱한 데로 가는 사고 방지).
//   place가 실제로 바뀐 경우만(같은 곳/기타 필드 변경엔 푸시 X). type은 동일 'mealSuggestion'(탭하면 홈).
exports.onMealSuggestionUpdated = onDocumentUpdated('mealSuggestions/{id}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after || !after.authorUid || !Array.isArray(after.audienceUids)) return;
  const beforeKey = before.place?.kakaoId || before.place?.name || '';
  const afterKey = after.place?.kakaoId || after.place?.name || '';
  if (!afterKey || beforeKey === afterKey) return; // 장소 변경 없음 → 푸시 X
  const targets = after.audienceUids.filter(u => u && u !== after.authorUid);
  if (!targets.length) return;
  const placeName = after.place?.name || '식당';
  const body = `${after.authorName ? after.authorName + '님이 ' : ''}식사 장소를 '${placeName}'(으)로 바꿨어요${after.course ? ` — ${after.course}` : ''}`;
  await Promise.all(capFanout(targets, 'meal/update').map(async (uid) => {
    try {
      const snap = await db.doc(`users/${uid}`).get();
      if (!snap.exists) return;
      const u = snap.data();
      if (u.settings?.notifyPrefs?.mealSuggestion === false) return;
      if (!u.pushToken) return;
      await sendExpoPush(u.pushToken, '함께 식사 변경', body, { type: 'mealSuggestion', mealId: event.params.id }, uid);
    } catch (e) { logger.warn('[meal] change push fail', e?.message); }
  }));
});

// 푸시 제목·본문 — 인앱 알림함(RoundupNotifications.js notiText)과 타입·톤 일치.
// 누락 타입은 default로 빠지므로, 새 알림 타입 추가 시 양쪽 모두 갱신할 것.
function titleFor(type) {
  switch (type) {
    // 라운지 일반
    case 'apply':       return '새 참여 신청';
    case 'confirmed':   return '참여 확정';
    case 'cancel':      return '참여 취소';
    case 'waitlist':    return '새 대기 신청';
    case 'waitlistPromoted': return '대기 즉시 참석 확정';
    case 'comment':     return '새 댓글';
    case 'mannerEval':  return '매너 평가 요청';
    case 'hostCancelledD7': return '모집 취소 안내';
    case 'scheduleNotice':  return '라운딩 일정 알림';
    case 'friendRequest':   return '새 친구 신청';
    case 'invite':          return '라운딩 초대';
    case 'roundupChanged':  return '모집 내용 변경';
    case 'roundupCancelled': return '모집 취소';
    case 'roundupFull':     return '모집 인원 마감';
    case 'scheduleChanged':   return '일정 변경';
    case 'scheduleCancelled': return '일정 취소';
    // 노쇼 신고
    case 'noshowReported':            return '노쇼 신고 접수';
    case 'noshowReportSubmitted':     return '노쇼 신고 접수됨';
    case 'noshowExplanationRequired': return '소명 요청';
    case 'noshowConfirmed':           return '노쇼 확정';
    case 'noshowReporterConfirmed':   return '노쇼 신고 처리';
    case 'noshowFalseReport':         return '신고 결과 안내';
    case 'noshowFalseReportConfirmed':return '신고 결과 안내';
    case 'noshowInconclusive':        return '노쇼 신고 종결';
    case 'noshowCancelled':           return '노쇼 신고 취소';
    // 정지·등급
    case 'permanentBanAppealNotice':  return '영구 정지 예정 안내';
    case 'permanentBanFinalized':     return '영구 정지 확정';
    case 'recruitBanPermanentFinalized': return '모집 자격 박탈 확정';
    case 'restrictionLifted':         return '이용 정지 해제';
    case 'mannerScoreUp':             return '매너 등급 상승';
    case 'mannerScoreDown':           return '매너 등급 변동';
    // 콘텐츠 신고
    case 'contentReportConfirmed':    return '게시물 신고 결과';
    case 'contentRecruitBan30d':      return '모집 정지 안내';
    default:            return 'Dear Golf 알림';
  }
}

function bodyFor(type, { postTitle = '', actorName = '', scheduleDate = '', scheduleTime = '' }) {
  const t = postTitle ? `'${postTitle}'` : '라운딩';
  switch (type) {
    case 'scheduleNotice': {
      const when = [scheduleDate, scheduleTime].filter(Boolean).join(' ');
      return `${actorName ? actorName + '님이 ' : ''}${t} 일정을 알렸어요${when ? ` — ${when}` : ''}`;
    }
    case 'friendRequest': return `${actorName || '누군가'}님이 친구 신청을 보냈어요`;
    // 오픈형은 코스 미정 → postTitle 빈값이라 코스명 있을 때만 표기 (notiText와 동일)
    case 'invite':      return `${actorName || '친구'}님이 ${postTitle ? `'${postTitle}' ` : ''}라운딩에 초대했어요`;
    // 라운지 일반
    case 'apply':       return `${actorName}님이 ${t} 모집에 참여 신청했어요`;
    case 'confirmed':   return `${t} 모집 참여가 확정됐어요`;
    case 'cancel':      return `${actorName}님이 ${t} 모집 참여를 취소했어요`;
    case 'waitlist':    return `${actorName}님이 ${t} 모집에 대기 신청했어요`;
    case 'waitlistPromoted': return `대기 중이던 ${t} 모집에 자리가 나서 즉시 참석이 확정됐어요 — 모집에서 확인하세요`;
    case 'comment':     return `${actorName}님이 ${t} 모집에 댓글을 남겼어요`;
    case 'mannerEval':  return `${t} 라운딩이 끝났어요 — 동반자분들 어떠셨어요?`;
    case 'hostCancelledD7': return `${t} 모집이 주최자에 의해 취소됐어요 — 매너 평가를 남길 수 있어요`;
    case 'roundupChanged':  return `${t} 모집 내용이 변경됐어요 — 날짜·장소·시간을 확인해주세요`;
    case 'roundupFull':     return `${t} 모집 인원이 다 모였어요 — '모집 확정하기'를 눌러 확정해주세요`;
    case 'scheduleChanged': {
      const when = [scheduleDate, scheduleTime].filter(Boolean).join(' ');
      return `${actorName ? actorName + '님이 ' : ''}${t} 일정을 변경했어요${when ? ` — ${when}` : ' — 확인해주세요'}`;
    }
    case 'scheduleCancelled': return `${actorName ? actorName + '님이 ' : ''}${t} 일정을 취소했어요${scheduleDate ? ` (${scheduleDate})` : ''}`;
    case 'roundupCancelled': return postTitle
      ? `${actorName ? actorName + '님의 ' : ''}'${postTitle}'${scheduleDate ? ` (${scheduleDate})` : ''} 모집이 취소됐어요`
      : `${actorName ? actorName + '님이 만든 ' : ''}모집이 취소됐어요`;
    // 노쇼 신고
    case 'noshowReported':            return `${t} 라운딩 노쇼 신고가 접수됐어요 — 7일 안에 신고자와 직접 해결할 수 있어요`;
    case 'noshowReportSubmitted':     return `${t} 라운딩 노쇼 신고가 정상 접수됐어요`;
    case 'noshowExplanationRequired': return `${t} 노쇼 신고 — 48시간 안에 소명을 제출해주세요`;
    case 'noshowConfirmed':           return `${t} 노쇼가 확정되어 매너 등급과 이용 정지가 적용됐어요`;
    case 'noshowReporterConfirmed':   return `${t} 노쇼 신고가 인정됐어요`;
    case 'noshowFalseReport':         return `${t} 신고가 허위로 판정되어 매너 등급과 이용 정지가 적용됐어요`;
    case 'noshowFalseReportConfirmed':return `${t} 신고가 허위로 판정됐어요`;
    case 'noshowInconclusive':        return `${t} 노쇼 신고가 중립 종결됐어요 — 양쪽 모두 패널티 없음`;
    case 'noshowCancelled':           return `${t} 노쇼 신고가 신고자에 의해 취소됐어요`;
    // 정지·등급
    case 'permanentBanAppealNotice':  return `누적 위반으로 영구 정지가 예정됐어요 — 7일 안에 소명하지 않으면 자동 적용돼요`;
    case 'permanentBanFinalized':     return `영구 정지가 확정됐어요 — 이의는 마이페이지에서 신청할 수 있어요`;
    case 'recruitBanPermanentFinalized': return `영구 모집 자격 박탈이 확정됐어요 — 이의는 마이페이지에서 신청할 수 있어요`;
    case 'restrictionLifted':         return `이용 정지가 해제됐어요 — 다시 모집과 참여를 이용할 수 있어요`;
    case 'mannerScoreUp':             return `${t} 라운딩 평가로 매너 등급이 올랐어요`;
    case 'mannerScoreDown':           return `${t} 라운딩 평가로 매너 등급이 내려갔어요`;
    // 콘텐츠 신고
    case 'contentReportConfirmed':    return `작성하신 게시물 신고가 확정되어 매너 점수가 감소했어요`;
    case 'contentRecruitBan30d':      return `콘텐츠 신고 누적으로 30일 모집 정지가 적용됐어요`;
    default:            return postTitle || '확인해주세요';
  }
}

// =============================================================
// §B 노쇼 SLA — ./noshow.js (CF3)
//   onNoshowReportCreated   — 신고 접수 시 deadline 기록 + 피신고자 중대 알림
//   noshowSlaTick           — 시간당 스케줄러 (7일/48h/48h 자동 전환)
//   onNoshowReportUpdated   — 최종 상태 적용 (매너-20·정지·카운트+1, 양쪽 통보)
// =============================================================
const noshow = require('./noshow');
exports.onNoshowReportCreated = noshow.onNoshowReportCreated;
exports.noshowSlaTick = noshow.noshowSlaTick;
exports.onNoshowReportUpdated = noshow.onNoshowReportUpdated;

// =============================================================
// §C 매너 평가 — ./manner.js (CF4)
//   onRoundupCreatedForManner  — roundup 생성 시 mannerEvalDeadline 기록(scope='all'만)
//   mannerAggregationTick      — 시간당 스케줄러 (deadline 경과 모집 일괄 집계 + delta 적용)
// =============================================================
const manner = require('./manner');
exports.onRoundupCreatedForManner = manner.onRoundupCreatedForManner;
exports.mannerAggregationTick = manner.mannerAggregationTick;
exports.mannerEvalNotifyTick = manner.mannerEvalNotifyTick;

// =============================================================
// §F 스케줄러 — ./scheduled.js (CF7)
//   restrictionExpiryTick      — 매일 04:00 KST. 정지 만료 해제 + 통보
//   bannedExpiryTick           — 매일 04:30 KST. banned_users 만료 정리
//   monthlyPenaltyCountTick    — 매월 1일 00:30 KST. noshow/false 카운트 -1
// =============================================================
const scheduled = require('./scheduled');
exports.restrictionExpiryTick = scheduled.restrictionExpiryTick;
exports.bannedExpiryTick = scheduled.bannedExpiryTick;
exports.monthlyPenaltyCountTick = scheduled.monthlyPenaltyCountTick;
exports.permanentBanFinalizeTick = scheduled.permanentBanFinalizeTick;
exports.locationLogExpiryTick = scheduled.locationLogExpiryTick;

// =============================================================
// §D 콘텐츠 신고 — ./contentReports.js (CF5)
//   onContentReportCreated     — reportedCount +1, 골퍼코멘트 3건 누적 자동 가림
//   contentReportSlaTick       — 시간당 스케줄러 (3일 SLA 자동 거부)
//   onContentReportUpdated     — confirmed 시 게시물 삭제+누적·제재, rejected 시 가림 해제
// =============================================================
const contentReports = require('./contentReports');
exports.onContentReportCreated = contentReports.onContentReportCreated;
exports.contentReportSlaTick = contentReports.contentReportSlaTick;
exports.onContentReportUpdated = contentReports.onContentReportUpdated;

// §E TTL 정리 — scheduleGroups·mealSuggestions·roundScoreShares 무한 누적 정리(매일 04:00). [[stability-audit-2026-06]]
const ttlCleanup = require('./ttlCleanup');
exports.ttlCleanupTick = ttlCleanup.ttlCleanupTick;

// §G 영상 faststart 리먹스 — 업로드된 영상 moov atom을 앞으로 옮겨 '뜸 들이다 재생' 해소(rounds/·dmImages/).
const videoFaststart = require('./videoFaststart');
exports.faststartVideo = videoFaststart.faststartVideo;

// 일회성 — 옛 영상 일괄 리먹스(backfill). 2026-06-26 실행 완료(옛 영상 47개 리먹스, 실패 0) 후
//   함수 삭제(functions:delete)·export 비활성. 옛 영상이 또 쌓이면 아래 2줄 주석 해제→배포→호출→재삭제.
// const batchFaststart = require('./batchFaststart');
// exports.batchFaststart = batchFaststart.batchFaststart;

// =============================================================
// 운영 이메일 — ./email.js (SendGrid 신고 접수 알림)
// ⚠️ 비활성화 (2026-06-02): SendGrid 키 미발급이라 SENDGRID_API_KEY secret이 없어
//    배포가 막힘. 운영자 알림 전용이라 앱 기능엔 무관(신고는 Firestore에 기록되고
//    SLA·제재는 noshow.js/contentReports.js가 처리). SendGrid 설정 후 아래 4줄 주석 해제로 복구.
// const email = require('./email');
// exports.onReportCreatedEmail = email.onReportCreatedEmail;
// exports.onContentReportCreatedEmail = email.onContentReportCreatedEmail;
// exports.onNoshowReportCreatedEmail = email.onNoshowReportCreatedEmail;

// =============================================================
// §A 라운지 자동 — ./roundup.js (CF2)
//   onRoundupUpdated — 만석 전환 알림 / 자리 열림 시 대기자 자동 승격 / D-7 주최자 취소 매너 평가
// =============================================================
const roundup = require('./roundup');
exports.onRoundupUpdated = roundup.onRoundupUpdated;

// =============================================================
// 스코어카드 OCR — ./ocr.js (네이버 CLOVA OCR 프록시)
//   recognizeScorecard — onCall. 앱 이미지(base64) → CLOVA → 텍스트+좌표 반환
//   Secret: CLOVA_OCR_SECRET, CLOVA_OCR_URL (functions:secrets:set 으로 등록)
// =============================================================
const ocr = require('./ocr');
exports.recognizeScorecard = ocr.recognizeScorecard;
