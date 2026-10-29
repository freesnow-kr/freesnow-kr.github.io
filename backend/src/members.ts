// 회원가입 신청, 프로필 사진 (Apps Script signup, avatar를 옮김). 신청은 signup_requests에 쌓이고 운영진이 /admin에서 승인
import type { Ctx, Env } from './index.ts';
import { need, weakReason } from './auth.ts';
import { iso, later, normPhone, PBKDF2_ITER, phoneKey, POLICY_VERSION, pbkdf2, randomB64, randomToken, safeEqual, sealPhone } from './lib.ts';
import { normArea } from './admin.ts';
import { signupRequested } from './notify.ts';

const SIGNUP_PER_HOUR = 30; // 전체 신청 시간당 상한 (스팸 방지)
const PHOTO_MAX = 400_000; // base64 글자 수 (브라우저가 256px JPG로 줄여서 보냄 ≈ 20~60KB)

// 응답은 {ok} / {ok:false, error}뿐. 숨은 칸(website)이 채워지면 저장 없이 ok
// 받는 것(사용자 결정 2026-10-27): 휴대폰 번호(= 아이디, 010 빼고, 비상 연락처로도), 비밀번호, 이름, 성별, 출생연도, 거주지(시도, 시군구) 모두 필수, 동의도 필수 하나뿐
// 휴대폰 번호는 로그인용 HMAC(login_key) + 비상 연락처용 암호문(phone_enc). 비밀번호는 해시 → 승인하면 그대로 로그인 비밀번호 (admin.signupDecide)
export async function signup(c: Ctx) {
	const db = c.env.DB;
	const b = c.body;
	if (b.website) return { ok: true };
	if (b.agree !== true) return { ok: false, error: '필수 항목 수집, 이용에 동의해 주세요.' };
	const text = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
	const name = text(b.name, 20), sido = text(b.sido, 20), area = text(b.sigungu, 20);
	const gender = b.gender === '남' || b.gender === '여' ? b.gender : '';
	const phone = normPhone(b.phone), pw = String(b.password ?? '');
	const year = Number(String(b.year ?? '').replace(/\D/g, '')); // 필수 (사용자 요구 2026-10-26)
	if (!phone) return { ok: false, error: '휴대폰 번호를 확인해 주세요. (010 빼고 8자리)' };
	if (!name || !gender) return { ok: false, error: '이름과 성별을 적어 주세요.' };
	if (!sido || !area) return { ok: false, error: '거주지(시도, 시군구)를 골라 주세요.' };
	const weak = weakReason(pw, phone, c.env.RESET_PASSWORD);
	if (weak) return { ok: false, error: weak };
	if (!(year >= 1930 && year <= c.now.getFullYear())) return { ok: false, error: '출생연도를 골라 주세요.' };
	// 19세 이상만 (사용자 요구 2026-10-26, 동호회 규칙): 연 나이 기준 — 올해 19세가 되는 해(올해-19년생)부터. 화면 고르기 칸도 같은 범위라 따로 체크받지 않음
	if (year > c.now.getFullYear() - 19) return { ok: false, error: `${c.now.getFullYear() - 19}년생부터 가입할 수 있어요.` };

	const key = await phoneKey(c.env.PHONE_KEY, phone);
	const n = await db.prepare(
		`SELECT (SELECT count(*) FROM signup_requests WHERE created_at > ?1) AS recent,
		        (SELECT count(*) FROM members WHERE login_key = ?2) + (SELECT count(*) FROM signup_requests WHERE login_key = ?2 AND status = 'pending' AND is_active = 1) AS dup`,
	).bind(iso(later(c.now, -3600e3)), key).first<{ recent: number; dup: number }>();
	if (n!.recent >= SIGNUP_PER_HOUR) return { ok: false, error: '신청이 많아요. 잠시 뒤 다시 시도해 주세요.' };
	const DUP = { ok: false, error: '이미 가입했거나 신청한 번호예요. 오픈채팅으로 문의해 주세요.' };
	if (n!.dup) return DUP;
	const salt = randomB64(16);
	// 동의 기록: 언제 무엇에 동의했는지 + 그때 처리방침 시행일 (승인하면 회원 정보로 옮김). 같은 번호 동시 신청은 UNIQUE 부분 인덱스로 하나만
	const r = await db.prepare(
		`INSERT INTO signup_requests (login_key, name, gender, birth_year, sido, area, phone_enc, pw_hash, pw_salt, pw_iter, agreed_at, agreed_opt_at, policy, created_at)
		 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?11) ON CONFLICT DO NOTHING`,
	).bind(key, name, gender, year, sido, area, await sealPhone(c.env.PHONE_KEY, phone), // 휴대폰 번호는 비상 연락처로도 (암호문)
		await pbkdf2(pw, salt, PBKDF2_ITER), salt, PBKDF2_ITER, iso(c.now), null, POLICY_VERSION).run(); // 선택 동의는 없앰 (agreed_opt_at 안 씀)
	if (!r.meta.changes) return DUP;
	// 운영진 메일, 앱 알림: 이름/출생연도 두 자리/거주지 — 적은 것만 (번호는 안 넣음)
	const who = [name, String(year).slice(2), area ? normArea(area) : ''].filter(Boolean).join('/');
	await signupRequested(c.env, { name, gender, region: [sido, area].filter(Boolean).join(' '), who, at: c.now });
	return { ok: true };
}

// {data: 256px JPG data URL} 저장 / {remove: true} 삭제 → {ok, photo}
// 사진은 R2 profile/{회원ID}/{무작위}.jpg (바꿀 때마다 새 이름 → 브라우저 캐시가 예전 사진을 안 보여 줌), DB엔 'r2:키'
// 예전 값(드라이브 파일 ID, data URL)도 그대로 보임 — 응답엔 photoUrl()로 바꾼 주소
export async function avatar(c: Ctx) {
	const db = c.env.DB;
	const me = await need(c);
	const old = await db.prepare('SELECT photo FROM profiles WHERE member_id = ? AND is_active = 1').bind(me.id).first<{ photo: string }>();
	const dropOld = async () => {
		if (old?.photo.startsWith('r2:')) await c.env.PHOTOS.delete(old.photo.slice(3));
	};
	if (c.body.remove) {
		await db.prepare('UPDATE profiles SET is_active = 0 WHERE member_id = ?').bind(me.id).run(); // 기록은 소프트 삭제, 파일은 지움
		await dropOld();
		return { ok: true, photo: '' };
	}
	const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(c.body.data ?? ''));
	if (!m || m[1].length > PHOTO_MAX) return { ok: false, error: '사진을 확인해 주세요. (JPG, 너무 큰 사진은 안 돼요)' };
	const key = `profile/${me.id}/${randomToken().slice(0, 12)}.jpg`;
	await c.env.PHOTOS.put(key, Uint8Array.from(atob(m[1]), (ch) => ch.charCodeAt(0)), { httpMetadata: { contentType: 'image/jpeg' } });
	await db.prepare('INSERT INTO profiles (member_id, photo, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(member_id) DO UPDATE SET photo = ?2, updated_at = ?3, is_active = 1')
		.bind(me.id, `r2:${key}`, iso(c.now)).run();
	await dropOld();
	return { ok: true, photo: photoUrl(c, `r2:${key}`) };
}

// 회원 탈퇴 {password} (사용자 요구 2026-10-26, 구글 플레이 정책: 앱, 웹에서 직접 계정 삭제)
// 개인정보처리방침대로 개인정보는 지체 없이 지움 — 운영진이 '탈퇴'로 바꾸는 것(기록 그대로)과 다름:
//   회원 줄은 다른 기록이 가리켜서 남기고 이름 '탈퇴 회원', 아이디 등은 비움, 개인 기록(SHRED LOG, 스노우라이브, 프로필 사진, 알림 기기, 비밀번호, 세션)은 진짜 삭제
//   게시글, 댓글, 갤러리 사진, 출격, 시즌방(정산) 기록은 남지만 '탈퇴 회원'으로만 보임
export async function withdraw(c: Ctx) {
	const db = c.env.DB;
	const me = await need(c);
	if (me.role === 'admin') return { ok: false, error: '관리자는 다른 관리자에게 권한을 넘긴 뒤 탈퇴할 수 있어요.' };
	const cred = await db.prepare('SELECT hash, salt, iter FROM member_credentials WHERE member_id = ? AND is_active = 1').bind(me.id).first<{ hash: string | null; salt: string; iter: number }>();
	if (!cred?.hash || !safeEqual(await pbkdf2(String(c.body.password ?? ''), cred.salt, cred.iter), cred.hash)) return { ok: false, error: '비밀번호가 맞지 않아요.' };
	const photo = await db.prepare('SELECT photo FROM profiles WHERE member_id = ?').bind(me.id).first<{ photo: string }>();
	const del = (table: string) => db.prepare(`DELETE FROM ${table} WHERE member_id = ?`).bind(me.id);
	await db.batch([
		db.prepare("UPDATE members SET status = 'withdrawn', name = '탈퇴 회원', gender = NULL, birth_year = NULL, region = '', area = '', login_key = NULL, phone_enc = NULL, email = NULL, role = 'member', updated_at = ?2 WHERE id = ?1")
			.bind(me.id, iso(c.now)), // 번호도 비움 → 같은 번호로 다시 가입 가능
		...['sessions', 'member_credentials', 'profiles', 'push_subscriptions', 'ride_logs', 'expense_logs', 'season_passes', 'snowlive_records', 'snowlive_links', 'gear_care'].map(del),
		db.prepare('INSERT INTO admin_logs (at, actor_id, action, target_id, detail) VALUES (?, ?, ?, ?, ?)').bind(iso(c.now), me.id, 'member.withdraw', me.id, '{}'),
	]);
	if (photo?.photo.startsWith('r2:')) await c.env.PHOTOS.delete(photo.photo.slice(3));
	return { ok: true };
}

// DB의 사진 값 → 화면에 줄 값: 'r2:키'는 이 서버 주소로, 드라이브 ID, data URL은 그대로
export const photoUrl = (c: Ctx, v: string | null | undefined) => (v?.startsWith('r2:') ? `${new URL(c.req.url).origin}/${v.slice(3)}` : (v ?? ''));

// GET /profile/{회원ID}/{파일} — 프로필 사진 (바꿀 때마다 새 주소라 1년 캐시)
export async function serveProfile(env: Env, key: string): Promise<Response> {
	if (!/^profile\/[\w-]+\/[\w-]+\.jpg$/.test(key)) return new Response('Not found', { status: 404 });
	const obj = await env.PHOTOS.get(key);
	if (!obj) return new Response('Not found', { status: 404 });
	return new Response(obj.body, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable', ETag: obj.httpEtag } });
}
