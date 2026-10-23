// Free Snow API (Cloudflare Worker). Apps Script와 같은 계약: POST / body {action, ...} → {ok, ...}
import { Reply, adminReset, login, logout, me, password, renew } from './auth.ts';
import { iso, later } from './lib.ts';
import { seasonRoom } from './seasonroom.ts';
import { shredLog } from './shredlog.ts';
import { snowlive } from './snowlive.ts';
import { somoim } from './somoim.ts';
import { avatar, signup } from './members.ts';
import { chatRank, gallery } from './gallery.ts';
import * as admin from './admin.ts';

export type Env = {
	DB: D1Database;
	ALLOWED_ORIGINS: string; // 쉼표로 구분
	RESET_PASSWORD: string; // secret
	LOGIN_KEY_SECRET: string; // secret (로그인 이력의 아이디·IP HMAC)
	SNOWLIVE_API: string; // secret (비공식 주소라 저장소에 안 둠)
	SOMOIM_URL: string; // secret (소모임 공개 모임 페이지)
	GALLERY_FOLDER_ID: string; // secret (갤러리 드라이브 폴더)
	GOOGLE_API_KEY?: string; // secret, 선택 (있으면 Drive API로 최신순)
};
export type Ctx = { env: Env; req: Request; body: Record<string, any>; now: Date };

const MAX_BODY = 3_000_000; // 채팅 랭킹 집계 결과(달별 순위)·프로필 사진 기준
const BAD = { ok: false, error: '잘못된 요청이에요.' };

const actions: Record<string, (c: Ctx) => Promise<object>> = {
	login,
	logout,
	password,
	renew,
	me,
	seasonroom: seasonRoom,
	shredlog: shredLog,
	snowlive,
	somoim,
	signup,
	avatar,
	gallery,
	chatrank: chatRank,
	'admin.summary': admin.summary,
	'admin.signups': admin.signups,
	'admin.signupDecide': admin.signupDecide,
	'admin.members': admin.members,
	'admin.memberUpdate': admin.memberUpdate,
	'admin.memberStatus': admin.memberStatus,
	'admin.logins': admin.logins,
	'admin.audit': admin.audit,
	'admin.roomOwners': admin.roomOwners,
	'admin.chatUpload': admin.chatUpload,
	'admin.reset': adminReset,
};

export default {
	async fetch(req: Request, env: Env): Promise<Response> {
		const cors = corsHeaders(req, env);
		if (req.method === 'OPTIONS') return new Response(null, { status: cors ? 204 : 403, headers: cors ?? {} });
		if (req.method !== 'POST') return json({ ok: true, service: 'Free Snow API', note: '사이트에서 POST로만 사용해요.' }, cors);
		const text = await req.text();
		if (text.length > MAX_BODY) return json({ ok: false, error: '요청이 너무 커요.' }, cors, 413);
		let body: Record<string, any>;
		try {
			body = JSON.parse(text);
		} catch {
			return json(BAD, cors);
		}
		const run = body && typeof body === 'object' ? actions[body.action] : undefined;
		if (!run) return json(BAD, cors);
		try {
			return json(await run({ env, req, body, now: new Date() }), cors);
		} catch (err) {
			if (err instanceof Reply) return json(err.body, cors);
			console.error(body.action, err); // 요청 내용(비밀번호 등)은 찍지 않음
			return json({ ok: false, error: '서버 오류가 났어요. 잠시 뒤 다시 시도해 주세요.' }, cors, 500);
		}
	},

	// 매일: 90일 지난 로그인 이력, 끝난 지 30일 지난 세션, 지난 캐시 삭제
	async scheduled(_event: unknown, env: Env): Promise<void> {
		const now = new Date();
		await env.DB.batch([
			env.DB.prepare('DELETE FROM login_logs WHERE at < ?').bind(iso(later(now, -90 * 864e5))),
			env.DB.prepare('DELETE FROM sessions WHERE coalesce(revoked_at, expires_at) < ?').bind(iso(later(now, -30 * 864e5))),
			env.DB.prepare('DELETE FROM cache WHERE expires_at < ?').bind(iso(now)),
		]);
	},
};

// 허용한 출처만 응답을 읽을 수 있게. Origin 없는 요청(서버끼리)은 CORS 헤더 없이
function corsHeaders(req: Request, env: Env): Record<string, string> | null {
	const origin = req.headers.get('Origin');
	if (!origin) return {};
	if (!env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).includes(origin)) return null;
	return {
		'Access-Control-Allow-Origin': origin,
		'Access-Control-Allow-Methods': 'POST',
		'Access-Control-Allow-Headers': 'Authorization, Content-Type',
		'Access-Control-Max-Age': '86400',
		Vary: 'Origin',
	};
}

function json(obj: object, cors: Record<string, string> | null, status = 200): Response {
	return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...(cors ?? {}) } });
}
