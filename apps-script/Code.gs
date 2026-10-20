// Free Snow 회원 API — 구글 시트 > 확장 프로그램 > Apps Script 에 붙여넣고 웹앱으로 배포
// 시트: '이름'·'비상연락망'이 있는 줄을 머리글로 찾음 (위에 제목 줄 있어도 됨)
//   No | 구분 | 거주지 | 이름 | 성별 | 나이(출생연도) | (생일)월 | (생일)일 | 비상연락망 | 비공개연락처
// 로그인: 아이디 = 비상연락망에서 010 뺀 8자리(010 붙여도 됨), 비밀번호 = 생년월일 8자리(나이+월+일)
// 프로젝트 설정 > 스크립트 속성: TOKEN_SECRET = 아무 긴 랜덤 문자열

const SHEET = '회원명부'; // 이 이름의 탭이 없으면 첫 번째 탭
// 머리글 이름 → 쓰는 값. 여기 없는 열(성별·비공개연락처 등)은 읽지도 내보내지도 않음
const COL = { grade: '구분', area: '거주지', name: '이름', year: '나이', month: '(생일)월', day: '(생일)일', phone: '비상연락망' };
const SIGNUP_SHEET = '가입신청'; // 없으면 자동 생성. 운영진이 확인 후 회원명부로 옮김
const SIGNUP_HEAD = ['신청일시', '이름', '성별', '나이', '(생일)월', '(생일)일', '거주지', '비상연락망', '상태'];
const SIGNUP_PER_HOUR = 30; // 전체 신청 시간당 상한 (스팸 방지)
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
	const area = clean(b.area, 20);
	const phone = normPhone(b.phone);
	const thisYear = new Date().getFullYear();
	if (!name || !gender || !area) return { ok: false, error: '빈 칸을 모두 채워 주세요.' };
	if (!(Number(year) >= 1930 && Number(year) <= thisYear) || !makeBirth(year, mon, day)) return { ok: false, error: '생년월일을 확인해 주세요.' };
	if (!/^01[016789]\d{7,8}$/.test(phone)) return { ok: false, error: '연락처를 확인해 주세요.' };

	const lock = LockService.getScriptLock();
	lock.waitLock(10000);
	try {
		const cache = CacheService.getScriptCache();
		const count = Number(cache.get('signups') || 0);
		if (count >= SIGNUP_PER_HOUR) return { ok: false, error: '신청이 많아요. 잠시 뒤 다시 시도해 주세요.' };

		const sheet = signupSheet();
		const applied = sheet.getDataRange().getValues().slice(1).some((r) => normPhone(r[7]) === phone);
		if (applied || readMembers().some((m) => m.phone === phone)) {
			return { ok: false, error: '이미 신청했거나 가입된 연락처예요. 오픈채팅으로 문의해 주세요.' };
		}
		sheet.appendRow([new Date(), name, gender, Number(year), mon, day, area, formatPhone(phone), '대기']);
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
	}
	return sheet;
}

// 글자 수 제한 + 시트 수식 주입 방지 (=, +, -, @ 로 시작하면 앞에 ' 붙임)
function clean(v, max) {
	const t = String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
	return /^[=+\-@]/.test(t) ? "'" + t : t;
}

function readMembers() {
	const book = SpreadsheetApp.getActiveSpreadsheet();
	const values = (book.getSheetByName(SHEET) || book.getSheets().find((t) => t.getName() !== SIGNUP_SHEET)).getDataRange().getValues();
	const head = values.findIndex((r) => r.map((c) => String(c).trim()).includes(COL.name) && r.map((c) => String(c).trim()).includes(COL.phone));
	if (head < 0) throw new Error(`'${COL.name}', '${COL.phone}' 머리글을 찾지 못했어요.`);
	const idx = {};
	for (const [k, label] of Object.entries(COL)) idx[k] = values[head].map((c) => String(c).trim()).indexOf(label);
	const get = (r, k) => (idx[k] < 0 ? '' : r[idx[k]]);
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
	if (d.startsWith('82')) d = '0' + d.slice(2);
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
