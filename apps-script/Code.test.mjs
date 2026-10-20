// Code.gs 로컬 검증: node apps-script/Code.test.mjs
// Apps Script 전역(SpreadsheetApp 등)을 흉내 내서 로그인·잠금·토큰을 확인
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// 실제 양식과 같은 구조의 가짜 데이터 (제목 줄 + 머리글 + 빈 줄)
const sheet = [
	['프리스노우 회원명부', '', '', '', '', '', '', '', '', ''],
	['No', '구분', '거주지', '이름', '성별', '나이', '(생일)월', '(생일)일', '비상연락망', '비공개연락처'],
	[1, '운영진', '마포구', '테스트일', '남', 1996, 2, 11, '010-1234-5678', '비밀메모'],
	[2, '', '춘천', '테스트이', '여', '2000', '1', '5', 1098765432, ''], // 숫자로 저장돼 앞 0 빠진 번호, 문자 숫자
	[3, '회원', '구리', '생일없음', '남', '', '', '', '010-5555-6666', ''],
	['', '', '', '', '', '', '', '', '', ''],
];
// 탭 흉내: 회원명부 탭 이름은 다르게 둬서 '첫 번째 탭' 대체 동작도 확인
const tab = (name, rows) => ({ rows, getName: () => name, getDataRange: () => ({ getValues: () => rows }), appendRow: (r) => rows.push(r), setFrozenRows: () => {} });
const tabs = [tab('시트1', sheet)];
const cache = new Map();
const b64 = (x) => Buffer.from(x).toString('base64url');
const ctx = {
	SpreadsheetApp: { getActiveSpreadsheet: () => ({
		getSheetByName: (n) => tabs.find((t) => t.getName() === n) ?? null,
		getSheets: () => tabs,
		insertSheet: (n) => { const t = tab(n, []); tabs.push(t); return t; },
	}) },
	LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
	CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) ?? null, put: (k, v) => cache.set(k, v), remove: (k) => cache.delete(k) }) },
	PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'test-secret' }) },
	Session: { getScriptTimeZone: () => 'Asia/Seoul' },
	Utilities: {
		base64EncodeWebSafe: b64,
		base64DecodeWebSafe: (s) => Buffer.from(s, 'base64url'),
		newBlob: (bytes) => ({ getDataAsString: () => Buffer.from(bytes).toString() }),
		computeHmacSha256Signature: (s, k) => createHmac('sha256', k).update(s).digest(),
		formatDate: (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`,
	},
	ContentService: { createTextOutput: (s) => ({ setMimeType: () => JSON.parse(s) }), MimeType: { JSON: 'json' } },
};
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL('./Code.gs', import.meta.url), 'utf8'), ctx);
const call = (body) => ctx.doPost({ postData: { contents: JSON.stringify(body) } });
// vm 안에서 만든 배열·객체는 realm이 달라서 값만 비교
const plain = (x) => JSON.parse(JSON.stringify(x));

// 로그인 성공 (하이픈 있든 없든)
const ok = call({ action: 'login', phone: '01012345678', birth: '1996-02-11' });
assert.equal(ok.ok, true);
assert.equal(ok.name, '테스트일');

// 아이디 = 010 뺀 8자리
const byId = call({ action: 'login', phone: '12345678', birth: '19960211' });
assert.equal(byId.ok, true);
assert.equal(call({ action: 'login', phone: '1234-5678', birth: '19960211' }).ok, true);
assert.match(call({ action: 'login', phone: '12345678', birth: '1' }).error, /아이디와 비밀번호/);

// 앞 0 빠진 번호 + 한 자리 월·일 → 20000105
assert.equal(call({ action: 'login', phone: '010-9876-5432', birth: '20000105' }).ok, true);

// 생일 칸 비어 있으면 로그인 불가 (빈 생일로 뚫리지 않게)
assert.equal(call({ action: 'login', phone: '01055556666', birth: '00000000' }).ok, false);

// 내 정보: 본인 것만, 생일·성별·비공개연락처 없음, 다른 회원 없음
const mine = call({ action: 'me', token: ok.token });
assert.equal(mine.ok, true);
assert.deepEqual(mine.me, { name: '테스트일', grade: '운영진', area: '마포구', phone: '010-1234-5678' });
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
const [p] = ok.token.split('.');
assert.equal(call({ action: 'me', token: b64('01098765432|9999999999999') + '.' + ok.token.split('.')[1] }).ok, false);
assert.equal(call({ action: 'me', token: p + '.' + b64('x') }).ok, false);

// 5번 틀리면 맞는 생일도 잠김
for (let i = 0; i < 5; i++) assert.equal(call({ action: 'login', phone: '01012345678', birth: '19990101' }).ok, false);
const locked = call({ action: 'login', phone: '01012345678', birth: '19960211' });
assert.equal(locked.ok, false);
assert.match(locked.error, /1시간/);

// 시트에서 지운 회원은 토큰이 있어도 차단
sheet.splice(2, 1);
assert.equal(call({ action: 'me', token: ok.token }).expired, true);

// ── 회원가입 ──
const form = { agree: true, name: '신규', gender: '여', year: '1999', month: '3', day: '7', area: '성남', phone: '22223333' };
assert.match(call({ action: 'signup', ...form, agree: false }).error, /동의/);
assert.match(call({ action: 'signup', ...form, name: ' ' }).error, /빈 칸/);
assert.match(call({ action: 'signup', ...form, month: '13' }).error, /생년월일/);
assert.match(call({ action: 'signup', ...form, phone: '123' }).error, /연락처/);
assert.match(call({ action: 'signup', ...form, phone: '010-9876-5432' }).error, /이미/); // 이미 회원
const done = call({ action: 'signup', ...form });
assert.deepEqual(done, { ok: true });
const apply = tabs.find((t) => t.getName() === '가입신청').rows;
assert.deepEqual(plain(apply[0]), ['신청일시', '이름', '성별', '나이', '(생일)월', '(생일)일', '거주지', '비상연락망', '상태']);
assert.deepEqual(plain(apply[1].slice(1)), ['신규', '여', 1999, 3, 7, '성남', '010-2222-3333', '대기']);
assert.match(call({ action: 'signup', ...form }).error, /이미/); // 중복 신청
// 수식 주입 방지
call({ action: 'signup', ...form, phone: '33334444', name: '=HYPERLINK("x")' });
assert.equal(apply[2][1], `'=HYPERLINK("x")`);
// 봇(숨은 칸) → 저장 안 함
const before = apply.length;
assert.equal(call({ action: 'signup', ...form, phone: '44445555', website: 'spam' }).ok, true);
assert.equal(apply.length, before);
// 가입신청 탭이 생겨도 로그인은 회원명부에서만 (신청자는 로그인 불가)
assert.equal(call({ action: 'login', phone: '22223333', birth: '19990307' }).ok, false);

console.log('ok: Code.gs 로그인·잠금·토큰·본인정보·회원가입 검증 통과');
