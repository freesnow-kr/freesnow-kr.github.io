// 회원 탈퇴: 비밀번호 확인, 개인정보 지움, 로그인 안 됨, 같은 번호로 다시 신청 가능
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { env, post, sessionFor, useDb } from './setup.ts';

useDb([
	['m-kim', '01011112222', '김보드', '1996-02-12'],
	['m-boss', '01055556666', '박관리', '1985-05-05', 'admin'],
]);

test('탈퇴', async () => {
	const first = await post({ action: 'login', phone: '1111-2222', password: '19960212' });
	await post({ action: 'password', next: 'powder-day-26' }, first.token);
	const token = (await post({ action: 'login', phone: '1111-2222', password: 'powder-day-26' })).token;
	await post({ action: 'shredlog', op: 'add', visits: [{ id: 'v1', date: '2026-01-10', resort: '강촌' }] }, token);

	assert.match((await post({ action: 'withdraw', password: 'nope' }, token)).error, /비밀번호/);
	assert.equal((await post({ action: 'withdraw', password: 'powder-day-26' }, token)).ok, true);

	const m = await env.DB.prepare("SELECT * FROM members WHERE id = 'm-kim'").first();
	assert.deepEqual([m.status, m.name, m.phone, m.birth, m.area], ['withdrawn', '탈퇴 회원', 'xm-kim', null, '']);
	for (const t of ['sessions', 'member_credentials', 'ride_logs']) assert.equal((await env.DB.prepare(`SELECT count(*) AS n FROM ${t} WHERE member_id = 'm-kim'`).first()).n, 0, t);
	assert.equal((await post({ action: 'me' }, token)).expired, true);
	assert.equal((await post({ action: 'login', phone: '1111-2222', password: 'powder-day-26' })).ok, false);
	// 같은 번호로 다시 가입 신청 가능
	assert.equal((await post({ action: 'signup', name: '김보드', gender: '남', year: '1996', month: '2', day: '12', sido: '경기도', sigungu: '구리시', phone: '010-1111-2222', agree: true })).ok, true);
});

test('관리자는 바로 탈퇴 안 됨', async () => {
	const t = await sessionFor('m-boss');
	assert.match((await post({ action: 'withdraw', password: 'x' }, t)).error, /관리자/);
});
