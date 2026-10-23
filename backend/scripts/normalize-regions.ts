// members.region(예전 시트 '구분')을 지역 이름으로 맞춤: 운영진·마스터로 적힌 줄은 거주지로 시도를 찾고, 경기는 북부·남부, 시도는 짧게
// 0007(grade → region) 적용 뒤 한 번:  node scripts/normalize-regions.ts --remote   (로컬은 --local)
// 바뀌는 줄만 UPDATE (updated_at은 트리거가 채움). 무엇이 바뀌는지 먼저 보여 줌
import { execFileSync } from 'node:child_process';
import { regionOf } from '../src/region.ts';

const where = process.argv.includes('--remote') ? '--remote' : '--local';
const d1 = (sql: string) => JSON.parse(execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', where, '--json', '--command', sql], { encoding: 'utf8' }));
const rows: { id: string; region: string; area: string }[] = d1('SELECT id, region, area FROM members')[0].results;
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const changes = rows.map((r) => ({ ...r, next: regionOf(r.region, r.area) })).filter((r) => r.next !== r.region);
for (const r of changes) console.log(`${r.id}: '${r.region}' → '${r.next}' (거주지 ${r.area})`);
if (changes.length) d1(changes.map((r) => `UPDATE members SET region = ${q(r.next)} WHERE id = ${q(r.id)};`).join('\n'));
console.log(`${changes.length}줄 바꿈 (${where})`);
