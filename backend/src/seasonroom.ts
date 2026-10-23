// 시즌방 숙박 체크 — Apps Script seasonRoom과 같은 규칙·응답 (AGENTS.md '시즌방 숙박 체크')
// 회원·날짜당 한 줄(PRIMARY KEY), 취소해도 줄은 남기고 kind = '취소'. 방 구분·정원 없음, 지난 날짜도 자유롭게. 시즌 = 7/1 ~ 6/30
import type { Ctx } from './index.ts';
import { need } from './auth.ts';
import { ROOM_PRICES as PRICES, iso } from './lib.ts';
import { lessonRequested } from './notify.ts';


// {season: '26-27', op?: 'add'|'remove', date?: '2026-12-13', kind?: '숙박'|'휴식'|'출격'|'강습'} → {ok, season, prices, nights: [{date, name, kind, me, owner}], rides: [{date, name, me}], lessons: ['2026-12-13']}
// kind '출격'이면 출격 체크(ride_checks, 시즌방과 따로·정산 없음). 응답엔 취소 빼고, 회원에게 이름만 (연락처 X)
// kind '강습'이면 강습 요청(lesson_requests) — 내가 출격한 날만. lessons는 내 요청 날짜만(다른 회원 요청·연결한 회원은 안 보냄 — 운영진만 /admin에서)
export async function seasonRoom(c: Ctx) {
	const db = c.env.DB;
	const me = await need(c);
	const season = String(c.body.season ?? '');
	const m = /^(\d{2})-(\d{2})$/.exec(season);
	if (!m) return { ok: false, error: '시즌을 확인해 주세요.' };

	if (c.body.op === 'add' || c.body.op === 'remove') {
		const date = String(c.body.date ?? '');
		if (!isDate(date)) return { ok: false, error: '날짜를 확인해 주세요.' };
		if (c.body.kind === '출격') {
			const ride = db.prepare(
				`INSERT INTO ride_checks (member_id, date, status, updated_at) VALUES (?1, ?2, ?3, ?4)
				 ON CONFLICT(member_id, date) DO UPDATE SET status = ?3, updated_at = ?4, is_active = 1`,
			).bind(me.id, date, c.body.op === 'add' ? '출격' : '취소', iso(c.now)); // 기록 없는 날 취소면 '취소' 줄이 생길 뿐 (응답엔 안 나옴)
			// 출격을 취소하면 그날 강습 요청도 취소
			if (c.body.op === 'add') await ride.run();
			else await db.batch([ride, db.prepare('UPDATE lesson_requests SET is_active = 0, teacher_id = NULL WHERE member_id = ? AND date = ? AND is_active = 1').bind(me.id, date)]);
		} else if (c.body.kind === '강습') {
			if (c.body.op === 'add') {
				const rode = await db.prepare("SELECT 1 FROM ride_checks WHERE member_id = ? AND date = ? AND status = '출격' AND is_active = 1").bind(me.id, date).first();
				if (!rode) return { ok: false, error: '먼저 그날 출격을 체크해 주세요.' };
				const was = await db.prepare('SELECT is_active FROM lesson_requests WHERE member_id = ? AND date = ?').bind(me.id, date).first<{ is_active: number }>();
				await db.prepare('INSERT INTO lesson_requests (member_id, date) VALUES (?, ?) ON CONFLICT(member_id, date) DO UPDATE SET is_active = 1').bind(me.id, date).run();
				if (!was?.is_active) await lessonRequested(c.env, me.name, date); // 새 요청일 때만 운영진 메일 (두 번 눌러도 한 번)
			} else await db.prepare('UPDATE lesson_requests SET is_active = 0, teacher_id = NULL WHERE member_id = ? AND date = ? AND is_active = 1').bind(me.id, date).run();
		} else if (c.body.op === 'add') {
			const kind = c.body.kind === '휴식' ? '휴식' : '숙박';
			await db.prepare(
				`INSERT INTO room_stays (member_id, date, kind, updated_at) VALUES (?1, ?2, ?3, ?4)
				 ON CONFLICT(member_id, date) DO UPDATE SET kind = ?3, updated_at = ?4, is_active = 1`,
			).bind(me.id, date, kind, iso(c.now)).run();
		} else {
			// 기록 없는 날 취소는 아무 일 없음
			await db.prepare("UPDATE room_stays SET kind = '취소', updated_at = ? WHERE member_id = ? AND date = ? AND is_active = 1").bind(iso(c.now), me.id, date).run();
		}
	}

	const from = `20${m[1]}-07-01`, to = `20${m[2]}-06-30`;
	const byDateName = (a: { date: string; name: string }, b: { date: string; name: string }) => (a.date === b.date ? a.name.localeCompare(b.name, 'ko') : a.date < b.date ? -1 : 1);
	const { results } = await db.prepare(
		`SELECT r.date, m.name, r.kind, r.member_id = ?1 AS me, o.member_id IS NOT NULL AS owner
		 FROM room_stays r JOIN members m ON m.id = r.member_id
		 LEFT JOIN room_owners o ON o.season = ?2 AND o.member_id = r.member_id AND o.is_active = 1
		 WHERE r.date BETWEEN ?3 AND ?4 AND r.kind != '취소' AND r.is_active = 1`,
	).bind(me.id, season, from, to).all<{ date: string; name: string; kind: string; me: number; owner: number }>();
	const nights = results.map((r) => ({ date: r.date, name: r.name, kind: r.kind, me: !!r.me, owner: !!r.owner })).sort(byDateName);
	const rides = (
		await db.prepare(
			`SELECT r.date, m.name, r.member_id = ?1 AS me FROM ride_checks r JOIN members m ON m.id = r.member_id
			 WHERE r.date BETWEEN ?2 AND ?3 AND r.status = '출격' AND r.is_active = 1`,
		).bind(me.id, from, to).all<{ date: string; name: string; me: number }>()
	).results.map((r) => ({ date: r.date, name: r.name, me: !!r.me })).sort(byDateName);
	const lessons = (
		await db.prepare('SELECT date FROM lesson_requests WHERE member_id = ? AND date BETWEEN ? AND ? AND is_active = 1 ORDER BY date').bind(me.id, from, to).all<{ date: string }>()
	).results.map((r) => r.date);
	return { ok: true, season, prices: PRICES, nights, rides, lessons };
}

// 'YYYY-MM-DD' + 실제 있는 날 (2026-02-30 거부)
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
