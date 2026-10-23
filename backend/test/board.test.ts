// 게시판: 공지는 누구나·운영진만 씀, 나머지는 회원만, 고치기는 쓴 사람, 지우기는 쓴 사람·운영진, 사진·댓글·좋아요
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.ts';
import { env, post, sessionFor, useDb } from './setup.ts';

let A: string, B: string, S: string;
useDb(
	[
		['m-a', '01011110000', '회원A', '1990-01-01'],
		['m-b', '01022220000', '회원B', '1991-01-01'],
		['m-s', '01033330000', '운영진', '1992-01-01', 'staff'],
	],
	async () => {
		A = await sessionFor('m-a');
		B = await sessionFor('m-b');
		S = await sessionFor('m-s');
	},
);
let notice = '', free = '';

test('공지는 운영진만 쓰고 고정 가능, 회원 글은 누구나, 고정은 운영진만', async () => {
	assert.match((await post({ action: 'board.write', category: 'notice', title: '공지', body: 'x' }, A)).error, /운영진만/);
	notice = (await post({ action: 'board.write', category: 'notice', title: '  시즌 오픈  안내 ', body: '첫 줄\n둘째 줄', pinned: true }, S)).id;
	free = (await post({ action: 'board.write', category: 'free', title: '안녕', body: '반가워요', pinned: true }, A)).id;
	const p = await env.DB.prepare('SELECT title, body, pinned FROM board_posts WHERE id = ?').bind(notice).first();
	assert.deepEqual([p.title, p.body, p.pinned], ['시즌 오픈 안내', '첫 줄\n둘째 줄', 1]);
	assert.equal((await env.DB.prepare('SELECT pinned FROM board_posts WHERE id = ?').bind(free).first()).pinned, 0, '회원은 고정 못 함');
	assert.match((await post({ action: 'board.write', category: 'free', title: '  ', body: '' }, A)).error, /제목/);
});

test('비회원은 공지만 보고, 회원은 다 봄, 고정이 위로', async () => {
	const pub = await post({ action: 'board.list' });
	assert.deepEqual(pub.posts.map((p: any) => p.id), [notice]);
	assert.equal((await post({ action: 'board.get', id: free })).needLogin, true);
	assert.equal((await post({ action: 'board.get', id: notice })).post.body, '첫 줄\n둘째 줄');
	const all = await post({ action: 'board.list' }, B);
	assert.deepEqual(all.posts.map((p: any) => p.id), [notice, free]);
	assert.deepEqual((await post({ action: 'board.list', category: 'free' }, B)).posts.map((p: any) => p.id), [free]);
	assert.deepEqual((await post({ action: 'board.list', pinned: true })).posts.map((p: any) => p.title), ['시즌 오픈 안내'], '메인 NOTICE 줄');
	assert.equal(JSON.stringify(all).includes('0101'), false, '연락처 안 보냄');
});

test('고치기는 쓴 사람만, 지우기는 쓴 사람·운영진 (소프트 삭제, 운영 기록)', async () => {
	assert.match((await post({ action: 'board.write', id: free, category: 'free', title: '바꿈', body: '' }, B)).error, /내가 쓴/);
	assert.equal((await post({ action: 'board.write', id: free, category: 'review', title: '후기로 바꿈', body: '좋았어요' }, A)).ok, true);
	const x = await post({ action: 'board.write', category: 'free', title: '지울 글', body: '' }, B);
	assert.match((await post({ action: 'board.delete', id: x.id }, A)).error, /내가 쓴/);
	assert.equal((await post({ action: 'board.delete', id: x.id }, S)).ok, true);
	assert.equal((await env.DB.prepare('SELECT is_active FROM board_posts WHERE id = ?').bind(x.id).first()).is_active, 0);
	assert.equal((await env.DB.prepare("SELECT count(*) AS n FROM admin_logs WHERE action = 'board.delete'").first()).n, 1);
	assert.equal((await post({ action: 'board.get', id: x.id }, A)).ok, false);
});

test('댓글·좋아요: 회원만, 좋아요는 다시 누르면 취소, 댓글 지우기는 쓴 사람·운영진', async () => {
	assert.equal((await post({ action: 'board.like', postId: free })).expired, true);
	assert.deepEqual(Object.values(await post({ action: 'board.like', postId: free }, B)).slice(2), [true, 1, true]);
	await post({ action: 'board.like', postId: free }, A);
	let r = await post({ action: 'board.like', postId: free }, B);
	assert.deepEqual([r.likes, r.liked], [1, false]);
	r = await post({ action: 'board.comment', postId: free, body: '좋네요' }, B);
	const cid = r.post.comments[0].id;
	assert.deepEqual([r.post.comments[0].author, r.post.comments[0].mine], ['회원B', true]);
	assert.match((await post({ action: 'board.commentDelete', id: cid }, A)).error, /내 댓글/);
	r = await post({ action: 'board.commentDelete', id: cid }, S);
	assert.equal(r.post.comments.length, 0);
	const l = (await post({ action: 'board.list' }, A)).posts.find((p: any) => p.id === free);
	assert.deepEqual([l.likes, l.comments], [1, 0]);
});

test('사진: 글쓴이만 올림, JPG만, R2 board/ 폴더, 빼면 파일도 지움', async () => {
	const send = async (token: string, files: File[]) => {
		const f = new FormData();
		f.set('token', token);
		f.set('postId', free);
		for (const x of files) f.append('photo', x);
		return (await (await worker.fetch(new Request('https://api.test/board-photos', { method: 'POST', body: f }), env)).json()) as any;
	};
	const jpg = (s: string) => new File([s], 'a.jpg', { type: 'image/jpeg' });
	assert.match((await send(B, [jpg('x')])).error, /내 글에만/);
	assert.equal((await send(A, [new File(['x'], 'a.png', { type: 'image/png' })])).ok, false);
	assert.equal((await send(A, [jpg('one'), jpg('two')])).count, 2);
	const g = (await post({ action: 'board.get', id: free }, B)).post;
	assert.equal(g.photos.length, 2);
	const key = g.photos[0].url.replace('https://api.test/', '');
	assert.match(key, /^board\/[\w-]+\/[\w-]+\.jpg$/);
	const res = await worker.fetch(new Request(g.photos[0].url), env);
	assert.deepEqual([res.status, await res.text()], [200, 'one']);
	assert.equal((await post({ action: 'board.photoDelete', id: g.photos[0].id }, A)).ok, true);
	assert.equal(await env.PHOTOS.get(key), null);
	assert.equal((await post({ action: 'board.get', id: free }, A)).post.photos.length, 1);
	assert.equal((await post({ action: 'board.list' }, A)).posts.find((p: any) => p.id === free).photos, 1);
});
