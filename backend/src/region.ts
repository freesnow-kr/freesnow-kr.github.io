// 회원 지역(members.region) 이름 맞추기: '경기북부', '서울', '충북' … (거주지와 같이 보이면 '경기북부 구리')
// 주어진 값이 지역이면 그걸 짧게, 비었거나 운영진, 마스터(예전 시트 '구분')면 거주지로 시도를 찾음 (가입 목록 src/data/regions.json)
// 가입 승인 때(신청한 시도 → 지역)와 예전 데이터를 고칠 때 씀
// 경기는 동호회 기준 북부, 남부로 (Apps Script GYEONGGI_NORTH와 같음), 시도는 짧게(서울특별시 → 서울, 충청북도 → 충북)
import regions from '../../src/data/regions.json' with { type: 'json' };

const GYEONGGI_NORTH = ['의정부', '남양주', '구리', '양주', '포천', '동두천', '가평', '고양', '파주', '연천', '하남', '김포'];
const SHORT: Record<string, string> = { 충청북도: '충북', 충청남도: '충남', 경상북도: '경북', 경상남도: '경남', 전라북도: '전북', 전북특별자치도: '전북', 전라남도: '전남', 전남광주통합특별시: '전남' };
// '구리시' → 구리, '가평군' → 가평, '노원구' 그대로 (승인 때 normArea와 같은 규칙)
const bare = (a: string) => (a.length > 2 ? a.replace(/[시군]$/, '') : a);

export function regionOf(given: string, area: string): string {
	const g = (given ?? '').trim();
	const a = bare((area ?? '').trim());
	let sido = g && !['운영진', '마스터', '회원'].includes(g) ? g : '';
	if (!sido && a) {
		// 거주지 이름이 한 시도에만 있을 때만 (중구, 동구처럼 여러 곳이면 모름)
		const hits = Object.entries(regions as Record<string, string[]>).filter(([, list]) => list.some((x) => bare(x) === a));
		if (hits.length === 1) sido = hits[0][0];
	}
	if (!sido) return '';
	if (sido.startsWith('경기')) return /북부|남부/.test(sido) ? sido : GYEONGGI_NORTH.includes(a) ? '경기북부' : '경기남부';
	return SHORT[sido] ?? sido.replace(/(특별자치시|특별자치도|특별시|광역시|도)$/, '');
}
