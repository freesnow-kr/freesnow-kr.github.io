// 스키장 날씨 (서버 action 'weather' — Open-Meteo, 서버가 1시간 캐시). 메인 TODAY 줄, 웹캠 페이지가 씀
// 브라우저에도 30분 저장해 두고 바로 보여 줌 (지났으면 새로 받음)
import { call } from './session';

export type Day = { date: string; code: number; max: number; min: number; feel: number; snow: number; wind: number };
export type ResortWeather = { id: string; name: string; now: { temp: number; code: number; wind: number }; days: Day[] };

const KEY = 'fs-weather';
export async function weather(): Promise<ResortWeather[]> {
	try {
		const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
		if (saved && Date.now() - saved.t < 30 * 60e3) return saved.resorts;
	} catch {}
	const res = await call({ action: 'weather' }).catch(() => null);
	if (!res?.ok) return [];
	try { localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), resorts: res.resorts })); } catch {}
	return res.resorts;
}

// WMO 날씨 코드 → 아이콘, 한 단어
export function sky(code: number): [string, string] {
	if (code === 0) return ['☀️', '맑음'];
	if (code <= 2) return ['🌤️', '구름 조금'];
	if (code === 3) return ['☁️', '흐림'];
	if (code <= 48) return ['🌫️', '안개'];
	if (code <= 57) return ['🌦️', '이슬비'];
	if (code <= 67) return ['🌧️', '비'];
	if (code <= 77) return ['🌨️', '눈'];
	if (code <= 82) return ['🌧️', '소나기'];
	if (code <= 86) return ['🌨️', '눈'];
	return ['⛈️', '뇌우'];
}

// '−10° / −1°' (마이너스는 보기 좋은 기호로)
export const deg = (n: number) => `${n < 0 ? '−' : ''}${Math.abs(n)}°`;
// '눈 7.3cm' (없으면 '')
export const snow = (cm: number) => (cm > 0 ? `눈 ${cm}cm` : '');
