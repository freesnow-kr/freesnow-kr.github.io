// 시즌 출격 순위, 배지 (사용자 요구 2026-10-29): 출격 체크(ride_checks) 횟수로. 회원만, 이름은 성 뺀 이름
// 배지: 출격 10/20/30회, 개장일 출격(그 시즌 동호회 첫 출격일에 출격), 평일 출격 5회, 시즌방 첫 숙박
import type { Ctx, Env } from './index.ts';
import { need } from './auth.ts';
import { givenName, seasonOf, seasonRange } from './lib.ts';

const TOP = 10;
export type Badge = { id: string; label: string };

// 한 회원의 이번 시즌 배지 (마이페이지도 씀)
export async function badgesOf(env: Env, memberId: string, season: string): Promise<Badge[]> {
	const [from, to] = seasonRange(season);
	const r = await env.DB.prepare(
		`SELECT (SELECT count(*) FROM ride_checks WHERE member_id = ?1 AND status = '출격' AND is_active = 1 AND date BETWEEN ?2 AND ?3) AS rides,
		        (SELECT count(*) FROM ride_checks WHERE member_id = ?1 AND status = '출격' AND is_active = 1 AND date BETWEEN ?2 AND ?3
		           AND strftime('%w', date) NOT IN ('0', '6')) AS weekdays,
		        (SELECT count(*) FROM ride_checks WHERE member_id = ?1 AND status = '출격' AND is_active = 1
		           AND date = (SELECT min(date) FROM ride_checks WHERE status = '출격' AND is_active = 1 AND date BETWEEN ?2 AND ?3)) AS opening,
		        (SELECT count(*) FROM room_stays WHERE member_id = ?1 AND kind = '숙박' AND is_active = 1 AND date BETWEEN ?2 AND ?3) AS stays`,
	).bind(memberId, from, to).first<{ rides: number; weekdays: number; opening: number; stays: number }>();
	const out: Badge[] = [];
	for (const n of [30, 20, 10]) if (r!.rides >= n) { out.push({ id: `ride${n}`, label: `출격 ${n}회` }); break; }
	if (r!.opening) out.push({ id: 'opening', label: '개장일 출격' });
	if (r!.weekdays >= 5) out.push({ id: 'weekday', label: '평일 출격 5회' });
	if (r!.stays) out.push({ id: 'stay', label: '시즌방 숙박' });
	return out;
}

// {season?} → {ok, season, top: [{rank, name, count, me}], me: {rank, count, badges}}. 같은 횟수면 같은 순위
export async function rideRank(c: Ctx) {
	const me = await need(c);
	const season = /^\d{2}-\d{2}$/.test(String(c.body.season ?? '')) ? String(c.body.season) : seasonOf(c.now);
	const [from, to] = seasonRange(season);
	const { results } = await c.env.DB.prepare(
		`SELECT r.member_id AS id, m.name, count(*) AS n FROM ride_checks r JOIN members m ON m.id = r.member_id
		 WHERE r.status = '출격' AND r.is_active = 1 AND r.date BETWEEN ? AND ? AND m.status = 'active'
		 GROUP BY r.member_id ORDER BY n DESC, min(r.date)`,
	).bind(from, to).all<{ id: string; name: string; n: number }>();
	const ranked = results.map((x) => ({ ...x, rank: 1 + results.filter((y) => y.n > x.n).length }));
	const mine = ranked.find((x) => x.id === me.id);
	return {
		ok: true,
		season,
		top: ranked.filter((x) => x.rank <= TOP).map((x) => ({ rank: x.rank, name: givenName(x.name), count: x.n, me: x.id === me.id })),
		me: { rank: mine?.rank ?? null, count: mine?.n ?? 0, badges: await badgesOf(c.env, me.id, season) },
	};
}
