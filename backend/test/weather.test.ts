// 스키장 날씨: 한 번에 여러 곳, 1시간 캐시, 실패하면 지난 값
import { test } from 'node:test';
import assert from 'node:assert/strict';
import resorts from '../../src/data/resorts.json' with { type: 'json' };
import { env, post, useDb } from './setup.ts';

useDb([]);

const day = (snow: number) => ({ time: ['2026-12-13', '2026-12-14'], weather_code: [71, 3], temperature_2m_max: [-1.4, 2.6], temperature_2m_min: [-9.5, -6], apparent_temperature_min: [-15.2, -10], snowfall_sum: [snow, 0], wind_speed_10m_max: [20.4, 8] });

test('날씨: 비회원도, 1시간에 한 번만 받아 옴, 실패하면 지난 값', async () => {
	let calls = 0, fail = false;
	const real = globalThis.fetch;
	globalThis.fetch = (async (u: any) => {
		assert.match(String(u), /api\.open-meteo\.com/);
		calls++;
		if (fail) return new Response('no', { status: 500 });
		return new Response(JSON.stringify(resorts.map((_, i) => ({ current: { temperature_2m: -3.26, weather_code: 73, wind_speed_10m: 11 }, daily: day(i === 0 ? 7.25 : 0) }))));
	}) as any;
	try {
		const r = await post({ action: 'weather' });
		assert.equal(r.ok, true);
		assert.equal(r.resorts.length, resorts.length);
		assert.deepEqual(r.resorts[0], {
			id: 'gangchon', name: '엘리시안 강촌', now: { temp: -3, code: 73, wind: 11 },
			days: [{ date: '2026-12-13', code: 71, max: -1, min: -9, feel: -15, snow: 7.3, wind: 20 }, { date: '2026-12-14', code: 3, max: 3, min: -6, feel: -10, snow: 0, wind: 8 }],
		});
		await post({ action: 'weather' });
		assert.equal(calls, 1); // 캐시
		await env.DB.prepare("UPDATE cache SET expires_at = '2000-01-01' WHERE key = 'weather'").run();
		fail = true;
		const stale = await post({ action: 'weather' });
		assert.equal(stale.stale, true);
		assert.equal(stale.resorts[0].days[0].snow, 7.3);
	} finally {
		globalThis.fetch = real;
	}
});
