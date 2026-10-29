// 시즌 출격 순위, 배지
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { env, post, sessionFor, useDb } from './setup.ts';

let A = '';
useDb(
	[
		['m-a', '01070000001', '홍길동', '1990'],
		['m-b', '01070000002', '김철', '1991'],
		['m-c', '01070000003', '남궁민수', '1992'],
	],
	async () => {
		A = await sessionFor('m-a');
		// 26-27 시즌: A는 12번(개장일 2026-11-28 포함, 평일 5번 이상), B는 2번, C는 2번(취소 1번은 안 셈)
		const days = ['2026-11-28', ...Array.from({ length: 11 }, (_, i) => `2026-12-${String(i + 1).padStart(2, '0')}`)];
		await env.DB.batch([
			...days.map((d) => env.DB.prepare("INSERT INTO ride_checks (member_id, date, status, updated_at) VALUES ('m-a', ?, '출격', '2026')").bind(d)),
			env.DB.prepare("INSERT INTO ride_checks (member_id, date, status, updated_at) VALUES ('m-b', '2026-12-05', '출격', '2026'), ('m-b', '2026-12-06', '출격', '2026'), ('m-c', '2026-12-05', '출격', '2026'), ('m-c', '2026-12-06', '출격', '2026'), ('m-c', '2026-12-07', '취소', '2026')"),
			env.DB.prepare("INSERT INTO room_stays (member_id, date, kind, updated_at) VALUES ('m-a', '2026-12-05', '숙박', '2026')"),
		]);
	},
);

test('출격 순위: 회원만, 성 뺀 이름, 같은 횟수는 같은 순위, 내 배지', async () => {
	assert.equal((await post({ action: 'rideRank', season: '26-27' })).expired, true);
	const r = await post({ action: 'rideRank', season: '26-27' }, A);
	assert.deepEqual(r.top, [
		{ rank: 1, name: '길동', count: 12, me: true },
		{ rank: 2, name: '철', count: 2, me: false },
		{ rank: 2, name: '민수', count: 2, me: false },
	]);
	assert.deepEqual(r.me.badges.map((b: any) => b.id), ['ride10', 'opening', 'weekday', 'stay']);
	assert.equal(r.me.rank, 1);
	const empty = await post({ action: 'rideRank', season: '25-26' }, A);
	assert.deepEqual([empty.top, empty.me], [[], { rank: null, count: 0, badges: [] }]);
});
