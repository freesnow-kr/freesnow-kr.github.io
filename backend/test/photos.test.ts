// 갤러리 사진: 회원이 올림(R2), 보기, 지우기 권한, 지난 시즌은 드라이브로 보관 (구글 API는 가짜 fetch)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.ts';
import { seasonOf } from '../src/photos.ts';
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
		env.GALLERY_FOLDER_ID = ''; // 예전 드라이브 폴더는 안 읽음 (진짜 네트워크 안 씀)
	},
);
const jpg = (n: number) => new File([new Uint8Array(n).fill(7)], 'x.jpg', { type: 'image/jpeg' });
const send = async (token: string, taken: Date, orig: File = jpg(5000)) => {
	const f = new FormData();
	f.set('token', token);
	f.set('orig', orig);
	f.set('large', jpg(500));
	f.set('thumb', jpg(100));
	f.set('taken', String(taken.getTime()));
	f.set('caption', '  하이원   정모 ');
	const res = await worker.fetch(new Request('https://api.test/photos', { method: 'POST', headers: { Origin: 'https://freesnow-kr.github.io' }, body: f }), env);
	return (await res.json()) as any;
};
const get = (path: string) => worker.fetch(new Request('https://api.test' + path), env);
const now = new Date();
const cur = seasonOf(now);
const [a] = cur.split('-').map(Number);
const old = `${String((a + 98) % 100).padStart(2, '0')}-${String((a + 99) % 100).padStart(2, '0')}`; // 두 시즌 전
let idA = '', idOld = '';

test('시즌: 7/1 ~ 6/30 (한국 시간)', () => {
	assert.equal(seasonOf(new Date('2026-06-30T14:59:00Z')), '25-26'); // 6/30 23:59 KST
	assert.equal(seasonOf(new Date('2026-06-30T15:00:00Z')), '26-27'); // 7/1 00:00 KST
});

test('올리기: 회원만, 원본 그대로 R2, 찍은 날로 시즌, 이상한 파일 거부', async () => {
	const f = new FormData();
	f.set('orig', jpg(10));
	assert.equal(((await (await worker.fetch(new Request('https://api.test/photos', { method: 'POST', body: f }), env)).json()) as any).expired, true);
	assert.equal((await send(A, now, new File(['x'], 'x.pdf', { type: 'application/pdf' }))).ok, false);
	const r = await send(A, now);
	assert.equal(r.ok, true);
	idA = r.id;
	const res = await get(`/photo/${idA}/orig`);
	assert.equal(res.status, 200);
	assert.equal((await res.arrayBuffer()).byteLength, 5000, '원본 크기 그대로');
	assert.match(res.headers.get('Cache-Control')!, /immutable/);
	assert.equal((await get(`/photo/${idA}/thumb`)).status, 200);
	assert.equal((await get('/photo/nope1234/thumb')).status, 404);
	const row = await env.DB.prepare('SELECT season, caption FROM photos WHERE id = ?').bind(idA).first();
	assert.deepEqual([row.season, row.caption], [cur, '하이원 정모']);
	idOld = (await send(B, new Date(now.getTime() - 2 * 365 * 864e5))).id;
});

test('목록: 찍은 날 최신순, 내 사진, 운영진만 mine, 지우기는 올린 사람, 운영진', async () => {
	const list = (await post({ action: 'gallery', token: A })).photos.filter((p: any) => p.thumb);
	assert.deepEqual(list.map((p: any) => p.id), [idA, idOld]);
	assert.equal(list[0].mine, true);
	assert.equal(list[1].mine, undefined);
	assert.match(list[0].thumb, /\/photo\/.+\/thumb$/);
	assert.equal((await post({ action: 'gallery', token: S })).photos.filter((p: any) => p.mine).length, 2);
	assert.match((await post({ action: 'photoDelete', id: idA }, B)).error, /내가 올린/);
});

test('보관: 이번, 지난 시즌은 안 됨, 지난 시즌 원본을 드라이브 시즌 폴더로 → R2에서 지움, 주소는 드라이브로', async () => {
	assert.match((await post({ action: 'admin.photoArchive', season: cur }, S)).error, /남겨/);
	assert.match((await post({ action: 'admin.photoArchive', season: old }, S)).error, /연결/);
	Object.assign(env, { GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'cs', GOOGLE_REFRESH_TOKEN: 'rt' });
	const calls: string[] = [];
	let uploaded = 0;
	const real = globalThis.fetch;
	globalThis.fetch = (async (u: any, i?: any) => {
		const url = String(u);
		if (!url.includes('google')) return real(u, i);
		calls.push(`${i?.method ?? 'GET'} ${url.replace(/\?.*/, '')}`);
		if (url.includes('oauth2')) return Response.json({ access_token: 'at' });
		if (url.endsWith('/drive/v3/files')) return Response.json({ id: 'folder1' });
		if (url.includes('/permissions')) return Response.json({});
		if (url.includes('uploadType=resumable')) return new Response(null, { headers: { Location: 'https://upload.google.test/session1' } });
		if (url.includes('session1')) return (uploaded = (await new Response(i.body).arrayBuffer()).byteLength), Response.json({ id: 'drive-file-1' });
		return new Response('?', { status: 500 });
	}) as typeof fetch;
	const r = await post({ action: 'admin.photoArchive', season: old }, S);
	globalThis.fetch = real;
	assert.deepEqual([r.ok, r.moved, r.remaining], [true, 1, 0]);
	assert.equal(uploaded, 5000, '원본을 그대로 드라이브로');
	assert.ok(calls.some((x) => x.includes('/permissions')), '폴더는 링크 공유');
	assert.equal(await env.PHOTOS.get(`gallery/orig/${idOld}`), null, 'R2에서 지움');
	const res = await get(`/photo/${idOld}/large`);
	assert.equal(res.status, 302);
	assert.equal(res.headers.get('Location'), 'https://lh3.googleusercontent.com/d/drive-file-1=w1800');
	const st = await post({ action: 'admin.photoStatus' }, S);
	assert.ok(st.seasons.some((x: any) => x.season === old && x.storage === 'drive'));
});

test('지우기: 올린 사람은 지우면 R2에서도 사라짐', async () => {
	assert.equal((await post({ action: 'photoDelete', id: idA }, A)).ok, true);
	assert.equal((await get(`/photo/${idA}/thumb`)).status, 404);
});
