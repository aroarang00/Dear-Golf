// =============================================================
// 월 결산 푸시 — 매월 1일 10:00 KST ([[record-share-redesign]] 2026-10-11)
//
//   결산 카드는 '때'(월초·시즌 끝)가 정해져 있어 그때 한 번 찔러주면 열어본다. 앱 안 띠(RecapBanner)는 1~10일만 뜨고,
//   이 푸시는 그 첫날 한 번. 지난달 라운딩이 1건이라도 있는 사용자에게만(없는 사람에게 '0회'는 소음).
//   12월 1일 = 올해 시즌 결산(국내 시즌 3~11월) · 그 외 1일 = 바로 지난달 결산. 1월 1일은 12월 월 결산(있는 사람만).
//   탭 → 클라(App.js) data.type==='recap' → 홈 openRecap 파라미터 → 결산 모달 바로 열림.
//   토글 = 마이페이지 알림 '월간 결산'(users.settings.notifyPrefs.recap, 기본 ON, false면 발송 안 함).
//
//   읽기 비용 = 기간 내 rounds 한 번(date 단일 필드 범위, 복합 인덱스 불필요) + 대상 사용자 수만큼 users 문서. 소규모라 가볍다.
//   날짜는 'YYYY.MM.DD' 문자열(사전순 = 시간순)이라 'YYYY.MM.01' ~ 'YYYY.MM.31' 범위로 자른다.
// =============================================================
const { getFirestore } = require('firebase-admin/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');
const { sendExpoPush } = require('./push');

const db = getFirestore();
const pad2 = (n) => String(n).padStart(2, '0');

// 오늘(KST) 기준 이번에 보낼 결산 기간 — 12월 1일이면 올해 시즌(month=null), 아니면 바로 지난달.
//   ※앱 띠(recap.js timelyRecap)는 10~12월에 시즌 결산을 먼저 띄우지만, 푸시는 10/1·11/1에 '9월·10월 결산'을 보낸다 — 의도된 차이:
//   시즌이 아직 진행 중이라 월 숫자가 더 새롭고, 탭하면 열리는 월 카드에서 '연' 칩으로 시즌도 바로 본다. 1/1은 12월 라운딩 있는 사람만(시즌은 12/1에 이미 감).
function periodFor(nowUtc = new Date()) {
  const kst = new Date(nowUtc.getTime() + 9 * 3600 * 1000);
  const y = kst.getUTCFullYear(), m = kst.getUTCMonth() + 1;
  if (m === 12) return { year: y, month: null };
  return m === 1 ? { year: y - 1, month: 12 } : { year: y, month: m - 1 };
}

// 기간의 date 문자열 범위 [from, to] (양끝 포함)
function dateRange({ year, month }) {
  if (month == null) return [`${year}.01.01`, `${year}.12.31`];
  return [`${year}.${pad2(month)}.01`, `${year}.${pad2(month)}.31`];
}

// 사용자별 요약 — 라운딩(kind!=='moment')만, 평균은 score>0인 기록만(클라 recap.js avgOf와 같은 규칙).
function summarize(rounds) {
  const byUser = new Map();
  for (const r of rounds) {
    if (!r || !r.ownerUid || r.kind === 'moment') continue;
    const e = byUser.get(r.ownerUid) || { count: 0, scores: [] };
    e.count += 1;
    if (typeof r.score === 'number' && r.score > 0) e.scores.push(r.score);
    byUser.set(r.ownerUid, e);
  }
  const out = new Map();
  for (const [uid, e] of byUser) {
    const avg = e.scores.length ? Math.round((e.scores.reduce((a, b) => a + b, 0) / e.scores.length) * 10) / 10 : null;
    out.set(uid, { count: e.count, avg });
  }
  return out;
}

// 푸시 문구 — 숫자가 서사라 제목보다 본문에 숫자를 둔다. 평균이 없으면(스코어 미입력) 횟수만.
function messageFor({ year, month }, { count, avg }) {
  const avgTxt = avg != null ? ` · 평균 ${avg}타` : '';
  if (month == null) {
    return { title: `${year} 시즌 결산이 준비됐어요`, body: `올해 라운딩 ${count}회${avgTxt}. 한 해를 카드로 돌아봐요.` };
  }
  return { title: `${month}월 결산 카드가 준비됐어요`, body: `${month}월 라운딩 ${count}회${avgTxt}. 카드로 돌아봐요.` };
}

async function runMonthlyRecapPush(nowUtc = new Date()) {
  const period = periodFor(nowUtc);
  const [from, to] = dateRange(period);
  // select 투영 — 라운드 문서는 사진·홀별 점수 등이 커서 필요한 세 필드만 받는다(읽기 횟수는 같고 바이트·메모리만 줄어듦)
  const snap = await db.collection('rounds').select('ownerUid', 'kind', 'score').where('date', '>=', from).where('date', '<=', to).get();
  const summary = summarize(snap.docs.map((d) => d.data()));
  logger.info('[recapPush] period', period, 'rounds=', snap.size, 'users=', summary.size);

  let sent = 0, skipped = 0;
  const uids = [...summary.keys()];
  const CHUNK = 20;   // users 읽기·발송 동시성 상한
  for (let i = 0; i < uids.length; i += CHUNK) {
    await Promise.all(uids.slice(i, i + CHUNK).map(async (uid) => {
      try {
        const u = (await db.doc(`users/${uid}`).get()).data();
        if (!u?.pushToken || u.settings?.notifyPrefs?.recap === false) { skipped++; return; }
        const { title, body } = messageFor(period, summary.get(uid));
        await sendExpoPush(u.pushToken, title, body, { type: 'recap', year: period.year, month: period.month }, uid);
        sent++;
      } catch (e) { logger.warn('[recapPush] user fail', uid, e?.message); }
    }));
  }
  logger.info('[recapPush] done sent=', sent, 'skipped=', skipped);
  return { period, sent, skipped };
}

// 매월 1일 10:00 KST — 출근길 지나고 점심 전, 새벽 정리 틱(04~05시)과 겹치지 않는 시간.
exports.monthlyRecapPushTick = onSchedule({ schedule: '0 10 1 * *', timeZone: 'Asia/Seoul' }, async () => {
  await runMonthlyRecapPush();
});

// 순수 함수 노출(검증용)
exports._internal = { periodFor, dateRange, summarize, messageFor };
