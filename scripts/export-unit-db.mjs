/**
 * platform_v11.html 내장 단가DB → CSV / JSON 추출
 * 사용: node scripts/export-unit-db.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'platform_v11.html'), 'utf8');
const m = html.match(/var EST_BUILTIN_DB_FALLBACK=\[([\s\S]*?)\];\s*\n\s*var EST_DB_META/);
if (!m) {
  console.error('EST_BUILTIN_DB_FALLBACK 블록을 찾을 수 없습니다.');
  process.exit(1);
}

const items = [];
const re = /\{cat:'([^']*)',spec:'([^']*)',unit:'([^']*)',price:(\d+)\}/g;
let x;
while ((x = re.exec(m[1]))) {
  items.push({ cat: x[1], spec: x[2], unit: x[3], price: Number(x[4]) });
}

const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
const csvLines = ['id,version,cat,spec,unit,price,region_factor,active,note'];
items.forEach((it, i) => {
  csvLines.push([i + 1, '2026-H1', esc(it.cat), esc(it.spec), it.unit, it.price, '1.0', 'Y', '국토부 표준시장단가'].join(','));
});

const templatesDir = path.join(root, 'templates');
const dataDir = path.join(root, 'data');
fs.mkdirSync(templatesDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });

fs.writeFileSync(path.join(templatesDir, '단가DB.csv'), '\uFEFF' + csvLines.join('\n'), 'utf8');
fs.writeFileSync(path.join(dataDir, 'builtin-unit-prices.json'), JSON.stringify(items, null, 0), 'utf8');

console.log('✅', items.length, '품목 추출');
console.log('   templates/단가DB.csv');
console.log('   data/builtin-unit-prices.json');
console.log('');
console.log('GAS BUILTIN_UNIT_PRICES_JSON 에 넣을 때:');
console.log("   copy(require('fs').readFileSync('data/builtin-unit-prices.json','utf8'))");
