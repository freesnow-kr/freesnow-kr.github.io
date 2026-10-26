// 에디토리얼 페이지 공통: 헤더 동작 + 회원 로그인 상태
import { club } from '../data/club';
import './picker'; // 공용 선택 창 (터치 기기의 select도 이 창으로 — 모든 페이지)

// 끝 슬래시 없이: 루트 주소면 '', 하위 경로면 '/free-snow' 같은 값 → 링크는 항상 `${base}/...`
export const base = import.meta.env.BASE_URL.replace(/\/$/, '');

// 날짜는 어디서나 한 모양: 2025.02.21 / 15:05 (앞에 0 붙임 — 사용자 요구 2026-10-23). 목록은 오늘 글이면 시각만
export const ymd = (iso: string) => new Date(iso).toLocaleDateString('sv-SE').replace(/-/g, '.');
export const hm = (iso: string) => new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
export const postDate = (iso: string) => (new Date().toDateString() === new Date(iso).toDateString() ? hm(iso) : ymd(iso));
export const loginUrl = `${base}/login/`;
export const membersUrl = `${base}/members/`;

// 토큰은 이 브라우저 편의용. 만료·위조는 서버(Worker 세션)가 판정
const KEY = 'fs-member-token';
const NAME = 'fs-member-name'; // 화면 표시용 (권한 판단엔 안 씀)
const PHOTO = 'fs-member-photo'; // 헤더 내 메뉴 동그라미 사진 (/members에서 받아 둠)
const ID = 'fs-member-id'; // '로그인 상태 유지' 때 아이디 기억 (비밀번호는 저장 안 함)
export const store = {
	get: () => { try { return localStorage.getItem(KEY); } catch { return null; } },
	set: (v: string) => { try { localStorage.setItem(KEY, v); } catch {} },
	clear: () => { try { localStorage.removeItem(KEY); localStorage.removeItem(NAME); localStorage.removeItem(PHOTO); localStorage.removeItem('fs-chatrank'); localStorage.removeItem('fs-gallery'); } catch {} }, // 채팅 랭킹(회원 전용)·갤러리(내 사진 표시) 저장본도
	name: () => { try { return localStorage.getItem(NAME); } catch { return null; } },
	setName: (v: string) => { try { localStorage.setItem(NAME, v); } catch {} },
	photo: () => { try { return localStorage.getItem(PHOTO); } catch { return null; } },
	setPhoto: (v: string) => { try { v ? localStorage.setItem(PHOTO, v) : localStorage.removeItem(PHOTO); } catch {} },
	id: () => { try { return localStorage.getItem(ID); } catch { return null; } },
	setId: (v: string | null) => { try { v ? localStorage.setItem(ID, v) : localStorage.removeItem(ID); } catch {} },
};

export const passwordUrl = `${base}/password/`;

// 앱으로 설치(PWA): 서비스 워커 등록 + 안드로이드 크롬의 설치 창을 잡아 두었다가 마이페이지 '앱으로 설치'에서 띄움
// 아이폰은 설치 창을 띄울 방법이 없어(애플 정책) Safari 공유 → '홈 화면에 추가' 안내
if ('serviceWorker' in navigator) navigator.serviceWorker.register(`${base}/sw.js`).catch(() => {});
let installEvent: any = null;
addEventListener('beforeinstallprompt', (e) => {
	e.preventDefault(); // 크롬이 아래에 띄우는 작은 안내 대신 우리 버튼으로
	installEvent = e;
	dispatchEvent(new Event('fs-installable'));
});
export const app = {
	installed: () => matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true,
	canPrompt: () => !!installEvent,
	prompt: async () => {
		if (!installEvent) return false;
		installEvent.prompt();
		const { outcome } = await installEvent.userChoice;
		installEvent = null;
		return outcome === 'accepted';
	},
	ios: () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
	inApp: () => /KAKAOTALK|NAVER\(|Instagram|FBAN|FBAV|Line\//i.test(navigator.userAgent), // 카톡 등 앱 안 브라우저 → 설치 안 됨
};

// text/plain POST → CORS 사전요청 없이 호출 (Content-Type·Authorization 헤더 붙이지 말 것 — 토큰은 body.token)
export const call = async (body: { action: string; [k: string]: unknown }) => {
	const res = await (await fetch(club.api, { method: 'POST', body: JSON.stringify(body) })).json();
	// 새 비밀번호를 정하기 전 세션(첫 전환·초기화)이면 어느 페이지든 비밀번호 화면으로
	if (res?.mustChange && body.action !== 'login' && !location.pathname.startsWith(passwordUrl)) { // login은 토큰 저장 후 login.astro가 보냄
		location.href = `${passwordUrl}?first`;
		return new Promise(() => {}); // 페이지가 오류 안내(alert 등)를 띄우지 않게 응답을 돌려주지 않음
	}
	return res;
};

// 로그아웃: 서버 세션도 끝냄 (페이지를 떠나도 보내지게 keepalive)
export const logout = () => {
	const token = store.get();
	if (token) fetch(club.api, { method: 'POST', body: JSON.stringify({ action: 'logout', token }), keepalive: true }).catch(() => {});
	store.clear();
};

// 드라이브가 크기를 줄여 주는 이미지 주소 (폴더가 '링크가 있는 모든 사용자' 공유여야 보임)
export const driveImg = (id: string, w: number) => `https://lh3.googleusercontent.com/d/${encodeURIComponent(id)}=w${w}`;
// 프로필 사진: R2 주소(https://…/profile/…), 예전 드라이브 파일 id, 또는 예전 시트의 작은 사진('data:image/jpeg…')
export const photoSrc = (photo: string, w: number) => (/^(https:|data:image\/)/.test(photo) ? photo : driveImg(photo, w));

// 갤러리 사진 목록: 이 브라우저에 저장해 두고 다시 열 때 바로 보여 줌
// 저장본이 10분 지났으면 보여 주는 동시에 뒤에서 새로 받아 둠 → 새 사진은 그다음 방문에 (서버도 5분 캐시)
// 회원이 올린 사진(R2·보관한 드라이브)은 thumb·large 주소가 오고, 예전 드라이브 폴더 사진은 id만 (driveImg로)
export type Photo = { id: string; caption: string; thumb?: string; large?: string; mine?: boolean };
export const thumbOf = (p: Photo) => p.thumb ?? driveImg(p.id, 720);
export const largeOf = (p: Photo) => p.large ?? driveImg(p.id, 1800);
const GKEY = 'fs-gallery';
const GTTL = 10 * 60 * 1000;
// 로그인했으면 토큰도 → 내가 올린 사진(지울 수 있는 사진)에 mine
export const fetchPhotos = async (): Promise<Photo[] | null> => {
	const res = await call({ action: 'gallery', token: store.get() ?? undefined }).catch(() => null);
	if (!res?.ok) return null;
	try { localStorage.setItem(GKEY, JSON.stringify({ t: Date.now(), photos: res.photos })); } catch {}
	return res.photos;
};
export const galleryPhotos = async (): Promise<Photo[] | null> => {
	let saved: { t: number; photos: Photo[] } | null = null;
	try { saved = JSON.parse(localStorage.getItem(GKEY) || 'null'); } catch {}
	if (!saved) return fetchPhotos();
	if (Date.now() - saved.t >= GTTL) fetchPhotos();
	return saved.photos;
};

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

// 로그인 연장: 로그인은 30일, 사이트를 쓰는 동안은 하루에 한 번 다시 30일로 → 한 달 안에 한 번만 들어와도 안 풀림
// (사용자 요구 2026-10-23). 서버가 세션 기한을 늘림 (토큰은 그대로, res.token이 오면 바꿔 씀)
const RENEWED = 'fs-member-renewed';
{
	const token = store.get();
	let last = 0;
	try { last = Number(localStorage.getItem(RENEWED)) || 0; } catch {}
	if (token && Date.now() - last > 24 * 60 * 60 * 1000) {
		call({ action: 'renew', token })
			.then((res) => {
				if (!res?.ok) return; // 만료면 각 페이지가 로그인으로 보냄
				if (res.token && store.get() === token) store.set(res.token);
				try { localStorage.setItem(RENEWED, String(Date.now())); } catch {}
			})
			.catch(() => {});
	}
}

const nav = document.querySelector('.nav');
if (nav) {
	// 스크롤 내리면 검은 배경
	const onScroll = () => nav.classList.toggle('is-solid', scrollY > 40);
	addEventListener('scroll', onScroll, { passive: true });
	onScroll();

	// 모바일 ☰ 메뉴: 열고 닫기 (메뉴 고르기·Esc·데스크톱 폭이 되면 닫힘)
	const menuBtn = nav.querySelector<HTMLButtonElement>('.nav-menu');
	if (menuBtn) {
		const setOpen = (open: boolean) => {
			nav.classList.toggle('is-open', open);
			menuBtn.setAttribute('aria-expanded', String(open));
			menuBtn.ariaLabel = open ? '메뉴 닫기' : '메뉴 열기';
			menuBtn.textContent = open ? '✕' : '☰';
		};
		menuBtn.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
		nav.querySelectorAll('nav a').forEach((a) => a.addEventListener('click', () => setOpen(false)));
		addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
		matchMedia('(min-width: 1201px)').addEventListener('change', () => setOpen(false));
	}

	// 로그인 상태면 LOGIN 대신 동그란 내 메뉴(프로필 사진, 없으면 이름 끝 두 글자) → 내 정보 / 로그아웃
	const btn = nav.querySelector<HTMLAnchorElement>('.nav-join');
	if (btn && store.get()) {
		const wrap = document.createElement('div');
		wrap.className = 'nav-me';
		const me = document.createElement('button');
		me.type = 'button';
		me.className = 'nav-me-btn';
		me.ariaLabel = '내 메뉴';
		me.setAttribute('aria-haspopup', 'menu');
		me.setAttribute('aria-expanded', 'false');
		const photo = store.photo();
		if (photo) {
			const img = document.createElement('img');
			img.src = photo;
			img.alt = '';
			img.referrerPolicy = 'no-referrer';
			me.append(img);
		} else me.textContent = (store.name() || '나').slice(-2);
		const menu = document.createElement('div');
		menu.className = 'nav-me-menu';
		menu.setAttribute('role', 'menu');
		menu.hidden = true;
		const info = document.createElement('a');
		info.href = membersUrl;
		info.textContent = '내 정보';
		const out = document.createElement('button');
		out.type = 'button';
		out.textContent = '로그아웃';
		out.addEventListener('click', () => {
			logout();
			location.href = `${base}/`;
		});
		for (const item of [info, out]) item.setAttribute('role', 'menuitem');
		menu.append(info, out);
		const open = (on: boolean) => {
			menu.hidden = !on;
			me.setAttribute('aria-expanded', String(on));
		};
		me.addEventListener('click', () => open(menu.hidden));
		addEventListener('click', (e) => { if (!wrap.contains(e.target as Node)) open(false); });
		addEventListener('keydown', (e) => { if (e.key === 'Escape') open(false); });
		wrap.append(me, menu);
		btn.replaceWith(wrap);
	}
}
