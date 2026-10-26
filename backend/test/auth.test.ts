// 로그인·세션·비밀번호·초기화·잠금·CORS
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.ts';
import { ORIGIN, PASSWORD, RESET, env, post, useDb } from './setup.ts';

useDb([
	['m-kim', '01011112222', '김보드', '1996-02-12'],
	['m-lee', '01033334444', '이스키', '1990-12-01'],
	['m-boss', '01055556666', '박관리', '1985-05-05', 'admin'],
	['m-staff', '01077778888', '최운영', '1992-07-07', 'staff'],
	['m-gone', '01099990000', '정탈퇴', '1999-09-09', 'member', 'withdrawn'],
]);

const login = (loginId: string, password: string) => post({ action: 'login', loginId, password });

test('아이디 = 010 뺀 휴대폰 번호(하이픈·010 있어도 됨), 내 정보엔 번호 없음', async () => {
	const s = await login('1111-2222', PASSWORD);
	assert.equal(s.ok, true);
	assert.equal(s.mustChange, false);
	assert.equal(s.name, '김보드');
	assert.equal((await login('010-1111-2222', PASSWORD)).ok, true);
	assert.equal((await login('2222', PASSWORD)).ok, false); // 예전 fs_ 아이디(숫자 4자리)는 없음
	const me = await post({ action: 'me' }, s.token);
	assert.deepEqual(me.me, { name: '김보드', region: '경기북부', area: '구리', photo: '', role: 'member' });
	assert.deepEqual({ ...me.season, season: 'x' }, { season: 'x', rides: 0, stays: 0, rests: 0, owner: false, pay: 0, visits: 0, spent: 0, photos: 0 });
	assert.equal(/1996|1111|2222/.test(JSON.stringify(me)), false); // 출생연도·번호는 응답에 없음
	const row = JSON.stringify(await env.DB.prepare("SELECT * FROM members WHERE id = 'm-kim'").first());
	assert.equal(/11112222/.test(row), false); // DB엔 번호 그대로 없음 (HMAC)
});

test('비밀번호 변경: 지금 비밀번호 확인, 다른 기기 세션은 끊김', async () => {
	const a = await login('3333-4444', PASSWORD);
	assert.match((await post({ action: 'password', current: PASSWORD, next: 'short' }, a.token)).error, /8자/);
	assert.match((await post({ action: 'password', current: PASSWORD, next: RESET }, a.token)).error, /초기화/);
	const b = await login('3333-4444', PASSWORD);
	assert.match((await post({ action: 'password', current: 'nope', next: 'second-pass-2' }, b.token)).error, /지금 비밀번호/);
	assert.equal((await post({ action: 'password', current: PASSWORD, next: 'second-pass-2' }, b.token)).ok, true);
	assert.equal((await post({ action: 'me' }, a.token)).expired, true); // 다른 기기
	assert.equal((await post({ action: 'me' }, b.token)).ok, true); // 바꾼 기기는 그대로
});

test('실패 문구는 하나, 5번 틀리면 맞는 비밀번호도 1시간 잠금', async () => {
	const msg = (await login('1357-1357', 'whatever1')).error; // 없는 회원
	assert.equal((await login('9999-0000', PASSWORD)).error, msg); // 탈퇴 회원
	for (let i = 0; i < 4; i++) assert.equal((await login('3333-4444', 'wrong-pass')).error, msg);
	assert.equal((await login('3333-4444', 'second-pass-2')).ok, true); // 4번까진 괜찮고 성공하면 다시 0부터
	for (let i = 0; i < 5; i++) await login('3333-4444', 'wrong-pass');
	assert.match((await login('3333-4444', 'second-pass-2')).error, /시도 횟수/);
});

test('같은 IP에서 30번 실패하면 다른 아이디도 막힘', async () => {
	const headers = { Origin: ORIGIN, 'CF-Connecting-IP': '198.51.100.7' };
	const tryLogin = async (loginId: string) =>
		(await (await worker.fetch(new Request('https://api.test/', { method: 'POST', headers, body: JSON.stringify({ action: 'login', loginId, password: 'guess-1234' }) }), env)).json()) as any;
	for (let i = 0; i < 30; i++) await tryLogin(`2${String(5000000 + i)}`);
	assert.match((await tryLogin('5555-6666')).error, /시도 횟수/);
});

test('초기화: 운영진 이상(관리자 계정은 관리자만), 그 회원 세션 끊김, 기한 안에만 공용 초기화 비밀번호', async () => {
	const boss = await login('5555-6666', PASSWORD);
	const staff = await login('7777-8888', PASSWORD);
	const kim = await login('1111-2222', PASSWORD);

	assert.match((await post({ action: 'admin.reset', memberId: 'm-kim' }, kim.token)).error, /권한/); // 일반 회원은 안 됨
	assert.match((await post({ action: 'admin.reset', memberId: 'm-boss' }, staff.token)).error, /관리자만/); // 운영진이 관리자 계정은 안 됨
	assert.equal((await login('5555-6666', RESET)).ok, false); // 초기화 안 된 계정엔 공용 비밀번호가 안 통함

	const r = await post({ action: 'admin.reset', memberId: 'm-kim' }, staff.token); // 운영진도 됨
	assert.equal(r.ok, true);
	assert.equal((await post({ action: 'me' }, kim.token)).expired, true);
	assert.equal((await login('1111-2222', PASSWORD)).ok, false);

	const back = await login('1111-2222', RESET);
	assert.equal(back.mustChange, true);
	assert.equal((await post({ action: 'me' }, back.token)).mustChange, true); // 새 비밀번호 전엔 다른 기능 안 됨
	assert.equal((await post({ action: 'password', next: 'new-powder-27' }, back.token)).ok, true);
	assert.equal((await login('1111-2222', RESET)).ok, false); // 다시 정하면 공용 비밀번호 끝

	await post({ action: 'admin.reset', memberId: 'm-kim' }, boss.token);
	await env.DB.prepare("UPDATE member_credentials SET reset_until = '2000-01-01T00:00:00.000Z' WHERE member_id = 'm-kim'").run();
	assert.equal((await login('1111-2222', RESET)).ok, false); // 기한 지남

	const log = await env.DB.prepare("SELECT * FROM admin_logs WHERE action = 'password.reset'").all();
	assert.equal(log.results.length, 2);
	assert.equal(log.results[0].actor_id, 'm-staff');
});

test('로그아웃하면 그 세션 끝, 로그인 이력엔 비밀번호·토큰·아이디 원문이 없음', async () => {
	const s = await login('5555-6666', PASSWORD);
	assert.equal((await post({ action: 'logout' }, s.token)).ok, true);
	assert.equal((await post({ action: 'me' }, s.token)).expired, true);
	const dump = JSON.stringify((await env.DB.prepare('SELECT * FROM login_logs').all()).results);
	for (const secret of [PASSWORD, RESET, '55556666', s.token]) assert.equal(dump.includes(secret), false, secret);
	assert.doesNotMatch(dump, /203\.0\.113\.\d/); // IP 전체는 안 남김
	assert.equal(dump.includes('203.0.113.x'), true); // IP는 앞부분만
	const sessions = JSON.stringify((await env.DB.prepare('SELECT * FROM sessions').all()).results);
	assert.equal(sessions.includes(s.token), false); // 토큰은 해시로만
});

test('세션은 30일, 쓰는 동안 하루 넘게 지났으면 다시 30일', async () => {
	const s = await login('5555-6666', PASSWORD);
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

test('지역 이름: 구분이 지역이면 그대로, 운영진·마스터면 거주지로 시도 찾기, 경기는 북부·남부', async () => {
	const { regionOf } = await import('../src/region.ts');
	assert.equal(regionOf('운영진', '구리'), '경기북부');
	assert.equal(regionOf('운영진', '수원'), '경기남부');
	assert.equal(regionOf('마스터', '노원구'), '서울');
	assert.equal(regionOf('경기도', '의정부'), '경기북부');
	assert.equal(regionOf('서울', '노원구'), '서울');
	assert.equal(regionOf('충청북도', '청주'), '충북');
	assert.equal(regionOf('운영진', '중구'), ''); // 여러 시도에 있으면 모름
});
