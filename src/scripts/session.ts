// 에디토리얼 페이지 공통: 헤더 동작 + 회원 로그인 상태
import { club } from '../data/club';

export const base = import.meta.env.BASE_URL;
export const loginUrl = `${base}/login/`;
export const membersUrl = `${base}/members/`;

// 토큰은 이 브라우저 편의용. 만료·위조는 서버(Apps Script)가 판정
const KEY = 'fs-member-token';
export const store = {
	get: () => { try { return localStorage.getItem(KEY); } catch { return null; } },
	set: (v: string) => { try { localStorage.setItem(KEY, v); } catch {} },
	clear: () => { try { localStorage.removeItem(KEY); } catch {} },
};

// text/plain POST → CORS 사전요청 없이 Apps Script 호출 (Content-Type 헤더 붙이지 말 것)
export const call = async (body: object) =>
	(await fetch(club.membersApi, { method: 'POST', body: JSON.stringify(body) })).json();

// 제출 중 표시: 버튼 글자·스피너, 폼 잠금(inert라 입력칸의 disabled 상태는 그대로 둠)
export const busy = (form: HTMLFormElement, on: boolean, label: string) => {
	const btn = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
	btn.dataset.label ??= btn.textContent!.trim();
	btn.textContent = on ? label : btn.dataset.label;
	btn.disabled = on;
	btn.classList.toggle('is-loading', on);
	form.inert = on;
	form.setAttribute('aria-busy', String(on));
};

const nav = document.querySelector('.nav');
if (nav) {
	// 스크롤 내리면 검은 배경
	const onScroll = () => nav.classList.toggle('is-solid', scrollY > 40);
	addEventListener('scroll', onScroll, { passive: true });
	onScroll();

	// 로그인 상태면 LOGIN → LOGOUT
	const btn = nav.querySelector<HTMLAnchorElement>('.nav-join');
	if (btn && store.get()) {
		btn.textContent = 'LOGOUT';
		btn.href = `${base}/`;
		btn.removeAttribute('aria-current');
		btn.addEventListener('click', () => store.clear());
	}
}
