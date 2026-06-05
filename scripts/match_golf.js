// 골프장 마스터 매칭 — golf_courses.csv(이름+주소)를 카카오와 매칭해 kakaoId·좌표·현재명 부착.
// 실행: KAKAO_KEY=<rest_key> node scripts/match_golf.js
// 출력: golf_master.json(전체 결과) + stdout 요약/확인필요 목록

const fs = require('fs');
const path = require('path');
const KEY = process.env.KAKAO_KEY;
if (!KEY) { console.error('KAKAO_KEY 환경변수 필요'); process.exit(1); }

const REGION_MAP = {
  강원: '강원특별자치도', 경기: '경기도', 경남: '경상남도', 경북: '경상북도',
  광주: '광주광역시', 대구: '대구광역시', 대전: '대전광역시', 부산: '부산광역시',
  서울: '서울특별시', 세종: '세종특별자치시', 울산: '울산광역시', 인천: '인천광역시',
  전남: '전라남도', 전북: '전북특별자치도', 제주: '제주특별자치도', 충남: '충청남도', 충북: '충청북도',
};

// ─ CSV 파싱 + 주소 보완 + 중복 제거 ─
const raw = fs.readFileSync(path.join(__dirname, 'golf_courses.csv'), 'utf-8');
const lines = raw.split(/\r?\n/).filter((l) => l.trim());
lines.shift(); // 헤더 제거

const seen = new Set();
const COURSES = [];
for (const line of lines) {
  const f = line.split(',');
  const region = (f[0] || '').trim();
  const name = (f[1] || '').trim();
  let addr = (f[3] || '').trim();
  if (!name || !addr) continue;
  // 주소가 시/도로 시작하지 않으면(강원·경남 등 생략형) 지역으로 보완
  if (!/^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충청|충북|충남|전라|전북|전남|경상|경북|경남|제주)/.test(addr)) {
    addr = (REGION_MAP[region] || region) + ' ' + addr;
  }
  const key = name + '|' + addr;
  if (seen.has(key)) continue; // 회원제/대중제 등 동일 구장 중복 제거
  seen.add(key);
  COURSES.push({ region, name, addr });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function kakao(p, params) {
  const url = `https://dapi.kakao.com/v2/local/search/${p}.json?` + new URLSearchParams(params);
  try {
    const res = await fetch(url, { headers: { Authorization: `KakaoAK ${KEY}` } });
    if (!res.ok) return [];
    return (await res.json()).documents || [];
  } catch (e) { return []; }
}
function isGolf(cat = '') {
  const last = String(cat).split('>').pop().trim();
  return /^(골프장|컨트리클럽|골프)$/.test(last);
}
function sigu(addr = '') {
  const m = addr.match(/([가-힣]+(시|군))/);
  return m ? m[1] : '';
}

(async () => {
  const master = [];   // 매칭 성공
  const fails = [];    // 실패
  const checks = [];   // 확인 필요 (주소매칭/중복후보)
  const masterIds = new Set();

  for (const c of COURSES) {
    const sg = sigu(c.addr);
    let method = 'name';
    let docs = await kakao('keyword', { query: c.name, size: '15' });
    let golf = docs.filter((d) => isGolf(d.category_name));
    let cands = golf.filter((d) => (d.road_address_name || d.address_name || '').includes(sg));
    if (!cands.length) cands = golf;

    let pick = cands[0];
    if (!pick) {
      method = 'addr';
      const ad = await kakao('address', { query: c.addr });
      if (ad[0]) {
        const near = await kakao('keyword', { query: '골프', x: ad[0].x, y: ad[0].y, radius: '1500', size: '15' });
        cands = near.filter((d) => isGolf(d.category_name));
        pick = cands[0];
      }
    }

    if (!pick) {
      fails.push(c);
      await sleep(110);
      continue;
    }

    const entry = {
      region: c.region, input: c.name, addr: c.addr, method,
      kakaoId: pick.id, name: pick.place_name,
      road: pick.road_address_name || pick.address_name, x: pick.x, y: pick.y,
    };
    if (!masterIds.has(pick.id)) { masterIds.add(pick.id); master.push(entry); }
    // 확인필요: 주소로 찾았거나(개명 의심), 같은 검색에 골프장 후보 2+개
    if (method === 'addr' || cands.length > 1) {
      checks.push({ input: c.name, matched: pick.place_name, method, others: cands.slice(1, 3).map((d) => d.place_name) });
    }
    await sleep(110);
  }

  fs.writeFileSync(path.join(__dirname, 'golf_master.json'), JSON.stringify(master, null, 2));

  console.log(`총 입력 ${COURSES.length}개 구장 / 매칭 ${COURSES.length - fails.length} / 실패 ${fails.length} / 고유 kakaoId ${master.length}`);
  console.log('\n=== ❌ 매칭 실패 ===');
  if (!fails.length) console.log('(없음)');
  fails.forEach((c) => console.log(`  ${c.region} | ${c.name} | ${c.addr}`));
  console.log('\n=== ⚠️ 확인 필요 (주소로 찾음=개명의심 / 후보 다수) ===');
  if (!checks.length) console.log('(없음)');
  checks.forEach((c) => console.log(`  [${c.method}] ${c.input} → ${c.matched}${c.others.length ? '  (others: ' + c.others.join(', ') + ')' : ''}`));
})();
