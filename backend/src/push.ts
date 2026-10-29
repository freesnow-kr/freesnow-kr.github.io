// 앱 알림(웹 푸시, 사용자 요구 2026-10-26) — 라이브러리 없이 표준대로: VAPID 서명(RFC 8292, ES256) + 내용 암호화(RFC 8291, aes128gcm)
// 서명 키는 Worker secret VAPID_JWK (P-256 개인키 JWK, scripts/vapid.mjs가 만들어 넣음). 공개키는 거기서 꺼내 push.key로 줌
// 받는 사람: 운영진 알림은 활동 중인 운영진, 관리자의 켜진 구독 전부(기기마다). 404, 410(만료, 해제)은 끔
import type { Ctx, Env } from './index.ts';
import { need, Reply } from './auth.ts';

const bad = (error: string) => new Reply({ ok: false, error });
const SITE = 'https://freesnow-kr.github.io'; // VAPID 연락처(sub) — 메일 대신 사이트 주소

export type PushMsg = { title: string; body: string; url?: string; tag?: string };

const b64u = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (ch) => ch.charCodeAt(0));
const cat = (...parts: Uint8Array[]) => {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const p of parts) out.set(p, at), (at += p.length);
	return out;
};
const utf8 = (s: string) => new TextEncoder().encode(s);
const hmac = async (key: Uint8Array, data: Uint8Array) =>
	new Uint8Array(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), data));

// VAPID 공개키 (브라우저 applicationServerKey = 0x04 || x || y, base64url)
export function publicKey(env: Env) {
	if (!env.VAPID_JWK) return null;
	const jwk = JSON.parse(env.VAPID_JWK);
	return b64u(cat(new Uint8Array([4]), unb64u(jwk.x), unb64u(jwk.y)));
}

// VAPID 서명 헤더: JWT {aud: 푸시 서비스 출처, exp: 12시간, sub} ES256
async function vapid(env: Env, endpoint: string) {
	const jwk = JSON.parse(env.VAPID_JWK!);
	const key = await crypto.subtle.importKey('jwk', { ...jwk, key_ops: ['sign'] }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
	const head = b64u(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
	const body = b64u(utf8(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SITE })));
	const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(`${head}.${body}`)); // WebCrypto는 r||s 64바이트 = JWS 형식
	return `vapid t=${head}.${body}.${b64u(sig)}, k=${publicKey(env)}`;
}

// 내용 암호화 (RFC 8291): 일회용 ECDH 키 + 기기 공개키 → 공유 비밀, auth로 섞어 CEK, nonce, AES-128-GCM 한 덩어리
export async function encrypt(payload: string, p256dh: string, auth: string) {
	const ua = unb64u(p256dh);
	const as = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
	const asPub = new Uint8Array((await crypto.subtle.exportKey('raw', as.publicKey)) as ArrayBuffer);
	const uaKey = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
	const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey } as any, as.privateKey, 256));
	const ikm = await hmac(await hmac(unb64u(auth), shared), cat(utf8('WebPush: info\0'), ua, asPub, new Uint8Array([1])));
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const prk = await hmac(salt, ikm);
	const cek = (await hmac(prk, cat(utf8('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
	const nonce = (await hmac(prk, cat(utf8('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
	const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
	const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, cat(utf8(payload), new Uint8Array([2])))); // 2 = 마지막 덩어리
	const rs = new Uint8Array(4);
	new DataView(rs.buffer).setUint32(0, 4096);
	return cat(salt, rs, new Uint8Array([asPub.length]), asPub, sealed);
}

type Sub = { endpoint: string; p256dh: string; auth: string };
// 여러 기기로. 404, 410이면 그 구독을 끔. 실패해도 던지지 않음(알림 때문에 요청이 실패하면 안 돼서) → 보낸 수
export async function sendPush(env: Env, subs: Sub[], msg: PushMsg) {
	if (!env.VAPID_JWK || !subs.length) return { sent: 0, failed: 0 };
	const payload = JSON.stringify(msg);
	let sent = 0, failed = 0;
	await Promise.all(
		subs.map(async (s) => {
			try {
				const res = await fetch(s.endpoint, {
					method: 'POST',
					headers: { Authorization: await vapid(env, s.endpoint), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'high' },
					body: await encrypt(payload, s.p256dh, s.auth),
				});
				if (res.ok) return void sent++;
				failed++;
				if (res.status === 404 || res.status === 410) await env.DB.prepare('UPDATE push_subscriptions SET is_active = 0 WHERE endpoint = ?').bind(s.endpoint).run();
				else console.error('push', res.status, await res.text().catch(() => ''));
			} catch (e) {
				failed++;
				console.error('push', e);
			}
		}),
	);
	return { sent, failed };
}

// 운영진 알림: 활동 중인 운영진, 관리자의 켜진 구독 전부
export async function pushStaff(env: Env, msg: PushMsg) {
	const { results } = await env.DB.prepare(
		`SELECT p.endpoint, p.p256dh, p.auth FROM push_subscriptions p JOIN members m ON m.id = p.member_id
		 WHERE p.is_active = 1 AND m.status = 'active' AND m.role IN ('staff', 'admin')`,
	).all<Sub>();
	return sendPush(env, results, msg);
}

// 폭설 알림 (사용자 요구 2026-10-29): 앱 알림을 켠 활동 회원 기기 전부 (운영진도). 회원은 이 알림만 받음
export async function pushMembers(env: Env, msg: PushMsg) {
	const { results } = await env.DB.prepare(
		`SELECT p.endpoint, p.p256dh, p.auth FROM push_subscriptions p JOIN members m ON m.id = p.member_id
		 WHERE p.is_active = 1 AND m.status = 'active'`,
	).all<Sub>();
	return sendPush(env, results, msg);
}

// ── API ──
// {} → {key} (브라우저가 구독할 때 쓰는 공개키). 준비 안 됐으면 key: null
export async function key(c: Ctx) {
	await need(c);
	return { ok: true, key: publicKey(c.env) };
}

// {subscription: {endpoint, keys: {p256dh, auth}}} 켜기 (같은 기기면 되살리고 지금 회원으로)
export async function subscribe(c: Ctx) {
	const me = await need(c);
	const s = c.body.subscription ?? {};
	const endpoint = String(s.endpoint ?? ''), p256dh = String(s.keys?.p256dh ?? ''), auth = String(s.keys?.auth ?? '');
	let ok = false;
	try {
		ok = new URL(endpoint).protocol === 'https:' && endpoint.length < 1000 && unb64u(p256dh).length === 65 && unb64u(auth).length === 16;
	} catch {}
	if (!ok) throw bad('알림 구독 정보를 확인해 주세요.');
	await c.env.DB.prepare(
		`INSERT INTO push_subscriptions (endpoint, member_id, p256dh, auth) VALUES (?1, ?2, ?3, ?4)
		 ON CONFLICT(endpoint) DO UPDATE SET member_id = ?2, p256dh = ?3, auth = ?4, is_active = 1`,
	).bind(endpoint, me.id, p256dh, auth).run();
	return { ok: true };
}

// {endpoint} 끄기 (내 구독만)
export async function unsubscribe(c: Ctx) {
	const me = await need(c);
	await c.env.DB.prepare('UPDATE push_subscriptions SET is_active = 0 WHERE endpoint = ? AND member_id = ?').bind(String(c.body.endpoint ?? ''), me.id).run();
	return { ok: true };
}

// 시험 알림: 내 켜진 기기 전부로 → {sent}
export async function test(c: Ctx) {
	const me = await need(c);
	if (!c.env.VAPID_JWK) throw bad('앱 알림이 아직 준비되지 않았어요. (backend/scripts/vapid.mjs)');
	const { results } = await c.env.DB.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE member_id = ? AND is_active = 1').bind(me.id).all<Sub>();
	const staff = me.role === 'staff' || me.role === 'admin';
	const r = await sendPush(c.env, results, {
		title: '앱 알림이 켜졌어요',
		body: staff ? '강습 요청, 가입 신청, 강촌 폭설 예보가 있으면 여기로 알려 드려요.' : '강촌에 눈이 많이 올 예보가 있으면 여기로 알려 드려요.',
		url: staff ? '/admin/' : '/',
		tag: 'test',
	});
	if (!r.sent) throw bad('알림을 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.');
	return { ok: true, ...r };
}
