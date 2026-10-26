// 소모임 정모 — Apps Script somoim과 같은 응답 {ok, url, meetups: [{title, date, time, start, place, fee, count, cap}]}
// 공개 모임 페이지(secret SOMOIM_URL)를 1시간에 한 번만 읽고(D1 cache), 읽을 때마다 meetups 테이블에 이력 저장. 참석자 얼굴, 이름은 안 가져옴
import type { Ctx } from './index.ts';
import { iso, later } from './lib.ts';

const CACHE_MS = 60 * 60 * 1000;
const KST = 9 * 3600e3; // Worker는 UTC로 돌아서 날짜는 직접 한국 시간으로 계산

export async function somoim(c: Ctx) {
	const db = c.env.DB;
	const url = c.env.SOMOIM_URL;
	if (!url) return { ok: false, url: '', error: '소모임 주소가 설정되지 않았어요.' };
	const hit = await db.prepare("SELECT value FROM cache WHERE key = 'somoim' AND expires_at > ?").bind(iso(c.now)).first<{ value: string }>();
	if (hit) return JSON.parse(hit.value);

	const res = await fetch(url, { redirect: 'follow' }).catch(() => null);
	if (!res?.ok) return { ok: false, url, error: '소모임 페이지를 열 수 없어요.' };
	const meetups = parseSomoim(await res.text(), c.now);
	const out = { ok: true, url, meetups };
	const now = iso(c.now);
	await db.batch([
		...meetups.map((m) =>
			db.prepare(
				`INSERT INTO meetups (id, source, title, starts_at, place, fee, capacity, somoim_count, first_seen_at, updated_at)
				 VALUES (?1, 'somoim', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
				 ON CONFLICT(id) DO UPDATE SET place = ?4, fee = ?5, capacity = ?6, somoim_count = ?7, updated_at = ?8`,
			).bind(`somoim:${m.start}|${m.title}`, m.title, m.start, m.place, m.fee, m.cap, m.count, now),
		),
		db.prepare('INSERT INTO cache (key, value, expires_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value = ?2, expires_at = ?3').bind('somoim', JSON.stringify(out), iso(later(c.now, CACHE_MS))),
	]);
	return out;
}

// 한국 시간 y-m-d h:mi → Date
const kst = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(Date.UTC(y, mo - 1, d, h, mi) - KST);
const dayLabel = (d: Date) => {
	const k = new Date(d.getTime() + KST);
	const p = (n: number) => String(n).padStart(2, '0');
	return `${p(k.getUTCMonth() + 1)}.${p(k.getUTCDate())} ${'일월화수목금토'[k.getUTCDay()]}`;
};
const decodeHtml = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ');

// 공개 모임 페이지 HTML → 정모 목록 (지난 정모 제외, 날짜순). Apps Script parseSomoim과 같은 규칙
export function parseSomoim(htmlText: string, now: Date) {
	const i = htmlText.indexOf('정모 일정');
	if (i < 0) return [];
	const j = htmlText.indexOf('</section>', i);
	const sec = htmlText.slice(i, j < 0 ? undefined : j);
	const text = (s: unknown) => decodeHtml(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
	const after = (it: string, icon: string) => {
		const m = new RegExp(icon + '[^]*?<p[^>]*>([^]*?)</p>').exec(it);
		return m ? text(m[1]) : '';
	};
	const k = new Date(now.getTime() + KST);
	const today = kst(k.getUTCFullYear(), k.getUTCMonth() + 1, k.getUTCDate());
	const list = [];
	for (const it of sec.split('<div class="flex space-x-3">').slice(1)) {
		const title = text((/<h3[^>]*>([^]*?)<\/h3>/.exec(it) || [])[1]);
		if (!title) continue;
		const flat = text(it);
		// 날짜: 이미지 파일 이름의 yyyymmddHHMM → 없으면 '11/7(토) 오후 1:00' 에서 (연도 추정)
		let start: Date | null = null;
		const stamp = /(\d{12})s\d+\.png/.exec(it);
		if (stamp) {
			const d = stamp[1];
			start = kst(+d.slice(0, 4), +d.slice(4, 6), +d.slice(6, 8), +d.slice(8, 10), +d.slice(10, 12));
		} else {
			const md = /(\d{1,2})\/(\d{1,2})\(/.exec(flat);
			const hm = /(오전|오후)\s*(\d{1,2}):(\d{2})/.exec(flat);
			if (md) {
				let y = k.getUTCFullYear();
				if (kst(y, +md[1], +md[2]).getTime() < today.getTime() - 60 * 864e5) y++; // 두 달 넘게 지난 날짜면 내년
				start = kst(y, +md[1], +md[2], hm ? (+hm[2] % 12) + (hm[1] === '오후' ? 12 : 0) : 0, hm ? +hm[3] : 0);
			}
		}
		if (!start || start < today) continue;
		const nums = /(\d+)\s*\/\s*(\d+)\s*$/.exec(flat);
		const hm = /(오전|오후)\s*\d{1,2}:\d{2}/.exec(flat);
		list.push({
			title,
			date: dayLabel(start),
			time: hm ? hm[0] : '',
			start: start.toISOString(),
			place: after(it, 'i_location'),
			fee: after(it, 'i_currency'),
			count: nums ? Number(nums[1]) : null,
			cap: nums ? Number(nums[2]) : null,
		});
	}
	return list.sort((a, b) => (a.start < b.start ? -1 : 1));
}
