// 운영진 메일 알림 (사용자 요구 2026-10-23): 강습 요청이 들어오면 운영진 메일로. 보내는 계정 = 사진 보관용으로 연결한 동호회 구글 계정의 Gmail
// 권한은 scripts/google-auth.mjs가 drive.file + gmail.send로 받음. 받을 메일 목록은 /admin 강습 요청 탭에서 D1 cache('notify:lesson')에
import type { Env } from './index.ts';
import { accessToken } from './photos.ts';

const KEY = 'notify:lesson';
const MAX = 10;
const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;
const ADMIN_URL = 'https://freesnow-kr.github.io/admin/';

export async function notifyEmails(env: Env): Promise<string[]> {
	const hit = await env.DB.prepare('SELECT value FROM cache WHERE key = ?').bind(KEY).first<{ value: string }>();
	return hit ? JSON.parse(hit.value) : [];
}

// 쉼표·줄바꿈으로 나눈 주소 → 검사 후 저장. 틀린 주소가 있으면 그 주소를 돌려줌(저장 안 함)
export async function saveNotifyEmails(env: Env, input: string): Promise<{ bad?: string; emails: string[] }> {
	const emails = [...new Set(input.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))];
	const bad = emails.find((e) => !EMAIL.test(e) || e.length > 100);
	if (bad) return { bad, emails };
	if (emails.length > MAX) return { bad: `최대 ${MAX}개`, emails };
	await env.DB.prepare("INSERT INTO cache (key, value, expires_at) VALUES (?1, ?2, '9999-12-31') ON CONFLICT(key) DO UPDATE SET value = ?2").bind(KEY, JSON.stringify(emails)).run();
	return { emails };
}

// Gmail API로 보냄. 받는 사람끼리 주소가 안 보이게 숨은 참조(Bcc)
export async function sendMail(env: Env, to: string[], subject: string, text: string) {
	if (!to.length) return;
	if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REFRESH_TOKEN) throw new Error('구글 연결이 아직 안 됐어요. (backend/scripts/google-auth.mjs)');
	const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
	const mime = [
		`Bcc: ${to.join(', ')}`,
		`Subject: =?UTF-8?B?${b64(subject)}?=`,
		'MIME-Version: 1.0',
		'Content-Type: text/plain; charset=UTF-8',
		'Content-Transfer-Encoding: base64',
		'',
		b64(text),
	].join('\r\n');
	const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
		method: 'POST',
		headers: { Authorization: `Bearer ${await accessToken(env)}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ raw: b64(mime).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }),
	});
	if (!res.ok) throw new Error(res.status === 403 ? '메일 보내기 권한이 없어요. 구글 연결을 다시 해 주세요. (backend/scripts/google-auth.mjs)' : `메일을 보내지 못했어요. (${res.status})`);
}

// 강습 요청 알림. 실패해도 요청 자체는 저장된 채로(로그만)
export async function lessonRequested(env: Env, name: string, date: string) {
	try {
		const [y, m, d] = date.split('-').map(Number);
		const day = `${m}/${d}(${'일월화수목금토'[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
		await sendMail(env, await notifyEmails(env), `[프리스노우] 강습 요청 · ${day} ${name}`, `${name} 님이 ${day} 출격 날 강습을 요청했어요.\n\n운영진 화면에서 연결해 주세요:\n${ADMIN_URL}\n\n(강습 요청은 운영진만 볼 수 있어요.)`);
	} catch (e) {
		console.error('lesson notify', e);
	}
}
