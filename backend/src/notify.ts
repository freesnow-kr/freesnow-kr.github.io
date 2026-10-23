// 운영진 메일 알림 (사용자 요구 2026-10-23): 강습 요청이 들어오면 회원 정보에 메일이 있는 활동 운영진(staff·admin)에게만.
// 보내는 계정 = 사진 보관용으로 연결한 동호회 구글 계정의 Gmail. 권한은 scripts/google-auth.mjs가 drive.file + gmail.send로 받음
import type { Env } from './index.ts';
import { accessToken } from './photos.ts';

export const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;
const ADMIN_URL = 'https://freesnow-kr.github.io/admin/';

// 알림 받을 운영진: 활동 중 + 운영진·관리자 + 메일 있음
export async function staffEmails(env: Env) {
	const { results } = await env.DB.prepare("SELECT name, email FROM members WHERE status = 'active' AND role IN ('staff', 'admin') AND email IS NOT NULL AND email != '' ORDER BY sort_no, name").all<{ name: string; email: string }>();
	return results;
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
		const day = `${date}(${'일월화수목금토'[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`; // 2026-10-29(목)
		await sendMail(env, (await staffEmails(env)).map((r) => r.email), `[프리스노우][강습 요청] ${day} ${name}`, `${name} 님이 ${day} 출격 날 강습을 요청했어요.\n\n운영진 화면에서 연결해 주세요:\n${ADMIN_URL}\n\n(강습 요청은 운영진만 볼 수 있어요.)`);
	} catch (e) {
		console.error('lesson notify', e);
	}
}
