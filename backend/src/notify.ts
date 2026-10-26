// 운영진 메일 알림 (사용자 요구 2026-10-23): 강습 요청·가입 신청이 들어오면 회원 정보에 메일이 있는 활동 운영진(staff·admin)에게만.
// 보내는 계정 = 사진 보관용으로 연결한 동호회 구글 계정의 Gmail. 권한은 scripts/google-auth.mjs가 drive.file + gmail.send로 받음
import type { Env } from './index.ts';
import { accessToken } from './photos.ts';
import { pushStaff } from './push.ts';

export const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;
const ADMIN_URL = 'https://freesnow-kr.github.io/admin/';

// 알림 받을 운영진: 활동 중 + 운영진·관리자 + 메일 있음
export async function staffEmails(env: Env) {
	const { results } = await env.DB.prepare("SELECT name, email FROM members WHERE status = 'active' AND role IN ('staff', 'admin') AND email IS NOT NULL AND email != '' ORDER BY sort_no, name").all<{ name: string; email: string }>();
	return results;
}

// Gmail API로 보냄. 받는 사람끼리 주소가 안 보이게 숨은 참조(Bcc)
// Gmail API로 보냄. 받는 사람끼리 주소가 안 보이게 숨은 참조(Bcc). html이 있으면 글자판과 같이(multipart — 글자만 보는 메일 앱용)
export async function sendMail(env: Env, to: string[], subject: string, text: string, html?: string) {
	if (!to.length) return;
	if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REFRESH_TOKEN) throw new Error('구글 연결이 아직 안 됐어요. (backend/scripts/google-auth.mjs)');
	const b64 = (s: string) => {
		const bytes = new TextEncoder().encode(s);
		let bin = '';
		for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); // 긴 HTML도 (인자 개수 한도)
		return btoa(bin);
	};
	const part = (type: string, body: string) => [`Content-Type: ${type}; charset=UTF-8`, 'Content-Transfer-Encoding: base64', '', b64(body).replace(/.{76}/g, '$&\r\n')];
	const boundary = `fs${crypto.randomUUID().replace(/-/g, '')}`;
	const mime = [
		`Bcc: ${to.join(', ')}`,
		`Subject: =?UTF-8?B?${b64(subject)}?=`,
		'MIME-Version: 1.0',
		...(html
			? [`Content-Type: multipart/alternative; boundary="${boundary}"`, '', `--${boundary}`, ...part('text/plain', text), `--${boundary}`, ...part('text/html', html), `--${boundary}--`]
			: part('text/plain', text)),
	].join('\r\n');
	const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
		method: 'POST',
		headers: { Authorization: `Bearer ${await accessToken(env)}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ raw: b64(mime).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }),
	});
	if (!res.ok) throw new Error(res.status === 403 ? '메일 보내기 권한이 없어요. 구글 연결을 다시 해 주세요. (backend/scripts/google-auth.mjs)' : `메일을 보내지 못했어요. (${res.status})`);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
const dayOf = (date: string) => {
	const [y, m, d] = date.split('-').map(Number);
	return `${date}(${'일월화수목금토'[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`; // 2026-10-29(목)
};

// 운영진 알림 메일 틀 (사용자가 고른 시안 A: 검정 머리 띠 FREE SNOW + 큰 영문 제목 + 정보 표 + 주황 버튼). 강습 요청·가입 신청이 같이 씀
// 메일 앱은 웹폰트·<style>을 잘 안 지켜서 인라인 스타일 + 기본 글꼴. rows = [이름표, HTML 값, 글자 값]
function staffMail(v: { heading: string; lead: string; leadText: string; rows: [string, string, string][]; button: string; footer: string; test?: boolean }) {
	const font = "-apple-system,'Apple SD Gothic Neo','Malgun Gothic',Arial,sans-serif";
	const row = ([k, val]: [string, string, string], last: boolean) => {
		const line = last ? '' : 'border-bottom:1px solid #e6e3dc;';
		return `<tr><td style="padding:10px 0;${line}color:#8b8f99;width:96px;vertical-align:top;">${k}</td><td style="padding:10px 0;${line}">${val}</td></tr>`;
	};
	const text = [v.leadText, '', ...v.rows.map(([k, , t]) => `${k}: ${t}`), '', `${v.button}: ${ADMIN_URL}`, '', v.footer].join('\n');
	const html = `<!doctype html><html lang="ko"><body style="margin:0;padding:24px 12px;background:#e9e7e2;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #d9d6cf;font-family:${font};color:#0b0d12;">
<tr><td style="background:#0b0d12;padding:18px 24px;color:#ffffff;font:900 18px Arial,sans-serif;letter-spacing:2px;">FREE SNOW</td></tr>
<tr><td style="padding:28px 24px 8px;">
<div style="font:700 11px Arial,sans-serif;letter-spacing:3px;color:#ff5a1f;">STAFF ONLY${v.test ? ' · TEST' : ''}</div>
<div style="margin-top:6px;font:900 34px/1.05 Arial,sans-serif;letter-spacing:-1px;">${v.heading}</div>
<p style="margin:16px 0 0;font-size:15px;line-height:1.6;">${v.lead}</p>
</td></tr>
<tr><td style="padding:16px 24px;">
<table width="100%" cellpadding="0" cellspacing="0" style="border-top:2px solid #0b0d12;font-size:14px;font-family:${font};">
${v.rows.map((r, i) => row(r, i === v.rows.length - 1)).join('\n')}
</table>
</td></tr>
<tr><td style="padding:8px 24px 28px;"><a href="${ADMIN_URL}" style="display:inline-block;padding:14px 22px;background:#ff5a1f;color:#0b0d12;font:900 14px Arial,sans-serif;letter-spacing:1px;text-decoration:none;">${v.button} &rarr;</a></td></tr>
<tr><td style="padding:14px 24px;background:#f1efea;color:#8b8f99;font-size:12px;line-height:1.5;">${v.footer}</td></tr>
</table></body></html>`;
	return { text, html };
}
const gray = (s: string) => `<span style="color:#8b8f99;">${s}</span>`;

// 강습 요청 메일
export function lessonMail(v: { name: string; date: string; riders: string[]; pending: number; test?: boolean }) {
	const day = dayOf(v.date);
	const subject = `${v.test ? '[시험] ' : ''}[프리스노우][강습 요청] ${day} ${v.name}`;
	return {
		subject,
		...staffMail({
			heading: 'LESSON<br>REQUEST.',
			lead: `<b>${esc(v.name)}</b> 님이 출격 날 강습을 요청했어요.`,
			leadText: `${v.name} 님이 ${day} 출격 날 강습을 요청했어요.`,
			rows: [
				['날짜', `<b>${day}</b>`, day],
				['요청한 회원', `<b>${esc(v.name)}</b>`, v.name],
				['같은 날 출격', v.riders.length ? `${esc(v.riders.join(', '))} ${gray(`(${v.riders.length}명)`)}` : gray('아직 없어요'), v.riders.length ? `${v.riders.join(', ')} (${v.riders.length}명)` : '아직 없어요'],
				['연결 대기', `<b style="color:#ff5a1f;">${v.pending}건</b>${v.test ? '' : ` ${gray('(이 요청 포함)')}`}`, `${v.pending}건`],
			],
			button: '연결하러 가기',
			footer: '강습 요청과 연결은 운영진만 볼 수 있어요. 메일이 등록된 운영진에게만 보내요.',
			test: v.test,
		}),
	};
}

// 가입 신청 메일 (사용자 요구 2026-10-23). 연락처·생년월일은 안 넣음(메일은 오래·넓게 남아서 — 승인할 때 운영진 화면에서)
export function signupMail(v: { name: string; gender: string; region: string; at: Date; pending: number }) {
	const k = new Date(v.at.getTime() + 9 * 3600e3);
	const day = dayOf(k.toISOString().slice(0, 10));
	const when = `${day} ${k.toISOString().slice(11, 16)}`;
	return {
		subject: `[프리스노우][가입 신청] ${day} ${v.name}`,
		...staffMail({
			heading: 'NEW<br>MEMBER.',
			lead: `<b>${esc(v.name)}</b> 님이 가입을 신청했어요.`,
			leadText: `${v.name} 님이 가입을 신청했어요.`,
			rows: [
				['이름', `<b>${esc(v.name)}</b>`, v.name],
				['성별', esc(v.gender), v.gender],
				['지역', esc(v.region || '-'), v.region || '-'],
				['신청 시각', when, when],
				['가입 대기', `<b style="color:#ff5a1f;">${v.pending}건</b> ${gray('(이 신청 포함)')}`, `${v.pending}건`],
			],
			button: '승인하러 가기',
			footer: '연락처·생년월일은 운영진 화면에서 확인해 주세요. 메일이 등록된 운영진에게만 보내요.',
		}),
	};
}

// 가입 신청 알림 (메일 + 앱 알림). 실패해도 신청은 저장된 채로(로그만)
export async function signupRequested(env: Env, v: { name: string; gender: string; region: string; who: string; at: Date }) {
	try {
		const { n } = (await env.DB.prepare("SELECT count(*) AS n FROM signup_requests WHERE status = 'pending' AND is_active = 1").first<{ n: number }>())!;
		const to = (await staffEmails(env)).map((r) => r.email);
		const mail = signupMail({ ...v, pending: n });
		await Promise.all([
			to.length && sendMail(env, to, mail.subject, mail.text, mail.html).catch((e) => console.error('signup mail', e)),
			pushStaff(env, { title: `[가입 신청] ${v.who}`, body: `가입 대기 ${n}건`, url: '/admin/', tag: 'signup' }), // who = 이름/출생연도 두 자리/거주지 (사용자 요구 2026-10-26)
		]);
	} catch (e) {
		console.error('signup notify', e);
	}
}

// 오늘(한국)부터 앞으로 아직 연결 안 한 강습 요청 수
export async function pendingLessons(env: Env, now = new Date()) {
	const today = new Date(now.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
	return (await env.DB.prepare('SELECT count(*) AS n FROM lesson_requests WHERE is_active = 1 AND teacher_id IS NULL AND date >= ?').bind(today).first<{ n: number }>())!.n;
}

// 강습 요청 알림 (메일 + 앱 알림). 실패해도 요청 자체는 저장된 채로(로그만)
export async function lessonRequested(env: Env, memberId: string, name: string, date: string) {
	try {
		const to = (await staffEmails(env)).map((r) => r.email);
		const { results } = await env.DB.prepare(
			`SELECT m.name FROM ride_checks r JOIN members m ON m.id = r.member_id
			 WHERE r.date = ? AND r.status = '출격' AND r.is_active = 1 AND r.member_id != ? ORDER BY m.name`,
		).bind(date, memberId).all<{ name: string }>();
		const pending = await pendingLessons(env);
		const mail = lessonMail({ name, date, riders: results.map((r) => r.name), pending });
		await Promise.all([
			to.length && sendMail(env, to, mail.subject, mail.text, mail.html).catch((e) => console.error('lesson mail', e)),
			pushStaff(env, { title: `[강습 요청] ${name}`, body: `${dayOf(date)} 출격 / 연결 대기 ${pending}건`, url: '/admin/', tag: 'lesson' }),
		]);
	} catch (e) {
		console.error('lesson notify', e);
	}
}
