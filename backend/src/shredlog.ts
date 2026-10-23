// SHRED LOG 출격·지출·시즌권 — Apps Script shredLog와 같은 규칙·응답 (AGENTS.md 'SHRED LOG')
// {op?: 'add'|'delete'} → 본인 기록 전체 {visits, expenses, pass}. 다른 회원 줄은 읽지도 지우지도 않음 (WHERE member_id)
import type { Ctx } from './index.ts';
import { need } from './auth.ts';
import { iso } from './lib.ts';

// 화면 필드 → 열 (숫자 칸은 비어 있으면 NULL)
const TEXT = ['slot', 'snow', 'style', 'weather', 'crew', 'gear', 'memo'] as const;
const NUM = ['temp', 'runs', 'hours', 'rating'] as const;
const LOG_MAX = 3000; // 회원당 출격+지출 줄 상한

const isId = (v: unknown) => /^[\w-]{1,64}$/.test(String(v ?? ''));
const isYmd = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ''));
const won = (v: unknown) => Number(v) >= 0 && Number(v) < 1e9;
// 글자 수 제한 + 공백 정리 (시트가 아니라 수식 주입 걱정은 없음 → 시트로 내보낼 때 막을 것)
const clean = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const num = (v: unknown) => (String(v ?? '').trim() !== '' && isFinite(Number(v)) ? Number(v) : null);

export async function shredLog(c: Ctx) {
	const db = c.env.DB;
	const me = await need(c);
	const b = c.body;

	if (b.op === 'add') {
		const visits: any[] = Array.isArray(b.visits) ? b.visits : [];
		const expenses: any[] = Array.isArray(b.expenses) ? b.expenses : [];
		const pass: Record<string, any> = b.pass && typeof b.pass === 'object' ? b.pass : {};
		if (visits.some((v) => !v || !isId(v.id) || !isYmd(v.date) || !clean(v.resort, 40))) return { ok: false, error: '출격 기록(날짜·스키장)을 확인해 주세요.' };
		if (expenses.some((e) => !e || !isId(e.id) || !isYmd(e.date) || !clean(e.cat, 40) || !(Number(e.amount) > 0) || !won(e.amount) || (e.visit && !isId(e.visit)))) return { ok: false, error: '지출 기록(날짜·금액)을 확인해 주세요.' };
		if (Object.keys(pass).some((s) => !/^\d{2}-\d{2}$/.test(s) || !won(pass[s]?.price || 0) || !won(pass[s]?.day || 0))) return { ok: false, error: '시즌권 가격을 확인해 주세요.' };

		const n = await db.prepare('SELECT (SELECT count(*) FROM ride_logs WHERE member_id = ?1) + (SELECT count(*) FROM expense_logs WHERE member_id = ?1) AS n').bind(me.id).first<{ n: number }>();
		if (n!.n + visits.length + expenses.length > LOG_MAX) return { ok: false, error: '기록이 너무 많아요. 운영진에게 문의해 주세요.' };

		const now = iso(c.now);
		// 같은 ID는 건너뜀 (옮기기 재시도해도 중복 없음). batch = 한 트랜잭션
		const stmts = [
			...visits.map((v) =>
				db.prepare(
					`INSERT INTO ride_logs (member_id, id, date, resort, ${TEXT.join(', ')}, ${NUM.join(', ')}, created_at)
					 VALUES (${Array(4 + TEXT.length + NUM.length + 1).fill('?').join(', ')}) ON CONFLICT DO NOTHING`,
				).bind(me.id, String(v.id), v.date, clean(v.resort, 100), ...TEXT.map((k) => clean(v[k], k === 'memo' ? 300 : 100)), ...NUM.map((k) => num(v[k])), now),
			),
			...expenses.map((e) =>
				db.prepare('INSERT INTO expense_logs (member_id, id, date, cat, amount, memo, visit_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING')
					.bind(me.id, String(e.id), e.date, clean(e.cat, 40), Number(e.amount), clean(e.memo, 100), e.visit ? String(e.visit) : null, now),
			),
			// 시즌권: 회원·시즌당 한 줄 (있으면 고침)
			...Object.keys(pass).map((s) =>
				db.prepare(
					`INSERT INTO season_passes (member_id, season, price, day_price, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
					 ON CONFLICT(member_id, season) DO UPDATE SET price = ?3, day_price = ?4, updated_at = ?5`,
				).bind(me.id, s, Number(pass[s].price) || 0, Number(pass[s].day) || 0, now),
			),
		];
		if (stmts.length) await db.batch(stmts);
	} else if (b.op === 'delete') {
		const stmts = [];
		if (b.visit) {
			// 출격을 지우면 묶인 지출도
			stmts.push(db.prepare('DELETE FROM ride_logs WHERE member_id = ? AND id = ?').bind(me.id, String(b.visit)));
			stmts.push(db.prepare('DELETE FROM expense_logs WHERE member_id = ? AND visit_id = ?').bind(me.id, String(b.visit)));
		}
		if (b.expense) stmts.push(db.prepare('DELETE FROM expense_logs WHERE member_id = ? AND id = ?').bind(me.id, String(b.expense)));
		if (stmts.length) await db.batch(stmts);
	}

	const [V, E, P] = await db.batch([
		db.prepare('SELECT * FROM ride_logs WHERE member_id = ? ORDER BY rowid').bind(me.id),
		db.prepare('SELECT * FROM expense_logs WHERE member_id = ? ORDER BY rowid').bind(me.id),
		db.prepare('SELECT * FROM season_passes WHERE member_id = ?').bind(me.id),
	]);
	// 화면이 받던 그대로: 출격 칸은 전부 글자 (빈 칸 '')
	const str = (v: unknown) => (v == null ? '' : String(v));
	const visits = V.results.map((r: any) => ({ id: r.id, date: r.date, resort: r.resort, ...Object.fromEntries([...TEXT, ...NUM].map((k) => [k, str(r[k])])) }));
	const expenses = E.results.map((r: any) => ({ id: r.id, date: r.date, cat: r.cat, amount: r.amount, memo: str(r.memo), visit: str(r.visit_id) }));
	const pass = Object.fromEntries(P.results.map((r: any) => [r.season, { price: r.price, day: r.day_price }]));
	return { ok: true, visits, expenses, pass };
}
