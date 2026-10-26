// 가입 신청 → 운영진 승인, 회원 관리 권한, 프로필 사진, 갤러리, 채팅 랭킹
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.ts';
import { ORIGIN, PASSWORD, env, post, sessionFor, useDb } from './setup.ts';

let M: string, S: string, B: string;
useDb(
	[
		['m-1', '01011110000', '회원일', '1990-01-01'],
		['m-staff', '01022220000', '운영진', '1991-01-01', 'staff'],
		['m-boss', '01033330000', '관리자', '1992-01-01', 'admin'],
	],
	async () => {
		M = await sessionFor('m-1');
		S = await sessionFor('m-staff');
		B = await sessionFor('m-boss');
	},
);
const form = { action: 'signup', phone: '4444-5555', password: 'snow-board-1', name: '새회원', gender: '여', agreeOpt: true, year: '1998', sido: '경기도', sigungu: '의정부시', emergency: true, agree: true, age14: true };

test('가입 신청: 형식 검사, 같은 번호 거부, 숨은 칸이면 저장 안 함, 응답엔 아무 데이터 없음, 번호는 HMAC·암호문으로만', async () => {
	assert.match((await post({ ...form, agree: false })).error, /동의/);
	assert.match((await post({ ...form, age14: false })).error, /14세/);
	assert.match((await post({ ...form, gender: '' })).error, /성별/);
	assert.match((await post({ ...form, phone: '1234' })).error, /휴대폰/);
	assert.match((await post({ ...form, password: 'short' })).error, /8자/);
	assert.match((await post({ ...form, password: 'pw44445555' })).error, /휴대폰/);
	assert.match((await post({ ...form, year: '1800' })).error, /출생연도/);
	assert.match((await post({ ...form, phone: '010-1111-0000' })).error, /이미/); // 회원 번호
	const { status, cors, ...r } = await post(form);
	assert.deepEqual(r, { ok: true });
	assert.match((await post(form)).error, /이미/); // 대기 중 신청도
	assert.equal((await post({ ...form, phone: '4444-5556', agreeOpt: false })).ok, true); // 선택 동의 안 하면 출생연도·지역·비상 연락처는 안 받음
	await post({ ...form, phone: '9999-9999', website: 'spam' });
	assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM signup_requests').first()).n, 2);
	const rows = JSON.stringify((await env.DB.prepare('SELECT * FROM signup_requests').all()).results);
	assert.equal(/snow-board-1|44445555/.test(rows), false); // 비밀번호·번호 원문 없음
	// 동의 기록: 시각·선택 동의·처리방침 시행일
	const consent = await env.DB.prepare("SELECT agreed_at IS NOT NULL AS req, agreed_opt_at IS NOT NULL AS opt, policy, birth_year, sido, phone_enc IS NOT NULL AS em FROM signup_requests ORDER BY id").all();
	assert.deepEqual(consent.results.map((x: any) => [x.req, x.opt, x.policy, x.birth_year, x.sido, x.em]), [[1, 1, '2026-10-26', 1998, '경기도', 1], [1, 0, '2026-10-26', null, '', 0]]);
});

test('승인: 운영진만, 신청 때 정한 번호·비밀번호로 바로 로그인, 기록 남음', async () => {
	assert.match((await post({ action: 'admin.signups' }, M)).error, /권한/);
	const list = (await post({ action: 'admin.signups' }, S)).signups;
	assert.deepEqual(list.map((x: any) => [x.birth_year, x.same_name, x.emergency]), [[1998, 1, 1], [null, 1, 0]]); // 같은 이름 신청이 하나 더
	assert.equal(/pw_|login_key|4444/.test(JSON.stringify(list)), false);
	const r = await post({ action: 'admin.signupDecide', id: list[0].id, approve: true }, S);
	assert.equal(r.ok, true);
	const m = await env.DB.prepare('SELECT * FROM members WHERE id = ?').bind(r.memberId).first();
	assert.deepEqual([m.name, m.gender, m.region, m.area, m.birth_year, m.role, m.policy, !!m.agreed_at, !!m.agreed_opt_at, !!m.login_key, !!m.phone_enc], ['새회원', '여', '경기북부', '의정부', 1998, 'member', '2026-10-26', true, true, true, true]);
	assert.equal((await post({ action: 'admin.signupDecide', id: list[0].id, approve: true }, S)).ok, false);
	const s = await post({ action: 'login', loginId: '44445555', password: 'snow-board-1' });
	assert.equal(s.ok, true);
	assert.equal(s.mustChange, false);
	assert.equal(await env.DB.prepare('SELECT 1 FROM signup_requests WHERE id = ?').bind(list[0].id).first(), null); // 승인하면 신청 줄은 삭제
	// 비상 연락처는 운영진이 볼 때만 풀고 기록
	assert.equal((await post({ action: 'admin.memberPhone', id: r.memberId }, M)).ok, false);
	assert.equal((await post({ action: 'admin.memberPhone', id: r.memberId }, S)).phone, '01044445555');
	assert.equal((await env.DB.prepare("SELECT count(*) AS n FROM admin_logs WHERE action = 'member.phoneView'").first()).n, 1);
	const r2 = await post({ action: 'admin.signupDecide', id: list[1].id, approve: true }, S);
	assert.deepEqual(Object.values(await env.DB.prepare('SELECT region, area, birth_year, phone_enc FROM members WHERE id = ?').bind(r2.memberId).first()), ['', '', null, null]);
	assert.match((await post({ action: 'admin.memberPhone', id: r2.memberId }, S)).error, /없어요/);
	assert.equal((await env.DB.prepare("SELECT count(*) AS n FROM admin_logs WHERE action = 'signup.approve'").first()).n, 2);
	assert.equal(JSON.stringify((await env.DB.prepare("SELECT detail FROM admin_logs WHERE action LIKE 'signup.%'").all()).results).includes('새회원'), false); // 기록에 이름 없음
	// 거절해도 삭제
	await post({ ...form, phone: '4444-6666', name: '거절됨' });
	const rej = (await post({ action: 'admin.signups' }, S)).signups[0];
	assert.equal((await post({ action: 'admin.signupDecide', id: rej.id, approve: false }, S)).ok, true);
	assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM signup_requests').first()).n, 0);
});

test('회원 관리: 운영진은 정보 수정·상태 변경, 권한·관리자 계정은 관리자만, 정지하면 바로 로그아웃, 내 권한은 못 바꿈', async () => {
	assert.equal((await post({ action: 'admin.members' }, M)).ok, false);
	const all = (await post({ action: 'admin.members' }, S)).members;
	assert.equal(all.length, 5);
	assert.equal(JSON.stringify(all).includes('login_key'), false);
	assert.equal((await post({ action: 'admin.memberUpdate', id: 'm-1', area: '노원구', birth_year: '1991', phone: '010 1111 0001', emergency: true }, S)).ok, true);
	assert.match((await post({ action: 'admin.memberUpdate', id: 'm-1', phone: '0101' }, S)).error, /휴대폰/);
	assert.match((await post({ action: 'admin.memberUpdate', id: 'm-1', phone: '4444-5555' }, S)).error, /다른 회원/);
	assert.equal(JSON.stringify((await env.DB.prepare("SELECT detail FROM admin_logs WHERE action = 'member.update'").all()).results).includes('11110001'), false); // 번호는 기록에 안 남김
	assert.deepEqual(Object.values(await env.DB.prepare("SELECT area, birth_year, phone_enc IS NOT NULL FROM members WHERE id = 'm-1'").first()), ['노원구', 1991, 1]);
	assert.equal((await post({ action: 'login', loginId: '11110001', password: PASSWORD })).ok, true);
	assert.equal((await post({ action: 'admin.memberUpdate', id: 'm-1', emergency: false }, S)).ok, true);
	assert.equal((await env.DB.prepare("SELECT phone_enc FROM members WHERE id = 'm-1'").first()).phone_enc, null);
	M = await sessionFor('m-1');
	assert.match((await post({ action: 'admin.memberStatus', id: 'm-1', role: 'staff' }, S)).error, /관리자만/); // 운영진은 권한 변경 못 함
	assert.match((await post({ action: 'admin.memberStatus', id: 'm-boss', status: 'suspended' }, S)).error, /관리자만/); // 관리자 계정 상태도 못 바꿈
	assert.equal((await post({ action: 'admin.memberStatus', id: 'm-1', status: 'suspended' }, S)).ok, true); // 상태는 운영진도
	assert.equal((await post({ action: 'me' }, M)).expired, true);
	assert.match((await post({ action: 'admin.memberStatus', id: 'm-boss', role: 'staff' }, B)).error, /내 계정/);
	const logs = (await post({ action: 'admin.audit' }, B)).logs;
	assert.ok(logs.some((l: any) => l.action === 'member.update' && l.actor === '운영진'));
	assert.equal((await post({ action: 'admin.audit' }, S)).ok, false);
});

test('마스터(명예)는 관리자가 role로 지정, 할 수 있는 일은 회원과 같음', async () => {
	assert.match((await post({ action: 'admin.memberStatus', id: 'm-1', role: 'master' }, S)).error, /관리자만/); // 운영진은 못 함
	assert.equal((await post({ action: 'admin.memberStatus', id: 'm-1', role: 'master' }, B)).ok, true);
	const m = (await post({ action: 'admin.members' }, S)).members.find((x: any) => x.id === 'm-1');
	assert.equal(m.role, 'master');
	const T = await sessionFor('m-1');
	await env.DB.prepare("UPDATE members SET status = 'active' WHERE id = 'm-1'").run();
	assert.match((await post({ action: 'admin.signups' }, T)).error, /권한/); // 마스터는 운영진 화면 못 씀
	assert.equal((await post({ action: 'me' }, T)).me.role, 'master');
});

test('시즌방 주주는 운영진이 시즌별로', async () => {
	assert.deepEqual((await post({ action: 'admin.roomOwners', season: '26-27', memberIds: ['m-staff', 'm-boss', 'nobody'] }, S)).memberIds.sort(), ['m-boss', 'm-staff']);
	assert.deepEqual((await post({ action: 'admin.roomOwners', season: '26-27' }, S)).memberIds.sort(), ['m-boss', 'm-staff']);
});

test('프로필 사진: R2 profile/ 폴더에, 바꾸면 예전 파일 지움, 지우기', async () => {
	const pic = 'data:image/jpeg;base64,' + btoa('fake-jpeg-bytes-1');
	assert.equal((await post({ action: 'avatar', data: 'data:image/png;base64,AAAA' }, S)).ok, false);
	const url1 = (await post({ action: 'avatar', data: pic }, S)).photo;
	assert.match(url1, /^https:\/\/api\.test\/profile\/m-staff\/[\w-]+\.jpg$/);
	assert.equal((await post({ action: 'me' }, S)).me.photo, url1);
	const key1 = url1.replace('https://api.test/', '');
	assert.equal(await (await env.PHOTOS.get(key1)).text(), 'fake-jpeg-bytes-1');
	const res = await worker.fetch(new Request(url1), env);
	assert.deepEqual([res.status, res.headers.get('Content-Type')], [200, 'image/jpeg']);
	const url2 = (await post({ action: 'avatar', data: 'data:image/jpeg;base64,' + btoa('two') }, S)).photo;
	assert.notEqual(url2, url1);
	assert.equal(await env.PHOTOS.get(key1), null, '바꾸면 예전 파일 지움');
	await post({ action: 'avatar', remove: true }, S);
	assert.equal((await post({ action: 'me' }, S)).me.photo, '');
	assert.equal(await env.PHOTOS.get(url2.replace('https://api.test/', '')), null);
	assert.equal((await worker.fetch(new Request('https://api.test/profile/a%2F..%2Fsecret.jpg'), env)).status, 404);
});

test('채팅 랭킹: 운영진이 집계를 올리고 회원이 봄, 이름은 홍*동으로 가려서 저장', async () => {
	assert.match((await post({ action: 'chatrank' }, S)).error, /준비/);
	const data = { from: '2025-11-28', to: '2025-12-01', total: 3, ranks: [{ name: '홍길동/96/고양', count: 2 }, { name: '김철/90', count: 1 }], months: [{ month: '2025-12', total: 1, ranks: [{ name: '남궁민수', count: 1 }] }] };
	assert.equal((await post({ action: 'admin.chatUpload', ...data, months: [{ month: 'x', ranks: [] }] }, S)).ok, false);
	assert.equal((await post({ action: 'admin.chatUpload', ...data }, B)).ok, true);
	const { status, cors, ...r } = await post({ action: 'chatrank' }, S);
	assert.deepEqual(r, { ok: true, ...data, ranks: [{ name: '홍*동', count: 2 }, { name: '김*', count: 1 }], months: [{ month: '2025-12', total: 1, ranks: [{ name: '남**수', count: 1 }] }] });
	assert.equal(JSON.stringify(await env.DB.prepare("SELECT value FROM cache WHERE key = 'chatrank'").first()).includes('홍길동'), false);
});

test('갤러리: 공개 폴더 보기에서 사진만, 5분 캐시, 실패하면 예전 목록', async () => {
	let calls = 0, fail = false;
	const real = globalThis.fetch;
	globalThis.fetch = (async (u: any, i?: any) => {
		if (!String(u).includes('embeddedfolderview')) return real(u, i);
		calls++;
		if (fail) return new Response('', { status: 500 });
		const e = (id: string, name: string) => `<div class="flip-entry" id="entry-${id}" tabindex="0"><div class="flip-entry-title">${name}</div></div>`;
		return new Response(e('aaa111', 'IMG_1.JPG') + e('bbb222', '하이원_정모.jpg') + e('ccc333', 'notes.pdf'));
	}) as typeof fetch;
	const r = await post({ action: 'gallery' });
	assert.deepEqual(r.photos, [{ id: 'aaa111', caption: '' }, { id: 'bbb222', caption: '하이원 정모' }]);
	await post({ action: 'gallery' });
	assert.equal(calls, 1);
	await env.DB.prepare("UPDATE cache SET expires_at = '2000-01-01' WHERE key = 'gallery'").run();
	fail = true;
	assert.equal((await post({ action: 'gallery' })).photos.length, 2);
	globalThis.fetch = real;
});

test('조 편성: 운영진만, 행사 저장·목록·불러오기·고치기·지우기', async () => {
	const data = { teams: [{ name: '1조' }, { name: '2조' }], people: [{ key: 'm:m-1', name: '회원일', team: 0 }, { key: 'g:1', name: '게스트', guest: true, team: 1 }], games: [{ name: '줄다리기', points: 10, winners: [0] }] };
	assert.match((await post({ action: 'admin.teams.save', title: '체육대회', date: '2026-11-07', data }, M)).error ?? '', /권한|로그인/);
	const id = (await post({ action: 'admin.teams.save', title: '  가을   체육대회 ', date: '2026-11-07', data }, S)).id;
	assert.ok(id);
	assert.deepEqual((await post({ action: 'admin.teams.list' }, S)).events.map((e: any) => [e.title, e.people, e.teams]), [['가을 체육대회', 2, 2]]);
	assert.deepEqual((await post({ action: 'admin.teams.get', id }, S)).event.data, data);
	data.games[0].winners = [1];
	assert.equal((await post({ action: 'admin.teams.save', id, title: '가을 체육대회', date: '2026-11-07', data }, S)).ok, true);
	assert.deepEqual((await post({ action: 'admin.teams.get', id }, S)).event.data.games[0].winners, [1]);
	assert.equal((await post({ action: 'admin.teams.save', title: 'x', date: '내일', data }, S)).ok, false);
	await post({ action: 'admin.teams.delete', id }, S);
	assert.equal((await post({ action: 'admin.teams.list' }, S)).events.length, 0);
});

test('가입 신청 알림 메일: 메일 있는 운영진에게만, 실제로 들어간 신청만, 번호는 안 넣음, 구글 실패해도 신청은 저장', async () => {
	await env.DB.prepare("UPDATE members SET email = 'staff@x.com' WHERE id = 'm-staff'").run();
	await env.DB.prepare("UPDATE members SET email = 'member@x.com' WHERE id = 'm-1'").run(); // 일반 회원 → 안 받음
	const sent: any[] = [];
	const realFetch = globalThis.fetch;
	globalThis.fetch = (async (url: string, init: any) => {
		if (String(url).includes('oauth2')) return new Response(JSON.stringify({ access_token: 't' }));
		sent.push(JSON.parse(init.body));
		return new Response('{}');
	}) as any;
	Object.assign(env, { GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's', GOOGLE_REFRESH_TOKEN: 'r' });
	try {
		const f = { ...form, name: '알림신청', phone: '7777-1234' };
		assert.equal((await post(f)).ok, true);
		await post({ ...f, phone: '7777-1235', website: 'spam' }); // 숨은 칸 → 저장·메일 없음
		await post(f); // 중복 → 거부, 메일 없음
		assert.equal(sent.length, 1);
		const mime = new TextDecoder().decode(Uint8Array.from(atob(sent[0].raw.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0)));
		assert.match(mime, /^Bcc: staff@x\.com\r\n/);
		const subject = new TextDecoder().decode(Uint8Array.from(atob(/Subject: =\?UTF-8\?B\?([^?]+)\?=/.exec(mime)![1]), (ch) => ch.charCodeAt(0)));
		assert.match(subject, /^\[프리스노우\]\[가입 신청\] \d{4}-\d{2}-\d{2}\([일월화수목금토]\) 알림신청$/);
		const body = [...mime.matchAll(/base64\r\n\r\n([A-Za-z0-9+/=\r\n]+)/g)].map((m) => new TextDecoder().decode(Uint8Array.from(atob(m[1].replace(/\r\n/g, '')), (ch) => ch.charCodeAt(0)))).join('\n');
		assert.match(body, /NEW<br>MEMBER\./);
		assert.match(body, /지역: 경기도 의정부시/);
		assert.equal(/7777|snow-board/.test(body), false); // 번호·비밀번호 X
		// 구글 실패해도 신청은 저장
		globalThis.fetch = (async () => new Response('no', { status: 500 })) as any;
		assert.equal((await post({ ...f, phone: '7777-1236' })).ok, true);
	} finally {
		globalThis.fetch = realFetch;
		for (const k of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN']) delete env[k];
	}
});

test('동의 문구: 지금 처리방침 시행일(POLICY_VERSION)의 문구가 consent_terms에 다 있음 (문구를 바꾸면 새 version 줄을 더할 것)', async () => {
	const { POLICY_VERSION } = await import('../src/lib.ts');
	const types = (await env.DB.prepare('SELECT type FROM consent_terms WHERE version = ? AND is_active = 1').bind(POLICY_VERSION).all()).results.map((r: any) => r.type).sort();
	assert.deepEqual(types, ['age14', 'emergency', 'notice', 'optional', 'policy', 'required', 'warning']);
});
