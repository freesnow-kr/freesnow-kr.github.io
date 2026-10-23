// 회원가입 신청·프로필 사진 (Apps Script signup·avatar를 옮김). 신청은 signup_requests에 쌓이고 운영진이 /admin에서 승인
import type { Ctx, Env } from './index.ts';
import { need } from './auth.ts';
import { iso, later, normPhone, randomToken } from './lib.ts';

const SIGNUP_PER_HOUR = 30; // 전체 신청 시간당 상한 (스팸 방지)
const PHOTO_MAX = 400_000; // base64 글자 수 (브라우저가 256px JPG로 줄여서 보냄 ≈ 20~60KB)

// 응답은 {ok} / {ok:false, error}뿐. 이미 회원·이미 신청한 연락처는 거부, 숨은 칸(website)이 채워지면 저장 없이 ok
export async function signup(c: Ctx) {
	const db = c.env.DB;
	const b = c.body;
	if (b.website) return { ok: true };
	if (b.agree !== true) return { ok: false, error: '개인정보 수집·이용에 동의해 주세요.' };
	const text = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
	const name = text(b.name, 20), sido = text(b.sido, 20), area = text(b.sigungu, 20);
	const gender = b.gender === '남' || b.gender === '여' ? b.gender : '';
	const y = Number(String(b.year ?? '').replace(/\D/g, '')), m = Number(b.month), d = Number(b.day);
	const birth = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
	const phone = normPhone(b.phone);
	if (!name || !gender || !sido || !area) return { ok: false, error: '빈 칸을 모두 채워 주세요.' };
	if (!(y >= 1930 && y <= c.now.getFullYear()) || new Date(birth + 'T00:00:00Z').toISOString().slice(0, 10) !== birth) return { ok: false, error: '생년월일을 확인해 주세요.' };
	if (!/^01[016789]\d{7,8}$/.test(phone)) return { ok: false, error: '연락처를 확인해 주세요.' };

	const n = await db.prepare(
		`SELECT (SELECT count(*) FROM signup_requests WHERE created_at > ?1) AS recent,
		        (SELECT count(*) FROM members WHERE phone = ?2) + (SELECT count(*) FROM signup_requests WHERE phone = ?2 AND status = 'pending' AND is_active = 1) AS dup`,
	).bind(iso(later(c.now, -3600e3)), phone).first<{ recent: number; dup: number }>();
	if (n!.recent >= SIGNUP_PER_HOUR) return { ok: false, error: '신청이 많아요. 잠시 뒤 다시 시도해 주세요.' };
	if (n!.dup) return { ok: false, error: '이미 신청했거나 가입된 연락처예요. 오픈채팅으로 문의해 주세요.' };
	// 동시에 같은 번호로 두 번 와도 대기 중 신청은 하나 (UNIQUE 부분 인덱스)
	await db.prepare("INSERT INTO signup_requests (created_at, name, gender, birth, sido, area, phone) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING")
		.bind(iso(c.now), name, gender, birth, sido, area, phone).run();
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

// DB의 사진 값 → 화면에 줄 값: 'r2:키'는 이 서버 주소로, 드라이브 ID·data URL은 그대로
export const photoUrl = (c: Ctx, v: string | null | undefined) => (v?.startsWith('r2:') ? `${new URL(c.req.url).origin}/${v.slice(3)}` : (v ?? ''));

// GET /profile/{회원ID}/{파일} — 프로필 사진 (바꿀 때마다 새 주소라 1년 캐시)
export async function serveProfile(env: Env, key: string): Promise<Response> {
	if (!/^profile\/[\w-]+\/[\w-]+\.jpg$/.test(key)) return new Response('Not found', { status: 404 });
	const obj = await env.PHOTOS.get(key);
	if (!obj) return new Response('Not found', { status: 404 });
	return new Response(obj.body, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable', ETag: obj.httpEtag } });
}
