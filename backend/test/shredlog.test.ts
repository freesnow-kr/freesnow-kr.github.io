// SHRED LOG — Apps Script 테스트(apps-script/Code.test.mjs 9번)와 같은 경우를 D1에서
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { env, post, sessionFor, useDb } from './setup.ts';

let A: string, B: string;
useDb([['m-a', '01060000001', '회원A', '1990-01-01'], ['m-b', '01060000002', '회원B', '1991-02-02']], async () => {
	A = await sessionFor('m-a');
	B = await sessionFor('m-b');
});
const log = async (token: string, body: object = {}) => {
	const { status, cors, ...r } = await post({ action: 'shredlog', ...body }, token);
	return r;
};
const visit = { id: 'v1', date: '2025-12-13', resort: '하이원', slot: '주간', temp: '-3', hours: '5', rating: '4', memo: '=HYPERLINK("x")' };
const lunch = { id: 'e1', date: '2025-12-13', cat: '🍲 식음료 / 뒤풀이', amount: 18000, memo: '하이원 당일', visit: 'v1' };
const pass = { id: 'e2', date: '2025-10-01', cat: '🎟️ 시즌권 / 리프트', amount: 600000, memo: '' };

test('회원만, 처음엔 빈 기록', async () => {
	assert.equal((await post({ action: 'shredlog' })).expired, true);
	assert.deepEqual(await log(A), { ok: true, visits: [], expenses: [], pass: {}, cares: [] });
});

test('추가: 응답 모양은 화면이 받던 그대로, 숫자 칸은 숫자로 저장', async () => {
	const r = await log(A, { op: 'add', visits: [visit], expenses: [lunch, pass], pass: { '25-26': { price: 600000, day: 110000 } } });
	assert.equal(r.ok, true);
	// 시트가 아니라서 메모 앞에 ' 를 붙이지 않음 (Apps Script와 다른 점 — 시트로 내보낼 때 막음)
	assert.deepEqual(r.visits[0], { id: 'v1', date: '2025-12-13', resort: '하이원', slot: '주간', snow: '', style: '', weather: '', crew: '', temp: '-3', runs: '', hours: '5', rating: '4', gear: '', memo: '=HYPERLINK("x")' });
	assert.deepEqual(r.expenses.map((e: any) => [e.id, e.amount, e.visit]), [['e1', 18000, 'v1'], ['e2', 600000, '']]);
	assert.deepEqual(r.pass, { '25-26': { price: 600000, day: 110000 } });
	const row = await env.DB.prepare("SELECT temp, runs FROM ride_logs WHERE id = 'v1'").first();
	assert.deepEqual([typeof row.temp, row.runs], ['number', null]);
});

test('다시 보내도 중복 없음, 시즌권은 같은 줄을 고침', async () => {
	const r = await log(A, { op: 'add', visits: [visit], expenses: [lunch], pass: { '25-26': { price: 650000, day: 110000 } } });
	assert.equal(r.visits.length, 1);
	assert.equal(r.expenses.length, 2);
	assert.deepEqual(r.pass, { '25-26': { price: 650000, day: 110000 } });
	assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM season_passes').first()).n, 1);
});

test('잘못된 값 거부 (하나라도 틀리면 아무것도 안 들어감)', async () => {
	assert.equal((await log(A, { op: 'add', visits: [{ id: 'v2', date: '어제', resort: '하이원' }] })).ok, false);
	assert.equal((await log(A, { op: 'add', expenses: [{ id: 'e9', date: '2025-12-13', cat: 'x', amount: -5 }] })).ok, false);
	assert.equal((await log(A, { op: 'add', visits: [{ id: '../x', date: '2025-12-13', resort: '하이원' }] })).ok, false);
	assert.equal((await log(A, { op: 'add', visits: [{ id: 'v3', date: '2025-12-14', resort: '하이원' }], expenses: [{ id: 'e8', date: '2025-12-14', cat: 'x', amount: 0 }] })).ok, false);
	assert.equal((await log(A)).visits.length, 1);
});

test('다른 회원 기록은 안 보이고, 남의 ID로 지워도 그대로. 출격을 지우면 묶인 지출도', async () => {
	assert.deepEqual(await log(B), { ok: true, visits: [], expenses: [], pass: {}, cares: [] });
	await log(B, { op: 'delete', visit: 'v1', expense: 'e2' });
	let r = await log(A);
	assert.deepEqual([r.visits.length, r.expenses.length], [1, 2]);
	r = await log(A, { op: 'delete', visit: 'v1' });
	assert.deepEqual(r.visits, []);
	assert.deepEqual(r.expenses.map((e: any) => e.id), ['e2']);
	r = await log(A, { op: 'delete', expense: 'e2' });
	assert.deepEqual(r.expenses, []);
});

test('지우면 소프트 삭제(is_active = 0)라 줄은 남고, 시각은 자동으로 기록됨', async () => {
	await log(A, { op: 'add', visits: [{ id: 'v9', date: '2025-12-20', resort: '휘닉스' }] });
	const before = await env.DB.prepare("SELECT created_at, updated_at, is_active FROM ride_logs WHERE id = 'v9'").first();
	assert.equal(before.is_active, 1);
	assert.match(before.created_at, /^\d{4}-\d{2}-\d{2}T/);
	await log(A, { op: 'delete', visit: 'v9' });
	const after = await env.DB.prepare("SELECT created_at, updated_at, is_active FROM ride_logs WHERE id = 'v9'").first();
	assert.deepEqual([after.is_active, after.created_at], [0, before.created_at]);
	assert.ok(after.updated_at >= before.updated_at);
	assert.equal((await log(A)).visits.some((v: any) => v.id === 'v9'), false);
	await log(A, { op: 'add', visits: [{ id: 'v9', date: '2025-12-20', resort: '휘닉스' }] });
	assert.equal((await log(A)).visits.some((v: any) => v.id === 'v9'), false, '지운 ID로 다시 보내도 되살리지 않음');
});

test('장비 관리: 추가(같은 ID는 한 번), 형식 검사, 지우기, 본인 것만', async () => {
	const A = await sessionFor('m-a'), B = await sessionFor('m-b');
	const care = { id: 'c1', date: '2026-12-01', kind: '왁싱', memo: '  핫왁스  ' };
	assert.match((await post({ action: 'shredlog', op: 'add', cares: [{ ...care, kind: '세차' }] }, A)).error, /장비 관리/);
	let r = await post({ action: 'shredlog', op: 'add', cares: [care, care] }, A);
	assert.deepEqual(r.cares, [{ id: 'c1', date: '2026-12-01', kind: '왁싱', memo: '핫왁스' }]);
	assert.deepEqual((await post({ action: 'shredlog' }, B)).cares, []);
	r = await post({ action: 'shredlog', op: 'delete', care: 'c1' }, A);
	assert.deepEqual(r.cares, []);
});
