// Free Snow 회원 API — 구글 시트 > 확장 프로그램 > Apps Script 에 붙여넣고 웹앱으로 배포
// 시트: '이름'·'비상연락망'이 있는 줄을 머리글로 찾음 (위에 제목 줄 있어도 됨)
//   No | 구분 | 거주지 | 이름 | 성별 | 나이(출생연도) | (생일)월 | (생일)일 | 비상연락망 | 비공개연락처
// 로그인: 아이디 = 비상연락망에서 010 뺀 8자리(010 붙여도 됨), 비밀번호 = 생년월일 8자리(나이+월+일)
// 프로젝트 설정 > 스크립트 속성: TOKEN_SECRET = 아무 긴 랜덤 문자열

const MEMBER_SHEETS = ['회원현황', '회원명부']; // 앞에서부터 있는 탭을 회원 탭으로 씀 (없으면 첫 탭)
// 머리글 이름 → 쓰는 값. 여기 없는 열(성별·비공개연락처 등)은 읽지도 내보내지도 않음
const COL = { grade: '구분', area: '거주지', name: '이름', year: '나이', month: '(생일)월', day: '(생일)일', phone: '비상연락망' };
const SIGNUP_SHEET = '가입신청'; // 없으면 자동 생성. 상태(드롭다운)를 '승인'으로 바꾸면 회원 탭에 자동 추가
const SIGNUP_HEAD = ['신청일시', '이름', '성별', '나이', '(생일)월', '(생일)일', '시도', '거주지', '비상연락망', '상태'];
const SIGNUP_PER_HOUR = 30; // 전체 신청 시간당 상한 (스팸 방지)
const STATUS = ['대기', '승인'];
// 회원 탭 구분 = 시도. 이 구분의 행은 승인 처리에서 절대 건드리지 않음(위치·No 포함)
const FIXED_GRADES = ['운영진', '마스터'];
// 경기도는 북부·남부 블록이 따로 있음. 이 목록이면 경기북부 블록, 아니면 경기남부 블록 끝에 넣음 (동호회 기준, 필요하면 추가)
const GYEONGGI_NORTH = ['의정부', '남양주', '구리', '양주', '포천', '동두천', '가평', '고양', '파주', '연천', '하남', '김포'];
const MAX_FAILS = 5; // 번호당 연속 실패 허용 횟수
const LOCK_SEC = 60 * 60; // 초과 시 잠금 시간
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 로그인 유지 시간

function doPost(e) {
	let body;
	try {
		body = JSON.parse(e.postData.contents);
	} catch (err) {
		return json({ ok: false, error: '잘못된 요청이에요.' });
	}
	if (body.action === 'login') return json(login(body.phone, body.birth));
	if (body.action === 'me') return json(me(body.token));
	if (body.action === 'signup') return json(signup(body));
	return json({ ok: false, error: '잘못된 요청이에요.' });
}

function login(phoneIn, birthIn) {
	const phone = normPhone(phoneIn);
	const birth = String(birthIn || '').replace(/\D/g, '');
	if (phone.length < 10 || birth.length !== 8) {
		return { ok: false, error: '아이디와 비밀번호를 확인해 주세요.' };
	}
	const cache = CacheService.getScriptCache();
	const key = 'fail:' + phone;
	const fails = Number(cache.get(key) || 0);
	if (fails >= MAX_FAILS) return { ok: false, error: '시도 횟수를 넘었어요. 1시간 뒤에 다시 시도해 주세요.' };

	const me = readMembers().find((m) => m.phone === phone && m.birth === birth);
	if (!me) {
		cache.put(key, String(fails + 1), LOCK_SEC);
		// 아이디가 틀렸는지 비밀번호가 틀렸는지 구분하지 않음
		return { ok: false, error: '아이디 또는 비밀번호가 맞지 않아요.' };
	}
	cache.remove(key);
	const exp = Date.now() + TOKEN_TTL_MS;
	return { ok: true, token: sign(phone + '|' + exp), name: me.name, exp };
}

// 로그인한 본인 정보만. 다른 회원 명단은 절대 내보내지 않음
function me(token) {
	const phone = verify(token);
	const m = phone ? readMembers().find((r) => r.phone === phone) : null;
	// 시트에서 지워진 회원도 바로 로그아웃
	if (!m) return { ok: false, expired: true, error: '다시 로그인해 주세요.' };
	// 생년월일(=비밀번호)·나이는 절대 내보내지 않음
	return { ok: true, me: { name: m.name, grade: m.grade, area: m.area, phone: formatPhone(m.phone) } };
}

// 가입 신청 → '가입신청' 탭에 한 줄 추가. 아무 데이터도 돌려주지 않음
function signup(b) {
	if (b.website) return { ok: true }; // 봇용 숨은 칸이 채워지면 조용히 무시
	if (b.agree !== true) return { ok: false, error: '개인정보 수집·이용에 동의해 주세요.' };
	const name = clean(b.name, 20);
	const gender = ['남', '여'].includes(b.gender) ? b.gender : '';
	const year = String(b.year || '').replace(/\D/g, '');
	const mon = Number(b.month), day = Number(b.day);
	const sido = clean(b.sido, 20);
	const area = clean(b.sigungu, 20);
	const phone = normPhone(b.phone);
	const thisYear = new Date().getFullYear();
	if (!name || !gender || !sido || !area) return { ok: false, error: '빈 칸을 모두 채워 주세요.' };
	if (!(Number(year) >= 1930 && Number(year) <= thisYear) || !makeBirth(year, mon, day)) return { ok: false, error: '생년월일을 확인해 주세요.' };
	if (!/^01[016789]\d{7,8}$/.test(phone)) return { ok: false, error: '연락처를 확인해 주세요.' };

	const lock = LockService.getScriptLock();
	lock.waitLock(10000);
	try {
		const cache = CacheService.getScriptCache();
		const count = Number(cache.get('signups') || 0);
		if (count >= SIGNUP_PER_HOUR) return { ok: false, error: '신청이 많아요. 잠시 뒤 다시 시도해 주세요.' };

		const sheet = signupSheet();
		const applied = applyTable(sheet).rows.some((r) => normPhone(r['비상연락망']) === phone);
		if (applied || readMembers().some((m) => m.phone === phone)) {
			return { ok: false, error: '이미 신청했거나 가입된 연락처예요. 오픈채팅으로 문의해 주세요.' };
		}
		sheet.appendRow([new Date(), name, gender, Number(year), mon, day, sido, area, formatPhone(phone), '대기']);
		applyStatusDropdown(sheet); // 예전에 만든 탭이어도 상태 열 전체를 선택식으로
		cache.put('signups', String(count + 1), 60 * 60);
		return { ok: true };
	} finally {
		lock.releaseLock();
	}
}

function signupSheet() {
	const book = SpreadsheetApp.getActiveSpreadsheet();
	let sheet = book.getSheetByName(SIGNUP_SHEET);
	if (!sheet) {
		sheet = book.insertSheet(SIGNUP_SHEET);
		sheet.appendRow(SIGNUP_HEAD);
		sheet.setFrozenRows(1);
		applyStatusDropdown(sheet);
	}
	return sheet;
}

// 가입신청 탭: 1행 머리글 이름으로 읽음 (열 순서가 바뀌어도 동작)
function applyTable(sheet) {
	const values = sheet.getDataRange().getValues();
	const labels = (values[0] || []).map((c) => String(c).trim());
	const rows = values.slice(1).map((r) => Object.fromEntries(labels.map((l, i) => [l, r[i]])));
	return { labels, rows, status: labels.indexOf('상태') + 1 };
}

// 글자 수 제한 + 시트 수식 주입 방지 (=, +, -, @ 로 시작하면 앞에 ' 붙임)
function clean(v, max) {
	const t = String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
	return /^[=+\-@]/.test(t) ? "'" + t : t;
}

function memberSheet() {
	const book = SpreadsheetApp.getActiveSpreadsheet();
	for (const n of MEMBER_SHEETS) {
		const t = book.getSheetByName(n);
		if (t) return t;
	}
	return book.getSheets().find((t) => t.getName() !== SIGNUP_SHEET);
}

// 머리글 줄(이름·비상연락망 있는 줄)을 찾아 열 이름 → 위치
function memberTable(sheet) {
	const values = (sheet || memberSheet()).getDataRange().getValues();
	const head = values.findIndex((r) => r.map((c) => String(c).trim()).includes(COL.name) && r.map((c) => String(c).trim()).includes(COL.phone));
	if (head < 0) throw new Error(`'${COL.name}', '${COL.phone}' 머리글을 찾지 못했어요.`);
	const labels = values[head].map((c) => String(c).trim());
	const at = (label) => labels.indexOf(label);
	const idx = {};
	for (const [k, label] of Object.entries(COL)) idx[k] = at(label);
	const get = (r, k) => (idx[k] < 0 ? '' : r[idx[k]]);
	return { values, head, labels, at, idx, get };
}

// ── 가입 승인 ──
// 가입신청 탭 상태 칸을 '승인'으로 바꾸면 실행 (단순 트리거, 설치 불필요)
function onEdit(e) {
	const r = e && e.range;
	if (!r || r.getSheet().getName() !== SIGNUP_SHEET || r.getRow() < 2 || r.getNumRows() !== 1) return;
	const t = applyTable(r.getSheet());
	if (r.getColumn() !== t.status || String(r.getValue()).trim() !== '승인') return;
	const lock = LockService.getScriptLock();
	lock.waitLock(10000);
	try {
		r.setNote(approve(t.rows[r.getRow() - 2]));
	} catch (err) {
		r.setNote('추가 실패: ' + err.message);
	} finally {
		lock.releaseLock();
	}
}

// 신청 한 줄 → 회원 탭. 구분 = 시도. 운영진·마스터 블록 아래 회원들 중
// 같은 시도의 같은 거주지 마지막 줄 → 같은 시도 마지막 줄 → 맨 끝 다음에 끼워 넣고 No 다시 매김
function approve(a) {
	const sido = String(a['시도'] || '').trim();
	const area = normArea(a['거주지']);
	if (!sido) return "'시도' 칸이 비어 있어 추가하지 않았어요.";
	const sheet = memberSheet();
	const t = memberTable(sheet);
	const all = t.values
		.map((r, i) => ({ i, grade: String(t.get(r, 'grade')).trim(), area: normArea(t.get(r, 'area')), name: String(t.get(r, 'name')).trim(), phone: normPhone(t.get(r, 'phone')) }))
		.filter((r) => r.i > t.head && r.grade); // 회원 줄 = 구분이 채워진 줄 (이름은 안 봄)
	if (all.some((r) => r.phone && r.phone === normPhone(a['비상연락망']))) return '이미 회원 탭에 있는 연락처라 추가하지 않았어요.';

	const fixedEnd = lastFixedRow(t);
	const rows = all.filter((r) => r.i > fixedEnd); // 운영진·마스터 블록 아래만 대상
	const after = insertAfter(rows, sido, area, Math.max(fixedEnd, t.head));
	sheet.insertRowAfter(after + 1);
	const line = new Array(t.labels.length).fill('');
	const put = (label, v) => { if (t.at(label) >= 0) line[t.at(label)] = v; };
	put(COL.grade, sido);
	put(COL.area, area);
	put(COL.name, a['이름']);
	put('성별', a['성별']);
	put(COL.year, a['나이']);
	put(COL.month, a['(생일)월']);
	put(COL.day, a['(생일)일']);
	put(COL.phone, formatPhone(normPhone(a['비상연락망'])));
	sheet.getRange(after + 2, 1, 1, line.length).setValues([line]);
	renumber(sheet);
	return `회원 탭 ${after + 2}행에 추가 · ${sido} ${area}`;
}

// 운영진·마스터 행 중 가장 아래 줄 (0부터). 없으면 -1
function lastFixedRow(t) {
	let last = -1;
	t.values.forEach((r, i) => { if (i > t.head && FIXED_GRADES.includes(String(t.get(r, 'grade')).trim())) last = i; });
	return last;
}

// 같은 시도+같은 거주지 마지막 줄 → (경기) 같은 북부·남부 블록 마지막 줄 → 같은 시도 마지막 줄 → 마지막 회원 줄 → base
function insertAfter(rows, sido, area, base) {
	const key = sidoKey(sido);
	const last = (f) => { const m = rows.filter(f); return m.length ? m[m.length - 1].i : -1; };
	const both = last((r) => sidoKey(r.grade) === key && r.area === area);
	if (both >= 0) return both;
	if (key === '경기') {
		const zone = gyeonggiZone('경기도', area);
		const inZone = last((r) => sidoKey(r.grade) === key && gyeonggiZone(r.grade, r.area) === zone);
		if (inZone >= 0) return inZone;
	}
	const same = last((r) => sidoKey(r.grade) === key);
	if (same >= 0) return same;
	const any = last(() => true);
	return any >= 0 ? any : base;
}

// 경기 줄의 북부/남부: 구분이 '경기북부'·'경기남부'면 그대로, '경기도'면 거주지가 북부 목록인지로
function gyeonggiZone(grade, area) {
	if (/북부/.test(grade)) return '북부';
	if (/남부/.test(grade)) return '남부';
	return GYEONGGI_NORTH.includes(normArea(area)) ? '북부' : '남부';
}

// 시도 비교용: '서울특별시'·'서울' → 서울, '경기도'·'경기북부'·'경기남부' → 경기, '강원특별자치도'·'강원도' → 강원,
// '인천광역시'·'인천광역' → 인천. 충청·경상·전라는 남북을 나눔
function sidoKey(v) {
	const s = String(v == null ? '' : v).trim();
	const split = { 충청북도: '충북', 충청남도: '충남', 경상북도: '경북', 경상남도: '경남', 전라북도: '전북', 전북특별자치도: '전북', 전라남도: '전남', 전남광주통합특별시: '전남' };
	return split[s] || s.slice(0, 2);
}

// 거주지 표기 맞춤: '의정부시' → 의정부, '가평군' → 가평, '노원구' → 노원구
function normArea(v) {
	let a = String(v == null ? '' : v).trim().split(/\s+/).pop() || '';
	a = a.replace(/(특별시|광역시|특별자치시|특별자치도)$/, '');
	if (a.length > 2) a = a.replace(/[시군]$/, '');
	return a;
}

// No = 행 번호 기준 수식(=ROW()-머리글행). 줄을 끼우거나 지워도 자동으로 맞음
// 운영진·마스터 행(맨 위 블록)은 쓰지 않고, 그 아래 구분 있는 줄에만 수식을 넣음
function renumber(sheet) {
	const t = memberTable(sheet);
	const no = t.at('No');
	if (no < 0) return;
	const start = Math.max(lastFixedRow(t), t.head) + 1; // 0부터 센 줄
	const body = t.values.slice(start);
	let end = body.length; // 마지막 구분 있는 줄까지만 (아래 빈 줄은 그대로)
	while (end > 0 && !String(t.get(body[end - 1], 'grade')).trim()) end--;
	if (!end) return;
	const formula = `=ROW()-${t.head + 1}`;
	const cells = body.slice(0, end).map((r) => [String(t.get(r, 'grade')).trim() ? formula : '']);
	sheet.getRange(start + 1, no + 1, end, 1).setFormulas(cells);
}

function statusDropdown(range) {
	range.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATUS, true).setAllowInvalid(false).build());
}

// 상태 열(2행~끝) 전체를 대기/승인 선택식으로. 신청 들어올 때마다 실행 + 편집기에서 직접 실행해도 됨
function applyStatusDropdown(sheet) {
	sheet = sheet || signupSheet();
	const col = applyTable(sheet).status;
	if (!col) throw new Error("가입신청 탭 1행에 '상태' 머리글이 없어요.");
	statusDropdown(sheet.getRange(2, col, sheet.getMaxRows() - 1));
}

function readMembers() {
	const { values, head, get } = memberTable();
	return values
		.slice(head + 1)
		.filter((r) => String(get(r, 'name')).trim() !== '' && normPhone(get(r, 'phone')) !== '')
		.map((r) => ({
			name: String(get(r, 'name')).trim(),
			grade: String(get(r, 'grade') || '회원').trim(),
			area: String(get(r, 'area')).trim(),
			phone: normPhone(get(r, 'phone')),
			birth: makeBirth(get(r, 'year'), get(r, 'month'), get(r, 'day')),
		}));
}

// 출생연도·월·일 → 19960212. 하나라도 이상하면 '' (로그인 불가)
function makeBirth(y, m, d) {
	const year = String(y).replace(/\D/g, '');
	const mon = Number(String(m).replace(/\D/g, ''));
	const day = Number(String(d).replace(/\D/g, ''));
	if (year.length !== 4 || !(mon >= 1 && mon <= 12) || !(day >= 1 && day <= 31)) return '';
	return year + String(mon).padStart(2, '0') + String(day).padStart(2, '0');
}

// 010-1234-5678 / 01012345678 / 12345678(아이디: 010 생략) / 1012345678(시트가 앞 0을 지운 경우) / +82 10 ... → 01012345678
function normPhone(v) {
	let d = String(v == null ? '' : v).replace(/\D/g, '');
	if (d.startsWith('8210') && d.length >= 12) d = '0' + d.slice(2); // +82 10 … (아이디 82xx… 와 구분)
	if (d.length === 10 && d.startsWith('10')) d = '0' + d;
	if (d.length === 8) d = '010' + d;
	return d;
}

function formatPhone(d) {
	return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : d;
}

// 토큰 = base64(phone|exp) . base64(HMAC) — 서버 저장 없이 검증
function sign(payload) {
	const p = Utilities.base64EncodeWebSafe(payload);
	return p + '.' + hmac(p);
}

function verify(token) {
	const [p, sig] = String(token || '').split('.');
	if (!p || !sig || hmac(p) !== sig) return null;
	const [phone, exp] = Utilities.newBlob(Utilities.base64DecodeWebSafe(p)).getDataAsString().split('|');
	return Number(exp) > Date.now() ? phone : null;
}

function hmac(s) {
	const secret = PropertiesService.getScriptProperties().getProperty('TOKEN_SECRET');
	if (!secret) throw new Error('스크립트 속성 TOKEN_SECRET 을 설정해 주세요.');
	return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(s, secret));
}

function json(obj) {
	return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
