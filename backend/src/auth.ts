// 로그인·세션·비밀번호·권한. 설계: docs/migration/02-design.md §3~4
import type { Ctx } from './index.ts';
import { PBKDF2_ITER, ROOM_PRICES, seasonOf, seasonRange, formatPhone, hmac, iso, later, maskIp, normPhone, pbkdf2, randomB64, randomToken, safeEqual, sha256 } from './lib.ts';

const HOUR = 60 * 60 * 1000;
// 세션은 30일, 쓰는 동안 하루 넘게 지났으면 다시 30일로 늘림 (사용자 요구 2026-10-23: 최대한 안 풀리게)
const SESSION_MS = 30 * 24 * HOUR;
const RESET_MS = 72 * HOUR; // 초기화 후 공용 초기화 비밀번호가 통하는 시간
const MAX_FAILS = 5; // 같은 아이디, 1시간
const MAX_IP_FAILS = 30; // 같은 IP, 1시간
const DUMMY_SALT = 'AAAAAAAAAAAAAAAAAAAAAA==';

const FAIL = { ok: false, error: '아이디 또는 비밀번호가 맞지 않아요.' }; // 무엇이 틀렸는지·회원인지 구분 안 함
const LOCKED = { ok: false, error: '시도 횟수를 넘었어요. 1시간 뒤에 다시 시도해 주세요.' };
const EXPIRED = { ok: false, expired: true, error: '다시 로그인해 주세요.' };
const MUST_CHANGE = { ok: false, mustChange: true, error: '새 비밀번호를 먼저 정해 주세요.' };
const FORBIDDEN = { ok: false, error: '권한이 없어요.' };

// 응답을 바로 돌려줄 때 던짐 (index.ts가 받아서 그대로 응답)
export class Reply {
	body: object;
	constructor(body: object) {
		this.body = body;
	}
}

const RANK = { member: 0, staff: 1, master: 2 } as const;
export type Role = keyof typeof RANK;
export type Me = { token_hash: string; must_change: number; expires_at: string; id: string; name: string; phone: string; grade: string; area: string; role: Role; birth: string | null };

// 세션 확인 + 회원 상태·권한은 매번 DB에서 (정지·권한 변경이 바로 반영). 토큰은 Authorization 헤더, 전환 기간엔 body.token도
export async function need(c: Ctx, role: Role = 'member', allowMustChange = false): Promise<Me> {
	const token = /^Bearer (\S+)$/.exec(c.req.headers.get('Authorization') || '')?.[1] || String(c.body.token || '');
	if (!token) throw new Reply(EXPIRED);
	const me = await c.env.DB.prepare(
		`SELECT s.token_hash, s.must_change, s.expires_at, m.id, m.name, m.phone, m.grade, m.area, m.role, m.birth
		 FROM sessions s JOIN members m ON m.id = s.member_id
		 WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.is_active = 1 AND s.expires_at > ? AND m.status = 'active' AND m.is_active = 1`,
	).bind(await sha256(token), iso(c.now)).first<Me>();
	if (!me) throw new Reply(EXPIRED);
	if (Date.parse(me.expires_at) < c.now.getTime() + SESSION_MS - 24 * HOUR) {
		await c.env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').bind(iso(later(c.now, SESSION_MS)), me.token_hash).run();
	}
	if (me.must_change && !allowMustChange) throw new Reply(MUST_CHANGE);
	if (RANK[me.role] < RANK[role]) throw new Reply(FORBIDDEN);
	return me;
}

// {phone, password} → {ok, token, name, exp, mustChange}. 세션 30일. 예전 화면이 보내는 birth도 비밀번호로 받음
export async function login(c: Ctx) {
	const db = c.env.DB;
	const phone = normPhone(c.body.phone);
	const pw = String(c.body.password ?? c.body.birth ?? '');
	if (phone.length < 10 || !pw || pw.length > 128) return FAIL;

	const key = await hmac(c.env.LOGIN_KEY_SECRET, phone);
	const ip = c.req.headers.get('CF-Connecting-IP') || '';
	const ipHash = ip ? await hmac(c.env.LOGIN_KEY_SECRET, 'ip:' + ip) : '';
	const ua = (c.req.headers.get('User-Agent') || '').slice(0, 200);
	const log = (ok: boolean, reason: string, memberId: string | null = null) =>
		db.prepare('INSERT INTO login_logs (at, member_id, login_key, ok, reason, ip_masked, ip_hash, ua) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
			.bind(iso(c.now), memberId, key, ok ? 1 : 0, reason, maskIp(ip), ipHash, ua);

	// 잠금: 마지막 성공 이후 1시간 안의 실패 수 ('잠김'으로 막힌 시도는 안 셈 → 1시간 지나면 풀림)
	const since = iso(later(c.now, -HOUR));
	const n = await db.prepare(
		`SELECT
		   (SELECT count(*) FROM login_logs WHERE login_key = ?1 AND ok = 0 AND reason != 'locked' AND at > ?2
		      AND at > coalesce((SELECT max(at) FROM login_logs WHERE login_key = ?1 AND ok = 1), '')) AS fails,
		   (SELECT count(*) FROM login_logs WHERE ?3 != '' AND ip_hash = ?3 AND ok = 0 AND reason != 'locked' AND at > ?2) AS ipFails`,
	).bind(key, since, ipHash).first<{ fails: number; ipFails: number }>();
	if (n!.fails >= MAX_FAILS || n!.ipFails >= MAX_IP_FAILS) {
		await log(false, 'locked').run();
		return LOCKED;
	}

	const m = await db.prepare(
		`SELECT m.id, m.name, m.birth, m.status, c.member_id AS cred, c.hash, c.salt, c.iter, c.reset_until
		 FROM members m LEFT JOIN member_credentials c ON c.member_id = m.id AND c.is_active = 1 WHERE m.phone = ? AND m.is_active = 1`,
	).bind(phone).first<{ id: string; name: string; birth: string | null; status: string; cred: string | null; hash: string | null; salt: string | null; iter: number | null; reset_until: string | null }>();

	// 어느 경우든 PBKDF2를 한 번 돌림 → 응답 시간으로 회원 여부를 알 수 없게
	let how: 'password' | 'reset' | 'birth' | null = null;
	if (m?.hash) {
		if (safeEqual(await pbkdf2(pw, m.salt!, m.iter!), m.hash)) how = 'password';
	} else {
		await pbkdf2(pw, DUMMY_SALT, PBKDF2_ITER);
		const birth = (m?.birth || '').replace(/\D/g, '');
		if (m?.cred) {
			// 초기화됨: 기한 안에만 공용 초기화 비밀번호
			if (m.reset_until && m.reset_until > iso(c.now) && c.env.RESET_PASSWORD && safeEqual(pw, c.env.RESET_PASSWORD)) how = 'reset';
		} else if (m && birth.length === 8 && safeEqual(pw.replace(/\D/g, ''), birth)) {
			how = 'birth'; // 첫 전환: 생년월일로 한 번만 → 바로 새 비밀번호
		}
	}
	if (!m || !how) {
		await log(false, m ? 'wrong' : 'unknown', m?.id ?? null).run();
		return FAIL;
	}
	if (m.status !== 'active') {
		await log(false, m.status, m.id).run();
		return FAIL;
	}

	const token = randomToken();
	const mustChange = how !== 'password';
	const exp = later(c.now, SESSION_MS);
	await db.batch([
		db.prepare('INSERT INTO sessions (token_hash, member_id, must_change, created_at, expires_at, ua) VALUES (?, ?, ?, ?, ?, ?)')
			.bind(await sha256(token), m.id, mustChange ? 1 : 0, iso(c.now), iso(exp), ua),
		log(true, how, m.id),
	]);
	return { ok: true, token, name: m.name, exp: exp.getTime(), mustChange };
}

export async function logout(c: Ctx) {
	const token = /^Bearer (\S+)$/.exec(c.req.headers.get('Authorization') || '')?.[1] || String(c.body.token || '');
	if (token) await c.env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL').bind(iso(c.now), await sha256(token)).run();
	return { ok: true };
}

// {current?, next} — 새 비밀번호 정하기 전 세션(첫 전환·초기화)이면 current 없이. 바꾸면 다른 기기 세션은 전부 끊음
export async function password(c: Ctx) {
	const db = c.env.DB;
	const me = await need(c, 'member', true);
	const next = String(c.body.next ?? '');
	if (!me.must_change) {
		const cred = await db.prepare('SELECT hash, salt, iter FROM member_credentials WHERE member_id = ? AND is_active = 1').bind(me.id).first<{ hash: string | null; salt: string; iter: number }>();
		if (!cred?.hash || !safeEqual(await pbkdf2(String(c.body.current ?? ''), cred.salt, cred.iter), cred.hash)) return { ok: false, error: '지금 비밀번호가 맞지 않아요.' };
	}
	const bad = weakReason(next, me, c.env.RESET_PASSWORD);
	if (bad) return { ok: false, error: bad };

	const salt = randomB64(16);
	const hash = await pbkdf2(next, salt, PBKDF2_ITER);
	await db.batch([
		db.prepare(
			`INSERT INTO member_credentials (member_id, hash, salt, iter, reset_until, changed_at) VALUES (?1, ?2, ?3, ?4, NULL, ?5)
			 ON CONFLICT(member_id) DO UPDATE SET hash = ?2, salt = ?3, iter = ?4, reset_until = NULL, changed_at = ?5, is_active = 1`,
		).bind(me.id, hash, salt, PBKDF2_ITER, iso(c.now)),
		db.prepare('UPDATE sessions SET revoked_at = ? WHERE member_id = ? AND token_hash != ? AND revoked_at IS NULL').bind(iso(c.now), me.id, me.token_hash),
		db.prepare('UPDATE sessions SET must_change = 0 WHERE token_hash = ?').bind(me.token_hash),
	]);
	return { ok: true };
}

function weakReason(pw: string, me: Me, resetPassword: string): string {
	if (pw.length < 8) return '비밀번호는 8자 이상으로 정해 주세요.';
	if (pw.length > 128) return '비밀번호가 너무 길어요.';
	const digits = pw.replace(/\D/g, '');
	const birth = (me.birth || '').replace(/\D/g, '');
	if ((birth && digits.includes(birth)) || digits.includes(me.phone.slice(3))) return '생년월일이나 전화번호가 들어간 비밀번호는 쓸 수 없어요.';
	if (resetPassword && pw === resetPassword) return '초기화 비밀번호는 새 비밀번호로 쓸 수 없어요.';
	return '';
}

// 화면이 하루에 한 번 부름: 세션 기한은 need()가 늘리므로 토큰은 그대로 (Apps Script renew는 새 토큰을 줌)
export async function renew(c: Ctx) {
	await need(c, 'member', true);
	return { ok: true };
}

// 본인 정보만. 생년월일·성별·비공개연락처는 절대 안 보냄 (Apps Script me와 같은 모양 + role)
export async function me(c: Ctx) {
	const me = await need(c);
	const season = seasonOf(c.now);
	const [from, to] = seasonRange(season);
	// 마이페이지 '이번 시즌': 출격 체크·시즌방·정산·SHRED LOG·올린 사진 (내 것만)
	const s = await c.env.DB.prepare(
		`SELECT (SELECT photo FROM profiles WHERE member_id = ?1 AND is_active = 1) AS photo,
		        (SELECT count(*) FROM ride_checks WHERE member_id = ?1 AND is_active = 1 AND status = '출격' AND date BETWEEN ?2 AND ?3) AS rides,
		        (SELECT count(*) FROM room_stays WHERE member_id = ?1 AND is_active = 1 AND kind = '숙박' AND date BETWEEN ?2 AND ?3) AS stays,
		        (SELECT count(*) FROM room_stays WHERE member_id = ?1 AND is_active = 1 AND kind = '휴식' AND date BETWEEN ?2 AND ?3) AS rests,
		        (SELECT count(*) FROM room_owners WHERE member_id = ?1 AND is_active = 1 AND season = ?4) AS owner,
		        (SELECT count(DISTINCT date) FROM ride_logs WHERE member_id = ?1 AND is_active = 1 AND date BETWEEN ?2 AND ?3) AS visits,
		        (SELECT coalesce(sum(amount), 0) FROM expense_logs WHERE member_id = ?1 AND is_active = 1 AND date BETWEEN ?2 AND ?3) AS spent,
		        (SELECT count(*) FROM photos WHERE uploaded_by = ?1 AND is_active = 1 AND season = ?4) AS photos`,
	).bind(me.id, from, to, season).first<Record<string, number> & { photo: string | null }>();
	const pay = s!.owner ? 0 : s!.stays * ROOM_PRICES.숙박 + s!.rests * ROOM_PRICES.휴식;
	return {
		ok: true,
		me: { name: me.name, grade: me.grade || '회원', area: me.area, phone: formatPhone(me.phone), photo: s!.photo ?? '', role: me.role },
		season: { season, rides: s!.rides, stays: s!.stays, rests: s!.rests, owner: !!s!.owner, pay, visits: s!.visits, spent: s!.spent, photos: s!.photos },
	};
}

// 마스터만: {memberId} → 비밀번호 지우고, 그 회원 세션 전부 끊고, 72시간 동안 공용 초기화 비밀번호로 로그인 가능
export async function adminReset(c: Ctx) {
	const db = c.env.DB;
	const actor = await need(c, 'master');
	const id = String(c.body.memberId ?? '');
	const target = await db.prepare('SELECT id FROM members WHERE id = ? AND is_active = 1').bind(id).first();
	if (!target) return { ok: false, error: '회원을 찾지 못했어요.' };
	if (!c.env.RESET_PASSWORD) return { ok: false, error: '초기화 비밀번호가 설정되지 않았어요.' };
	const until = iso(later(c.now, RESET_MS));
	await db.batch([
		db.prepare(
			`INSERT INTO member_credentials (member_id, hash, salt, iter, reset_until, changed_at) VALUES (?1, NULL, NULL, NULL, ?2, ?3)
			 ON CONFLICT(member_id) DO UPDATE SET hash = NULL, salt = NULL, iter = NULL, reset_until = ?2, changed_at = ?3, is_active = 1`,
		).bind(id, until, iso(c.now)),
		db.prepare('UPDATE sessions SET revoked_at = ? WHERE member_id = ? AND revoked_at IS NULL').bind(iso(c.now), id),
		db.prepare('INSERT INTO admin_logs (at, actor_id, action, target_id, detail) VALUES (?, ?, ?, ?, ?)').bind(iso(c.now), actor.id, 'password.reset', id, JSON.stringify({ resetUntil: until })),
	]);
	return { ok: true, resetUntil: until };
}
