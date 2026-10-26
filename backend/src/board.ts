// 게시판 (사용자 요구 2026-10-23, 소모임 게시판처럼): 말머리 공지/모임후기/가입인사/자유 + 사진, 댓글, 좋아요
// 보기: 공지는 누구나, 나머지는 회원만. 쓰기: 공지는 운영진만, 나머지는 회원 누구나. 고정은 운영진만
// 고치기는 쓴 사람만, 지우기는 쓴 사람, 운영진 (소프트 삭제). 사진은 R2 board/{글}/{사진}.jpg
import type { Ctx, Env } from './index.ts';
import { need, Reply, type Me } from './auth.ts';
import { hmac, iso, randomToken } from './lib.ts';

const CATS = ['notice', 'review', 'greeting', 'free'] as const;
const PAGE = 30;
const PHOTO_MAX = 4 * 1024 * 1024; // 브라우저가 1600px JPG로 줄여 보냄
const PHOTOS_PER_POST = 10;
// 스팸 막기 (사용자 요구 2026-10-23): 한 사람이 1시간에 글 10개, 댓글 30개까지, 같은 제목 글 10분, 같은 댓글 5분 안에 다시 못 씀
const POSTS_PER_HOUR = 10;
const COMMENTS_PER_HOUR = 30;
const HOUR = 3600e3;
// 사진 주소 서명: 글을 볼 수 있는 사람에게만 서명된 주소를 줌 (<img>는 로그인 헤더를 못 보내서). 기한은 오늘 끝 + 7일 → 하루 동안은 같은 주소라 캐시됨
const SIGN_DAYS = 7;
const photoSig = (env: Env, key: string, exp: number) => hmac(env.LOGIN_KEY_SECRET, `photo|${key}|${exp}`).then((h) => h.slice(0, 32));
async function signedUrl(c: Ctx, key: string) {
	const exp = Math.floor(c.now.getTime() / 864e5 + 1 + SIGN_DAYS) * 864e5;
	return `${new URL(c.req.url).origin}/${key}?e=${exp}&s=${await photoSig(c.env, key, exp)}`;
}
const bad = (error: string) => new Reply({ ok: false, error });
const isStaff = (me: Me | null) => !!me && (me.role === 'staff' || me.role === 'admin');
// 로그인 안 했거나 토큰이 만료됐으면 null (공지는 볼 수 있게)
const viewer = (c: Ctx) => (c.body.token || c.req.headers.get('Authorization') ? need(c).catch(() => null) : Promise.resolve(null));
const text = (v: unknown, max: number) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max); // 본문 줄바꿈은 살림
const newId = () => randomToken().slice(0, 12);

async function activePost(c: Ctx, id: unknown) {
	const p = await c.env.DB.prepare('SELECT * FROM board_posts WHERE id = ? AND is_active = 1').bind(String(id ?? '')).first<any>();
	if (!p) throw bad('글을 찾지 못했어요. (지워졌을 수도 있어요)');
	return p;
}

// {category?, page?, pinned?} → {posts: [{id, category, title, author, pinned, created_at, comments, likes, photos}], more, member, staff}
export async function list(c: Ctx) {
	const me = await viewer(c);
	const cat = String(c.body.category ?? '');
	if (cat && !CATS.includes(cat as any)) throw bad('말머리를 확인해 주세요.');
	const page = Math.max(1, Math.floor(Number(c.body.page)) || 1);
	const where = ['p.is_active = 1'];
	const args: unknown[] = [];
	if (!me) where.push("p.category = 'notice'"); // 비회원은 공지만
	if (cat) where.push('p.category = ?'), args.push(cat);
	if (c.body.pinned === true) where.push('p.pinned = 1'); // 메인 NOTICE 줄
	const { results } = await c.env.DB.prepare(
		`SELECT p.id, p.category, p.title, p.pinned, p.created_at, m.name AS author,
		        (SELECT count(*) FROM board_comments WHERE post_id = p.id AND is_active = 1) AS comments,
		        (SELECT count(*) FROM board_likes WHERE post_id = p.id AND is_active = 1) AS likes,
		        (SELECT count(*) FROM board_photos WHERE post_id = p.id AND is_active = 1) AS photos
		 FROM board_posts p JOIN members m ON m.id = p.author_id
		 WHERE ${where.join(' AND ')} ORDER BY p.pinned DESC, p.created_at DESC LIMIT ? OFFSET ?`,
	).bind(...args, PAGE + 1, (page - 1) * PAGE).all();
	return { ok: true, posts: results.slice(0, PAGE), more: results.length > PAGE, member: !!me, staff: isStaff(me) };
}

// {id} → 글 + 사진 + 댓글 + 좋아요 (공지 아닌 글은 회원만)
export async function get(c: Ctx) {
	const db = c.env.DB;
	const me = await viewer(c);
	const p = await activePost(c, c.body.id);
	if (p.category !== 'notice' && !me) return { ok: false, needLogin: true, error: '회원만 볼 수 있는 글이에요. 로그인해 주세요.' };
	const [author, photos, comments, likes] = await db.batch([
		db.prepare('SELECT name FROM members WHERE id = ?').bind(p.author_id),
		db.prepare('SELECT id FROM board_photos WHERE post_id = ? AND is_active = 1 ORDER BY sort, created_at').bind(p.id),
		db.prepare('SELECT c.id, c.body, c.created_at, c.author_id, m.name AS author FROM board_comments c JOIN members m ON m.id = c.author_id WHERE c.post_id = ? AND c.is_active = 1 ORDER BY c.created_at').bind(p.id),
		db.prepare('SELECT count(*) AS n, sum(member_id = ?) AS mine FROM board_likes WHERE post_id = ? AND is_active = 1').bind(me?.id ?? '', p.id),
	]);
	const mine = me?.id === p.author_id;
	return {
		ok: true,
		member: !!me,
		staff: isStaff(me),
		post: {
			id: p.id, category: p.category, title: p.title, body: p.body, pinned: !!p.pinned, created_at: p.created_at, updated_at: p.updated_at,
			author: (author.results[0] as any)?.name ?? '', mine, canDelete: mine || isStaff(me),
			likes: (likes.results[0] as any).n, liked: !!(likes.results[0] as any).mine,
			photos: await Promise.all(photos.results.map(async (x: any) => ({ id: x.id, url: await signedUrl(c, `board/${p.id}/${x.id}.jpg`) }))),
			comments: comments.results.map((x: any) => ({ id: x.id, body: x.body, created_at: x.created_at, author: x.author, mine: x.author_id === me?.id, canDelete: x.author_id === me?.id || isStaff(me) })),
		},
	};
}

// {id?, category, title, body, pinned?} 새 글 또는 내 글 고치기 → {id}
export async function write(c: Ctx) {
	const db = c.env.DB;
	const me = await need(c);
	const category = String(c.body.category ?? '');
	if (!CATS.includes(category as any)) throw bad('말머리를 골라 주세요.');
	if (category === 'notice' && !isStaff(me)) throw bad('공지는 운영진만 쓸 수 있어요.');
	const title = text(c.body.title, 100).replace(/\s+/g, ' ');
	const body = text(c.body.body, 10000);
	if (!title) throw bad('제목을 적어 주세요.');
	const pinned = isStaff(me) && c.body.pinned === true ? 1 : 0;
	if (c.body.id) {
		const p = await activePost(c, c.body.id);
		if (p.author_id !== me.id) throw bad('내가 쓴 글만 고칠 수 있어요.');
		await db.prepare('UPDATE board_posts SET category = ?, title = ?, body = ?, pinned = ? WHERE id = ?').bind(category, title, body, pinned, p.id).run();
		return { ok: true, id: p.id };
	}
	const recent = await db.prepare(
		`SELECT count(*) AS n, sum(title = ? AND created_at > ?) AS same FROM board_posts WHERE author_id = ? AND created_at > ?`,
	).bind(title, iso(new Date(c.now.getTime() - 10 * 60e3)), me.id, iso(new Date(c.now.getTime() - HOUR))).first<{ n: number; same: number }>();
	if (recent!.same) throw bad('같은 제목의 글을 방금 올렸어요.');
	if (recent!.n >= POSTS_PER_HOUR) throw bad('글을 너무 많이 올렸어요. 잠시 뒤 다시 써 주세요.');
	const id = newId();
	await db.prepare('INSERT INTO board_posts (id, category, title, body, author_id, pinned) VALUES (?, ?, ?, ?, ?, ?)').bind(id, category, title, body, me.id, pinned).run();
	return { ok: true, id };
}

// {id} 쓴 사람, 운영진. 남의 글을 운영진이 지우면 운영 기록
export async function remove(c: Ctx) {
	const me = await need(c);
	const p = await activePost(c, c.body.id);
	if (p.author_id !== me.id && !isStaff(me)) throw bad('내가 쓴 글만 지울 수 있어요.');
	const stmts = [c.env.DB.prepare('UPDATE board_posts SET is_active = 0 WHERE id = ?').bind(p.id)];
	if (p.author_id !== me.id) stmts.push(c.env.DB.prepare('INSERT INTO admin_logs (at, actor_id, action, target_id, detail) VALUES (?, ?, ?, ?, ?)').bind(new Date().toISOString(), me.id, 'board.delete', p.id, JSON.stringify({ title: p.title, author: p.author_id })));
	await c.env.DB.batch(stmts);
	return { ok: true };
}

// {postId, body} 댓글 → 글 전체 다시
export async function comment(c: Ctx) {
	const me = await need(c);
	const p = await activePost(c, c.body.postId);
	const body = text(c.body.body, 1000);
	if (!body) throw bad('댓글을 적어 주세요.');
	const recent = await c.env.DB.prepare(
		`SELECT count(*) AS n, sum(post_id = ? AND body = ? AND created_at > ?) AS same FROM board_comments WHERE author_id = ? AND created_at > ?`,
	).bind(p.id, body, iso(new Date(c.now.getTime() - 5 * 60e3)), me.id, iso(new Date(c.now.getTime() - HOUR))).first<{ n: number; same: number }>();
	if (recent!.same) throw bad('같은 댓글을 방금 달았어요.');
	if (recent!.n >= COMMENTS_PER_HOUR) throw bad('댓글을 너무 많이 달았어요. 잠시 뒤 다시 달아 주세요.');
	await c.env.DB.prepare('INSERT INTO board_comments (id, post_id, author_id, body) VALUES (?, ?, ?, ?)').bind(newId(), p.id, me.id, body).run();
	return get({ ...c, body: { ...c.body, id: p.id } });
}

// {id} 내 댓글, 운영진
export async function commentRemove(c: Ctx) {
	const me = await need(c);
	const x = await c.env.DB.prepare('SELECT id, post_id, author_id FROM board_comments WHERE id = ? AND is_active = 1').bind(String(c.body.id ?? '')).first<any>();
	if (!x) throw bad('댓글을 찾지 못했어요.');
	if (x.author_id !== me.id && !isStaff(me)) throw bad('내 댓글만 지울 수 있어요.');
	await c.env.DB.prepare('UPDATE board_comments SET is_active = 0 WHERE id = ?').bind(x.id).run();
	return get({ ...c, body: { ...c.body, id: x.post_id } });
}

// {postId} 좋아요 켜고 끄기 → {liked, likes}
export async function like(c: Ctx) {
	const db = c.env.DB;
	const me = await need(c);
	const p = await activePost(c, c.body.postId);
	await db.prepare('INSERT INTO board_likes (post_id, member_id) VALUES (?, ?) ON CONFLICT(post_id, member_id) DO UPDATE SET is_active = 1 - is_active').bind(p.id, me.id).run();
	const r = await db.prepare('SELECT count(*) AS n, sum(member_id = ?) AS mine FROM board_likes WHERE post_id = ? AND is_active = 1').bind(me.id, p.id).first<any>();
	return { ok: true, likes: r.n, liked: !!r.mine };
}

// POST /board-photos (multipart: token, postId, photo×여러 장) — 글쓴이만, 글당 10장
export async function uploadPhotos(req: Request, env: Env, now: Date) {
	const form = await req.formData().catch(() => null);
	if (!form) throw bad('잘못된 요청이에요.');
	const c: Ctx = { env, req, body: { token: String(form.get('token') ?? '') }, now };
	const me = await need(c);
	const p = await activePost(c, form.get('postId'));
	if (p.author_id !== me.id) throw bad('내 글에만 사진을 붙일 수 있어요.');
	const files = form.getAll('photo').filter((f): f is File => f instanceof File);
	if (!files.length) throw bad('사진을 골라 주세요.');
	if (files.some((f) => f.type !== 'image/jpeg' || f.size > PHOTO_MAX)) throw bad('사진을 확인해 주세요.');
	const have = await env.DB.prepare('SELECT count(*) AS n, coalesce(max(sort), -1) AS last FROM board_photos WHERE post_id = ? AND is_active = 1').bind(p.id).first<{ n: number; last: number }>();
	if (have!.n + files.length > PHOTOS_PER_POST) throw bad(`사진은 글 하나에 ${PHOTOS_PER_POST}장까지예요.`);
	const ids = files.map(() => newId());
	await Promise.all(files.map((f, i) => env.PHOTOS.put(`board/${p.id}/${ids[i]}.jpg`, f, { httpMetadata: { contentType: 'image/jpeg' } })));
	await env.DB.batch(ids.map((id, i) => env.DB.prepare('INSERT INTO board_photos (id, post_id, author_id, sort) VALUES (?, ?, ?, ?)').bind(id, p.id, me.id, have!.last + 1 + i)));
	return { ok: true, count: ids.length };
}

// {id} 사진 빼기 — 글쓴이, 운영진. 기록은 소프트 삭제, 파일은 지움
export async function photoRemove(c: Ctx) {
	const me = await need(c);
	const x = await c.env.DB.prepare('SELECT id, post_id, author_id FROM board_photos WHERE id = ? AND is_active = 1').bind(String(c.body.id ?? '')).first<any>();
	if (!x) throw bad('사진을 찾지 못했어요.');
	if (x.author_id !== me.id && !isStaff(me)) throw bad('내 사진만 뺄 수 있어요.');
	await c.env.DB.prepare('UPDATE board_photos SET is_active = 0 WHERE id = ?').bind(x.id).run();
	await c.env.PHOTOS.delete(`board/${x.post_id}/${x.id}.jpg`);
	return { ok: true };
}

// GET /board/{글}/{사진}.jpg?e=기한&s=서명 — board.get이 글을 볼 수 있는 사람에게만 서명된 주소를 줌 (회원 글 사진은 회원만)
export async function servePhoto(env: Env, key: string, q: URLSearchParams): Promise<Response> {
	if (!/^board\/[\w-]+\/[\w-]+\.jpg$/.test(key)) return new Response('Not found', { status: 404 });
	const exp = Number(q.get('e'));
	if (!(exp > Date.now()) || q.get('s') !== (await photoSig(env, key, exp))) return new Response('Forbidden', { status: 403 });
	const obj = await env.PHOTOS.get(key);
	if (!obj) return new Response('Not found', { status: 404 });
	return new Response(obj.body, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': `private, max-age=${Math.floor((exp - Date.now()) / 1000)}`, ETag: obj.httpEtag } });
}
