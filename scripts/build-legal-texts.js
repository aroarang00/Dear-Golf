// hosting/legal-texts.js를 src/constants/legalTexts.js 본문 5종에서 생성.
// 약관 변경 시: node scripts/build-legal-texts.js
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src', 'constants', 'legalTexts.js');
const OUT = path.join(__dirname, '..', 'hosting', 'legal-texts.js');

const txt = fs.readFileSync(SRC, 'utf8');

function extract(name) {
  // export const NAME = `...`;
  const start = txt.indexOf('export const ' + name + ' = `');
  if (start < 0) return '';
  const bodyStart = start + ('export const ' + name + ' = `').length;
  // 다음 ` 위치 찾기 (인용 ` 없다고 가정)
  const end = txt.indexOf('`;', bodyStart);
  if (end < 0) return '';
  return txt.slice(bodyStart, end);
}

const out = {
  TERMS_OF_SERVICE: extract('TERMS_OF_SERVICE'),
  PRIVACY_POLICY: extract('PRIVACY_POLICY'),
  LOCATION_BASED_SERVICE_TERMS: extract('LOCATION_BASED_SERVICE_TERMS'),
  COMMUNITY_GUIDELINES: extract('COMMUNITY_GUIDELINES'),
  PENALTY_CONSENT: extract('PENALTY_CONSENT'),
};

const banner = '// Dear Golf 규정집 본문 — src/constants/legalTexts.js 와 동기화 필요.\n' +
               '// 변호사 검토 반영 (2026-05-29). 약관 변경 시: node scripts/build-legal-texts.js\n';

fs.writeFileSync(OUT, banner + 'window.DG_LEGAL = ' + JSON.stringify(out, null, 2) + ';\n', 'utf8');
console.log('wrote', OUT, fs.statSync(OUT).size, 'bytes');
