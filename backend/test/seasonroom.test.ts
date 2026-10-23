// 시즌방 — Apps Script 테스트(apps-script/Code.test.mjs 11번)와 같은 경우를 D1에서
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { env, post, sessionFor, useDb } from './setup.ts';

let A: string, B: string;
useDb(
	[
		['m-a', '01060000001', '회원A', '1990-01-01'],
		['m-b', '01060000002', '회원B', '1991-02-02'],
	],
	async () => {
		A = await sessionFor('m-a');
		B = await sessionFor('m-b');
		await env.DB.batch([
			env.DB.prepare("INSERT INTO room_owners VALUES ('26-27', 'm-b'), ('25-26', 'm-a')"), // 주주는 시즌마다
			env.DB.prepare("INSERT INTO room_stays VALUES ('m-a', '2026-11-01', '숙박', '2026-11-01T00:00:00.000Z')"),
		]);
	},
);
const room = (token: string, body: object = {}) => post({ action: 'seasonroom', season: '26-27', ...body }, token);
const rows = async () => (await env.DB.prepare('SELECT * FROM room_stays ORDER BY date, member_id').all()).results;

test('회원만, 응답 모양은 Apps Script와 같음', async () => {
	assert.equal((await post({ action: 'seasonroom', season: '26-27' })).expired, true);
	const { status, cors, ...r } = await room(A);
	assert.deepEqual(r, { ok: true, season: '26-27', prices: { 숙박: 10000, 휴식: 5000 }, nights: [{ date: '2026-11-01', name: '회원A', kind: '숙박', me: true, owner: false }] });
});

test('체크: 두 번 눌러도 한 줄, 지난 시즌 날짜도 되고 응답엔 그 시즌만, 이름만 (연락처 X)', async () => {
	await room(A, { op: 'add', date: '2026-12-13' }); // kind 없으면 숙박
	await room(A, { op: 'add', date: '2026-12-13' });
	await room(A, { op: 'add', date: '2025-12-13' });
	const r = await room(B, { op: 'add', date: '2026-12-13', kind: '휴식' });
	assert.deepEqual(r.nights.filter((n: any) => n.date === '2026-12-13'), [
		{ date: '2026-12-13', name: '회원A', kind: '숙박', me: false, owner: false },
		{ date: '2026-12-13', name: '회원B', kind: '휴식', me: true, owner: true },
	]);
	assert.equal(JSON.stringify(r).includes('6000'), false);
	assert.equal((await rows()).length, 4);
	assert.deepEqual((await room(A, { season: '25-26' })).nights, [{ date: '2025-12-13', name: '회원A', kind: '숙박', me: true, owner: true }]);
});

test('같은 날 다시 체크하면 구분만 바뀜, 취소는 줄을 남기고 취소로 (응답엔 빠짐), 다시 체크하면 되살림', async () => {
	let r = await room(A, { op: 'add', date: '2026-12-13', kind: '휴식' });
	assert.equal(r.nights.find((n: any) => n.date === '2026-12-13' && n.me).kind, '휴식');
	assert.equal((await rows()).length, 4);

	await room(B, { op: 'remove', date: '2026-12-13' });
	await room(B, { op: 'remove', date: '2026-12-14' }); // 기록 없는 날 취소는 아무 일 없음
	const all = await rows();
	assert.equal(all.length, 4);
	assert.equal(all.find((x: any) => x.member_id === 'm-b').kind, '취소');
	r = await room(A);
	assert.deepEqual(r.nights.map((n: any) => [n.date, n.name, n.kind]), [['2026-11-01', '회원A', '숙박'], ['2026-12-13', '회원A', '휴식']]); // B가 취소해도 A는 그대로

	r = await room(B, { op: 'add', date: '2026-12-13' });
	assert.equal((await rows()).length, 4);
	assert.deepEqual(r.nights.find((n: any) => n.me), { date: '2026-12-13', name: '회원B', kind: '숙박', me: true, owner: true });
});

test('잘못된 날짜·시즌 거부', async () => {
	assert.equal((await room(A, { op: 'add', date: '2026-02-30' })).ok, false);
	assert.equal((await room(A, { op: 'add', date: '내일' })).ok, false);
	assert.equal((await room(A, { season: '2026' })).ok, false);
	assert.equal((await rows()).length, 4);
});
