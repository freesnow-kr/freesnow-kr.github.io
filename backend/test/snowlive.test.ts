// 스노우라이브 — Apps Script 테스트(apps-script/Code.test.mjs 10번)와 같은 경우를 D1에서. 스노우라이브 API는 가짜 fetch
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { env, post, sessionFor, useDb } from './setup.ts';

let A: string;
useDb([['m-a', '01060000001', '회원A', '1990-01-01']], async () => {
	A = await sessionFor('m-a');
});
// 실제 응답 모양 (값은 가짜)
const fake = (o: any = {}) => ({
	friend_user_info: { user_id: 111, display_name: '가짜보더', profile_image_url_user_thumb: 'https://img.example/p.jpg', crew_name: 'FREESNOW', favorite_resort: '어딘가', skiorboard: '스노보드', sex: '여자', hide_profile: false, ...o.user },
	season_ranking_info: { count_info: [{ slope: '슬로프A', count: 9, ratio: 1 }, { slope: '슬로프B', count: 3, ratio: 0.3 }], overall_total_score: 120.4, overall_total_count: 12, overall_rank: 7, overall_rank_percentage: 0.0123, overall_tier_icon_url: 'https://img.example/t.png', primary_color: '825CD2', secondary_color: 'FAEFFF', tier_name_kor: '다이아몬드', ...o.season },
	calender_info: [
		{ date: '2026-01-10', daily_info: [{ slope: '슬로프B', count: 1 }, { slope: '슬로프A', count: 5 }], daily_total_count: 6 },
		{ date: '2025-12-27', daily_info: [{ slope: '슬로프A', count: 4 }], daily_total_count: 4 },
	],
});
const urls: string[] = [];
let reply: { code: number; body: object } = { code: 200, body: fake() };
const realFetch = globalThis.fetch;
globalThis.fetch = (async (u: any, init?: any) => {
	if (!String(u).startsWith('https://snowlive.example/')) return realFetch(u, init);
	urls.push(String(u));
	return new Response(JSON.stringify(reply.body), { status: reply.code });
}) as typeof fetch;

const sl = async (body: object) => {
	const { status, cors, ...r } = await post({ action: 'snowlive', ...body }, A);
	return r;
};
const records = async () => (await env.DB.prepare('SELECT season, data, fetched_at FROM snowlive_records WHERE is_active = 1 ORDER BY season').all()).results;
const age = (season: string, ms: number) => env.DB.prepare('UPDATE snowlive_records SET fetched_at = ? WHERE season = ?').bind(new Date(Date.now() - ms).toISOString(), season).run();
const now = new Date(), y = now.getFullYear() % 100;
const cur = now.getMonth() >= 3 ? `${y}-${y + 1}` : `${y - 1}-${y}`; // 진행 중(또는 다가오는) 시즌

test('회원만, 연결 전엔 빈 값, 이상한 링크 거부', async () => {
	assert.equal((await post({ action: 'snowlive', season: '25-26' })).expired, true);
	assert.deepEqual(await sl({ season: '25-26' }), { ok: true, id: '', stats: null });
	assert.equal((await sl({ op: 'link', id: 'https://evil.example/?x=1' })).ok, false);
});

test('연결: 링크에서 ID, 라이딩 통계만 (성별 버림), 저장', async () => {
	const r = await sl({ season: '25-26', op: 'link', id: 'https://snowlive.kr/share/user/111' });
	assert.equal(r.id, '111');
	assert.deepEqual(r.stats, {
		name: '가짜보더', photo: 'https://img.example/p.jpg', crew: 'FREESNOW', resort: '어딘가', board: '스노보드', total: 12, score: 120, rank: 7, top: 1.2,
		tier: { name: '다이아몬드', icon: 'https://img.example/t.png', color: '#825CD2', bg: '#FAEFFF' },
		slopes: [{ slope: '슬로프A', count: 9 }, { slope: '슬로프B', count: 3 }],
		days: [{ date: '2025-12-27', count: 4, slope: '슬로프A' }, { date: '2026-01-10', count: 6, slope: '슬로프A' }],
	});
	assert.equal(urls[0], 'https://snowlive.example/api/?user_id=111&friend_user_id=111&season=2025-10-01%2C%202026-03-31');
	const saved = await records();
	assert.equal(saved.length, 1);
	assert.deepEqual(JSON.parse(saved[0].data), r.stats);
	assert.equal(saved[0].data.includes('여자'), false);
});

test('끝난 시즌은 저장된 것만, 진행 중 시즌은 1시간 지나면 새로, 실패하면 저장된 것', async () => {
	await age('25-26', 1000 * 864e5);
	assert.equal((await sl({ season: '25-26' })).stats.total, 12);
	assert.equal(urls.length, 1);

	await sl({ season: cur });
	await sl({ season: cur });
	assert.equal(urls.length, 2);
	await age(cur, 2 * 3600e3);
	await sl({ season: cur });
	assert.equal(urls.length, 3);
	assert.equal((await records()).length, 2);

	await age(cur, 2 * 3600e3);
	reply = { code: 500, body: {} };
	assert.equal((await sl({ season: cur })).stats.total, 12);
	reply = { code: 200, body: fake() };
});

test('재연결: 끝난 시즌도 새로 요청, 1분 안에 또 누르면 저장된 것', async () => {
	const n = urls.length;
	await age('25-26', 5 * 60e3);
	reply = { code: 200, body: fake({ season: { overall_total_count: 20 } }) };
	assert.equal((await sl({ season: '25-26', op: 'refresh' })).stats.total, 20);
	assert.equal(urls.length, n + 1);
	assert.equal((await sl({ season: '25-26' })).stats.total, 20);
	await sl({ season: '25-26', op: 'refresh' });
	assert.equal(urls.length, n + 1);
	reply = { code: 200, body: fake() };
	// 같은 ID를 앱 주소 형식으로 다시 연결해도 기록 유지
	assert.equal((await sl({ season: '25-26', op: 'link', id: 'https://snowlive.kr/#/profile?id=111' })).id, '111');
	assert.equal((await records()).length, 2);
});

test('빈 시즌, 숨김 프로필, 실패 안내, 다른 ID로 바꾸면 예전 기록 삭제, 해제', async () => {
	reply = { code: 200, body: fake({ season: { count_info: [], overall_total_count: 0, overall_rank: 1 } }) };
	assert.equal((await sl({ season: '30-31' })).stats.total, 0);
	reply = { code: 200, body: fake({ user: { hide_profile: true } }) };
	const hidden = (await sl({ season: '24-25' })).stats;
	assert.equal(hidden.hidden, true);
	assert.equal(hidden.total, undefined);
	reply = { code: 500, body: {} };
	assert.equal((await sl({ season: '23-24' })).ok, false);

	// 연결 직후 스노우라이브가 실패해도 연결은 남고, 다음에 가져오면 저장
	assert.equal((await sl({ season: '25-26', op: 'link', id: '222' })).ok, false);
	assert.equal((await records()).length, 0);
	reply = { code: 200, body: fake() };
	assert.equal((await sl({ season: '25-26' })).stats.total, 12);
	assert.ok(urls.at(-1)!.includes('user_id=222'));
	assert.deepEqual(await sl({ op: 'unlink' }), { ok: true, id: '', stats: null });
	assert.equal((await records()).length, 0);
	assert.equal((await sl({ season: '25-26' })).id, '');
});

test('시즌 형식 거부', async () => {
	await sl({ season: '25-26', op: 'link', id: '111' });
	assert.equal((await sl({ season: '2026' })).ok, false);
});
