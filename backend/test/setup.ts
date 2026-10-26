// 테스트 공통: 임시 폴더에 진짜 로컬 D1(workerd) + 스키마, Worker fetch 직접 호출. 데이터는 전부 가짜
import { after, before } from 'node:test';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getPlatformProxy } from 'wrangler';
import worker from '../src/index.ts';
import { PBKDF2_ITER, normPhone, pbkdf2, phoneKey } from '../src/lib.ts';

export const RESET = 'reset-test-1234';
export const PASSWORD = 'powder-day-26';
export const ORIGIN = 'https://freesnow-kr.github.io';
export const env: any = {};

// 회원: [id, 휴대폰(→ login_key), name, 출생연도(앞 4자리), role?, status?], seed = 그 뒤에 넣을 테스트 데이터. 비밀번호는 다 PASSWORD
export function useDb(members: string[][], seed?: () => Promise<unknown>) {
	const dir = mkdtempSync(join(tmpdir(), 'fs-api-'));
	let proxy: Awaited<ReturnType<typeof getPlatformProxy>>;
	before(async () => {
		proxy = await getPlatformProxy({ configPath: new URL('../wrangler.jsonc', import.meta.url).pathname, persist: { path: dir } });
		Object.assign(env, proxy.env, { RESET_PASSWORD: RESET, LOGIN_KEY_SECRET: 'test-key', PHONE_KEY: 'test-phone-key', SNOWLIVE_API: 'https://snowlive.example/api/', SOMOIM_URL: 'https://somoim.example/group', GALLERY_FOLDER_ID: 'folder1' });
		const sql = readdirSync(new URL('../migrations/', import.meta.url)).sort().map((f) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8')).join(';\n').replace(/--.*$/gm, '');
		// ';'로 나누되 트리거(BEGIN … END;) 본문은 한 문장으로 다시 붙임
		const stmts: string[] = [];
		for (const part of sql.split(';').map((x) => x.trim()).filter(Boolean)) {
			const last = stmts.at(-1);
			if (last && /\bBEGIN\b/i.test(last) && !/\bEND$/i.test(last)) stmts[stmts.length - 1] = `${last};\n${part}`;
			else stmts.push(part);
		}
		for (const x of stmts) await env.DB.prepare(x).run(); // 한 문장씩: 로컬 D1은 0010(테이블 다시 만들기)을 batch로 못 함 (빈 DB라 외래키 문제 없음)
		const now = new Date().toISOString();
		const salt = 'c2FsdHNhbHRzYWx0c2FsdA==';
		const hash = await pbkdf2(PASSWORD, salt, PBKDF2_ITER);
		const keys = await Promise.all(members.map(([, digits]) => (normPhone(digits) ? phoneKey(env.PHONE_KEY, normPhone(digits)) : null)));
		if (members.length) await env.DB.batch(members.flatMap(([id, , name, year, role = 'member', status = 'active'], i) => [
			env.DB.prepare('INSERT INTO members (id, login_key, name, birth_year, region, area, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
				.bind(id, keys[i], name, Number(year.slice(0, 4)) || null, '경기북부', '구리', role, status, now, now),
			env.DB.prepare('INSERT INTO member_credentials (member_id, hash, salt, iter, changed_at) VALUES (?, ?, ?, ?, ?)').bind(id, hash, salt, PBKDF2_ITER, now),
		]));
		await seed?.();
	});
	after(async () => {
		await proxy?.dispose();
		rmSync(dir, { recursive: true, force: true });
	});
}

let ip = 0; // 요청마다 다른 IP (IP 잠금이 다른 테스트에 번지지 않게)
export async function post(body: object, token?: string, origin = ORIGIN) {
	const headers: Record<string, string> = { Origin: origin, 'CF-Connecting-IP': `203.0.113.${++ip % 250}` };
	if (token) headers.Authorization = `Bearer ${token}`;
	const res = await worker.fetch(new Request('https://api.test/', { method: 'POST', headers, body: JSON.stringify(body) }), env);
	return { status: res.status, cors: res.headers.get('Access-Control-Allow-Origin'), ...((await res.json()) as object) } as any;
}

// 로그인 절차 없이 바로 쓰는 세션 (기능 테스트용)
export async function sessionFor(memberId: string): Promise<string> {
	const token = 'test-' + memberId + '-' + Math.random().toString(36).slice(2);
	const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))].map((b) => b.toString(16).padStart(2, '0')).join('');
	await env.DB.prepare('INSERT INTO sessions (token_hash, member_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
		.bind(hash, memberId, new Date().toISOString(), new Date(Date.now() + 3600e3).toISOString()).run();
	return token;
}
