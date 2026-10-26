// 시즌방 — Apps Script 테스트(apps-script/Code.test.mjs 11번)와 같은 경우를 D1에서
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { env, post, sessionFor, useDb } from './setup.ts';
import { lessonMail } from '../src/notify.ts';

let A: string, B: string, S: string;
useDb(
	[
		['m-a', '01060000001', '회원A', '1990-01-01'],
		['m-b', '01060000002', '회원B', '1991-02-02'],
		['m-s', '01060000003', '운영진S', '1992-03-03', 'staff'],
	],
	async () => {
		A = await sessionFor('m-a');
		B = await sessionFor('m-b');
		S = await sessionFor('m-s');
		await env.DB.batch([
			env.DB.prepare("INSERT INTO room_owners (season, member_id) VALUES ('26-27', 'm-b'), ('25-26', 'm-a')"), // 주주는 시즌마다
			env.DB.prepare("INSERT INTO room_stays (member_id, date, kind, updated_at) VALUES ('m-a', '2026-11-01', '숙박', '2026-11-01T00:00:00.000Z')"),
		]);
	},
);
const room = (token: string, body: object = {}) => post({ action: 'seasonroom', season: '26-27', ...body }, token);
const rows = async () => (await env.DB.prepare('SELECT * FROM room_stays ORDER BY date, member_id').all()).results;

test('회원만, 응답 모양은 Apps Script와 같음', async () => {
	assert.equal((await post({ action: 'seasonroom', season: '26-27' })).expired, true);
	const { status, cors, ...r } = await room(A);
	assert.deepEqual(r, { ok: true, season: '26-27', prices: { 숙박: 10000, 휴식: 5000 }, nights: [{ date: '2026-11-01', name: '회원A', kind: '숙박', me: true, owner: false }], rides: [], lessons: [] });
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

test('출격: 시즌방과 따로, 취소해도 줄은 남김, 연락처 안 보냄', async () => {
	const stays = (await rows()).length;
	await room(A, { op: 'add', date: '2026-12-13', kind: '출격' });
	await room(A, { op: 'add', date: '2026-12-13', kind: '출격' });
	let r = await room(B, { op: 'add', date: '2026-12-13', kind: '출격' });
	assert.equal((await rows()).length, stays);
	assert.deepEqual(r.rides, [{ date: '2026-12-13', name: '회원A', me: false }, { date: '2026-12-13', name: '회원B', me: true }]);
	assert.equal(JSON.stringify(r).includes('6000'), false);
	r = await room(B, { op: 'remove', date: '2026-12-13', kind: '출격' });
	assert.deepEqual(r.rides.map((x: any) => x.name), ['회원A']);
	const checks = (await env.DB.prepare('SELECT member_id, status FROM ride_checks ORDER BY member_id').all()).results;
	assert.deepEqual(checks.map((x: any) => [x.member_id, x.status]), [['m-a', '출격'], ['m-b', '취소']]);
	assert.ok(r.nights.some((n: any) => n.date === '2026-12-13' && n.name === '회원B'), '출격 취소해도 시즌방 기록은 그대로');
});

test('잘못된 날짜, 시즌 거부', async () => {
	assert.equal((await room(A, { op: 'add', date: '2026-02-30' })).ok, false);
	assert.equal((await room(A, { op: 'add', date: '내일' })).ok, false);
	assert.equal((await room(A, { season: '2026' })).ok, false);
	assert.equal((await rows()).length, 4);
});

test('마이페이지 이번 시즌 요약: 내 숙박, 휴식, 출격, 주주면 0원', async () => {
	const now = new Date(), y = now.getFullYear() % 100;
	const cur = now.getMonth() >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
	const day = `20${cur.slice(0, 2)}-12-01`;
	const before = (await post({ action: 'me' }, A)).season;
	await room(A, { season: cur, op: 'add', date: day });
	await room(A, { season: cur, op: 'add', date: `20${cur.slice(0, 2)}-12-02`, kind: '휴식' });
	await room(A, { season: cur, op: 'add', date: day, kind: '출격' });
	const s = (await post({ action: 'me' }, A)).season;
	assert.deepEqual([s.season, s.stays - before.stays, s.rests - before.rests, s.rides - before.rides, s.owner, s.pay - before.pay], [cur, 1, 1, 1, false, 15000]);
	await env.DB.prepare('INSERT INTO room_owners (season, member_id) VALUES (?, ?)').bind(cur, 'm-a').run();
	assert.equal((await post({ action: 'me' }, A)).season.pay, 0);
});

test('강습 요청: 출격한 날만, 본인 요청만 보임, 출격 취소하면 같이 취소, 운영진은 /admin 목록', async () => {
	const day = '2026-12-20';
	assert.equal((await room(A, { op: 'add', date: day, kind: '강습' })).ok, false); // 출격 전
	await room(A, { op: 'add', date: day, kind: '출격' });
	await room(B, { op: 'add', date: day, kind: '출격' });
	assert.deepEqual((await room(A, { op: 'add', date: day, kind: '강습' })).lessons, [day]);
	assert.deepEqual((await room(A, { op: 'add', date: day, kind: '강습' })).lessons, [day]); // 두 번 눌러도 한 줄
	const b = await room(B);
	assert.deepEqual(b.lessons, []); // 다른 회원 요청은 안 보임
	assert.equal(JSON.stringify(b).includes('강습'), false);
	// 운영진 목록: 오늘 기준 2주 전부터, 날짜순 (두 요청 모두 앞으로의 날짜)
	const future = new Date(Date.now() + 30 * 86400e3).toISOString().slice(0, 10);
	await env.DB.prepare("INSERT INTO lesson_requests (member_id, date) VALUES ('m-b', ?)").bind(future).run();
	assert.equal((await post({ action: 'admin.lessons' }, A)).ok, false); // 회원은 못 봄
	let list = await post({ action: 'admin.lessons' }, S);
	assert.deepEqual(list.lessons.map((l: any) => [l.date, l.name]), [[day, '회원A'], [future, '회원B']].sort().reverse()); // 둘 다 연결 전 → 날짜 최신순
	assert.deepEqual(list.lessons.find((l: any) => l.member_id === 'm-a').riders, ['m-b']); // 그날 출격하는 다른 회원
	// 연결: 운영진만, 활동 회원만, 본인 X. 연결해도 요청한 회원 응답엔 안 나옴(운영진만 봄)
	assert.equal((await post({ action: 'admin.lessons', memberId: 'm-a', date: day, teacherId: 'm-b' }, A)).ok, false);
	assert.equal((await post({ action: 'admin.lessons', memberId: 'm-a', date: day, teacherId: 'm-a' }, S)).ok, false);
	const sum = async () => { const r = await post({ action: 'admin.summary' }, S); return [r.lessonsTodo, r.lessons]; };
	assert.deepEqual(await sum(), [2, 2]); // 앞으로의 요청 2건, 둘 다 연결 전
	list = await post({ action: 'admin.lessons', memberId: 'm-a', date: day, teacherId: 'm-b' }, S);
	assert.deepEqual(await sum(), [1, 2]);
	assert.equal(list.lessons.find((l: any) => l.member_id === 'm-a').teacher, '회원B');
	assert.equal(list.lessons.at(-1).member_id, 'm-a'); // 연결된 요청은 아래로
	const a = await room(A);
	assert.deepEqual(a.lessons, [day]); // 날짜만, 연결한 회원 정보 없음
	assert.equal(/teacher/.test(JSON.stringify(a)), false);
	assert.equal(JSON.stringify(await room(B)).includes('강습'), false);
	// 강습만 취소 → 출격은 그대로, 연결도 지워짐
	let r = await room(A, { op: 'remove', date: day, kind: '강습' });
	assert.deepEqual([r.lessons, r.rides.filter((x: any) => x.me && x.date === day).length], [[], 1]);
	assert.equal((await env.DB.prepare("SELECT teacher_id FROM lesson_requests WHERE member_id = 'm-a'").first())!.teacher_id, null);
	// 다시 요청 후 출격 취소 → 강습도 취소
	await room(A, { op: 'add', date: day, kind: '강습' });
	r = await room(A, { op: 'remove', date: day, kind: '출격' });
	assert.deepEqual(r.lessons, []);
	await room(A, { op: 'add', date: day, kind: '출격' }); // 다시 출격해도 강습은 꺼진 채
	assert.deepEqual((await room(A)).lessons, []);
});

test('강습 알림 메일: 회원 정보에 메일이 있는 활동 운영진에게만, 새 요청일 때만 Gmail로 한 번, 구글 실패해도 요청은 저장', async () => {
	// 메일은 운영진 화면 회원 수정으로 (검사, 소문자)
	assert.match((await post({ action: 'admin.memberUpdate', id: 'm-s', email: '이상한주소' }, S)).error, /메일/);
	assert.equal((await post({ action: 'admin.memberUpdate', id: 'm-s', email: 'Staff@X.com' }, S)).ok, true);
	assert.equal((await post({ action: 'admin.memberUpdate', id: 'm-b', email: 'member@y.kr' }, S)).ok, true); // 일반 회원 → 안 받음
	assert.equal((await post({ action: 'admin.members' }, S)).members.find((m: any) => m.id === 'm-s').email, 'staff@x.com');
	assert.deepEqual((await post({ action: 'admin.lessons' }, S)).notify, ['운영진S']);
	// 구글 호출은 가짜로 (실제 메일 X)
	const sent: any[] = [];
	const realFetch = globalThis.fetch;
	globalThis.fetch = (async (url: string, init: any) => {
		if (String(url).includes('oauth2')) return new Response(JSON.stringify({ access_token: 't' }));
		sent.push(JSON.parse(init.body));
		return new Response('{}');
	}) as any;
	Object.assign(env, { GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's', GOOGLE_REFRESH_TOKEN: 'r' });
	try {
		const day = '2026-12-27';
		await room(A, { op: 'add', date: day, kind: '출격' });
		await room(B, { op: 'add', date: day, kind: '출격' });
		await room(B, { op: 'add', date: day, kind: '강습' });
		await room(B, { op: 'add', date: day, kind: '강습' }); // 두 번 눌러도 메일 한 번
		assert.equal(sent.length, 1);
		const mime = new TextDecoder().decode(Uint8Array.from(atob(sent[0].raw.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0)));
		assert.match(mime, /^Bcc: staff@x\.com\r\n/); // 운영진만 (일반 회원 메일 X)
		const subject = /Subject: =\?UTF-8\?B\?([^?]+)\?=/.exec(mime)![1];
		assert.equal(new TextDecoder().decode(Uint8Array.from(atob(subject), (ch) => ch.charCodeAt(0))), '[프리스노우][강습 요청] 2026-12-27(일) 회원B');
		assert.equal(mime.includes('01060000002'), false); // 연락처는 메일에 안 넣음
		// 시안 A HTML + 글자판: 같은 날 출격(본인 빼고), 연결 대기, 이름은 HTML 이스케이프
		const partOf = (type: string) => {
			const m = new RegExp(`Content-Type: ${type}; charset=UTF-8\\r\\nContent-Transfer-Encoding: base64\\r\\n\\r\\n([A-Za-z0-9+/=\\r\\n]+)`).exec(mime)!;
			return new TextDecoder().decode(Uint8Array.from(atob(m[1].replace(/\r\n/g, '')), (ch) => ch.charCodeAt(0)));
		};
		assert.match(partOf('text/plain'), /같은 날 출격: 회원A \(1명\)\n연결 대기: \d+건/);
		assert.match(partOf('text/html'), /LESSON<br>REQUEST\.[\s\S]*회원A[\s\S]*연결하러 가기/);
		await room(B, { op: 'remove', date: day, kind: '강습' });
		await room(B, { op: 'add', date: day, kind: '강습' }); // 취소 후 다시 요청 = 새 요청
		assert.equal(sent.length, 2);
		assert.equal((await post({ action: 'admin.lessons', test: true }, S)).ok, true);
		assert.equal(sent.length, 3);
		// 정지된 운영진, 메일 지운 운영진은 안 받음 → 받을 사람 없으면 안 보냄
		await post({ action: 'admin.memberUpdate', id: 'm-s', email: '' }, S);
		assert.match((await post({ action: 'admin.lessons', test: true }, S)).error, /메일이 등록된 운영진이 없어요/);
		await room(B, { op: 'remove', date: day, kind: '강습' });
		await room(B, { op: 'add', date: day, kind: '강습' });
		assert.equal(sent.length, 3);
		// 구글이 실패해도 요청은 그대로 저장
		await post({ action: 'admin.memberUpdate', id: 'm-s', email: 'staff@x.com' }, S);
		globalThis.fetch = (async () => new Response('no', { status: 500 })) as any;
		await room(B, { op: 'remove', date: day, kind: '강습' });
		assert.equal((await room(B, { op: 'add', date: day, kind: '강습' })).lessons.includes(day), true);
		assert.equal((await post({ action: 'admin.lessons', test: true }, S)).ok, false); // 시험 메일은 실패를 알려 줌
	} finally {
		globalThis.fetch = realFetch;
		for (const k of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN']) delete env[k];
	}
});

test('강습 메일 HTML: 이름은 이스케이프, 날짜는 YYYY-MM-DD(요일)', () => {
	const m = lessonMail({ name: '<b>"김"</b>', date: '2026-10-29', riders: ['a&b'], pending: 1 });
	assert.equal(m.subject, '[프리스노우][강습 요청] 2026-10-29(목) <b>"김"</b>');
	assert.equal(/<b>"김"<\/b>|a&b/.test(m.html), false);
	assert.match(m.html, /&#60;b&#62;&#34;김&#34;&#60;\/b&#62;/);
});
