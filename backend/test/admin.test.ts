// 가입 신청 → 운영진 승인, 회원 관리 권한, 프로필 사진, 갤러리, 채팅 랭킹
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.ts';
import { env, post, sessionFor, useDb } from './setup.ts';

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
const form = { action: 'signup', name: '새회원', gender: '여', year: '1998', month: '3', day: '7', sido: '경기도', sigungu: '의정부시', phone: '010-4444-5555', agree: true };

test('가입 신청: 형식 검사, 중복 거부, 숨은 칸이면 저장 안 함, 응답엔 아무 데이터 없음', async () => {
	assert.match((await post({ ...form, agree: false })).error, /동의/);
	assert.match((await post({ ...form, day: '31', month: '2' })).error, /생년월일/);
	assert.match((await post({ ...form, phone: '01011110000' })).error, /이미/);
	const { status, cors, ...r } = await post(form);
	assert.deepEqual(r, { ok: true });
	assert.match((await post(form)).error, /이미/);
	await post({ ...form, phone: '01099998888', website: 'spam' });
	assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM signup_requests').first()).n, 1);
});

test('승인: 운영진만, 회원이 되면 생년월일로 첫 로그인, 기록 남음', async () => {
	assert.match((await post({ action: 'admin.signups' }, M)).error, /권한/);
	const list = (await post({ action: 'admin.signups' }, S)).signups;
	assert.equal(list.length, 1);
	const r = await post({ action: 'admin.signupDecide', id: list[0].id, approve: true }, S);
	assert.equal(r.ok, true);
	const m = await env.DB.prepare('SELECT * FROM members WHERE id = ?').bind(r.memberId).first();
	assert.deepEqual([m.name, m.region, m.area, m.birth, m.role], ['새회원', '경기북부', '의정부', '1998-03-07', 'member']);
	assert.equal((await post({ action: 'admin.signupDecide', id: list[0].id, approve: true }, S)).ok, false);
	assert.equal((await post({ action: 'login', phone: '44445555', password: '19980307' })).mustChange, true);
	assert.equal((await env.DB.prepare("SELECT count(*) AS n FROM admin_logs WHERE action = 'signup.approve'").first()).n, 1);
});

test('회원 관리: 운영진은 정보 수정·상태 변경, 권한·관리자 계정은 관리자만, 정지하면 바로 로그아웃, 내 권한은 못 바꿈', async () => {
	assert.equal((await post({ action: 'admin.members' }, M)).ok, false);
	const all = (await post({ action: 'admin.members' }, S)).members;
	assert.equal(all.length, 4);
	assert.equal((await post({ action: 'admin.memberUpdate', id: 'm-1', area: '노원구', phone: '010 1111 0001' }, S)).ok, true);
	assert.match((await post({ action: 'admin.memberUpdate', id: 'm-1', phone: '01022220000' }, S)).error, /다른 회원/);
	assert.deepEqual(Object.values(await env.DB.prepare("SELECT area, phone FROM members WHERE id = 'm-1'").first()), ['노원구', '01011110001']);
	assert.match((await post({ action: 'admin.memberStatus', id: 'm-1', role: 'staff' }, S)).error, /관리자만/); // 운영진은 권한 변경 못 함
	assert.match((await post({ action: 'admin.memberStatus', id: 'm-boss', status: 'suspended' }, S)).error, /관리자만/); // 관리자 계정 상태도 못 바꿈
	assert.equal((await post({ action: 'admin.memberStatus', id: 'm-1', status: 'suspended' }, S)).ok, true); // 상태는 운영진도
	assert.equal((await post({ action: 'me' }, M)).expired, true);
	assert.match((await post({ action: 'admin.memberStatus', id: 'm-boss', role: 'staff' }, B)).error, /내 계정/);
	assert.equal((await post({ action: 'admin.members', export: true }, S)).members.length, 4);
	const logs = (await post({ action: 'admin.audit' }, B)).logs;
	assert.ok(logs.some((l: any) => l.action === 'members.export' && l.actor === '운영진'), '명부 내려받기는 운영 기록');
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

test('채팅 랭킹: 운영진이 집계를 올리고 회원이 봄', async () => {
	assert.match((await post({ action: 'chatrank' }, S)).error, /준비/);
	const data = { from: '2025-11-28', to: '2025-12-01', total: 3, ranks: [{ name: 'A/96', count: 2 }, { name: 'B/90', count: 1 }], months: [{ month: '2025-12', total: 1, ranks: [{ name: 'A/96', count: 1 }] }] };
	assert.equal((await post({ action: 'admin.chatUpload', ...data, months: [{ month: 'x', ranks: [] }] }, S)).ok, false);
	assert.equal((await post({ action: 'admin.chatUpload', ...data }, B)).ok, true);
	const { status, cors, ...r } = await post({ action: 'chatrank' }, S);
	assert.deepEqual(r, { ok: true, ...data });
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
