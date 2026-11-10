// 스키장 웹캠 HLS 중계 (사용자 요구 2026-11-10). 하이원, 무주, 오투는 영상이 http + 다른 사이트에서 직접 못 열게 막혀 있어서
// (snowthing.org도 자기 서버로 중계) 브라우저가 우리 Worker를 거쳐 영상을 받게 함. 곤지암 등 공개 영상은 중계 없이 그대로 재생.
// 주의: 영상이라 보는 사람당 계속 요청이 흘러서 D1과 달리 요청 수가 큼 (무료 10만/일) — 꼭 필요한 스키장만.
// 켜는 법: 아래 CAM_SOURCES에 { base: '스킴://호스트[:포트]', referer: '스키장 페이지 주소' }를 넣으면 /cam/<이름>/... 가 열림.
import type { Env } from './index.ts';

// base = 원본 영상 서버의 오리진만 (경로 없이). referer = 스키장이 확인하는 Referer (없으면 안 붙임).
// 주소는 아직 비움 — 받는 대로 채우면 바로 켜짐 (빈 값이면 503).
export const CAM_SOURCES: Record<string, { base: string; referer?: string }> = {
	high1: { base: '', referer: 'https://www.high1.com/' },
	muju: { base: '', referer: 'https://www.mdysresort.com/' },
	o2: { base: '', referer: 'https://www.o2resort.com/' },
};

const TS_TYPE = 'video/mp2t';
const M3U8_TYPE = 'application/vnd.apple.mpegurl';

// /cam/<resort>/<원본 경로> → 원본 서버로 중계. m3u8이면 그 안의 주소도 /cam/<resort>/ 로 바꿔 줌
export async function proxy(env: Env, resort: string, rest: string, reqUrl: URL): Promise<Response> {
	const src = CAM_SOURCES[resort];
	if (!src) return new Response('Unknown cam', { status: 404 });
	if (!src.base) return new Response('이 스키장 영상 주소가 아직 설정되지 않았어요.', { status: 503 });

	const upstream = `${src.base}/${rest}${reqUrl.search}`;
	let res: Response;
	try {
		res = await fetch(upstream, {
			headers: { ...(src.referer ? { Referer: src.referer } : {}), 'User-Agent': 'Mozilla/5.0' },
			// Cloudflare 캐시: 조각(.ts)은 잠깐, 목록(.m3u8)은 캐시 안 함 (라이브)
			cf: { cacheTtl: rest.includes('.m3u8') ? 0 : 3, cacheEverything: !rest.includes('.m3u8') },
		});
	} catch {
		return new Response('Upstream error', { status: 502, headers: cors() });
	}
	if (!res.ok) return new Response('Upstream ' + res.status, { status: 502, headers: cors() });

	const type = res.headers.get('Content-Type') ?? '';
	const isPlaylist = rest.includes('.m3u8') || type.includes('mpegurl');
	if (isPlaylist) {
		const text = rewrite(await res.text(), upstream, src.base, resort);
		return new Response(text, { headers: { 'Content-Type': M3U8_TYPE, 'Cache-Control': 'no-store', ...cors() } });
	}
	const ct = type || (rest.includes('.ts') ? TS_TYPE : 'application/octet-stream');
	return new Response(res.body, { headers: { 'Content-Type': ct, 'Cache-Control': 'public, max-age=3', ...cors() } });
}

// m3u8 안의 조각/하위목록 주소를 우리 중계 주소로 바꿈. 같은 서버 것만 (다른 CDN은 그대로 둠)
function rewrite(text: string, upstreamUrl: string, base: string, resort: string): string {
	const map = (uri: string) => {
		let abs: string;
		try { abs = new URL(uri, upstreamUrl).href; } catch { return uri; }
		if (!abs.startsWith(base + '/')) return abs; // 다른 서버면 그대로 (우리가 못 바꿈)
		const path = abs.slice(base.length + 1);
		const q = path.indexOf('?');
		return `/cam/${resort}/${q < 0 ? path : path.slice(0, q)}${q < 0 ? '' : path.slice(q)}`;
	};
	return text.split('\n').map((line) => {
		const t = line.trim();
		if (!t) return line;
		if (t.startsWith('#')) {
			// #EXT-X-KEY, #EXT-X-MEDIA 등의 URI="..." 도 바꿈
			return line.replace(/URI="([^"]+)"/g, (_, u) => `URI="${map(u)}"`);
		}
		return map(t); // 조각, 하위 목록 줄
	}).join('\n');
}

const cors = () => ({ 'Access-Control-Allow-Origin': '*' });
