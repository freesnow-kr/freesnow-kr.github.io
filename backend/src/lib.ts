// 공통 도구: 전화번호, 시각, 암호 (WebCrypto만 — 외부 라이브러리 없음)

// 010-1234-5678 / 01012345678 / 12345678(010 생략 아이디) / 1012345678(시트가 앞 0을 지움) / +82 10… → 01012345678

// 휴대폰 번호: 숫자만 01012345678. 010 뺀 8자리, 010-1234-5678, +82 10…도 받음. 형식이 틀리면 ''
export function normPhone(v: unknown): string {
	let d = String(v ?? '').replace(/\D/g, '');
	if (d.startsWith('8210') && d.length >= 12) d = '0' + d.slice(2);
	if (d.length === 8) d = '010' + d;
	return /^01[016789]\d{7,8}$/.test(d) ? d : '';
}

// 가입 동의 기록에 남기는 개인정보처리방침 시행일 — src/pages/privacy.astro의 시행일을 바꾸면 같이.
// 그 판의 동의 문구는 DB consent_terms(version = 이 값, 0020)에 보관 — 가입 화면 문구를 바꾸면 새 version 줄을 더하는 migration도 (테스트가 확인)
export const POLICY_VERSION = '2026-10-26';

// 출격, 시즌방 명단 이름: 성 빼고 이름만 (사용자 요구 2026-10-26) — 홍길동 → 길동, 김철 → 철, 네 글자 이상(남궁민수)은 끝 두 글자
export function givenName(name: string): string {
	const c = [...name.trim()];
	return c.length >= 4 ? c.slice(-2).join('') : c.length >= 2 ? c.slice(1).join('') : c.join('');
}

// 채팅 랭킹 이름 가리기 (사용자 요구 2026-10-26): 닉네임 '홍길동/90/고양' → 홍*동 (나이, 지역은 뺌), 두 글자는 홍*
export function maskName(nick: string): string {
	const c = [...nick.split('/')[0].trim()];
	return c.length <= 1 ? c.join('') : c[0] + '*'.repeat(Math.max(1, c.length - 2)) + (c.length > 2 ? c.at(-1) : '');
}
// 집계 {ranks, months:[{ranks}]}의 이름을 모두 가림 (이미 가린 이름은 그대로)
export const maskRanks = <T extends { ranks: { name: string }[]; months: { ranks: { name: string }[] }[] }>(v: T): T => {
	const m = (r: { name: string }[]) => r.map((x) => ({ ...x, name: maskName(x.name) }));
	return { ...v, ranks: m(v.ranks), months: v.months.map((x) => ({ ...x, ranks: m(x.ranks) })) };
};

export const iso = (d: Date) => d.toISOString();

// 시즌 = 7/1 ~ 6/30 (한국 시간): 2026-12-13 → '26-27'
export function seasonOf(d: Date) {
	const k = new Date(d.getTime() + 9 * 3600e3);
	const s = (k.getUTCMonth() >= 6 ? k.getUTCFullYear() : k.getUTCFullYear() - 1) % 100;
	return `${String(s).padStart(2, '0')}-${String((s + 1) % 100).padStart(2, '0')}`;
}
// 시즌 첫날, 끝날 ('26-27' → '2026-07-01', '2027-06-30')
export const seasonRange = (season: string) => [`20${season.slice(0, 2)}-07-01`, `20${season.slice(3)}-06-30`] as const;

// 시즌방 정산: 숙박 1박 / 4시간 휴식, 시즌방 주주는 빠짐
export const ROOM_PRICES = { 숙박: 10000, 휴식: 5000 };
export const later = (d: Date, ms: number) => new Date(d.getTime() + ms);

// 로그인 이력에 남기는 IP: 앞부분만 (203.0.113.x / 2001:db8:1::x)
export function maskIp(ip: string): string {
	if (!ip) return '';
	if (ip.includes(':')) return ip.split(':').slice(0, 3).join(':') + '::x';
	return ip.split('.').slice(0, 3).join('.') + '.x';
}

const enc = new TextEncoder();
const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export const randomB64 = (n: number) => b64(crypto.getRandomValues(new Uint8Array(n)));
// 세션 토큰: 주소, 헤더에 그대로 쓰게 URL-safe
export const randomToken = () => randomB64(32).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const sha256 = async (s: string) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));

export async function hmac(secret: string, s: string): Promise<string> {
	if (!secret) throw new Error('LOGIN_KEY_SECRET 이 비어 있어요.');
	const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	return hex(await crypto.subtle.sign('HMAC', key, enc.encode(s)));
}

// 반복 횟수: 로컬 workerd에서 10만 회 ≈ 6ms(2026-10-23, Mac). 무료 플랜 CPU는 요청당 10ms라 실제 Cloudflare에서 다시 잴 것.
// 예전 Workers는 10만 회 넘는 값을 거부했다고 알려져 있음(로컬에선 통과) → 10만을 넘기지 말 것. 바꿔도 예전 해시는 행마다 저장된 iter로 확인됨
export const PBKDF2_ITER = 100_000;

export async function pbkdf2(password: string, salt: string, iter: number): Promise<string> {
	const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
	return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(salt), iterations: iter }, key, 256));
}

// 길이가 달라도 같은 시간 (비밀번호, 초기화 비밀번호 비교)
export function safeEqual(a: string, b: string): boolean {
	const x = enc.encode(a), y = enc.encode(b);
	let diff = x.length ^ y.length;
	for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
	return diff === 0;
}

// 휴대폰 번호 보관 (사용자 결정 2026-10-26: 아이디 = 010 뺀 휴대폰 번호, 화면 어디에도 안 보이고 DB엔 번호 그대로 안 둠)
// secret PHONE_KEY 하나에서 두 키를 만듦 — 잃으면 아무도 휴대폰으로 로그인 못 하고 비상 연락처도 못 풂 → 따로 백업
//   phoneKey: 로그인, 중복 가입 확인용 HMAC (되돌릴 수 없음). 번호는 1억 가지뿐이라 키 없는 해시는 금방 풀려서 꼭 비밀키로
//   sealPhone/openPhone: 비상 연락처(선택 동의한 회원만)용 AES-GCM — 운영진 화면에서만 풂
async function subKey(secret: string, label: string): Promise<ArrayBuffer> {
	if (!secret) throw new Error('PHONE_KEY 가 비어 있어요.');
	const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	return crypto.subtle.sign('HMAC', key, enc.encode(label));
}
export async function phoneKey(secret: string, phone: string): Promise<string> {
	const key = await crypto.subtle.importKey('raw', await subKey(secret, 'phone-id'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	return hex(await crypto.subtle.sign('HMAC', key, enc.encode(phone)));
}
const aesKey = async (secret: string) => crypto.subtle.importKey('raw', await subKey(secret, 'phone-enc'), 'AES-GCM', false, ['encrypt', 'decrypt']);
export async function sealPhone(secret: string, phone: string): Promise<string> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret), enc.encode(phone)));
	return b64(new Uint8Array([...iv, ...ct]));
}
export async function openPhone(secret: string, sealed: string | null): Promise<string> {
	if (!sealed) return '';
	const all = unb64(sealed);
	return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, await aesKey(secret), all.slice(12)));
}
