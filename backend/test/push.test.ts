// 앱 알림(웹 푸시): 구독, 해제, 운영진만 받음, 보낸 내용을 기기처럼 복호화해서 확인(RFC 8291), VAPID 서명 확인(RFC 8292), 만료 구독은 끔
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { env, post, sessionFor, useDb } from './setup.ts';

let A: string, S: string;
useDb(
	[
		['m-a', '01070000001', '회원A', '1990-01-01'],
		['m-s', '01070000002', '운영진S', '1991-01-01', 'staff'],
	],
	async () => {
		A = await sessionFor('m-a');
		S = await sessionFor('m-s');
	},
);

const b64u = (b: ArrayBuffer | Uint8Array) => Buffer.from(new Uint8Array(b)).toString('base64url');
const hmac = async (key: Uint8Array, data: Uint8Array) => new Uint8Array(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), data));
const cat = (...p: Uint8Array[]) => Uint8Array.from(p.flatMap((x) => [...x]));
const te = (s: string) => new TextEncoder().encode(s);

// 가짜 기기: ECDH 키 + auth 16바이트
async function device(endpoint: string) {
	const kp = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
	const pub = new Uint8Array((await crypto.subtle.exportKey('raw', kp.publicKey)) as ArrayBuffer);
	const auth = crypto.getRandomValues(new Uint8Array(16));
	return { kp, pub, auth, sub: { endpoint, keys: { p256dh: b64u(pub), auth: b64u(auth) } } };
}
// 기기가 하는 복호화 (RFC 8291)
async function decrypt(dev: Awaited<ReturnType<typeof device>>, body: Uint8Array) {
	const salt = body.slice(0, 16), idlen = body[20], asPub = body.slice(21, 21 + idlen), sealed = body.slice(21 + idlen);
	const asKey = await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
	const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey } as any, dev.kp.privateKey, 256));
	const ikm = await hmac(await hmac(dev.auth, shared), cat(te('WebPush: info\0'), dev.pub, asPub, new Uint8Array([1])));
	const prk = await hmac(salt, ikm);
	const cek = (await hmac(prk, cat(te('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
	const nonce = (await hmac(prk, cat(te('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
	const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), sealed));
	assert.equal(plain.at(-1), 2); // 마지막 덩어리 표시
	return JSON.parse(new TextDecoder().decode(plain.slice(0, -1)));
}

test('앱 알림: 구독 검사, 해제, 운영진만 받음, 내용 복호화, VAPID 서명 확인, 410이면 구독 끔', async () => {
	// VAPID 키 (테스트용)
	const vk = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
	const jwk = await crypto.subtle.exportKey('jwk', vk.privateKey);
	assert.equal((await post({ action: 'push.key' }, A)).key, null); // 아직 준비 전
	env.VAPID_JWK = JSON.stringify(jwk);
	const realFetch = globalThis.fetch;
	const sent: { url: string; headers: Record<string, string>; body: Uint8Array }[] = [];
	let reply = 201;
	globalThis.fetch = (async (url: string, init: any) => {
		if (String(url).startsWith('https://push.test/')) {
			sent.push({ url: String(url), headers: init.headers, body: new Uint8Array(init.body) });
			return new Response('', { status: reply });
		}
		return realFetch(url, init);
	}) as any;
	try {
		const key = (await post({ action: 'push.key' }, A)).key;
		assert.equal(Buffer.from(key, 'base64url').length, 65);
		assert.equal((await post({ action: 'push.subscribe', subscription: { endpoint: 'http://x', keys: {} } }, S)).ok, false);
		const staffDev = await device('https://push.test/staff');
		const memberDev = await device('https://push.test/member');
		assert.equal((await post({ action: 'push.subscribe', subscription: staffDev.sub }, S)).ok, true);
		assert.equal((await post({ action: 'push.subscribe', subscription: memberDev.sub }, A)).ok, true);

		// 가입 신청 → 운영진 기기에만
		await post({ action: 'signup', phone: '5555-1212', password: 'snow-board-1', name: '새사람', gender: '여', year: '1998', sido: '경기도', sigungu: '의정부시', agree: true });
		assert.deepEqual(sent.map((x) => x.url), ['https://push.test/staff']);
		const msg = await decrypt(staffDev, sent[0].body);
		assert.equal(msg.title, '[가입 신청] 새사람/98/의정부');
		assert.equal(msg.body, '가입 대기 1건');
		assert.equal(sent[0].headers['Content-Encoding'], 'aes128gcm');
		// VAPID: JWT 서명을 공개키로 확인, aud = 푸시 서비스 출처
		const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(sent[0].headers.Authorization)!;
		assert.equal(m[4], key);
		const pubKey = await crypto.subtle.importKey('raw', Buffer.from(key, 'base64url'), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
		assert.equal(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pubKey, Buffer.from(m[3], 'base64url'), te(`${m[1]}.${m[2]}`)), true);
		assert.equal(JSON.parse(Buffer.from(m[2], 'base64url').toString()).aud, 'https://push.test');

		// 시험 알림은 내 기기로만
		sent.length = 0;
		assert.equal((await post({ action: 'push.test' }, S)).sent, 1);
		assert.equal((await decrypt(staffDev, sent[0].body)).title, '앱 알림이 켜졌어요');

		// 푸시 서비스가 410(만료) → 구독 끔 → 다음엔 안 보냄
		reply = 410;
		sent.length = 0;
		await post({ action: 'push.test' }, S);
		assert.equal((await env.DB.prepare("SELECT is_active FROM push_subscriptions WHERE endpoint = 'https://push.test/staff'").first()).is_active, 0);
		reply = 201;
		assert.equal((await post({ action: 'push.test' }, S)).ok, false); // 켜진 기기 없음

		// 다시 켜기 → 되살림, 끄기는 내 구독만
		await post({ action: 'push.subscribe', subscription: staffDev.sub }, S);
		await post({ action: 'push.unsubscribe', endpoint: 'https://push.test/staff' }, A); // 남의 것 → 그대로
		assert.equal((await env.DB.prepare("SELECT is_active FROM push_subscriptions WHERE endpoint = 'https://push.test/staff'").first()).is_active, 1);
		await post({ action: 'push.unsubscribe', endpoint: 'https://push.test/staff' }, S);
		assert.equal((await env.DB.prepare("SELECT is_active FROM push_subscriptions WHERE endpoint = 'https://push.test/staff'").first()).is_active, 0);
	} finally {
		globalThis.fetch = realFetch;
		delete env.VAPID_JWK;
	}
});

test('폭설 알림: 강촌 내일 5cm 이상이면 알림 켠 회원 모두, 하루 한 번만, 적으면 안 보냄', async () => {
	const { snowAlert } = await import('../src/weather.ts');
	const resorts = (await import('../../src/data/resorts.json', { with: { type: 'json' } })).default;
	const vk = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
	env.VAPID_JWK = JSON.stringify(await crypto.subtle.exportKey('jwk', vk.privateKey));
	const realFetch = globalThis.fetch;
	const sent: { url: string; body: Uint8Array }[] = [];
	let snow = 3;
	globalThis.fetch = (async (url: string, init: any) => {
		if (String(url).startsWith('https://push.test/')) {
			sent.push({ url: String(url), body: new Uint8Array(init.body) });
			return new Response('', { status: 201 });
		}
		if (String(url).includes('open-meteo')) {
			const daily = { time: ['2026-12-12', '2026-12-13'], weather_code: [3, 73], temperature_2m_max: [1, -1], temperature_2m_min: [-6, -8], apparent_temperature_min: [-10, -14], snowfall_sum: [0, snow], wind_speed_10m_max: [5, 9] };
			return new Response(JSON.stringify(resorts.map(() => ({ current: { temperature_2m: 0, weather_code: 3, wind_speed_10m: 4 }, daily }))));
		}
		return realFetch(url, init);
	}) as any;
	try {
		const member = await device('https://push.test/snow-member'), staff = await device('https://push.test/snow-staff');
		await post({ action: 'push.subscribe', subscription: member.sub }, A);
		await post({ action: 'push.subscribe', subscription: staff.sub }, S);
		assert.deepEqual(await snowAlert(env, new Date()), { sent: 0 }); // 3cm
		await env.DB.prepare("DELETE FROM cache WHERE key = 'weather'").run();
		snow = 8;
		await snowAlert(env, new Date());
		assert.deepEqual(['snow-member', 'snow-staff'].map((k) => sent.some((x) => x.url.endsWith(k))), [true, true]); // 회원, 운영진 모두 (앞 테스트에서 켠 기기도 받음)
		const msg = await decrypt(member, sent.find((x) => x.url.endsWith('snow-member'))!.body);
		assert.equal(msg.title, '❄️ 내일 강촌 눈 8cm 예보');
		assert.equal(msg.url, '/seasonroom/');
		assert.deepEqual(await snowAlert(env, new Date()), { sent: 0 }); // 같은 날 두 번 안 보냄
	} finally {
		globalThis.fetch = realFetch;
		delete env.VAPID_JWK;
	}
});
