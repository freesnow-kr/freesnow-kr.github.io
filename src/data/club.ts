// 일정·링크는 여기만 고치면 모든 페이지에 반영됨
export const club = {
	name: 'Free Snow',
	joinUrl: 'https://open.kakao.com/o/gkiI7dQb',
	// Apps Script 웹앱 배포 URL (apps-script/Code.gs). 비어 있으면 회원 페이지는 '준비 중'
	membersApi: 'https://script.google.com/macros/s/AKfycbwLMPOxtBqyoYwp6B-s6PQOL4iA0Xeo0snrFmzl7tQFH0uB2kWp1uy0-UXkVhIbhyxk-A/exec',
};

export const trips = [
	{ date: '12.13 토', place: '하이원 리조트', note: '시즌 오픈 첫 정모', tag: '당일' },
	{ date: '01.10 토', place: '용평 리조트', note: '숙소 공동 예약', tag: '1박 2일' },
	{ date: '02.07 토', place: '휘닉스 평창', note: '초보 강습 데이', tag: '당일' },
];

export const faqs = [
	{ q: '완전 초보도 가입할 수 있나요?', a: '네. 초보 강습 데이가 따로 있고, 상급자 회원이 기초부터 같이 봐드려요.' },
	{ q: '회비가 있나요?', a: '정기 회비는 없고, 정모 때 리프트·숙소·카풀 비용만 나눠 내요.' },
	{ q: '장비가 없어요.', a: '리조트 렌탈로 충분해요. 할인되는 렌탈샵도 공유해 드려요.' },
	{ q: '스키, 보드 둘 다 되나요?', a: '둘 다 환영해요. 슬로프에서는 다 같이 탑니다.' },
];
