// 에디토리얼 페이지 공통: 헤더 동작 + 회원 로그인 상태
import { club } from '../data/club';

// 끝 슬래시 없이: 루트 주소면 '', 하위 경로면 '/free-snow' 같은 값 → 링크는 항상 `${base}/...`
export const base = import.meta.env.BASE_URL.replace(/\/$/, '');
export const loginUrl = `${base}/login/`;
export const membersUrl = `${base}/members/`;

// 토큰은 이 브라우저 편의용. 만료·위조는 서버(Apps Script)가 판정
const KEY = 'fs-member-token';
const NAME = 'fs-member-name'; // 화면 표시용 (권한 판단엔 안 씀)
const ID = 'fs-member-id'; // '로그인 상태 유지' 때 아이디 기억 (비밀번호는 저장 안 함)
export const store = {
	get: () => { try { return localStorage.getItem(KEY); } catch { return null; } },
	set: (v: string) => { try { localStorage.setItem(KEY, v); } catch {} },
	clear: () => { try { localStorage.removeItem(KEY); localStorage.removeItem(NAME); localStorage.removeItem('fs-chatrank'); } catch {} }, // 채팅 랭킹(회원 전용) 저장본도
	name: () => { try { return localStorage.getItem(NAME); } catch { return null; } },
	setName: (v: string) => { try { localStorage.setItem(NAME, v); } catch {} },
	id: () => { try { return localStorage.getItem(ID); } catch { return null; } },
	setId: (v: string | null) => { try { v ? localStorage.setItem(ID, v) : localStorage.removeItem(ID); } catch {} },
};

// Worker(club.workerApi)가 맡는 action. 나머지는 Apps Script. 로그인 토큰이 서버마다 달라서 회원 기능은 한꺼번에 옮김
// (docs/migration/02-design.md §5) — Worker로 옮긴 action을 여기 추가. workerApi가 비어 있으면 전부 Apps Script
const WORKER_ACTIONS = new Set(['login', 'logout', 'password', 'me', 'seasonroom', 'shredlog', 'snowlive']);
const apiFor = (action: string) => (club.workerApi && WORKER_ACTIONS.has(action) ? club.workerApi : club.membersApi);
export const passwordUrl = `${base}/password/`;

// text/plain POST → CORS 사전요청 없이 호출 (Content-Type·Authorization 헤더 붙이지 말 것 — 토큰은 body.token)
export const call = async (body: { action: string; [k: string]: unknown }) => {
	const res = await (await fetch(apiFor(body.action), { method: 'POST', body: JSON.stringify(body) })).json();
	// 새 비밀번호를 정하기 전 세션(첫 전환·초기화)이면 어느 페이지든 비밀번호 화면으로
	if (res?.mustChange && body.action !== 'login' && !location.pathname.startsWith(passwordUrl)) { // login은 토큰 저장 후 login.astro가 보냄
		location.href = `${passwordUrl}?first`;
		return new Promise(() => {}); // 페이지가 오류 안내(alert 등)를 띄우지 않게 응답을 돌려주지 않음
	}
	return res;
};

// 로그아웃: Worker면 서버 세션도 끝냄(페이지를 떠나도 보내지게 keepalive). Apps Script 토큰은 서버에 저장이 없어 지우기만
export const logout = () => {
	const token = store.get();
	if (token && club.workerApi) fetch(club.workerApi, { method: 'POST', body: JSON.stringify({ action: 'logout', token }), keepalive: true }).catch(() => {});
	store.clear();
};

// 드라이브가 크기를 줄여 주는 이미지 주소 (폴더가 '링크가 있는 모든 사용자' 공유여야 보임)
export const driveImg = (id: string, w: number) => `https://lh3.googleusercontent.com/d/${encodeURIComponent(id)}=w${w}`;
// 프로필 사진: 드라이브 파일 id 또는 시트에 저장된 작은 사진('data:image/jpeg…')
export const photoSrc = (photo: string, w: number) => (photo.startsWith('data:image/') ? photo : driveImg(photo, w));

// 갤러리 사진 목록: 이 브라우저에 저장해 두고 다시 열 때 바로 보여 줌 (Apps Script 응답이 1~2초라)
// 저장본이 10분 지났으면 보여 주는 동시에 뒤에서 새로 받아 둠 → 새 사진은 그다음 방문에 (서버도 5분 캐시)
type Photo = { id: string; caption: string };
const GKEY = 'fs-gallery';
const GTTL = 10 * 60 * 1000;
const fetchPhotos = async (): Promise<Photo[] | null> => {
	const res = await call({ action: 'gallery' }).catch(() => null);
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

	// 로그인 상태면 LOGIN → LOGOUT
	const btn = nav.querySelector<HTMLAnchorElement>('.nav-join');
	if (btn && store.get()) {
		btn.textContent = 'LOGOUT';
		btn.href = `${base}/`;
		btn.removeAttribute('aria-current');
		btn.addEventListener('click', logout);
	}
}
