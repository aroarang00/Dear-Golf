// =============================================================
// SendGrid 이메일 발송 — 신고 접수·운영자 알림
//
// 사용 흐름:
//   1) Firebase Functions config에 SendGrid API 키 등록:
//      firebase functions:config:set sendgrid.key="SG.xxx" sendgrid.from="deargolf.official@gmail.com" sendgrid.to="deargolf.official@gmail.com"
//   2) 또는 환경변수: SENDGRID_API_KEY / SENDGRID_FROM / SENDGRID_OPS_TO
//   3) reports / content_reports / noshowReports onCreate 트리거에서 발송
//
// SendGrid 미설정 시 silent fail — 운영 환경에서만 활성화.
// =============================================================

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const { logger } = require('firebase-functions');

const SENDGRID_KEY = defineSecret('SENDGRID_API_KEY');

const FROM = process.env.SENDGRID_FROM || 'deargolf.official@gmail.com';
const OPS_TO = process.env.SENDGRID_OPS_TO || 'deargolf.official@gmail.com';

async function sendOpsEmail(subject, body) {
  const key = SENDGRID_KEY.value();
  if (!key) {
    logger.info('[email] SENDGRID_API_KEY not configured, skipping');
    return;
  }
  try {
    const fetch = (await import('node-fetch')).default;
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: OPS_TO }] }],
        from: { email: FROM, name: 'Dear Golf System' },
        subject,
        content: [{ type: 'text/plain', value: body }],
      }),
    });
    if (!res.ok) {
      logger.warn('[email] sendgrid non-ok', res.status, await res.text().catch(() => ''));
    }
  } catch (e) {
    logger.warn('[email] send fail', e?.message);
  }
}

// 사용자 신고 접수 시 운영 이메일 알림
exports.onReportCreatedEmail = onDocumentCreated({ document: 'reports/{reportId}', secrets: [SENDGRID_KEY] }, async (event) => {
  const d = event.data?.data();
  if (!d) return;
  const subj = `[Dear Golf 신고] 사용자 신고 접수 (${d.reason})`;
  const body =
`사용자 신고가 접수됐습니다.

· 신고자 UID: ${d.reporterUid || '-'}
· 신고자 닉네임: ${d.reporterName || '-'}
· 대상자 UID: ${d.targetUid || '-'}
· 대상자 닉네임: ${d.targetName || '-'}
· 사유: ${d.reason || '-'}
· 근거:
${d.evidence || '-'}

신고 ID: ${event.params.reportId}
Firebase Console에서 검토 후 status를 confirmed/rejected로 변경하세요.
`;
  await sendOpsEmail(subj, body);
});

// 콘텐츠 신고 접수 시 운영 이메일 알림
exports.onContentReportCreatedEmail = onDocumentCreated({ document: 'content_reports/{reportId}', secrets: [SENDGRID_KEY] }, async (event) => {
  const d = event.data?.data();
  if (!d) return;
  const subj = `[Dear Golf 신고] 콘텐츠 신고 (${d.targetType} / ${d.reason})`;
  const body =
`콘텐츠 신고가 접수됐습니다.

· 신고자 UID: ${d.reporterUid || '-'}
· 대상 타입: ${d.targetType || '-'}
· 대상 ID: ${d.targetId || '-'}
· 대상 작성자 UID: ${d.targetAuthorUid || '-'}
· 사유: ${d.reason || '-'}
· 비고: ${d.note || '-'}

신고 ID: ${event.params.reportId}
3일 SLA 자동 거부 적용. 그 전에 confirmed/rejected 결정하세요.
`;
  await sendOpsEmail(subj, body);
});

// 노쇼 신고 접수 시 운영 이메일 알림
exports.onNoshowReportCreatedEmail = onDocumentCreated({ document: 'noshowReports/{reportId}', secrets: [SENDGRID_KEY] }, async (event) => {
  const d = event.data?.data();
  if (!d) return;
  const subj = `[Dear Golf 신고] 노쇼 신고 (7일 유예 시작)`;
  const body =
`노쇼 신고가 접수됐습니다. 7일 유예 후 자동으로 explanation_required 전환됩니다.

· 신고자 UID: ${d.reporterUid || '-'}
· 신고자 닉네임: ${d.reporterName || '-'}
· 피신고자 UID: ${d.reportedUid || '-'}
· 피신고자 닉네임: ${d.reportedName || '-'}
· 모집 ID: ${d.roundupId || '-'}
· 코스: ${d.roundupCourse || '-'} / 날짜: ${d.roundupDate || '-'}
· 사유: ${d.reason || '-'}

신고 ID: ${event.params.reportId}
`;
  await sendOpsEmail(subj, body);
});
