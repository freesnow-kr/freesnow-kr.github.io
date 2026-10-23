// 운영진 화면(/admin) API. 권한은 전부 여기서 확인 (화면에서 메뉴를 숨기는 건 편의일 뿐)
// staff(운영진): 가입 승인·거절, 회원 목록·정보 수정·상태(정지·탈퇴), 로그인 이력, 시즌방 주주, 채팅 랭킹 올리기
// staff는 비밀번호 초기화(auth.ts adminReset)도 — 관리자 계정은 관리자만
// admin(관리자): + 정지·탈퇴·권한 변경(마스터 지정 포함), 운영 기록. master(마스터)는 명예 — 권한은 회원과 같음
// 바꾸는 일은 전부 admin_logs (누가·언제·무엇을·전후 값)
import type { Ctx } from './index.ts';
import { need, Reply } from './auth.ts';
import { iso, normPhone, randomToken } from './lib.ts';
import { regionOf } from './region.ts';

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
		        (SELECT count(*) FROM signup_requests WHERE status = 'pending' AND is_active = 1) AS pending,
		        (SELECT count(*) FROM login_logs WHERE ok = 0 AND at > ?1) AS fails,
		        (SELECT count(*) FROM lesson_requests WHERE is_active = 1 AND date >= ?2) AS lessons,
		        (SELECT count(*) FROM lesson_requests WHERE is_active = 1 AND date >= ?2 AND teacher_id IS NULL) AS lessonsTodo`,
	).bind(iso(new Date(c.now.getTime() - 864e5)), new Date(c.now.getTime() + 9 * 3600e3).toISOString().slice(0, 10)).first(); // 강습: 오늘(한국)부터 앞으로
	return { ok: true, role: me.role, ...r };
}

export async function signups(c: Ctx) {
	await need(c, 'staff');
	const { results } = await c.env.DB.prepare("SELECT id, created_at, name, gender, birth, sido, area, phone FROM signup_requests WHERE status = 'pending' AND is_active = 1 ORDER BY created_at").all();
	return { ok: true, signups: results };
}

// {id, approve: true|false} — 승인하면 회원으로 (지역 = 신청한 시도를 짧게 — 경기는 북부·남부, 거주지는 시·군 뗀 값)
export async function signupDecide(c: Ctx) {
	const db = c.env.DB;
	const me = await need(c, 'staff');
	const s = await db.prepare("SELECT * FROM signup_requests WHERE id = ? AND status = 'pending' AND is_active = 1").bind(Number(c.body.id)).first<any>();
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
				`INSERT INTO members (id, phone, name, gender, birth, region, area, joined_at, approved_at, created_at, updated_at, sort_no)
				 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9, ?9, (SELECT coalesce(max(sort_no), 0) + 1 FROM members))`,
			).bind(memberId, s.phone, s.name, s.gender, s.birth, regionOf(s.sido, normArea(s.area)), normArea(s.area), s.created_at, now),
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
		`SELECT m.id, m.name, m.phone, m.gender, m.birth, m.region, m.area, m.private_contact, m.role, m.status, m.joined_at,
		        (SELECT max(at) FROM login_logs l WHERE l.member_id = m.id AND l.ok = 1) AS last_login,
		        c.member_id IS NOT NULL AND c.hash IS NULL AS reset_pending, c.changed_at AS password_changed
		 FROM members m LEFT JOIN member_credentials c ON c.member_id = m.id AND c.is_active = 1
		 ORDER BY m.sort_no, m.name`,
	).all();
	// {export: true} 명부 내려받기 — 개인정보라 누가 언제 받았는지 운영 기록
	if (c.body.export === true) await log(c, me.id, 'members.export', null, { count: results.length }).run();
	return { ok: true, role: me.role, members: results };
}

const FIELDS = ['name', 'phone', 'gender', 'birth', 'region', 'area', 'private_contact'] as const;
// {id, name?, phone?, gender?, birth?, region?, area?, private_contact?} 운영진
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

// {id, status?, role?} — 상태(활동·정지·탈퇴)는 운영진 이상(관리자 계정은 관리자만, 사용자 요구 2026-10-23), 권한 변경은 관리자만
// 정지·탈퇴면 세션 끊음. 기록은 그대로 둠(사용자 결정)
export async function memberStatus(c: Ctx) {
	const db = c.env.DB;
	const me = await need(c, 'staff');
	const id = String(c.body.id ?? '');
	const before = await db.prepare('SELECT status, role FROM members WHERE id = ?').bind(id).first<{ status: string; role: string }>();
	if (!before) throw bad('회원을 찾지 못했어요.');
	const status = c.body.status ?? before.status, role = c.body.role ?? before.role;
	if (me.role !== 'admin' && (role !== before.role || before.role === 'admin')) throw bad('권한 변경과 관리자 계정은 관리자만 바꿀 수 있어요.');
	if (!['active', 'suspended', 'withdrawn'].includes(status) || !['member', 'master', 'staff', 'admin'].includes(role)) throw bad('값을 확인해 주세요.');
	if (id === me.id && (status !== 'active' || role !== 'admin')) throw bad('내 계정의 권한·상태는 바꿀 수 없어요. 다른 관리자에게 부탁해 주세요.');
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
	await need(c, 'admin');
	const { results } = await c.env.DB.prepare('SELECT a.at, a.action, a.target_id, a.detail, m.name AS actor FROM admin_logs a LEFT JOIN members m ON m.id = a.actor_id ORDER BY a.at DESC LIMIT 300').all();
	return { ok: true, logs: results };
}

// 강습 요청 (운영진이 회원 중 한 명과 연결): 2주 전부터 앞으로의 요청, 날짜순. 연락처는 운영진 회원 화면과 같은 범위
// {memberId, date, teacherId?} 이면 연결(teacherId 비우면 연결 해제) 후 목록. riders = 그날 출격 체크한 회원 ID (연결 후보 먼저 보이게)
export async function lessons(c: Ctx) {
	const db = c.env.DB;
	const me = await need(c, 'staff');
	if (c.body.memberId) {
		const memberId = String(c.body.memberId), date = String(c.body.date ?? ''), teacherId = c.body.teacherId ? String(c.body.teacherId) : null;
		if (teacherId === memberId) throw bad('요청한 회원 본인과는 연결할 수 없어요.');
		if (teacherId && !(await db.prepare("SELECT 1 FROM members WHERE id = ? AND status = 'active'").bind(teacherId).first())) throw bad('활동 중인 회원만 연결할 수 있어요.');
		const r = await db.prepare('UPDATE lesson_requests SET teacher_id = ? WHERE member_id = ? AND date = ? AND is_active = 1').bind(teacherId, memberId, date).run();
		if (!r.meta.changes) throw bad('요청을 찾지 못했어요. 회원이 취소했을 수 있어요.');
		await log(c, me.id, 'lesson.match', memberId, { date, teacherId }).run();
	}
	const from = new Date(c.now.getTime() + 9 * 3600e3 - 14 * 86400e3).toISOString().slice(0, 10); // 한국 날짜 기준 14일 전
	const { results } = await db.prepare(
		`SELECT l.date, l.member_id, l.teacher_id, l.created_at, m.name, m.phone, m.region, m.area, t.name AS teacher
		 FROM lesson_requests l JOIN members m ON m.id = l.member_id LEFT JOIN members t ON t.id = l.teacher_id
		 WHERE l.is_active = 1 AND l.date >= ? ORDER BY l.date, l.created_at`,
	).bind(from).all<any>();
	const rides = (
		await db.prepare("SELECT date, member_id FROM ride_checks WHERE date >= ? AND status = '출격' AND is_active = 1").bind(from).all<{ date: string; member_id: string }>()
	).results;
	return { ok: true, from, lessons: results.map((l) => ({ ...l, riders: rides.filter((r) => r.date === l.date && r.member_id !== l.member_id).map((r) => r.member_id) })) };
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
			// 그 시즌 주주를 모두 끄고(소프트 삭제) 고른 사람만 다시 켬
			db.prepare('UPDATE room_owners SET is_active = 0 WHERE season = ? AND is_active = 1').bind(season),
			...ids.map((id) => db.prepare('INSERT INTO room_owners (season, member_id) SELECT ?, id FROM members WHERE id = ? ON CONFLICT(season, member_id) DO UPDATE SET is_active = 1').bind(season, id)),
			log(c, me.id, 'roomowners.set', null, { season, ids }),
		]);
	}
	const { results } = await db.prepare('SELECT member_id FROM room_owners WHERE season = ? AND is_active = 1').bind(season).all<{ member_id: string }>();
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
