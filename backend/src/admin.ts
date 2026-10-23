// 운영진 화면(/admin) API. 권한은 전부 여기서 확인 (화면에서 메뉴를 숨기는 건 편의일 뿐)
// staff(운영진): 가입 승인·거절, 회원 목록·정보 수정, 로그인 이력, 시즌방 주주, 채팅 랭킹 올리기
// master(마스터): + 정지·탈퇴·권한 변경, 비밀번호 초기화(auth.ts adminReset), 감사 로그
// 바꾸는 일은 전부 admin_logs (누가·언제·무엇을·전후 값)
import type { Ctx } from './index.ts';
import { need, Reply } from './auth.ts';
import { iso, normPhone, randomToken } from './lib.ts';

const log = (c: Ctx, actor: string, action: string, target: string | null, detail: object) =>
	c.env.DB.prepare('INSERT INTO admin_logs (at, actor_id, action, target_id, detail) VALUES (?, ?, ?, ?, ?)').bind(iso(c.now), actor, action, target, JSON.stringify(detail));
const bad = (error: string) => new Reply({ ok: false, error });

// 거주지 표기 맞춤: '의정부시' → 의정부, '가평군' → 가평, '노원구' 그대로 (Apps Script normArea와 같음)
export function normArea(v: unknown) {
	let a = String(v ?? '').trim().split(/\s+/).pop() || '';
	a = a.replace(/(특별시|광역시|특별자치시|특별자치도)$/, '');
	if (a.length > 2) a = a.replace(/[시군]$/, '');
	return a;
}

export async function summary(c: Ctx) {
	const me = await need(c, 'staff');
	const r = await c.env.DB.prepare(
		`SELECT (SELECT count(*) FROM members WHERE status = 'active') AS active,
		        (SELECT count(*) FROM members) AS total,
		        (SELECT count(*) FROM signup_requests WHERE status = 'pending') AS pending,
		        (SELECT count(*) FROM login_logs WHERE ok = 0 AND at > ?) AS fails`,
	).bind(iso(new Date(c.now.getTime() - 864e5))).first();
	return { ok: true, role: me.role, ...r };
}

export async function signups(c: Ctx) {
	await need(c, 'staff');
	const { results } = await c.env.DB.prepare("SELECT id, created_at, name, gender, birth, sido, area, phone FROM signup_requests WHERE status = 'pending' ORDER BY created_at").all();
	return { ok: true, signups: results };
}

// {id, approve: true|false} — 승인하면 회원으로 (구분 = 신청한 시도, 거주지는 시·군 뗀 값)
export async function signupDecide(c: Ctx) {
	const db = c.env.DB;
	const me = await need(c, 'staff');
	const s = await db.prepare("SELECT * FROM signup_requests WHERE id = ? AND status = 'pending'").bind(Number(c.body.id)).first<any>();
	if (!s) throw bad('이미 처리했거나 없는 신청이에요.');
	const approve = c.body.approve === true;
	const now = iso(c.now);
	const stmts = [db.prepare('UPDATE signup_requests SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?').bind(approve ? 'approved' : 'rejected', me.id, now, s.id)];
	let memberId = null;
	if (approve) {
		if (await db.prepare('SELECT 1 FROM members WHERE phone = ?').bind(s.phone).first()) throw bad('이미 회원인 연락처예요.');
		memberId = 'm' + randomToken().slice(0, 15);
		stmts.push(
			db.prepare(
				`INSERT INTO members (id, phone, name, gender, birth, grade, area, joined_at, approved_at, created_at, updated_at, sort_no)
				 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9, ?9, (SELECT coalesce(max(sort_no), 0) + 1 FROM members))`,
			).bind(memberId, s.phone, s.name, s.gender, s.birth, s.sido, normArea(s.area), s.created_at, now),
		);
	}
	stmts.push(log(c, me.id, approve ? 'signup.approve' : 'signup.reject', memberId, { signup: s.id, name: s.name }));
	await db.batch(stmts);
	return { ok: true, memberId };
}

// 회원명부: 운영진에게만, 개인정보 포함 (본인 확인·연락용). 최근 로그인 함께
export async function members(c: Ctx) {
	const me = await need(c, 'staff');
	const { results } = await c.env.DB.prepare(
		`SELECT m.id, m.name, m.phone, m.gender, m.birth, m.grade, m.area, m.private_contact, m.role, m.status, m.joined_at,
		        (SELECT max(at) FROM login_logs l WHERE l.member_id = m.id AND l.ok = 1) AS last_login,
		        c.member_id IS NOT NULL AND c.hash IS NULL AS reset_pending, c.changed_at AS password_changed
		 FROM members m LEFT JOIN member_credentials c ON c.member_id = m.id
		 ORDER BY m.sort_no, m.name`,
	).all();
	return { ok: true, role: me.role, members: results };
}

const FIELDS = ['name', 'phone', 'gender', 'birth', 'grade', 'area', 'private_contact'] as const;
// {id, name?, phone?, gender?, birth?, grade?, area?, private_contact?} 운영진
export async function memberUpdate(c: Ctx) {
	const db = c.env.DB;
	const me = await need(c, 'staff');
	const before = await db.prepare(`SELECT ${FIELDS.join(', ')} FROM members WHERE id = ?`).bind(String(c.body.id)).first<any>();
	if (!before) throw bad('회원을 찾지 못했어요.');
	const next: Record<string, any> = {};
	for (const k of FIELDS) {
		if (c.body[k] === undefined) continue;
		let v = String(c.body[k] ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
		if (k === 'phone') v = normPhone(v);
		if (k === 'phone' && !/^01[016789]\d{7,8}$/.test(v)) throw bad('연락처를 확인해 주세요.');
		if (k === 'name' && !v) throw bad('이름을 적어 주세요.');
		if (k === 'gender' && v && v !== '남' && v !== '여') throw bad('성별을 확인해 주세요.');
		if (k === 'birth' && v && new Date(v + 'T00:00:00Z').toISOString?.().slice(0, 10) !== v) throw bad('생년월일을 확인해 주세요. (YYYY-MM-DD)');
		if (v !== (before[k] ?? '')) next[k] = v || null;
	}
	if (!Object.keys(next).length) return { ok: true };
	if (next.phone && (await db.prepare('SELECT 1 FROM members WHERE phone = ? AND id != ?').bind(next.phone, c.body.id).first())) throw bad('다른 회원이 쓰는 연락처예요.');
	const keys = Object.keys(next);
	await db.batch([
		db.prepare(`UPDATE members SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).bind(...keys.map((k) => next[k]), iso(c.now), c.body.id),
		log(c, me.id, 'member.update', String(c.body.id), { before: Object.fromEntries(keys.map((k) => [k, before[k]])), after: next }),
	]);
	return { ok: true };
}

// {id, status?: active|suspended|withdrawn, role?: member|staff|master} 마스터만. 정지·탈퇴면 세션 끊음. 기록은 그대로 둠(사용자 결정)
export async function memberStatus(c: Ctx) {
	const db = c.env.DB;
	const me = await need(c, 'master');
	const id = String(c.body.id ?? '');
	const before = await db.prepare('SELECT status, role FROM members WHERE id = ?').bind(id).first<{ status: string; role: string }>();
	if (!before) throw bad('회원을 찾지 못했어요.');
	const status = c.body.status ?? before.status, role = c.body.role ?? before.role;
	if (!['active', 'suspended', 'withdrawn'].includes(status) || !['member', 'staff', 'master'].includes(role)) throw bad('값을 확인해 주세요.');
	if (id === me.id && (status !== 'active' || role !== 'master')) throw bad('내 계정의 권한·상태는 바꿀 수 없어요. 다른 마스터에게 부탁해 주세요.');
	const stmts = [db.prepare('UPDATE members SET status = ?, role = ?, updated_at = ? WHERE id = ?').bind(status, role, iso(c.now), id), log(c, me.id, 'member.status', id, { before, after: { status, role } })];
	if (status !== 'active') stmts.push(db.prepare('UPDATE sessions SET revoked_at = ? WHERE member_id = ? AND revoked_at IS NULL').bind(iso(c.now), id));
	await db.batch(stmts);
	return { ok: true };
}

// 로그인 이력 최근 300건 (IP는 앞부분만 저장돼 있음). {memberId?}
export async function logins(c: Ctx) {
	await need(c, 'staff');
	const id = c.body.memberId ? String(c.body.memberId) : null;
	const { results } = await c.env.DB.prepare(
		`SELECT l.at, l.ok, l.reason, l.ip_masked, l.ua, m.name FROM login_logs l LEFT JOIN members m ON m.id = l.member_id
		 WHERE ?1 IS NULL OR l.member_id = ?1 ORDER BY l.at DESC LIMIT 300`,
	).bind(id).all();
	return { ok: true, logins: results };
}

export async function audit(c: Ctx) {
	await need(c, 'master');
	const { results } = await c.env.DB.prepare('SELECT a.at, a.action, a.target_id, a.detail, m.name AS actor FROM admin_logs a LEFT JOIN members m ON m.id = a.actor_id ORDER BY a.at DESC LIMIT 300').all();
	return { ok: true, logs: results };
}

// 시즌방 주주: {season} 목록 / {season, memberIds: []} 저장(그 시즌 전체를 바꿈)
export async function roomOwners(c: Ctx) {
	const db = c.env.DB;
	const me = await need(c, 'staff');
	const season = String(c.body.season ?? '');
	if (!/^\d{2}-\d{2}$/.test(season)) throw bad('시즌을 확인해 주세요.');
	if (Array.isArray(c.body.memberIds)) {
		const ids = [...new Set(c.body.memberIds.map(String))];
		await db.batch([
			db.prepare('DELETE FROM room_owners WHERE season = ?').bind(season),
			...ids.map((id) => db.prepare('INSERT INTO room_owners (season, member_id) SELECT ?, id FROM members WHERE id = ?').bind(season, id)),
			log(c, me.id, 'roomowners.set', null, { season, ids }),
		]);
	}
	const { results } = await db.prepare('SELECT member_id FROM room_owners WHERE season = ?').bind(season).all<{ member_id: string }>();
	return { ok: true, season, memberIds: results.map((r) => r.member_id) };
}

// 채팅 랭킹 올리기: 브라우저가 카톡 CSV를 집계한 결과 {from, to, total, ranks, months}. 메시지 내용은 안 받음
export async function chatUpload(c: Ctx) {
	const me = await need(c, 'staff');
	const b = c.body;
	const ranksOk = (r: unknown) => Array.isArray(r) && r.every((x) => x && typeof x.name === 'string' && Number.isInteger(x.count));
	if (!/^\d{4}-\d{2}-\d{2}$/.test(b.from) || !/^\d{4}-\d{2}-\d{2}$/.test(b.to) || !ranksOk(b.ranks) || !Array.isArray(b.months) || !b.months.every((m: any) => /^\d{4}-\d{2}$/.test(m?.month) && ranksOk(m.ranks)))
		throw bad('집계 결과를 확인해 주세요.');
	const value = JSON.stringify({ from: b.from, to: b.to, total: Number(b.total) || 0, ranks: b.ranks, months: b.months });
	await c.env.DB.batch([
		c.env.DB.prepare("INSERT INTO cache (key, value, expires_at) VALUES ('chatrank', ?1, '9999-12-31') ON CONFLICT(key) DO UPDATE SET value = ?1").bind(value),
		log(c, me.id, 'chatrank.upload', null, { from: b.from, to: b.to, total: b.total }),
	]);
	return { ok: true };
}
