const babel = require('@babel/parser');
const fs = require('fs');
const code = fs.readFileSync('C:\\Users\\user\\Documents\\projects\\dear-golf\\App.js', 'utf8');
try {
  babel.parse(code, { sourceType: 'module', plugins: ['jsx'] });
  console.log('OK');
} catch(e) {
  console.log('SYNTAX ERROR:', e.message);
}