// 회원가입 신청·프로필 사진 (Apps Script signup·avatar를 옮김). 신청은 signup_requests에 쌓이고 운영진이 /admin에서 승인
import type { Ctx } from './index.ts';
import { need } from './auth.ts';
import { iso, later, normPhone } from './lib.ts';

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
		        (SELECT count(*) FROM members WHERE phone = ?2) + (SELECT count(*) FROM signup_requests WHERE phone = ?2 AND status = 'pending') AS dup`,
	).bind(iso(later(c.now, -3600e3)), phone).first<{ recent: number; dup: number }>();
	if (n!.recent >= SIGNUP_PER_HOUR) return { ok: false, error: '신청이 많아요. 잠시 뒤 다시 시도해 주세요.' };
	if (n!.dup) return { ok: false, error: '이미 신청했거나 가입된 연락처예요. 오픈채팅으로 문의해 주세요.' };
	// 동시에 같은 번호로 두 번 와도 대기 중 신청은 하나 (UNIQUE 부분 인덱스)
	await db.prepare("INSERT INTO signup_requests (created_at, name, gender, birth, sido, area, phone) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING")
		.bind(iso(c.now), name, gender, birth, sido, area, phone).run();
	return { ok: true };
}

// {data: 256px JPG data URL} 저장 / {remove: true} 삭제 → {ok, photo}. 사진은 D1에 data URL로 (예전 드라이브 사진 ID도 그대로 보임)
export async function avatar(c: Ctx) {
	const db = c.env.DB;
	const me = await need(c);
	if (c.body.remove) {
		await db.prepare('DELETE FROM profiles WHERE member_id = ?').bind(me.id).run();
		return { ok: true, photo: '' };
	}
	const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(c.body.data ?? ''));
	if (!m || m[1].length > PHOTO_MAX) return { ok: false, error: '사진을 확인해 주세요. (JPG, 너무 큰 사진은 안 돼요)' };
	const photo = String(c.body.data);
	await db.prepare('INSERT INTO profiles (member_id, photo, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(member_id) DO UPDATE SET photo = ?2, updated_at = ?3')
		.bind(me.id, photo, iso(c.now)).run();
	return { ok: true, photo };
}
