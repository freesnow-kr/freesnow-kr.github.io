// 조 편성 (운영진 이상): 행사별로 참가자, 팀을 저장(선택). 편성 계산은 화면(브라우저)이 하고 서버는 저장만
import type { Ctx } from './index.ts';
import { need, Reply } from './auth.ts';
import { randomToken } from './lib.ts';

const bad = (error: string) => new Reply({ ok: false, error });
const DATA_MAX = 200_000; // 참가자 수백 명 + 게임 기록 넉넉히

// 최근 행사 목록 (참가자, 팀 수만)
export async function list(c: Ctx) {
	await need(c, 'staff');
	const { results } = await c.env.DB.prepare('SELECT id, title, date, data, updated_at FROM team_events WHERE is_active = 1 ORDER BY date DESC, updated_at DESC LIMIT 50').all<any>();
	return {
		ok: true,
		events: results.map((e) => {
			let d: any = {};
			try {
				d = JSON.parse(e.data);
			} catch {}
			return { id: e.id, title: e.title, date: e.date, updated_at: e.updated_at, people: d.people?.length ?? 0, teams: d.teams?.length ?? 0 };
		}),
	};
}

export async function get(c: Ctx) {
	await need(c, 'staff');
	const e = await c.env.DB.prepare('SELECT id, title, date, data FROM team_events WHERE id = ? AND is_active = 1').bind(String(c.body.id ?? '')).first<any>();
	if (!e) throw bad('행사를 찾지 못했어요.');
	return { ok: true, event: { id: e.id, title: e.title, date: e.date, data: JSON.parse(e.data) } };
}

// {id?, title, date, data} 새로 만들거나 고침 → {id}
export async function save(c: Ctx) {
	const me = await need(c, 'staff');
	const title = String(c.body.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
	const date = String(c.body.date ?? '');
	if (!title) throw bad('행사 이름을 적어 주세요.');
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw bad('날짜를 확인해 주세요.');
	const d = c.body.data;
	if (!d || typeof d !== 'object' || !Array.isArray(d.teams) || !Array.isArray(d.people)) throw bad('편성 내용을 확인해 주세요.');
	const data = JSON.stringify(d);
	if (data.length > DATA_MAX) throw bad('편성 내용이 너무 커요.');
	if (c.body.id) {
		const r = await c.env.DB.prepare('UPDATE team_events SET title = ?, date = ?, data = ? WHERE id = ? AND is_active = 1').bind(title, date, data, String(c.body.id)).run();
		if (!r.meta.changes) throw bad('행사를 찾지 못했어요.');
		return { ok: true, id: String(c.body.id) };
	}
	const id = randomToken().slice(0, 12);
	await c.env.DB.prepare('INSERT INTO team_events (id, title, date, data, created_by) VALUES (?, ?, ?, ?, ?)').bind(id, title, date, data, me.id).run();
	return { ok: true, id };
}

export async function remove(c: Ctx) {
	await need(c, 'staff');
	await c.env.DB.prepare('UPDATE team_events SET is_active = 0 WHERE id = ?').bind(String(c.body.id ?? '')).run();
	return { ok: true };
}
