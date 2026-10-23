// 스노우라이브 연동 — Apps Script snowlive와 같은 규칙·응답 (AGENTS.md 'SHRED LOG' 스노우라이브 연동)
// {season: '25-26', op?: 'link'|'unlink'|'refresh', id?} → {ok, id, stats}. 공식 API 아님(앱이 쓰는 주소, 사용자 동의) — 주소는 secret SNOWLIVE_API
// 저장된 것(snowlive_records)이 캐시 역할: 끝난 시즌(4/1 이후)은 다시 요청 안 함, 진행 중 시즌은 1시간 지나면 새로, 실패하면 저장된 것
import type { Ctx } from './index.ts';
import { need } from './auth.ts';
import { iso } from './lib.ts';

const REFRESH_MS = 60 * 60 * 1000;
const REFRESH_GAP_MS = 60 * 1000; // '재연결'을 연달아 눌러도 1분에 한 번만 (스노우라이브 서버 보호)

export async function snowlive(c: Ctx) {
	const db = c.env.DB;
	const me = await need(c);
	const b = c.body;

	if (b.op === 'link' || b.op === 'unlink') {
		const id = b.op === 'link' ? snowliveId(b.id) : '';
		if (b.op === 'link' && !id) return { ok: false, error: '스노우라이브 프로필 링크나 ID를 확인해 주세요.' };
		const old = await db.prepare('SELECT snowlive_id FROM snowlive_links WHERE member_id = ? AND is_active = 1').bind(me.id).first<{ snowlive_id: string }>();
		const stmts = [];
		if (!id || old?.snowlive_id !== id) stmts.push(db.prepare('UPDATE snowlive_records SET is_active = 0 WHERE member_id = ? AND is_active = 1').bind(me.id)); // 다른 ID 기록 소프트 삭제 (해제면 전부)
		stmts.push(
			id
				? db.prepare('INSERT INTO snowlive_links (member_id, snowlive_id, linked_at) VALUES (?1, ?2, ?3) ON CONFLICT(member_id) DO UPDATE SET snowlive_id = ?2, linked_at = ?3, is_active = 1').bind(me.id, id, iso(c.now))
				: db.prepare('UPDATE snowlive_links SET is_active = 0 WHERE member_id = ?').bind(me.id),
		);
		await db.batch(stmts);
		if (!id) return { ok: true, id: '', stats: null };
		return snowlive({ ...c, body: { season: b.season } });
	}

	const link = await db.prepare('SELECT snowlive_id FROM snowlive_links WHERE member_id = ? AND is_active = 1').bind(me.id).first<{ snowlive_id: string }>();
	const id = link?.snowlive_id ?? '';
	if (!id) return { ok: true, id: '', stats: null };
	const season = String(b.season ?? '');
	const m = /^(\d{2})-(\d{2})$/.exec(season);
	if (!m) return { ok: false, error: '시즌을 확인해 주세요.' };

	const saved = await db.prepare('SELECT data, fetched_at FROM snowlive_records WHERE member_id = ? AND season = ? AND is_active = 1').bind(me.id, season).first<{ data: string; fetched_at: string }>();
	let old = null;
	try {
		old = saved ? JSON.parse(saved.data) : null;
	} catch {}
	// 스노우라이브 시즌 = 10/1 ~ 3/31. 4/1이 지나면 끝난 시즌
	const ended = c.now.getTime() >= Date.UTC(2000 + Number(m[2]), 3, 1) - 9 * 3600e3; // 4/1 00:00 KST
	const age = saved ? c.now.getTime() - Date.parse(saved.fetched_at) : Infinity;
	if (old && (b.op === 'refresh' ? age < REFRESH_GAP_MS : ended || age < REFRESH_MS)) return { ok: true, id, stats: old };

	let stats = null;
	try {
		const range = `20${m[1]}-10-01, 20${m[2]}-03-31`;
		const res = await fetch(`${c.env.SNOWLIVE_API}?user_id=${id}&friend_user_id=${id}&season=${encodeURIComponent(range)}`);
		stats = res.ok ? parseSnowlive(await res.json()) : null;
	} catch {}
	if (!stats) return old ? { ok: true, id, stats: old } : { ok: false, id, error: '스노우라이브 기록을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.' };
	await db.prepare(
		`INSERT INTO snowlive_records (member_id, season, data, fetched_at) VALUES (?1, ?2, ?3, ?4)
		 ON CONFLICT(member_id, season) DO UPDATE SET data = ?3, fetched_at = ?4, is_active = 1`,
	).bind(me.id, season, JSON.stringify(stats), iso(c.now)).run();
	return { ok: true, id, stats };
}

// '…/share/user/16740', '…#/profile?id=16740', '16740' → '16740'
export function snowliveId(v: unknown): string {
	const s = String(v ?? '').trim();
	const m = /(?:\/user\/|[?&]id=)(\d{1,10})\b/.exec(s) || /^(\d{1,10})$/.exec(s);
	return m ? m[1] : '';
}

// API 응답 → 라이딩 통계만 (성별 등은 버림). 숨김 프로필이면 {hidden: true}. 이번 시즌 기록이 없으면 total 0
export function parseSnowlive(d: any) {
	const u = d?.friend_user_info, s = d?.season_ranking_info;
	if (!u || !s) return null;
	const https = (v: unknown) => (/^https:\/\//.test(String(v || '')) ? String(v) : '');
	const color = (v: unknown) => (/^[0-9a-f]{6}$/i.test(String(v || '')) ? '#' + v : '');
	const profile = { name: String(u.display_name || ''), photo: https(u.profile_image_url_user_thumb || u.profile_image_url_user), crew: String(u.crew_name || ''), resort: String(u.favorite_resort || ''), board: String(u.skiorboard || '') };
	if (u.hide_profile) return { hidden: true, ...profile, photo: '' };
	const total = Number(s.overall_total_count) || 0;
	const out: Record<string, any> = { ...profile, total, days: [], slopes: [] };
	if (!total) return out;
	out.score = Math.round(Number(s.overall_total_score) || 0);
	out.rank = Number(s.overall_rank) || 0;
	out.top = Math.round((Number(s.overall_rank_percentage) || 0) * 1000) / 10; // 상위 n%
	out.tier = { name: String(s.tier_name_kor || ''), icon: https(s.overall_tier_icon_url), color: color(s.primary_color), bg: color(s.secondary_color) };
	out.slopes = (s.count_info || []).slice(0, 10).map((x: any) => ({ slope: String(x.slope), count: Number(x.count) || 0 }));
	out.days = (d.calender_info || [])
		.map((x: any) => {
			const top = (x.daily_info || []).slice().sort((a: any, c: any) => c.count - a.count)[0];
			return { date: String(x.date).slice(0, 10), count: Number(x.daily_total_count) || 0, slope: top ? String(top.slope) : '' };
		})
		.sort((a: any, c: any) => (a.date < c.date ? -1 : 1));
	return out;
}
