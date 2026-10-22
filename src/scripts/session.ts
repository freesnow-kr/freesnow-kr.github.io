// 에디토리얼 페이지 공통: 헤더 동작 + 회원 로그인 상태
import { club } from '../data/club';

export const base = import.meta.env.BASE_URL;
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

// text/plain POST → CORS 사전요청 없이 Apps Script 호출 (Content-Type 헤더 붙이지 말 것)
export const call = async (body: object) =>
	(await fetch(club.membersApi, { method: 'POST', body: JSON.stringify(body) })).json();

// 드라이브가 크기를 줄여 주는 이미지 주소 (폴더가 '링크가 있는 모든 사용자' 공유여야 보임)
export const driveImg = (id: string, w: number) => `https://lh3.googleusercontent.com/d/${encodeURIComponent(id)}=w${w}`;
// 프로필 사진: 드라이브 파일 id 또는 시트에 저장된 작은 사진('data:image/jpeg…')
export const photoSrc = (photo: string, w: number) => (photo.startsWith('data:image/') ? photo : driveImg(photo, w));

// 갤러리 사진 목록: 이 브라우저에 10분 저장 → 다시 열 때 바로 보임 (서버도 5분 캐시)
type Photo = { id: string; caption: string };
const GKEY = 'fs-gallery';
const GTTL = 10 * 60 * 1000;
export const galleryPhotos = async (): Promise<Photo[] | null> => {
	let saved: { t: number; photos: Photo[] } | null = null;
	try { saved = JSON.parse(localStorage.getItem(GKEY) || 'null'); } catch {}
	if (saved && Date.now() - saved.t < GTTL) return saved.photos;
	const res = await call({ action: 'gallery' }).catch(() => null);
	if (!res?.ok) return saved?.photos ?? null; // 서버 오류면 예전 목록이라도
	try { localStorage.setItem(GKEY, JSON.stringify({ t: Date.now(), photos: res.photos })); } catch {}
	return res.photos;
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
		matchMedia('(min-width: 1181px)').addEventListener('change', () => setOpen(false));
	}

	// 로그인 상태면 LOGIN → LOGOUT
	const btn = nav.querySelector<HTMLAnchorElement>('.nav-join');
	if (btn && store.get()) {
		btn.textContent = 'LOGOUT';
		btn.href = `${base}/`;
		btn.removeAttribute('aria-current');
		btn.addEventListener('click', () => store.clear());
	}
}
