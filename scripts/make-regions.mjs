// 법정동 CSV → src/data/regions.json (시도 → 시군구, 중복 없이, 코드 순서)
// 사용: node scripts/make-regions.mjs data/list_20260630.csv
// 시 아래 일반구(수원시장안구 등)는 빼고 시(수원시)만 남김
// 시도 순서: 서울·경기 먼저(FIRST) → 나머지 가나다 순. 시군구도 가나다 순
import { readFileSync, writeFileSync } from 'node:fs';

const [, , csvPath] = process.argv;
if (!csvPath) throw new Error('사용: node scripts/make-regions.mjs <법정동.csv>');

const [header, ...lines] = readFileSync(csvPath, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
const col = header.split(',');
const iSido = col.indexOf('시도명');
const iGu = col.indexOf('시군구명');
if (iSido < 0 || iGu < 0) throw new Error('시도명·시군구명 열이 없어요');

const FIRST = ['서울특별시', '경기도'];

const map = new Map();
for (const line of lines) {
	const f = line.split(',');
	const sido = f[iSido]?.trim();
	const gu = f[iGu]?.trim();
	if (!sido) continue;
	if (!map.has(sido)) map.set(sido, new Set());
	if (gu) map.get(sido).add(gu);
}

const out = {};
const rest = [...map.keys()].filter((s) => !FIRST.includes(s)).sort((a, b) => a.localeCompare(b, 'ko'));
const order = [...FIRST.filter((s) => map.has(s)), ...rest];
for (const sido of order) {
	const set = map.get(sido);
	const all = [...set];
	const cities = all.filter((g) => g.endsWith('시'));
	out[sido] = all.filter((g) => !cities.some((c) => g !== c && g.startsWith(c))).sort((a, b) => a.localeCompare(b, 'ko'));
}
writeFileSync(new URL('../src/data/regions.json', import.meta.url), JSON.stringify(out, null, '\t') + '\n');
console.log(Object.entries(out).map(([s, g]) => `${s} ${g.length}`).join(', '));
