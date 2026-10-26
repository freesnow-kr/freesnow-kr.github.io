// 카톡 오픈채팅 내보내기 CSV(Date,User,Message) → 닉네임별 메시지 수. 운영진 화면(/admin)에서 브라우저가 세고 결과만 서버로
// (예전 Apps Script parseChat과 같은 규칙. 메시지 내용은 서버로 안 보냄)
// 닉네임 '이름/96/구리/…'은 이름/나이가 같으면 한 사람으로 묶고 마지막 닉네임으로 표시 (모든 달 같은 이름)
const SKIP_USERS = ['방장봇'];
const SYSTEM = /님이 (들어왔습니다|나갔습니다)|님을 내보냈습니다|채팅방 관리자가/;

type Rank = { name: string; count: number };
export type ChatStats = { from: string; to: string; total: number; ranks: Rank[]; months: { month: string; total: number; ranks: Rank[] }[] };

export function parseChat(text: string): ChatStats {
	const rows = parseCsv(String(text).replace(/^﻿/, ''));
	const names: Record<string, string> = {}, all: Record<string, number> = {}, months: Record<string, Record<string, number>> = {};
	let from = '', to = '';
	rows.slice(1).forEach(([date, user, msg]) => {
		user = String(user || '').trim();
		if (!user || SKIP_USERS.includes(user) || SYSTEM.test(msg || '')) return;
		const parts = user.split('/');
		const id = parts.length > 1 && /^\d{2,4}$/.test(parts[1].trim()) ? parts[0].trim() + '/' + parts[1].trim() : user;
		names[id] = user;
		const day = String(date).slice(0, 10);
		const m = (months[day.slice(0, 7)] ||= {});
		all[id] = (all[id] || 0) + 1;
		m[id] = (m[id] || 0) + 1;
		if (!from || day < from) from = day;
		if (day > to) to = day;
	});
	const rank = (counts: Record<string, number>) => {
		const ranks = Object.keys(counts).map((id) => ({ name: names[id], count: counts[id] })).sort((a, b) => b.count - a.count);
		return { total: ranks.reduce((s, r) => s + r.count, 0), ranks };
	};
	const byMonth = Object.keys(months).sort().reverse().map((month) => ({ month, ...rank(months[month]) }));
	return { from, to, ...rank(all), months: byMonth };
}

// 따옴표 안 쉼표, 줄바꿈, "" 처리. 머리글이 탭으로 나뉘어 있으면 탭 구분
function parseCsv(text: string): string[][] {
	const sep = /^[^\n]*\t/.test(text) ? '\t' : ',';
	const rows: string[][] = [];
	let row: string[] = [], cell = '', q = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (q) {
			if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
			else if (c === '"') q = false;
			else cell += c;
		} else if (c === '"' && cell === '') q = true;
		else if (c === sep) row.push(cell), (cell = '');
		else if (c === '\n' || c === '\r') {
			if (c === '\r' && text[i + 1] === '\n') i++;
			row.push(cell), rows.push(row), (row = []), (cell = '');
		} else cell += c;
	}
	if (cell || row.length) row.push(cell), rows.push(row);
	return rows;
}
