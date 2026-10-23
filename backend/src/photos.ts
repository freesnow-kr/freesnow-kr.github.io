// 갤러리 사진: 회원이 올린 원본을 R2에 (사용자 요구 2026-10-23). 이번·지난 시즌만 R2, 더 오래된 시즌은 드라이브로 보관
// 올리기: POST /photos (multipart: token, orig, large, thumb, taken) — 브라우저가 1800px·720px JPG를 만들어 같이 보냄
// 보기: GET /photo/{id}/{thumb|large|orig} — R2에 있으면 바로(브라우저 1년 캐시), 드라이브로 옮겼으면 드라이브 주소로
import type { Ctx, Env } from './index.ts';
import { need, Reply } from './auth.ts';
import { iso, randomToken, seasonOf } from './lib.ts';
export { seasonOf };

const ORIG_MAX = 30 * 1024 * 1024; // 원본 한 장 30MB
const SMALL_MAX = 4 * 1024 * 1024; // 1800px·720px JPG
const PER_DAY = 300; // 회원 한 명이 하루에 올릴 수 있는 장 수
const ORIG_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const SIZES = ['thumb', 'large', 'orig'] as const;
const DRIVE_W = { thumb: 720, large: 1800, orig: 4000 };

// R2에 남기는 시즌: 이번 시즌과 지난 시즌. 이것보다 앞선 시즌은 보관 대상
const keepFrom = (now: Date) => {
	const [a] = seasonOf(now).split('-').map(Number);
	const p = (a + 99) % 100;
	return `${String(p).padStart(2, '0')}-${String((p + 1) % 100).padStart(2, '0')}`;
};

export async function upload(req: Request, env: Env, now: Date) {
	const form = await req.formData().catch(() => null);
	if (!form) throw new Reply({ ok: false, error: '잘못된 요청이에요.' });
	const ctx: Ctx = { env, req, body: { token: String(form.get('token') ?? '') }, now };
	const me = await need(ctx);
	const orig = form.get('orig'), large = form.get('large'), thumb = form.get('thumb');
	if (!(orig instanceof File) || !(large instanceof File) || !(thumb instanceof File)) throw new Reply({ ok: false, error: '사진을 확인해 주세요.' });
	if (!ORIG_TYPES.includes(orig.type) || orig.size > ORIG_MAX) return { ok: false, error: 'JPG·PNG·WEBP·HEIC 사진만, 한 장 30MB까지 올릴 수 있어요.' };
	if (large.type !== 'image/jpeg' || thumb.type !== 'image/jpeg' || large.size > SMALL_MAX || thumb.size > SMALL_MAX) return { ok: false, error: '사진을 확인해 주세요.' };
	const n = await env.DB.prepare('SELECT count(*) AS n FROM photos WHERE uploaded_by = ? AND created_at > ? AND is_active = 1').bind(me.id, iso(new Date(now.getTime() - 864e5))).first<{ n: number }>();
	if (n!.n >= PER_DAY) return { ok: false, error: '오늘은 더 올릴 수 없어요. 내일 다시 올려 주세요.' };

	const t = Number(form.get('taken'));
	const taken = t > Date.UTC(2000, 0, 1) && t < now.getTime() + 864e5 ? new Date(t) : now;
	const id = randomToken().slice(0, 16);
	// File(Blob)째로 넘김: R2는 길이를 아는 본문만 받음 (form의 stream()은 길이를 모름)
	await Promise.all([
		env.PHOTOS.put(`orig/${id}`, orig, { httpMetadata: { contentType: orig.type } }),
		env.PHOTOS.put(`large/${id}`, large, { httpMetadata: { contentType: 'image/jpeg' } }),
		env.PHOTOS.put(`thumb/${id}`, thumb, { httpMetadata: { contentType: 'image/jpeg' } }),
	]);
	const caption = String(form.get('caption') ?? '').replace(/\s+/g, ' ').trim().slice(0, 100);
	await env.DB.prepare('INSERT INTO photos (id, season, taken_at, caption, uploaded_by, content_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
		.bind(id, seasonOf(taken), iso(taken), caption, me.id, orig.type, orig.size, iso(now)).run();
	return { ok: true, id };
}

export async function serve(env: Env, id: string, size: string): Promise<Response> {
	if (!/^[\w-]{8,32}$/.test(id) || !SIZES.includes(size as any)) return new Response('Not found', { status: 404 });
	const obj = await env.PHOTOS.get(`${size}/${id}`);
	if (obj) {
		return new Response(obj.body, {
			headers: { 'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable', ETag: obj.httpEtag },
		});
	}
	const row = await env.DB.prepare("SELECT drive_id FROM photos WHERE id = ? AND storage = 'drive' AND is_active = 1").bind(id).first<{ drive_id: string }>();
	if (!row) return new Response('Not found', { status: 404 });
	return Response.redirect(`https://lh3.googleusercontent.com/d/${row.drive_id}=w${DRIVE_W[size as keyof typeof DRIVE_W]}`, 302);
}

// 갤러리 목록에 넣을 사진들 (찍은 날 최신순). 로그인했으면 내가 지울 수 있는 사진에 mine
export async function listPhotos(c: Ctx) {
	let me: { id: string; role: string } | null = null;
	if (c.body.token) me = await need(c).catch(() => null);
	const base = new URL(c.req.url).origin;
	const { results } = await c.env.DB.prepare('SELECT id, caption, season, storage, drive_id, uploaded_by FROM photos WHERE is_active = 1 ORDER BY taken_at DESC, created_at DESC').all<any>();
	return results.map((p) => ({
		id: p.id,
		caption: p.caption,
		season: p.season,
		thumb: p.storage === 'r2' ? `${base}/photo/${p.id}/thumb` : `https://lh3.googleusercontent.com/d/${p.drive_id}=w720`,
		large: p.storage === 'r2' ? `${base}/photo/${p.id}/large` : `https://lh3.googleusercontent.com/d/${p.drive_id}=w1800`,
		...(me && (p.uploaded_by === me.id || me.role !== 'member') ? { mine: true } : {}),
	}));
}

// {id} 올린 사람 또는 운영진. R2에 있으면 파일도 지움 (드라이브로 옮긴 건 목록에서만 뺌)
export async function deletePhoto(c: Ctx) {
	const me = await need(c);
	const p = await c.env.DB.prepare('SELECT id, uploaded_by FROM photos WHERE id = ? AND is_active = 1').bind(String(c.body.id ?? '')).first<{ id: string; uploaded_by: string }>();
	if (!p) return { ok: false, error: '사진을 찾지 못했어요.' };
	if (p.uploaded_by !== me.id && me.role === 'member') return { ok: false, error: '내가 올린 사진만 지울 수 있어요.' };
	await c.env.PHOTOS.delete(SIZES.map((s) => `${s}/${p.id}`));
	await c.env.DB.prepare('UPDATE photos SET is_active = 0 WHERE id = ?').bind(p.id).run(); // 기록은 소프트 삭제, R2 파일은 지움
	return { ok: true };
}

// ── 시즌 보관: R2 → 드라이브 '프리스노우 {시즌}' 폴더 (원본), 링크가 있는 모든 사용자 보기 ──
// 한 번에 BATCH장씩 (무료 플랜 하위 요청 50개 제한). 운영진 화면이 남은 게 없을 때까지 반복 호출, 매일 Cron도 한 묶음씩
const BATCH = 8;

export async function archiveStatus(c: Ctx) {
	await need(c, 'staff');
	const { results } = await c.env.DB.prepare("SELECT season, storage, count(*) AS n, sum(size) AS bytes FROM photos WHERE is_active = 1 GROUP BY season, storage ORDER BY season DESC").all();
	return { ok: true, keepFrom: keepFrom(c.now), seasons: results, ready: !!(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_REFRESH_TOKEN) };
}

export async function archiveAction(c: Ctx) {
	await need(c, 'staff');
	const season = String(c.body.season ?? '');
	if (!/^\d{2}-\d{2}$/.test(season) || season >= keepFrom(c.now)) return { ok: false, error: `${keepFrom(c.now)} 시즌부터는 Cloudflare에 남겨 둬요.` };
	return { ok: true, ...(await archive(c.env, season)) };
}

// 보관할 시즌 중 가장 오래된 것부터 한 묶음 (Cron)
export async function archiveDue(env: Env, now: Date) {
	if (!env.GOOGLE_REFRESH_TOKEN) return;
	const row = await env.DB.prepare("SELECT season FROM photos WHERE storage = 'r2' AND is_active = 1 AND season < ? ORDER BY season LIMIT 1").bind(keepFrom(now)).first<{ season: string }>();
	if (row) await archive(env, row.season);
}

async function archive(env: Env, season: string) {
	if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REFRESH_TOKEN) throw new Reply({ ok: false, error: '구글 드라이브 연결이 아직 안 됐어요. (backend/scripts/google-auth.mjs)' });
	const token = await accessToken(env);
	const folder = await seasonFolder(env, token, season);
	const { results } = await env.DB.prepare("SELECT id, content_type, taken_at FROM photos WHERE season = ? AND storage = 'r2' AND is_active = 1 ORDER BY taken_at LIMIT ?").bind(season, BATCH).all<any>();
	let moved = 0;
	for (const p of results) {
		const obj = await env.PHOTOS.get(`orig/${p.id}`);
		if (!obj) continue;
		const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' }[p.content_type as string] ?? 'jpg';
		// 이어 올리기(resumable): 메타데이터로 주소를 받고 그 주소에 원본을 그대로 흘려보냄 (Worker 메모리·CPU 적게)
		const init = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Upload-Content-Type': p.content_type, 'X-Upload-Content-Length': String(obj.size) },
			body: JSON.stringify({ name: `${p.taken_at.slice(0, 10)}_${p.id}.${ext}`, parents: [folder] }),
		});
		const at = init.headers.get('Location');
		if (!init.ok || !at) throw new Error('drive init ' + init.status);
		const put = await fetch(at, { method: 'PUT', headers: { 'Content-Length': String(obj.size), 'Content-Type': p.content_type }, body: obj.body });
		if (!put.ok) throw new Error('drive upload ' + put.status);
		const { id: driveId } = (await put.json()) as { id: string };
		// 드라이브 저장을 먼저 기록하고 R2를 지움 → 중간에 끊겨도 사진을 잃지 않음
		await env.DB.prepare("UPDATE photos SET storage = 'drive', drive_id = ? WHERE id = ?").bind(driveId, p.id).run();
		await env.PHOTOS.delete(SIZES.map((s) => `${s}/${p.id}`));
		moved++;
	}
	const left = await env.DB.prepare("SELECT count(*) AS n FROM photos WHERE season = ? AND storage = 'r2' AND is_active = 1").bind(season).first<{ n: number }>();
	return { season, moved, remaining: left!.n };
}

async function accessToken(env: Env) {
	const res = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID!, client_secret: env.GOOGLE_CLIENT_SECRET!, refresh_token: env.GOOGLE_REFRESH_TOKEN!, grant_type: 'refresh_token' }),
	});
	if (!res.ok) throw new Reply({ ok: false, error: '구글 드라이브 연결이 끊겼어요. 다시 연결해 주세요. (backend/scripts/google-auth.mjs)' });
	return ((await res.json()) as { access_token: string }).access_token;
}

// 시즌 폴더: 처음이면 만들고 '링크가 있는 모든 사용자 보기'로 (안의 사진도 같이 보임). id는 D1 cache에 기억
async function seasonFolder(env: Env, token: string, season: string) {
	const key = `drivefolder:${season}`;
	const hit = await env.DB.prepare('SELECT value FROM cache WHERE key = ?').bind(key).first<{ value: string }>();
	if (hit) return hit.value;
	const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
	const made = await fetch('https://www.googleapis.com/drive/v3/files', { method: 'POST', headers: auth, body: JSON.stringify({ name: `프리스노우 ${season}`, mimeType: 'application/vnd.google-apps.folder' }) });
	if (!made.ok) throw new Error('drive folder ' + made.status);
	const { id } = (await made.json()) as { id: string };
	await fetch(`https://www.googleapis.com/drive/v3/files/${id}/permissions`, { method: 'POST', headers: auth, body: JSON.stringify({ role: 'reader', type: 'anyone' }) });
	await env.DB.prepare("INSERT INTO cache (key, value, expires_at) VALUES (?, ?, '9999-12-31')").bind(key, id).run();
	return id;
}
