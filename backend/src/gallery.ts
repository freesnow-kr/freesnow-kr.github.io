// 갤러리 (공개): 회원이 올린 사진(photos 테이블, R2·보관한 드라이브) 먼저 + 예전 드라이브 폴더(GALLERY_FOLDER_ID, '링크가 있는 모든 사용자' 공유)의 사진 [{id, caption}] 최신순, D1 cache 5분
// GOOGLE_API_KEY가 있으면 Drive API(만든 날짜 최신순), 없으면 공개 폴더 보기 페이지에서 읽음(이름순 — 비공식)
// 채팅 랭킹: 운영진이 /admin에서 카톡 CSV를 고르면 브라우저가 집계해서 올린 결과를 저장해 두고 회원에게 줌 (Worker가 큰 CSV를 세지 않게)
import type { Ctx } from './index.ts';
import { need } from './auth.ts';
import { iso, later } from './lib.ts';
import { listPhotos } from './photos.ts';

const CACHE_MS = 5 * 60 * 1000;

export async function gallery(c: Ctx) {
	const uploaded = await listPhotos(c);
	const old = await driveFolder(c);
	if (!old && !uploaded.length) return { ok: false, error: '사진을 불러오지 못했어요.' };
	return { ok: true, photos: [...uploaded, ...(old ?? [])] };
}

// 예전 드라이브 폴더 사진 (5분 캐시, 실패하면 지난 목록)
async function driveFolder(c: Ctx): Promise<{ id: string; caption: string }[] | null> {
	const db = c.env.DB;
	const folder = c.env.GALLERY_FOLDER_ID;
	if (!folder) return [];
	const hit = await db.prepare("SELECT value FROM cache WHERE key = 'gallery' AND expires_at > ?").bind(iso(c.now)).first<{ value: string }>();
	if (hit) return JSON.parse(hit.value);

	let photos: { id: string; caption: string }[] | null = null;
	try {
		photos = c.env.GOOGLE_API_KEY ? await viaApi(folder, c.env.GOOGLE_API_KEY) : await viaFolderPage(folder);
	} catch (err) {
		console.error('gallery', err);
	}
	if (!photos) {
		const old = await db.prepare("SELECT value FROM cache WHERE key = 'gallery'").first<{ value: string }>();
		return old ? JSON.parse(old.value) : null;
	}
	await db.prepare('INSERT INTO cache (key, value, expires_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value = ?2, expires_at = ?3')
		.bind('gallery', JSON.stringify(photos), iso(later(c.now, CACHE_MS))).run();
	return photos;
}

async function viaApi(folder: string, key: string) {
	const q = encodeURIComponent(`'${folder}' in parents and mimeType contains 'image/' and trashed = false`);
	const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1000&fields=files(id,name)&key=${encodeURIComponent(key)}`);
	if (!res.ok) throw new Error('drive api ' + res.status);
	const { files } = (await res.json()) as { files: { id: string; name: string }[] };
	return files.map((f) => ({ id: f.id, caption: caption(f.name) }));
}

async function viaFolderPage(folder: string) {
	const res = await fetch(`https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folder)}`);
	if (!res.ok) throw new Error('folder page ' + res.status);
	const html = await res.text();
	const out = [];
	for (const part of html.split('class="flip-entry"').slice(1)) {
		const id = /id="entry-([\w-]+)"/.exec(part)?.[1];
		const name = /flip-entry-title">([^<]*)</.exec(part)?.[1] ?? '';
		if (id && /\.(jpe?g|png|gif|webp|heic)$/i.test(name)) out.push({ id, caption: caption(name) });
	}
	return out;
}

// 파일 이름 → 설명. 휴대폰 기본 이름(IMG_1234 등)이면 설명 없음
export function caption(name: string) {
	const n = String(name).replace(/\.[^.]+$/, '').replace(/_+/g, ' ').trim();
	return /^(IMG|DSC|PXL|MVIMG|KakaoTalk|Screenshot|스크린샷|\d{8})/i.test(n) ? '' : n;
}

// 회원만: 마지막으로 올린 집계 {from, to, total, ranks, months}
export async function chatRank(c: Ctx) {
	await need(c);
	const row = await c.env.DB.prepare("SELECT value FROM cache WHERE key = 'chatrank'").first<{ value: string }>();
	return row ? { ok: true, ...JSON.parse(row.value) } : { ok: false, error: '랭킹을 준비 중이에요.' };
}
