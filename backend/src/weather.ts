// 스키장 날씨 (사용자 요구 2026-10-29): Open-Meteo(무료, 키 없음, 비상업 용도) — 1시간에 한 번만 받아 D1 cache에 두고 모두 같은 값
// 스키장 목록, 좌표는 src/data/resorts.json (웹캠 페이지와 같이 씀). 비회원도 봄 (공개 정보)
// 받아 오지 못하면 지난 값을 그대로 (stale: true)
import type { Ctx, Env } from './index.ts';
import resorts from '../../src/data/resorts.json' with { type: 'json' };
import { iso, later } from './lib.ts';

const CACHE_MS = 60 * 60 * 1000;
const API = 'https://api.open-meteo.com/v1/forecast';

export type Day = { date: string; code: number; max: number; min: number; feel: number; snow: number; wind: number };
export type ResortWeather = { id: string; name: string; now: { temp: number; code: number; wind: number }; days: Day[] };
export type Forecast = { at: string; resorts: ResortWeather[]; stale?: boolean };

const round = (v: unknown, d = 0) => Math.round(Number(v ?? 0) * 10 ** d) / 10 ** d;

// 오늘, 내일 (한국 시간). 여러 곳을 한 번에 물어봄 (위경도를 쉼표로)
async function fetchForecast(now: Date): Promise<Forecast> {
	const q = new URLSearchParams({
		latitude: resorts.map((r) => r.lat).join(','),
		longitude: resorts.map((r) => r.lon).join(','),
		current: 'temperature_2m,weather_code,wind_speed_10m',
		daily: 'weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_min,snowfall_sum,wind_speed_10m_max',
		timezone: 'Asia/Seoul',
		forecast_days: '2',
	});
	const res = await fetch(`${API}?${q}`);
	if (!res.ok) throw new Error(`open-meteo ${res.status}`);
	const raw = (await res.json()) as any;
	const list: any[] = Array.isArray(raw) ? raw : [raw];
	if (list.length !== resorts.length) throw new Error('open-meteo 응답 개수가 달라요');
	return {
		at: iso(now),
		resorts: resorts.map((r, i) => {
			const { current: cur, daily: d } = list[i];
			return {
				id: r.id,
				name: r.name,
				now: { temp: round(cur.temperature_2m), code: Number(cur.weather_code), wind: round(cur.wind_speed_10m) },
				days: d.time.map((date: string, k: number) => ({
					date,
					code: Number(d.weather_code[k]),
					max: round(d.temperature_2m_max[k]),
					min: round(d.temperature_2m_min[k]),
					feel: round(d.apparent_temperature_min[k]),
					snow: round(d.snowfall_sum[k], 1),
					wind: round(d.wind_speed_10m_max[k]),
				})),
			};
		}),
	};
}

// 다른 기능(폭설 알림)도 씀
export async function forecast(env: Env, now: Date): Promise<Forecast> {
	const db = env.DB;
	const hit = await db.prepare("SELECT value, expires_at FROM cache WHERE key = 'weather'").first<{ value: string; expires_at: string }>();
	if (hit && hit.expires_at > iso(now)) return JSON.parse(hit.value);
	try {
		const out = await fetchForecast(now);
		await db.prepare('INSERT INTO cache (key, value, expires_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value = ?2, expires_at = ?3')
			.bind('weather', JSON.stringify(out), iso(later(now, CACHE_MS))).run();
		return out;
	} catch (e) {
		console.error('weather', e);
		if (hit) return { ...JSON.parse(hit.value), stale: true };
		throw e;
	}
}

// {} → {ok, at, resorts}
export async function weather(c: Ctx) {
	try {
		return { ok: true, ...(await forecast(c.env, c.now)) };
	} catch {
		return { ok: false, error: '날씨를 불러오지 못했어요.' };
	}
}

// {} → {ok, date, rides, stays} 오늘(한국 시간) 출격 체크, 시즌방(숙박+휴식) 인원 — 숫자만이라 비회원도 봄 (사용자 요구 2026-10-29, 메인 TODAY 줄)
export async function today(c: Ctx) {
	const date = new Date(c.now.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
	const r = await c.env.DB.prepare(
		`SELECT (SELECT count(*) FROM ride_checks WHERE date = ?1 AND status = '출격' AND is_active = 1) AS rides,
		        (SELECT count(*) FROM room_stays WHERE date = ?1 AND kind IN ('숙박', '휴식') AND is_active = 1) AS stays`,
	).bind(date).first<{ rides: number; stays: number }>();
	return { ok: true, date, rides: r!.rides, stays: r!.stays };
}
