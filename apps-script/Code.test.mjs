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

function load(tabs, driveFiles = []) {
	let uuid = 0;
	const created = [], trashed = [];
	const props = new Map();
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
		DriveApp: {
			Access: { ANYONE_WITH_LINK: 'anyone' },
			Permission: { VIEW: 'view' },
			getFolderById: (fid) => {
				let k = 0;
				return {
					getId: () => fid,
					getName: () => `폴더 ${fid}`,
					getFiles: () => ({ hasNext: () => k < driveFiles.length, next: () => { const f = driveFiles[k++]; return { getId: () => f.id, getName: () => f.name, getMimeType: () => f.type, getDateCreated: () => new Date(f.t) }; } }),
					createFile: (blob) => { const id = `f${created.length + 1}`; created.push({ id, folder: fid, ...blob }); return { getId: () => id, setSharing: (a, p) => (created.at(-1).sharing = `${a}/${p}`) }; },
				};
			},
			getFoldersByName: () => ({ hasNext: () => false }),
			createFolder: (n) => ctx.DriveApp.getFolderById(`auto-${n}`),
			getFileById: (id) => ({ setTrashed: (v) => v && trashed.push(id) }),
		},
		CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) ?? null, put: (k, v) => cache.set(k, v), remove: (k) => cache.delete(k) }) },
		PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k === 'TOKEN_SECRET' ? 'test-secret' : props.get(k) ?? null), setProperty: (k, v) => props.set(k, v) }) },
		Session: { getScriptTimeZone: () => 'Asia/Seoul' },
		Utilities: {
			base64EncodeWebSafe: b64,
			base64DecodeWebSafe: (s) => Buffer.from(s, 'base64url'),
			newBlob: (bytes, type, name) => ({ getDataAsString: () => Buffer.from(bytes).toString(), type, name, size: bytes.length }),
			base64Decode: (s) => Buffer.from(s, 'base64'),
			computeHmacSha256Signature: (s, k) => createHmac('sha256', k).update(s).digest(),
			getUuid: () => `u${++uuid}-0000-0000`,
		},
		ContentService: { createTextOutput: (s) => ({ setMimeType: () => JSON.parse(s) }), MimeType: { JSON: 'json' } },
	};
	vm.createContext(ctx);
	vm.runInContext(code, ctx);
	return { ctx, created, trashed, props, call: (body) => ctx.doPost({ postData: { contents: JSON.stringify(body) } }) };
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
	// 로그인 상태 유지: 30일 / 기본 12시간
	const ttl = (r) => r.exp - Date.now();
	assert.ok(ttl(call({ action: 'login', phone: '12345678', birth: '19960211', keep: true })) > 29 * 24 * 3600e3);
	assert.ok(ttl(call({ action: 'login', phone: '12345678', birth: '19960211' })) < 13 * 3600e3);
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
	assert.deepEqual(plain(mine.me), { name: '테스트일', grade: '운영진', area: '마포구', phone: '010-1234-5678', photo: '' });
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

// ══ 4. 갤러리: 드라이브 폴더 사진만, 최신순, 휴대폰 기본 이름은 설명 없음, 캐시 ══
{
	const drive = [
		{ id: 'a', name: '하이원 첫 정모.jpg', type: 'image/jpeg', t: 1000 },
		{ id: 'b', name: 'IMG_1234.HEIC', type: 'image/heic', t: 3000 },
		{ id: 'c', name: '정산표.xlsx', type: 'application/vnd.ms-excel', t: 4000 },
		{ id: 'd', name: '단체_사진.png', type: 'image/png', t: 2000 },
	];
	const { call } = load([tab('회원현황', [HEAD])], drive);
	const g = call({ action: 'gallery' });
	assert.equal(g.ok, true);
	assert.deepEqual(plain(g.photos), [{ id: 'b', caption: '' }, { id: 'd', caption: '단체 사진' }, { id: 'a', caption: '하이원 첫 정모' }]);
	drive.push({ id: 'e', name: '새 사진.jpg', type: 'image/jpeg', t: 9000 });
	assert.equal(call({ action: 'gallery' }).photos.length, 3); // 5분 캐시
	// 서버 오류(예: 드라이브 권한 없음)도 JSON으로 응답
	const broken = load([tab('회원현황', [HEAD])]);
	broken.ctx.DriveApp.getFolderById = () => { throw new Error('권한 없음'); };
	const origErr = console.error; console.error = () => {};
	assert.deepEqual(plain(broken.call({ action: 'gallery' })), { ok: false, error: '서버 오류가 났어요. 잠시 뒤 다시 시도해 주세요.' });
	console.error = origErr;
}

// ══ 5. 모임 참석/취소: 회원만, 정원, 지난 모임 제외, 참석자 정보 비공개 ══
{
	const y = new Date().getFullYear() + 1;
	const roster = [HEAD,
		[1, '서울', '노원구', '회원A', '남', 1990, 1, 1, '010-6000-0001', ''],
		[2, '서울', '노원구', '회원B', '여', 1991, 2, 2, '010-6000-0002', ''],
		[3, '서울', '노원구', '회원C', '남', 1992, 3, 3, '010-6000-0003', ''],
	];
	const today0 = new Date(); today0.setHours(0, 0, 0, 0);
	const yesterday = new Date(today0 - 864e5), tomorrow = new Date(+today0 + 864e5);
	const evRows = [['ID', '시작일', '종료일', '장소', '내용', '태그', '정원'],
		['', `${y}-01-10`, `${y}-01-11`, '용평', '숙소 공동 예약', '1박 2일', 2],
		['', new Date(y, 0, 3), '', '하이원', '첫 정모', '당일', ''], // 날짜 셀, 종료일·정원 없음
		['old', '2020-01-01', '2020-01-02', '지난 모임', '', '', 10],
		['', '', '', '날짜없음', '', '', 5],
		['now', yesterday, tomorrow, '진행 중', '어제 시작, 내일 끝', '', ''], // 시작일 지났지만 종료일 전이라 표시
	];
	const tabs = [tab('회원현황', roster), tab('모임', evRows)];
	const { call } = load(tabs);
	const login = (ph, b) => call({ action: 'login', phone: ph, birth: b }).token;
	const A = login('60000001', '19900101'), B = login('60000002', '19910202'), C = login('60000003', '19920303');

	// 공개: 다가오는 모임만 날짜순, ID 자동 생성, 인원만
	const pub = plain(call({ action: 'events' }));
	assert.equal(pub.member, false);
	const md = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
	assert.deepEqual(pub.events.map((e) => [e.place, e.date.slice(0, 5), e.end.slice(0, 5), e.cap, e.count]), [['진행 중', md(yesterday), md(tomorrow), 0, 0], ['하이원', '01.03', '', 0, 0], ['용평', '01.10', '01.11', 2, 0]]);
	assert.ok(evRows[1][0] && evRows[2][0], 'ID 자동 생성');
	const yp = pub.events[2].id, hw = pub.events[1].id;
	const at = (r, id) => r.events.find((e) => e.id === id);

	// 회원 아니면 거부
	assert.equal(call({ action: 'rsvp', token: 'x.y', id: yp, go: true }).expired, true);

	// 참석 → mine, 인원 증가
	let r = plain(call({ action: 'rsvp', token: A, id: yp, go: true }));
	assert.equal(r.member, true);
	assert.deepEqual([at(r, yp).count, at(r, yp).mine], [1, true]);
	assert.equal(at(plain(call({ action: 'events', token: B })), yp).mine, false);
	call({ action: 'rsvp', token: A, id: yp, go: true }); // 두 번 눌러도 1명
	assert.equal(at(plain(call({ action: 'rsvp', token: B, id: yp, go: true })), yp).count, 2);

	// 정원(2) 다 차면 거부
	assert.match(call({ action: 'rsvp', token: C, id: yp, go: true }).error, /정원/);
	// 취소하면 자리 남 → 다른 회원 신청 가능, 다시 참석하면 같은 줄을 고침
	assert.equal(at(plain(call({ action: 'rsvp', token: A, id: yp, go: false })), yp).count, 1);
	assert.equal(at(plain(call({ action: 'rsvp', token: C, id: yp, go: true })), yp).count, 2);
	assert.match(call({ action: 'rsvp', token: A, id: yp, go: true }).error, /정원/);
	const rsvpRows = tabs.find((t) => t.getName() === '참석').rows;
	assert.equal(rsvpRows.filter((x) => x[4] === '010-6000-0001').length, 1);
	assert.deepEqual(plain(rsvpRows[0]), ['모임ID', '날짜', '장소', '이름', '연락처', '상태', '변경일시']);
	assert.match(rsvpRows[1][1], /^01\.10 . ~ 01\.11 .$/); // 참석 탭 날짜는 기간으로

	// 정원 없는 모임은 제한 없음
	for (const t of [A, B, C]) call({ action: 'rsvp', token: t, id: hw, go: true });
	assert.equal(at(plain(call({ action: 'events' })), hw).count, 3);

	// 지난 모임·없는 모임 신청 불가
	assert.match(call({ action: 'rsvp', token: A, id: 'old', go: true }).error, /신청할 수 없는/);
	// 비회원(공개) 응답엔 참석자 이름·번호 없음
	const pubRaw = JSON.stringify(call({ action: 'events' }));
	for (const leak of ['회원A', '회원B', '회원C', 'names', '6000-000']) assert.ok(!pubRaw.includes(leak), `공개 노출 금지: ${leak}`);
	// 회원에겐 이름만 (신청 순서), 번호는 없음
	const mem = plain(call({ action: 'events', token: A }));
	assert.deepEqual(mem.events.find((e) => e.id === yp).names, ['회원B', '회원C']);
	// 예전 '날짜' 열만 있는 탭도 시작일로 읽음
	const old = load([tab('회원현황', [HEAD]), tab('모임', [['ID', '날짜', '장소', '정원'], ['x', `${y}-03-01`, '예전양식', 3]])]);
	assert.deepEqual(plain(old.call({ action: 'events' }).events.map((e) => [e.place, e.date.slice(0, 5), e.end])), [['예전양식', '03.01', '']]);
	assert.deepEqual(mem.events.find((e) => e.id === hw).names, ['회원A', '회원B', '회원C']);
	assert.ok(!JSON.stringify(mem).includes('6000-000'), '번호 노출 금지');
}

// ══ 6. 프로필 사진: 회원만, 지정 폴더에 저장, 프로필 탭 기록, 바꾸면 예전 것 휴지통, 참석자 배지에 사진 ══
{
	const y = new Date().getFullYear() + 1;
	const roster = [HEAD, [1, '서울', '노원구', '회원A', '남', 1990, 1, 1, '010-6000-0001', ''], [2, '서울', '노원구', '회원B', '여', 1991, 2, 2, '010-6000-0002', '']];
	const tabs = [tab('회원현황', roster), tab('모임', [['ID', '시작일', '종료일', '장소', '내용', '태그', '정원'], ['ev', `${y}-01-10`, '', '용평', '', '', 5]])];
	const env = load(tabs);
	vm.runInContext("AVATAR_FOLDER_ID = ''", env.ctx); // 지정 안 한 경우부터
	const { call, created, trashed } = env;
	const A = call({ action: 'login', phone: '60000001', birth: '19900101' }).token;
	const B = call({ action: 'login', phone: '60000002', birth: '19910202' }).token;
	const jpg = 'data:image/jpeg;base64,' + Buffer.from('fakejpeg').toString('base64');

	assert.equal(call({ action: 'avatar', token: 'x.y', data: jpg }).expired, true); // 회원만
	assert.match(call({ action: 'avatar', token: A, data: 'data:image/png;base64,AAAA' }).error, /사진을 확인/); // JPG만
	assert.match(call({ action: 'avatar', token: A, data: 'data:image/jpeg;base64,' + 'A'.repeat(400004) }).error, /사진을 확인/); // 크기 상한

	// 폴더 지정 안 했으면 자동 폴더, 파일 이름에 번호 없음, 링크 보기 공유
	const first = call({ action: 'avatar', token: A, data: jpg });
	assert.deepEqual(plain(first), { ok: true, photo: 'f1' });
	assert.equal(created[0].folder, 'auto-프리스노우 프로필사진');
	assert.match(created[0].name, /^avatar-[^0-9]*u?\d*-?.*\.jpg$/);
	assert.ok(!created[0].name.includes('6000'), '파일 이름에 번호 금지');
	assert.equal(created[0].sharing, 'anyone/view');
	const profile = tabs.find((t) => t.getName() === '프로필').rows;
	assert.deepEqual(plain(profile[0]), ['연락처', '사진ID', '변경일시', '사진데이터']);
	assert.deepEqual(plain(profile[1].slice(0, 2)), ['010-6000-0001', 'f1']);
	assert.ok(!roster.some((r) => r.includes('f1')), '회원 탭은 안 건드림');

	// 바꾸면 같은 줄을 고치고 예전 사진은 휴지통
	assert.equal(call({ action: 'avatar', token: A, data: jpg }).photo, 'f2');
	assert.deepEqual(plain(trashed), ['f1']);
	assert.equal(profile.length, 2);
	assert.equal(call({ action: 'me', token: A }).me.photo, 'f2');

	// 참석자 배지에 사진 (사진 없는 회원은 '')
	call({ action: 'rsvp', token: A, id: 'ev', go: true });
	call({ action: 'rsvp', token: B, id: 'ev', go: true });
	assert.deepEqual(plain(call({ action: 'events', token: B }).events[0].people), [{ name: '회원A', photo: 'f2' }, { name: '회원B', photo: '' }]);
	assert.equal(call({ action: 'events' }).events[0].people, undefined); // 비회원에겐 없음

	// 삭제
	assert.deepEqual(plain(call({ action: 'avatar', token: A, remove: true })), { ok: true, photo: '' });
	assert.deepEqual(plain(trashed), ['f1', 'f2']);
	assert.equal(call({ action: 'me', token: A }).me.photo, '');

	// 드라이브 저장 실패(권한·폴더) → 작은 사진을 '프로필' 탭에, 작은 사진도 없으면 원인 메시지
	const origErr = console.error; console.error = () => {};
	const saveFn = env.ctx.DriveApp.getFolderById;
	vm.runInContext("AVATAR_FOLDER_ID = 'no-access'", env.ctx);
	env.ctx.DriveApp.getFolderById = () => { throw new Error('권한 없음 https://www.googleapis.com/auth/drive'); };
	assert.match(call({ action: 'avatar', token: A, data: jpg }).error, /폴더 권한/);
	const small = 'data:image/jpeg;base64,' + Buffer.from('smalljpeg').toString('base64');
	assert.deepEqual(plain(call({ action: 'avatar', token: A, data: jpg, small })), { ok: true, photo: small });
	assert.equal(call({ action: 'me', token: A }).me.photo, small);
	const prow = profile.find((r) => r[0] === '010-6000-0001');
	assert.deepEqual([prow[1], prow[3]], ['', small]); // 사진ID 비우고 사진데이터에
	assert.equal(plain(call({ action: 'events', token: B }).events[0].people)[0].photo, small); // 배지에도
	assert.match(call({ action: 'avatar', token: A, data: jpg, small: 'data:image/jpeg;base64,' + 'A'.repeat(40004) }).error, /폴더 권한/); // 시트 칸 한도
	env.ctx.DriveApp.getFolderById = saveFn;
	vm.runInContext("AVATAR_FOLDER_ID = ''", env.ctx);
	console.error = origErr;
	// 드라이브가 다시 되면 드라이브에 저장하고 시트 사진은 비움
	const back = call({ action: 'avatar', token: A, data: jpg }).photo;
	assert.match(back, /^f\d+$/);
	assert.deepEqual([profile.find((r) => r[0] === '010-6000-0001')[1], profile.find((r) => r[0] === '010-6000-0001')[3]], [back, '']);

	// 링크 공유 설정만 실패하면(조직 정책 등) 파일은 그대로 사용
	console.error = () => {};
	const cf = env.ctx.DriveApp.getFolderById;
	env.ctx.DriveApp.getFolderById = (fid) => { const f = cf(fid); const mk = f.createFile; f.createFile = (blob) => { const file = mk(blob); file.setSharing = () => { throw new Error('공유 정책'); }; return file; }; return f; };
	const shared = call({ action: 'avatar', token: A, data: jpg });
	assert.equal(shared.ok, true);
	assert.match(shared.photo, /^f\d+$/);
	env.ctx.DriveApp.getFolderById = cf;
	console.error = origErr;

	// 폴더 지정하면 그 폴더에 저장
	const env2 = load([tab('회원현황', roster)]);
	vm.runInContext("AVATAR_FOLDER_ID = 'admin-folder'", env2.ctx);
	const A2 = env2.call({ action: 'login', phone: '60000001', birth: '19900101' }).token;
	env2.call({ action: 'avatar', token: A2, data: jpg });
	assert.equal(env2.created[0].folder, 'admin-folder');
}

// 주소를 직접 열면(doGet) 동작 확인만, 데이터 없음
{
	const { ctx } = load([tab('회원현황', [HEAD, [1, '서울', '노원구', '회원A', '남', 1990, 1, 1, '010-6000-0001', '']])]);
	const g = plain(ctx.doGet());
	assert.equal(g.ok, true);
	assert.ok(!JSON.stringify(g).includes('회원A'));
}

console.log('ok: Code.gs 로그인·잠금·토큰·본인정보·회원가입·드롭다운·승인 배치(운영진·마스터 보호) ·갤러리·모임 참석·프로필 사진 검증 통과');
