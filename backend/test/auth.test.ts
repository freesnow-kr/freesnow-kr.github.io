// 로그인·세션·비밀번호·초기화·잠금·CORS
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.ts';
import { ORIGIN, RESET, env, post, useDb } from './setup.ts';

useDb([
	['m-kim', '01011112222', '김보드', '1996-02-12'],
	['m-lee', '01033334444', '이스키', '1990-12-01'],
	['m-boss', '01055556666', '박마스터', '1985-05-05', 'master'],
	['m-staff', '01077778888', '최운영', '1992-07-07', 'staff'],
	['m-gone', '01099990000', '정탈퇴', '1999-09-09', 'member', 'withdrawn'],
]);

const login = (phone: string, password: string, keep = false) => post({ action: 'login', phone, password, keep });

test('첫 전환: 생년월일로 한 번 → 새 비밀번호 전에는 다른 기능 안 됨 → 정한 뒤엔 생년월일 안 통함', async () => {
	const first = await login('1111-2222', '19960212'); // 010 뺀 아이디
	assert.equal(first.ok, true);
	assert.equal(first.mustChange, true);
	assert.equal(first.name, '김보드');
	assert.equal((await post({ action: 'me' }, first.token)).mustChange, true);

	assert.match((await post({ action: 'password', next: 'short' }, first.token)).error, /8자/);
	assert.match((await post({ action: 'password', next: 'pw19960212!' }, first.token)).error, /생년월일/);
	assert.match((await post({ action: 'password', next: 'aa11112222' }, first.token)).error, /전화번호/);
	assert.match((await post({ action: 'password', next: RESET }, first.token)).error, /초기화/);
	assert.equal((await post({ action: 'password', next: 'powder-day-26' }, first.token)).ok, true);

	const me = await post({ action: 'me' }, first.token);
	assert.deepEqual(me.me, { name: '김보드', grade: '경기도', area: '구리', phone: '010-1111-2222', photo: '', role: 'member' });
	assert.equal(JSON.stringify(me).includes('1996'), false); // 생년월일은 응답에 없음

	assert.equal((await login('010-1111-2222', '19960212')).ok, false);
	const again = await login('01011112222', 'powder-day-26');
	assert.equal(again.ok, true);
	assert.equal(again.mustChange, false);
});

test('비밀번호 변경: 지금 비밀번호 확인, 다른 기기 세션은 끊김', async () => {
	const a = await login('01033334444', '19901201');
	await post({ action: 'password', next: 'first-pass-1' }, a.token);
	const b = await login('01033334444', 'first-pass-1');
	assert.match((await post({ action: 'password', current: 'nope', next: 'second-pass-2' }, b.token)).error, /지금 비밀번호/);
	assert.equal((await post({ action: 'password', current: 'first-pass-1', next: 'second-pass-2' }, b.token)).ok, true);
	assert.equal((await post({ action: 'me' }, a.token)).expired, true); // 다른 기기
	assert.equal((await post({ action: 'me' }, b.token)).ok, true); // 바꾼 기기는 그대로
});

test('실패 문구는 하나, 5번 틀리면 맞는 비밀번호도 1시간 잠금', async () => {
	const msg = (await login('01000000000', 'whatever1')).error; // 없는 회원
	assert.equal((await login('01099990000', '19990909')).error, msg); // 탈퇴 회원
	for (let i = 0; i < 4; i++) assert.equal((await login('01033334444', 'wrong-pass')).error, msg);
	assert.equal((await login('01033334444', 'second-pass-2')).ok, true); // 4번까진 괜찮고 성공하면 다시 0부터
	for (let i = 0; i < 5; i++) await login('01033334444', 'wrong-pass');
	assert.match((await login('01033334444', 'second-pass-2')).error, /시도 횟수/);
});

test('같은 IP에서 30번 실패하면 다른 아이디도 막힘', async () => {
	const headers = { Origin: ORIGIN, 'CF-Connecting-IP': '198.51.100.7' };
	const tryLogin = async (phone: string) =>
		(await (await worker.fetch(new Request('https://api.test/', { method: 'POST', headers, body: JSON.stringify({ action: 'login', phone, password: 'guess-1234' }) }), env)).json()) as any;
	for (let i = 0; i < 30; i++) await tryLogin(`0102000${String(i).padStart(4, '0')}`);
	assert.match((await tryLogin('01055556666')).error, /시도 횟수/);
});

test('초기화: 마스터만, 그 회원 세션 끊김, 기한 안에만 공용 초기화 비밀번호', async () => {
	const boss = await login('01055556666', '19850505');
	await post({ action: 'password', next: 'master-pass-1' }, boss.token);
	const staff = await login('01077778888', '19920707');
	await post({ action: 'password', next: 'staff-pass-1' }, staff.token);
	const kim = await login('01011112222', 'powder-day-26');

	assert.match((await post({ action: 'admin.reset', memberId: 'm-kim' }, staff.token)).error, /권한/); // 운영진은 안 됨
	assert.equal((await login('01055556666', RESET)).ok, false); // 초기화 안 된 계정엔 공용 비밀번호가 안 통함

	const r = await post({ action: 'admin.reset', memberId: 'm-kim' }, boss.token);
	assert.equal(r.ok, true);
	assert.equal((await post({ action: 'me' }, kim.token)).expired, true);
	assert.equal((await login('01011112222', 'powder-day-26')).ok, false);
	assert.equal((await login('01011112222', '19960212')).ok, false); // 생년월일도 안 됨

	const back = await login('01011112222', RESET);
	assert.equal(back.mustChange, true);
	assert.equal((await post({ action: 'password', next: 'new-powder-27' }, back.token)).ok, true);
	assert.equal((await login('01011112222', RESET)).ok, false); // 다시 정하면 공용 비밀번호 끝

	await post({ action: 'admin.reset', memberId: 'm-kim' }, boss.token);
	await env.DB.prepare("UPDATE member_credentials SET reset_until = '2000-01-01T00:00:00.000Z' WHERE member_id = 'm-kim'").run();
	assert.equal((await login('01011112222', RESET)).ok, false); // 기한 지남

	const log = await env.DB.prepare("SELECT * FROM admin_logs WHERE action = 'password.reset'").all();
	assert.equal(log.results.length, 2);
	assert.equal(log.results[0].actor_id, 'm-boss');
});

test('로그아웃하면 그 세션 끝, 로그인 이력엔 비밀번호·토큰·전화번호 원문이 없음', async () => {
	const s = await login('01055556666', 'master-pass-1');
	assert.equal((await post({ action: 'logout' }, s.token)).ok, true);
	assert.equal((await post({ action: 'me' }, s.token)).expired, true);
	const dump = JSON.stringify((await env.DB.prepare('SELECT * FROM login_logs').all()).results);
	for (const secret of ['master-pass-1', 'powder-day-26', RESET, '19960212', '01055556666', s.token]) assert.equal(dump.includes(secret), false, secret);
	assert.doesNotMatch(dump, /203\.0\.113\.\d/); // IP 전체는 안 남김
	assert.equal(dump.includes('203.0.113.x'), true); // IP는 앞부분만
	const sessions = JSON.stringify((await env.DB.prepare('SELECT * FROM sessions').all()).results);
	assert.equal(sessions.includes(s.token), false); // 토큰은 해시로만
});

test('세션은 30일, 쓰는 동안 하루 넘게 지났으면 다시 30일', async () => {
	const s = await login('01055556666', 'master-pass-1');
	const days = (await env.DB.prepare('SELECT expires_at FROM sessions ORDER BY created_at DESC LIMIT 1').first()).expires_at;
	assert.ok(Date.parse(days) - Date.now() > 29.9 * 864e5);
	await env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE member_id = ? AND revoked_at IS NULL').bind(new Date(Date.now() + 3 * 864e5).toISOString(), 'm-boss').run();
	assert.equal((await post({ action: 'renew' }, s.token)).ok, true);
	const after = (await env.DB.prepare("SELECT max(expires_at) AS e FROM sessions WHERE member_id = 'm-boss' AND revoked_at IS NULL").first()).e;
	assert.ok(Date.parse(after) - Date.now() > 29.9 * 864e5);
	await post({ action: 'logout' }, s.token);
});

test('CORS: 허용한 출처만, 이상한 요청은 같은 오류', async () => {
	const pre = (origin: string) => worker.fetch(new Request('https://api.test/', { method: 'OPTIONS', headers: { Origin: origin } }), env);
	const ok = await pre(ORIGIN);
	assert.equal(ok.status, 204);
	assert.equal(ok.headers.get('Access-Control-Allow-Origin'), ORIGIN);
	assert.match(ok.headers.get('Access-Control-Allow-Headers')!, /Authorization/);
	assert.equal((await pre('https://evil.example')).status, 403);
	assert.equal((await post({ action: 'me' }, undefined, 'https://evil.example')).cors, null);
	assert.equal((await post({ action: 'nope' })).error, '잘못된 요청이에요.');
	const big = await worker.fetch(new Request('https://api.test/', { method: 'POST', body: 'x'.repeat(3_000_001) }), env);
	assert.equal(big.status, 413);
});
