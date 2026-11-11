// 데크 사이즈 참고 계산 (SHRED LOG GEAR 탭). snowthing 코드가 아니라 아래 공식 표로 직접 만듦 (사용자 결정 2026-11-11)
// 길이: Jones 공식 사이즈 안내, 남녀 공용 성인 체중표 (2026-11-11 확인) — [최소 kg, 최대 kg, 짧은 cm, 긴 cm]
const TABLE: [number, number, number, number][] = [
	[34, 45, 137, 143], [43, 50, 140, 145], [47, 54, 142, 147], [52, 58, 144, 149], [56, 63, 146, 151],
	[61, 68, 148, 153], [65, 72, 150, 155], [70, 77, 152, 157], [74, 81, 154, 159], [79, 86, 156, 161],
	[83, 91, 158, 163], [88, 95, 160, 165], [92, 99, 162, 167], [97, 104, 164, 169],
];
// 폭: 부츠 한국 mm(= Mondo, Burton 표에서 280 = 미국 남성 10) → Jones 표의 최소 허리 폭 cm. 280mm부터 와이드
const WIDE: [number, number][] = [[325, 27.8], [320, 27.5], [315, 27.3], [310, 27.1], [305, 26.9], [300, 26.7], [295, 26.5], [290, 26.3], [285, 26.1], [280, 25.9]];

export type Deck = { kind: 'kids' } | { kind: 'big' } | { kind: 'ok'; lo: number; hi: number; picks: [number, number][] };

// 체중이 걸치는 구간을 모두 합친 범위를 짧게, 중간(추천), 길게로 3등분 (Jones: 두 구간에 걸치면 가운데)
export function deckSize(kg: number): Deck {
	const w = Math.round(kg);
	if (w < 34) return { kind: 'kids' };
	if (w >= 105) return { kind: 'big' };
	const rows = TABLE.filter(([a, b]) => w >= a && w <= b);
	const lo = Math.min(...rows.map((r) => r[2]));
	const hi = Math.max(...rows.map((r) => r[3]));
	const n = hi - lo + 1;
	const mid = Math.floor(n / 3);
	const a = lo + Math.ceil((n - mid) / 2);
	const b = a + mid;
	return { kind: 'ok', lo, hi, picks: [[lo, a - 1], [a, b - 1], [b, hi]] };
}

export const wideWaist = (mm: number) => WIDE.find(([m]) => mm >= m)?.[1] ?? null;
export const span = ([a, b]: [number, number]) => (a === b ? `${a}` : `${a}–${b}`);
