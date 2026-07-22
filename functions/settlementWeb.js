// =============================================================
// 정산서 웹 페이지 — 참가자가 앱 없이 '보냈어요'를 누르는 곳.
//
// ★왜 웹인가 (2026-07-22 결정)
//   카톡에선 "입완"이라 쓰면 스크롤에 묻히고, 방 나가기는 편법이고, 입금자명 규칙은 안 지켜진다
//   ("생각없이 보내다가 그냥 내 이름으로 보내기 일쑤" — 사용자). 각자 스스로 체크하는 게 제일 좋은데
//   카톡으로는 안 된다. 그게 이 앱이 할 수 있는 유일한 것.
//   ★단 앱 설치를 전제하면 안 된다 — 조편성이 "참가자 전원 앱 유저" 전제 때문에 죽은 전례가 있다.
//     그래서 링크 하나로 끝나는 웹 페이지로 만든다.
//
// ★왜 Cloud Function인가
//   Firestore 보안 규칙으로는 "토큰을 아는 사람만 읽기"를 표현할 수 없다(문서 읽기 시 클라이언트가
//   보낸 값과 대조할 수단이 없음). CF가 토큰을 검증하고 admin 권한으로 대신 읽어준다.
//   덕분에 settlements 규칙은 총무 전용 그대로 둔다.
//
// 경로(hosting rewrite /s/** → 이 함수)
//   GET  /s/{token}        정산서 HTML
//   POST /s/{token}        { memberId } → 그 사람을 '보냈어요'(claimed)로
// =============================================================
const { onRequest } = require('firebase-functions/v2/https');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');

const COLLECTION = 'settlements';
// 링크 유효기간 — 카톡방에 영영 남는 링크가 계속 열려 있으면 안 된다. 정산은 길어야 몇 주다.
const EXPIRE_DAYS = 120;
// 한 정산서에 허용하는 체크 횟수 상한 — 공개 엔드포인트라 장난으로 연타하는 걸 막는다.
const MAX_CLAIMS = 200;

const KIND_LABEL = { prepay: '선입금', meal: '식사 정산', etc: '기타' };
const won = (n) => Number(n || 0).toLocaleString('ko-KR');

// HTML 이스케이프 — 이름·상호는 사용자가 넣은 값이라 그대로 넣으면 스크립트 주입이 된다.
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function tokenFrom(req) {
  // hosting rewrite로 오면 path가 '/s/<token>' 형태. 함수 직접 호출도 대비해 마지막 조각을 쓴다.
  const raw = (req.path || '').split('/').filter(Boolean).pop() || '';
  return /^[A-Za-z0-9]{10,40}$/.test(raw) ? raw : '';
}

function expiredAt(doc) {
  const created = doc.createdAt?.toDate ? doc.createdAt.toDate().getTime() : 0;
  if (!created) return false;
  return Date.now() - created > EXPIRE_DAYS * 24 * 3600 * 1000;
}

function page({ title, body }) {
  return `<!DOCTYPE html><html lang="ko"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="robots" content="noindex">
<meta property="og:title" content="Dear Golf — 정산">
<meta property="og:description" content="입금하셨으면 눌러주세요 ⛳">
<meta name="theme-color" content="#FAF6EC">
<link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<style>
  :root{--cream:#FAF6EC;--charcoal:#3D3935;--warm:#8B8680;--burgundy:#6B1E2A;--sage:#6B8B5E;--line:#E5DFD2;}
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  body{margin:0;background:var(--cream);color:var(--charcoal);
    font-family:Pretendard,-apple-system,BlinkMacSystemFont,system-ui,sans-serif;
    padding:28px 18px 56px;line-height:1.5}
  .wrap{max-width:460px;margin:0 auto}
  .head{font-size:20px;font-weight:700;margin:0 0 4px}
  .sub{font-size:14px;color:var(--warm);margin:0 0 22px}
  .card{background:#fff;border-radius:16px;padding:16px 16px 8px;margin-bottom:16px}
  .row{display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid var(--line)}
  .row:last-child{border-bottom:0}
  .nm{flex:1;font-weight:600;font-size:16px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .amt{font-size:15px;color:var(--warm);white-space:nowrap}
  button{font-family:inherit;border:0;cursor:pointer}
  .btn{background:var(--burgundy);color:#F5E6A8;border-radius:10px;padding:9px 14px;font-size:14px;font-weight:700}
  .btn[disabled]{background:#EFEAE0;color:var(--warm);cursor:default}
  .done{color:var(--sage);font-weight:700;font-size:14px;white-space:nowrap}
  .items{font-size:14px;color:var(--warm)}
  .items div{display:flex;justify-content:space-between;padding:3px 0}
  .acc{background:#fff;border-radius:16px;padding:16px;margin-bottom:16px}
  .acc .no{font-size:17px;font-weight:700;letter-spacing:-.2px;word-break:break-all}
  .acc .who{font-size:15px;color:var(--warm);margin-top:2px}
  .copy{margin-top:12px;width:100%;background:var(--charcoal);color:var(--cream);border-radius:10px;padding:12px;font-size:15px;font-weight:700}
  .tot{display:flex;justify-content:space-between;font-size:16px;font-weight:700;padding:14px 2px 2px}
  .foot{text-align:center;margin-top:28px;font-size:13px;color:var(--warm)}
  .foot a{color:var(--warm)}
  .note{font-size:13px;color:var(--warm);margin:-8px 0 18px}
</style></head><body><div class="wrap">${body}</div></body></html>`;
}

function notice(msg) {
  return page({
    title: 'Dear Golf',
    body: `<p class="head">${esc(msg)}</p>
      <p class="sub">링크가 만료되었거나 주소가 올바르지 않아요.</p>
      <p class="foot"><a href="https://deargolf.app">Dear Golf</a></p>`,
  });
}

function render(d, token) {
  const members = Array.isArray(d.members) ? d.members : [];
  const items = Array.isArray(d.items) ? d.items.filter(i => i && i.label && i.amount > 0) : [];
  const total = members.reduce((a, m) => a + Number(m.amount || 0), 0);
  const head = [d.course, d.date].filter(Boolean).join(' · ');

  const itemHtml = items.length
    ? `<div class="card items">${items.map(i =>
        `<div><span>${esc(i.label)}</span><span>${won(i.amount)}원</span></div>`).join('')}</div>`
    : '';

  const rows = members.map((m, i) => {
    const paid = m.status === 'claimed' || m.status === 'confirmed';
    const id = esc(m.id || `m${i}`);
    return `<div class="row" data-id="${id}">
      <span class="nm">${esc(m.name)}</span>
      <span class="amt">${won(m.amount)}원</span>
      ${paid
        ? '<span class="done">보냄</span>'
        : `<button class="btn" onclick="mark(this)">보냈어요</button>`}
    </div>`;
  }).join('');

  const accHtml = d.account ? `<div class="acc">
      <div class="no" id="acc">${esc(d.account)}</div>
      ${d.accountName ? `<div class="who">${esc(d.accountName)}</div>` : ''}
      <button class="copy" onclick="copyAcc()">계좌번호 복사</button>
    </div>` : '';

  const body = `
    <p class="head">${esc(head || '정산')}</p>
    <p class="sub">${esc(KIND_LABEL[d.kind] || '정산')}</p>
    ${accHtml}
    ${itemHtml}
    <div class="card">${rows}<div class="tot"><span>합계</span><span>${won(total)}원</span></div></div>
    <p class="note">입금하신 뒤 본인 이름 옆 <b>보냈어요</b>를 눌러주세요.</p>
    <p class="note" id="mine" style="display:none"></p>
    <p class="foot">Dear Golf로 정산했어요 · <a href="https://deargolf.app">앱 보기</a></p>
    <script>
      var TOKEN=${JSON.stringify(token)};
      // ★남의 걸 대신 누르는 건 링크 방식으로는 막을 수 없다(웹 페이지는 누가 누구인지 모른다).
      //   실제로 잦은 건 악의가 아니라 '옆줄을 잘못 탭'하는 실수라, 확인 한 번과 기록으로 그것만 줄인다.
      //   총무가 최종 '확인'하는 단계가 안전망이고, 위험 수준은 카톡에 "입완"이라 쓰던 때와 같다.
      var KEY='dg_s_'+TOKEN;
      try{
        var prev=localStorage.getItem(KEY);
        if(prev){ var el=document.getElementById('mine'); el.style.display='block';
          el.textContent='이 기기에서 '+prev+'님으로 눌렀어요.'; }
      }catch(e){}
      function copyAcc(){
        var t=document.getElementById('acc').textContent.replace(/[^0-9-]/g,'');
        navigator.clipboard&&navigator.clipboard.writeText(t).then(function(){
          var b=document.querySelector('.copy'); b.textContent='복사했어요'; setTimeout(function(){b.textContent='계좌번호 복사';},1500);
        });
      }
      function mark(btn){
        var row=btn.closest('.row');
        var name=row.querySelector('.nm').textContent.trim();
        // 확인 한 번 — 옆줄을 잘못 누르는 실수를 막는다
        if(!confirm(name+'님이 입금하신 게 맞나요?')) return;
        btn.disabled=true; btn.textContent='보내는 중';
        fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({memberId:row.getAttribute('data-id')})})
          .then(function(r){return r.json();})
          .then(function(j){
            if(j&&j.ok){
              var s=document.createElement('span'); s.className='done'; s.textContent='보냄'; btn.replaceWith(s);
              try{ localStorage.setItem(KEY,name);
                var el=document.getElementById('mine'); el.style.display='block';
                el.textContent='이 기기에서 '+name+'님으로 눌렀어요.'; }catch(e){}
            }
            else { btn.disabled=false; btn.textContent='다시 시도'; }
          })
          .catch(function(){ btn.disabled=false; btn.textContent='다시 시도'; });
      }
    </script>`;
  return page({ title: `Dear Golf — ${head || '정산'}`, body });
}

exports.settlementWeb = onRequest(
  { region: 'asia-northeast3', memory: '256MiB', timeoutSeconds: 20, cors: false },
  async (req, res) => {
    const token = tokenFrom(req);
    res.set('Cache-Control', 'no-store');
    if (!token) { res.status(404).send(notice('정산서를 찾을 수 없어요')); return; }

    const db = getFirestore();
    let snap;
    try {
      snap = await db.collection(COLLECTION).where('shareToken', '==', token).limit(1).get();
    } catch (e) {
      logger.error('[settlementWeb] query fail', e?.message);
      res.status(500).send(notice('잠시 후 다시 열어주세요')); return;
    }
    if (snap.empty) { res.status(404).send(notice('정산서를 찾을 수 없어요')); return; }

    const docRef = snap.docs[0].ref;
    const d = snap.docs[0].data();
    if (expiredAt(d)) { res.status(410).send(notice('만료된 정산서예요')); return; }

    if (req.method === 'GET') { res.status(200).send(render(d, token)); return; }

    if (req.method === 'POST') {
      const memberId = String((req.body && req.body.memberId) || '').slice(0, 60);
      if (!memberId) {
        logger.warn('[settlementWeb] claim without memberId', { token, body: typeof req.body });
        res.status(400).json({ ok: false }); return;
      }
      if (Number(d.claimCount || 0) >= MAX_CLAIMS) { res.status(429).json({ ok: false }); return; }
      try {
        // ★참가자는 '보냈어요'(claimed)까지만 만들 수 있다. 확정(confirmed)은 총무만 —
        //   이미 확정된 건 건드리지 않는다.
        let hit = false;
        await db.runTransaction(async (tx) => {
          const cur = await tx.get(docRef);
          const cd = cur.data() || {};
          const members = (cd.members || []).map(m => {
            if (m.id !== memberId) return m;
            hit = true;
            return m.status === 'confirmed' ? m : { ...m, status: 'claimed' };
          });
          tx.update(docRef, {
            members,
            claimCount: FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp(),
          });
        });
        // hit=false면 memberId가 명단과 안 맞은 것 — 화면의 data-id와 문서의 member.id가 어긋난 경우다
        logger.info('[settlementWeb] claim', { token, memberId, hit });
        res.status(200).json({ ok: true, hit }); return;
      } catch (e) {
        logger.error('[settlementWeb] claim fail', e?.message);
        res.status(500).json({ ok: false }); return;
      }
    }

    res.status(405).json({ ok: false });
  },
);
