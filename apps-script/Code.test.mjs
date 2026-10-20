// Code.gs 로컬 검증: node apps-script/Code.test.mjs
// Apps Script 전역(SpreadsheetApp 등)을 흉내 내서 로그인·잠금·토큰·가입·승인을 확인
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const code = readFileSync(new URL('./Code.gs', import.meta.url), 'utf8');
const b64 = (x) => Buffer.from(x).toString('base64url');
// vm 안에서 만든 배열·객체는 realm이 달라서 값만 비교
const plain = (x) => JSON.parse(JSON.stringify(x));

// 시트 탭 흉내 (행·열 1부터)
function tab(name, rows) {
	const width = () => Math.max(0, ...rows.map((r) => r.length));
	const t = {
		rows,
		notes: {},
		validations: [],
		getName: () => name,
		getDataRange: () => ({ getValues: () => rows.map((r) => [...r, ...Array(width() - r.length).fill('')]) }),
		appendRow: (r) => rows.push([...r]),
		setFrozenRows: () => {},
		getLastRow: () => rows.length,
		getMaxRows: () => Math.max(rows.length, 1000),
		insertRowAfter: (n) => rows.splice(n, 0, Array(width()).fill('')),
		getRange: (r, c, nr = 1, nc = 1) => ({
			getSheet: () => t,
			getRow: () => r,
			getColumn: () => c,
			getNumRows: () => nr,
			getValue: () => (rows[r - 1] ?? [])[c - 1] ?? '',
			getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (rows[r - 1 + i] ?? [])[c - 1 + j] ?? '')),
			setValues: (v) => v.forEach((line, i) => { rows[r - 1 + i] ??= []; line.forEach((x, j) => (rows[r - 1 + i][c - 1 + j] = x)); }),
			setValue: (x) => { rows[r - 1] ??= []; rows[r - 1][c - 1] = x; },
			setFormulas: (v) => v.forEach((line, i) => { rows[r - 1 + i] ??= []; line.forEach((x, j) => (rows[r - 1 + i][c - 1 + j] = x)); }),
			setNote: (n) => (t.notes[`${r},${c}`] = n),
			setDataValidation: (dv) => t.validations.push({ r, c, nr, dv }),
		}),
	};
	return t;
}

function load(tabs) {
	const cache = new Map();
	const chain = { requireValueInList: (l) => ((chain.list = l), chain), setAllowInvalid: () => chain, build: () => ({ list: [...chain.list] }) };
	const ctx = {
		SpreadsheetApp: {
			getActiveSpreadsheet: () => ({
				getSheetByName: (n) => tabs.find((t) => t.getName() === n) ?? null,
				getSheets: () => tabs,
				insertSheet: (n) => { const t = tab(n, []); tabs.push(t); return t; },
			}),
			newDataValidation: () => chain,
		},
		LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
		CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) ?? null, put: (k, v) => cache.set(k, v), remove: (k) => cache.delete(k) }) },
		PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'test-secret' }) },
		Session: { getScriptTimeZone: () => 'Asia/Seoul' },
		Utilities: {
			base64EncodeWebSafe: b64,
			base64DecodeWebSafe: (s) => Buffer.from(s, 'base64url'),
			newBlob: (bytes) => ({ getDataAsString: () => Buffer.from(bytes).toString() }),
			computeHmacSha256Signature: (s, k) => createHmac('sha256', k).update(s).digest(),
		},
		ContentService: { createTextOutput: (s) => ({ setMimeType: () => JSON.parse(s) }), MimeType: { JSON: 'json' } },
	};
	vm.createContext(ctx);
	vm.runInContext(code, ctx);
	return { ctx, call: (body) => ctx.doPost({ postData: { contents: JSON.stringify(body) } }) };
}

// No 칸 값: '=ROW()-n' 수식이면 행 번호로 계산 (i = 0부터 센 줄)
const noValue = (rows, i) => { const m = /^=ROW\(\)-(\d+)$/.exec(String(rows[i][0])); return m ? i + 1 - Number(m[1]) : rows[i][0]; };

const HEAD = ['No', '구분', '거주지', '이름', '성별', '나이', '(생일)월', '(생일)일', '비상연락망', '비공개연락처'];

// ══ 1. 로그인 · 내 정보 · 회원가입 ══
{
	// 실제 양식과 같은 구조의 가짜 데이터 (제목 줄 + 머리글 + 빈 줄). 탭 이름이 달라 '첫 탭' 대체 동작도 확인
	const sheet = [
		['프리스노우 회원명부'],
		HEAD,
		[1, '운영진', '마포구', '테스트일', '남', 1996, 2, 11, '010-1234-5678', '비밀메모'],
		[2, '', '춘천', '테스트이', '여', '2000', '1', '5', 1098765432, ''], // 숫자로 저장돼 앞 0 빠진 번호, 문자 숫자
		[3, '회원', '구리', '생일없음', '남', '', '', '', '010-5555-6666', ''],
		['', '', '', '', '', '', '', '', '', ''],
	];
	const tabs = [tab('시트1', sheet)];
	const { ctx, call } = load(tabs);

	// 로그인 성공 (하이픈 있든 없든)
	const ok = call({ action: 'login', phone: '01012345678', birth: '1996-02-11' });
	assert.equal(ok.ok, true);
	assert.equal(ok.name, '테스트일');

	// 82로 시작하는 아이디는 국가번호로 오해하지 않음, +82 10… 은 국가번호
	assert.equal(ctx.normPhone('82220001'), '01082220001');
	assert.equal(ctx.normPhone('+82 10-1234-5678'), '01012345678');
	// 아이디 = 010 뺀 8자리
	assert.equal(call({ action: 'login', phone: '12345678', birth: '19960211' }).ok, true);
	assert.equal(call({ action: 'login', phone: '1234-5678', birth: '19960211' }).ok, true);
	assert.match(call({ action: 'login', phone: '12345678', birth: '1' }).error, /아이디와 비밀번호/);

	// 앞 0 빠진 번호 + 한 자리 월·일 → 20000105
	assert.equal(call({ action: 'login', phone: '010-9876-5432', birth: '20000105' }).ok, true);

	// 생일 칸 비어 있으면 로그인 불가 (빈 생일로 뚫리지 않게)
	assert.equal(call({ action: 'login', phone: '01055556666', birth: '00000000' }).ok, false);

	// 내 정보: 본인 것만, 생일·성별·비공개연락처 없음, 다른 회원 없음
	const mine = call({ action: 'me', token: ok.token });
	assert.equal(mine.ok, true);
	assert.deepEqual(plain(mine.me), { name: '테스트일', grade: '운영진', area: '마포구', phone: '010-1234-5678' });
	assert.deepEqual(Object.keys(mine), ['ok', 'me']);
	const raw = JSON.stringify(mine);
	for (const secret of ['1996', '19960211', '비밀메모', '남', '여', '테스트이', '5432', '6666', '춘천']) assert.ok(!raw.includes(secret), `노출 금지: ${secret}`);

	// 구분 비어 있으면 '회원'
	const t2 = call({ action: 'login', phone: '01098765432', birth: '20000105' }).token;
	assert.equal(call({ action: 'me', token: t2 }).me.grade, '회원');

	// 예전 명단 요청은 거부
	assert.equal(call({ action: 'members', token: ok.token }).ok, false);

	// 위조·변조 토큰 거부
	assert.equal(call({ action: 'me', token: 'abc.def' }).ok, false);
	const [p, sig] = ok.token.split('.');
	assert.equal(call({ action: 'me', token: b64('01098765432|9999999999999') + '.' + sig }).ok, false);
	assert.equal(call({ action: 'me', token: p + '.' + b64('x') }).ok, false);

	// 5번 틀리면 맞는 생일도 잠김
	for (let i = 0; i < 5; i++) assert.equal(call({ action: 'login', phone: '01012345678', birth: '19990101' }).ok, false);
	const locked = call({ action: 'login', phone: '01012345678', birth: '19960211' });
	assert.equal(locked.ok, false);
	assert.match(locked.error, /1시간/);

	// 시트에서 지운 회원은 토큰이 있어도 차단
	sheet.splice(2, 1);
	assert.equal(call({ action: 'me', token: ok.token }).expired, true);

	// 회원가입
	const form = { agree: true, name: '신규', gender: '여', year: '1999', month: '3', day: '7', sido: '경기도', sigungu: '성남시', phone: '22223333' };
	assert.match(call({ action: 'signup', ...form, agree: false }).error, /동의/);
	assert.match(call({ action: 'signup', ...form, name: ' ' }).error, /빈 칸/);
	assert.match(call({ action: 'signup', ...form, sido: '' }).error, /빈 칸/);
	assert.match(call({ action: 'signup', ...form, month: '13' }).error, /생년월일/);
	assert.match(call({ action: 'signup', ...form, phone: '123' }).error, /연락처/);
	assert.match(call({ action: 'signup', ...form, phone: '010-9876-5432' }).error, /이미/); // 이미 회원
	assert.deepEqual(plain(call({ action: 'signup', ...form })), { ok: true });
	const applyTab = tabs.find((t) => t.getName() === '가입신청');
	const apply = applyTab.rows;
	assert.deepEqual(plain(apply[0]), ['신청일시', '이름', '성별', '나이', '(생일)월', '(생일)일', '시도', '거주지', '비상연락망', '상태']);
	assert.deepEqual(plain(apply[1].slice(1)), ['신규', '여', 1999, 3, 7, '경기도', '성남시', '010-2222-3333', '대기']);
	// 상태 열(10번째) 2행~끝 전체가 대기/승인 선택식, 신청 들어올 때마다 다시 적용
	const dd = applyTab.validations.filter((v) => v.c === 10 && v.r === 2 && v.nr > 1 && plain(v.dv.list).join() === '대기,승인');
	assert.ok(dd.length >= 2);
	assert.match(call({ action: 'signup', ...form }).error, /이미/); // 중복 신청
	// 수식 주입 방지
	call({ action: 'signup', ...form, phone: '33334444', name: '=HYPERLINK("x")' });
	assert.equal(apply[2][1], `'=HYPERLINK("x")`);
	// 봇(숨은 칸) → 저장 안 함
	const before = apply.length;
	assert.equal(call({ action: 'signup', ...form, phone: '44445555', website: 'spam' }).ok, true);
	assert.equal(apply.length, before);
	// 가입신청 탭이 생겨도 로그인은 회원 탭에서만 (신청자는 로그인 불가)
	assert.equal(call({ action: 'login', phone: '22223333', birth: '19990307' }).ok, false);
}

// ══ 2. 승인 → 회원현황: 구분 = 시도, 운영진·마스터 행은 그대로, 같은 시도·거주지 아래 ══
{
	// 실제 회원현황과 같은 배치(예전 구분 이름 그대로), 이름·번호는 가짜
	let n = 0;
	const m = (grade, area) => [++n, grade, area, `회원${n}`, '남', 1990, 1, 1, `010-7000-${String(n).padStart(4, '0')}`, ''];
	const roster = [
		['프리스노우 회원명부'],
		HEAD,
		m('운영진', '양주'), m('운영진', '마포구'), // 거주지가 겹쳐도 이 아래로 끼우면 안 됨
		m('마스터', '남양주'),
		m('서울', '노원구'), m('서울', '노원구'), m('서울', '성북구'),
		m('경기북부', '의정부'), m('경기북부', '의정부'), m('경기북부', '남양주'), m('경기북부', '구리'), m('경기북부', '하남'),
		m('경기남부', '부천'),
		m('인천광역', '인천'),
		m('강원도', '춘천'), m('강원도', '춘천'),
		[], [],
	];
	const fixedBefore = plain(roster.slice(0, 5)); // 제목·머리글·운영진·마스터
	const members = tab('회원현황', roster);
	const tabs = [tab('안내', [['아무 내용']]), members]; // 회원현황이 첫 탭이 아니어도 이름으로 찾음
	const { ctx, call } = load(tabs);

	const people = [
		{ name: '의정부신청', sido: '경기도', sigungu: '의정부시', phone: '81110001' }, // 경기북부 의정부 아래
		{ name: '양주신청', sido: '경기도', sigungu: '양주시', phone: '81110002' }, // 운영진 양주 아님 → 경기북부 블록 끝
		{ name: '남양주신청', sido: '경기도', sigungu: '남양주시', phone: '81110003' }, // 마스터 남양주 아님 → 경기북부 남양주 아래
		{ name: '마포신청', sido: '서울특별시', sigungu: '마포구', phone: '81110004' }, // 운영진 마포구 아님 → 서울 블록 끝
		{ name: '부평신청', sido: '인천광역시', sigungu: '부평구', phone: '81110005' }, // 인천 블록 끝
		{ name: '원주신청', sido: '강원특별자치도', sigungu: '원주시', phone: '81110006' }, // 강원 블록 끝
		{ name: '제주신청', sido: '제주특별자치도', sigungu: '제주시', phone: '81110007' }, // 시도 블록 없음 → 맨 끝
	];
	for (const p of people) assert.equal(call({ action: 'signup', agree: true, gender: '여', year: '1995', month: '5', day: '20', ...p }).ok, true);
	const applyTab = tabs.find((t) => t.getName() === '가입신청');

	const approve = (row) => {
		applyTab.getRange(row, 10).setValue('승인');
		ctx.onEdit({ range: applyTab.getRange(row, 10) });
		return applyTab.notes[`${row},10`];
	};
	const line = (name) => roster.find((r) => r[3] === name);
	const pos = (name) => roster.findIndex((r) => r[3] === name);

	for (let r = 2; r <= 8; r++) assert.match(approve(r), /추가/);

	// 운영진·마스터 행(위치·내용·No) 그대로
	assert.deepEqual(plain(roster.slice(0, 5)), fixedBefore);

	// 구분 = 신청한 시도, 거주지 = 시군구(시·군 뗌)
	assert.deepEqual(plain(line('의정부신청').slice(1, 9)), ['경기도', '의정부', '의정부신청', '여', 1995, 5, 20, '010-8111-0001']);
	assert.equal(pos('의정부신청'), pos('회원8') + 1); // 회원7·8이 경기북부 의정부
	assert.equal(pos('남양주신청'), pos('회원9') + 1); // 경기북부 남양주 아래 (마스터 남양주 아래 아님)
	assert.equal(pos('양주신청'), pos('회원11') + 1); // 양주 = 북부 → 경기북부 블록 끝(하남), 남부(부천) 아래 아님
	assert.deepEqual(plain(line('마포신청').slice(1, 3)), ['서울특별시', '마포구']);
	assert.equal(pos('마포신청'), pos('회원6') + 1);
	assert.deepEqual(plain(line('부평신청').slice(1, 3)), ['인천광역시', '부평구']);
	assert.equal(pos('부평신청'), pos('회원13') + 1);
	assert.equal(pos('원주신청'), pos('회원15') + 1);
	assert.equal(line('제주신청')[1], '제주특별자치도');
	assert.equal(pos('제주신청'), Math.max(...roster.map((r, i) => (r[3] ? i : -1)))); // 맨 끝

	// No: 운영진·마스터(1~3)는 원래 숫자 그대로, 그 아래는 =ROW()-2 수식 → 행 번호대로 4, 5, 6 …
	const used = roster.map((r, i) => i).filter((i) => i >= 2 && roster[i][1]);
	assert.deepEqual(used.map((i) => noValue(roster, i)), used.map((_, k) => k + 1));
	assert.deepEqual(plain(roster.slice(2, 5).map((r) => r[0])), [1, 2, 3]);
	assert.ok(roster.slice(5).filter((r) => r[1]).every((r) => r[0] === '=ROW()-2'));
	assert.equal(line('의정부신청')[9], ''); // 비공개연락처는 비워 둠

	// 승인 → 대기 → 승인 해도 두 번 안 들어감
	const count = roster.length;
	applyTab.getRange(2, 10).setValue('대기');
	ctx.onEdit({ range: applyTab.getRange(2, 10) });
	assert.match(approve(2), /이미/);
	assert.equal(roster.length, count);

	// 다른 칸·다른 탭 편집은 무시
	ctx.onEdit({ range: applyTab.getRange(3, 2) });
	ctx.onEdit({ range: members.getRange(5, 9) });
	assert.equal(roster.length, count);

	// 시도 없는 예전 신청 줄은 추가하지 않음
	assert.match(ctx.approve({ 이름: '예전', 거주지: '의정부', 비상연락망: '010-8111-0099' }), /시도/);
	assert.equal(roster.length, count);

	// 승인된 사람은 이제 로그인 가능
	assert.equal(call({ action: 'login', phone: '81110001', birth: '19950520' }).ok, true);

	// 시도 비교 키
	for (const [a, b] of [['서울특별시', '서울'], ['서울', '서울'], ['경기도', '경기'], ['경기북부', '경기'], ['강원특별자치도', '강원'], ['강원도', '강원'], ['인천광역', '인천'], ['충청북도', '충북'], ['충청남도', '충남']]) assert.equal(ctx.sidoKey(a), b);
	for (const [a, b] of [['의정부시', '의정부'], ['가평군', '가평'], ['노원구', '노원구'], ['-', '-']]) assert.equal(ctx.normArea(a), b);
}

// ══ 3. 이름 없이 구분·거주지만 채운 줄이 섞여 있어도 자리 찾기 (실제 테스트 시트 상황) ══
{
	const r = (grade, area, name = '') => ['', grade, area, name, '', '', '', '', '', ''];
	const roster = [
		['프리스노우 회원명부'], HEAD,
		r('운영진', '양주', '운영1'), r('마스터', '인천', '마스터1'),
		r('서울', '중랑구', '서울1'), r('서울', '노원구'), r('서울', '-'),
		r('경기북부', '의정부'), r('경기북부', '양주'), r('경기남부', '부천'), r('경기남부', '화성'),
		r('강원도', '춘천'),
	];
	roster[2][0] = 1; // 운영진·마스터 No는 시트에 이미 있음 (코드는 이 행을 안 씀)
	roster[3][0] = 2;
	const tabs = [tab('회원현황', roster)];
	const { ctx, call } = load(tabs);
	assert.equal(call({ action: 'signup', agree: true, name: '김포신청', gender: '남', year: '1990', month: '1', day: '1', sido: '경기도', sigungu: '김포시', phone: '82220001' }).ok, true);
	const applyTab = tabs.find((t) => t.getName() === '가입신청');
	applyTab.getRange(2, 10).setValue('승인');
	ctx.onEdit({ range: applyTab.getRange(2, 10) });
	const at = roster.findIndex((x) => x[3] === '김포신청');
	assert.deepEqual(plain(roster[at - 1].slice(1, 3)), ['경기북부', '양주']); // 김포 = 경기북부 → 북부 블록 끝 (남부 아래 아님)
	assert.deepEqual(plain(roster[at + 1].slice(1, 3)), ['경기남부', '부천']);
	// 북부 목록에 없는 경기 지역 → 경기남부 블록 끝
	assert.equal(call({ action: 'signup', agree: true, name: '수원신청', gender: '남', year: '1990', month: '1', day: '1', sido: '경기도', sigungu: '수원시', phone: '82220002' }).ok, true);
	applyTab.getRange(3, 10).setValue('승인');
	ctx.onEdit({ range: applyTab.getRange(3, 10) });
	const sw = roster.findIndex((x) => x[3] === '수원신청');
	assert.deepEqual(plain(roster[sw - 1].slice(1, 3)), ['경기남부', '화성']);
	assert.deepEqual(plain(roster[sw + 1].slice(1, 3)), ['강원도', '춘천']);
	// 구분이 '경기도'로만 된 줄도 거주지로 북부/남부 판단
	assert.equal(ctx.gyeonggiZone('경기도', '김포'), '북부');
	assert.equal(ctx.gyeonggiZone('경기도', '부천'), '남부');
	assert.equal(ctx.gyeonggiZone('경기북부', '부천'), '북부');
	assert.deepEqual(roster.slice(2).map((_, k) => noValue(roster, k + 2)), roster.slice(2).map((_, k) => k + 1)); // No = 행 번호 기준
}

console.log('ok: Code.gs 로그인·잠금·토큰·본인정보·회원가입·드롭다운·승인 배치(운영진·마스터 보호) 검증 통과');
