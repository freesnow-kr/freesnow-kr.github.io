// 스키장 웹캠 HLS 중계 (사용자 요구 2026-11-10). 하이원, 무주 등은 영상이 http + CORS는 있지만 토큰이 9시간마다 만료 +
// 우리 사이트는 https라 브라우저가 http 영상을 직접 못 받음 → Worker가 중계. snowthing.org도 자기 서버로 중계.
// 주의: 영상이 Worker를 거쳐서 요청 수가 큼 (무료 10만/일) — 꼭 필요한 스키장만.
//
// 무주: 팝업 webcam_popup_jh.asp?cam_num=NN 가 <source src="http://…cloudn…/camNN.stream/playlist.m3u8?e=만료&h=서명"> 를 줌
//   → start/NN 요청 때 팝업에서 그 주소를 받아 중계. 토큰은 그 주소에 들어 있어 세션마다 새로 받음(마스터는 한 번, 조각은 /p/로).
import type { Env } from './index.ts';

type Fixed = { base: string; referer?: string }; // 고정 경로 중계
type Popup = { popup: string; base: string; referer: string }; // 팝업에서 서명 주소 받아 중계
export const CAM_SOURCES: Record<string, Fixed | Popup> = {
	muju: { popup: 'http://www.mdysresort.com/guide/webcam_popup_jh.asp?cam_num=', base: 'http://muju.cache.cdn.cloudn.co.kr', referer: 'http://www.mdysresort.com/' },
};

const M3U8 = 'application/vnd.apple.mpegurl';
const cors = () => ({ 'Access-Control-Allow-Origin': '*' });

// rest = /cam/<resort>/ 뒤 전체. 팝업형: 'start/<n>'(서명 주소 받아 중계) | 'p/<원본 경로>'(조각 중계)
export async function proxy(env: Env, resort: string, rest: string, reqUrl: URL): Promise<Response> {
	const src = CAM_SOURCES[resort];
	if (!src) return new Response('Unknown cam', { status: 404 });

	if ('popup' in src) {
		const start = /^start\/(\w+)$/.exec(rest);
		if (start) {
			const html = await fetchText(src.popup + start[1], src.referer);
			if (html == null) return new Response('Upstream error', { status: 502, headers: cors() });
			const m = /src=["']([^"']+\.m3u8[^"']*)["']/i.exec(html);
			if (!m || !m[1].startsWith(src.base + '/')) return new Response('영상 주소를 찾지 못했어요.', { status: 502, headers: cors() });
			return relay(m[1], src, resort);
		}
		if (rest.startsWith('p/')) return relay(`${src.base}/${rest.slice(2)}${reqUrl.search}`, src, resort);
		return new Response('Bad cam path', { status: 404 });
	}

	if (!src.base) return new Response('이 스키장 영상 주소가 아직 설정되지 않았어요.', { status: 503 });
	return relay(`${src.base}/${rest}${reqUrl.search}`, src, resort);
}

// 원본 m3u8/조각을 받아 CORS https로 내보냄. m3u8이면 안의 주소를 /cam/<resort>/p/ 로 바꿈
async function relay(upstream: string, src: Fixed | Popup, resort: string): Promise<Response> {
	const referer = 'referer' in src ? src.referer : undefined;
	let res: Response;
	try {
		res = await fetch(upstream, { headers: { ...(referer ? { Referer: referer } : {}), 'User-Agent': 'Mozilla/5.0' } });
	} catch {
		return new Response('Upstream error', { status: 502, headers: cors() });
	}
	if (!res.ok) return new Response('Upstream ' + res.status, { status: 502, headers: cors() });
	const type = res.headers.get('Content-Type') ?? '';
	if (upstream.includes('.m3u8') || type.includes('mpegurl')) {
		const text = rewrite(await res.text(), upstream, src.base, resort);
		return new Response(text, { headers: { 'Content-Type': M3U8, 'Cache-Control': 'no-store', ...cors() } });
	}
	return new Response(res.body, { headers: { 'Content-Type': type || 'video/mp2t', 'Cache-Control': 'public, max-age=3', ...cors() } });
}

// m3u8 안의 하위목록/조각 주소(같은 서버 것)를 우리 중계 /cam/<resort>/p/ 로 바꿈 (토큰 쿼리 유지)
function rewrite(text: string, upstreamUrl: string, base: string, resort: string): string {
	const map = (uri: string) => {
		let abs: string;
		try { abs = new URL(uri, upstreamUrl).href; } catch { return uri; }
		if (!abs.startsWith(base + '/')) return abs; // 다른 서버면 그대로
		return `/cam/${resort}/p/${abs.slice(base.length + 1)}`;
	};
	return text.split('\n').map((line) => {
		const t = line.trim();
		if (!t) return line;
		if (t.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_, u) => `URI="${map(u)}"`);
		return map(t);
	}).join('\n');
}

async function fetchText(url: string, referer: string): Promise<string | null> {
	try {
		const r = await fetch(url, { headers: { Referer: referer, 'User-Agent': 'Mozilla/5.0' } });
		return r.ok ? await r.text() : null;
	} catch {
		return null;
	}
}
