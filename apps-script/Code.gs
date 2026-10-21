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
// 갤러리: 이 드라이브 폴더의 사진을 최신순으로 보여줌 (폴더는 '링크가 있는 모든 사용자' 보기 권한)
const GALLERY_FOLDER_ID = '1-LucEsq3CeyoqFSeZqttzbMwcv4mTnHc';
const GALLERY_CACHE_SEC = 5 * 60; // 목록 재사용 시간 (새 사진은 최대 5분 뒤 반영)
// 모임·참석: 운영진이 '모임' 탭에 한 줄 추가 → 사이트 THE SEASON에 표시, 회원 참석/취소는 '참석' 탭에 기록
const EVENT_SHEET = '모임';
const EVENT_HEAD = ['ID', '시작일', '종료일', '장소', '내용', '태그', '정원']; // 종료일·정원 비워도 됨, ID 비우면 자동 ('날짜' 열은 시작일로 읽음)
const RSVP_SHEET = '참석';
const RSVP_HEAD = ['모임ID', '날짜', '장소', '이름', '연락처', '상태', '변경일시'];
// 프로필 사진: 아래 드라이브 폴더에 저장(링크 보기) → 사이트가 그 사진을 가져다 씀. 누가 어떤 사진인지는 '프로필' 탭에 (회원 탭은 안 건드림)
// 폴더 주소 https://drive.google.com/drive/folders/<이 부분> 을 넣기. 비워 두면 '프리스노우 프로필사진' 폴더를 자동으로 만듦
var AVATAR_FOLDER_ID = '1l4luKl_nTyDSTvtnxxNsbdbI0kR7M4J-'; // (var: 테스트에서 바꿔 넣으려고)
const PROFILE_SHEET = '프로필';
const PROFILE_HEAD = ['연락처', '사진ID', '변경일시', '사진데이터']; // 사진데이터: 드라이브 저장이 안 될 때 작은 사진(96px)을 여기에
const AVATAR_FOLDER = '프리스노우 프로필사진';
const AVATAR_MAX = 400000; // base64 글자 수 상한 (브라우저에서 256px로 줄여서 보냄 ≈ 20~60KB)
const SMALL_MAX = 40000; // 시트 칸에 넣는 작은 사진 상한 (칸 한도 5만 자)
// 소모임: 프리스노우 모임 공개 페이지에서 '정모 일정'을 1시간에 한 번 읽어 THE SEASON에 표시 (참석은 소모임에서)
// 공식 API가 아니라 페이지 구조가 바뀌면 못 읽을 수 있음 → 사이트는 안내 + 링크로 대체
const SOMOIM_URL = 'https://www.somoim.co.kr/821b9cba-c97a-11e8-9395-0a16433fdfe81';
const SOMOIM_CACHE_SEC = 60 * 60;
const MAX_FAILS = 5; // 번호당 연속 실패 허용 횟수
const LOCK_SEC = 60 * 60; // 초과 시 잠금 시간
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 로그인 유지 시간
const KEEP_TTL_MS = 30 * 24 * 60 * 60 * 1000; // '로그인 상태 유지' 체크 시

// 웹 앱 주소를 브라우저로 직접 열었을 때: 동작 확인용 (데이터는 안 내보냄). 사이트는 doPost만 씀
function doGet() {
	return json({ ok: true, service: 'Free Snow 회원 API', note: '사이트에서 POST로만 사용해요.' });
}

function doPost(e) {
	let body;
	try {
		body = JSON.parse(e.postData.contents);
	} catch (err) {
		return json({ ok: false, error: '잘못된 요청이에요.' });
	}
	// 오류가 나도 JSON으로 응답 (안 그러면 구글 오류 페이지가 가서 브라우저엔 CORS 오류로만 보임)
	try {
		if (body.action === 'login') return json(login(body.phone, body.birth, body.keep === true));
		if (body.action === 'me') return json(me(body.token));
		if (body.action === 'signup') return json(signup(body));
		if (body.action === 'gallery') return json(gallery());
		if (body.action === 'events') return json(events(body.token));
		if (body.action === 'rsvp') return json(rsvp(body));
		if (body.action === 'avatar') return json(avatar(body));
		if (body.action === 'somoim') return json(somoim());
	} catch (err) {
		console.error(body.action, err); // Apps Script 편집기 > 실행 기록에서 확인
		return json({ ok: false, error: '서버 오류가 났어요. 잠시 뒤 다시 시도해 주세요.' });
	}
	return json({ ok: false, error: '잘못된 요청이에요.' });
}

// 드라이브 권한 승인용: 편집기에서 이 함수를 골라 한 번 실행 → 권한 허용 (갤러리용, 그 뒤 새 버전 배포)
// 실행 기록에 폴더 이름·주인·실행 계정과, 프로필 폴더에 실제로 파일을 쓸 수 있는지 찍힘
function authorizeDrive() {
	console.log('실행 계정: ' + Session.getEffectiveUser().getEmail());
	console.log('갤러리 폴더: ' + DriveApp.getFolderById(GALLERY_FOLDER_ID).getName());
	const folder = avatarFolder();
	let owner = '?';
	try {
		owner = folder.getOwner().getEmail();
	} catch (err) {}
	console.log(`프로필 사진 폴더: ${folder.getName()} (주인 ${owner})`);
	try {
		const test = folder.createFile('쓰기확인.txt', '프로필 사진 저장 테스트 — 지워도 돼요');
		console.log('✅ 프로필 폴더에 파일 쓰기 성공');
		try {
			test.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
			console.log('✅ 파일 링크 공유 설정 성공');
		} catch (err) {
			console.error('⚠️ 파일 링크 공유를 바꿀 수 없어요: ' + err.message + ' → 프로필 폴더를 "링크가 있는 모든 사용자 · 뷰어"로 공유해 두면 사진이 보여요.');
		}
		test.setTrashed(true);
	} catch (err) {
		const scope = /auth\/drive/.test(err.message);
		console.error('❌ 프로필 폴더에 파일을 쓸 수 없어요: ' + err.message);
		console.error(scope
			? '→ 권한(드라이브 쓰기)이 승인되지 않았어요. ① 프로젝트 설정 > OAuth 범위에 …/auth/drive 가 있는지 확인 ② https://myaccount.google.com/permissions 에서 이 프로젝트 액세스 삭제 ③ authorizeDrive 다시 실행 → 권한 창에서 드라이브 항목까지 모두 체크'
			: '→ 이 계정에 폴더 편집 권한을 주거나 AVATAR_FOLDER_ID 를 비워 두세요.');
	}
}

function login(phoneIn, birthIn, keep) {
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
	const exp = Date.now() + (keep ? KEEP_TTL_MS : TOKEN_TTL_MS);
	return { ok: true, token: sign(phone + '|' + exp), name: me.name, exp };
}

// 로그인한 본인 정보만. 다른 회원 명단은 절대 내보내지 않음
function me(token) {
	const phone = verify(token);
	const m = phone ? readMembers().find((r) => r.phone === phone) : null;
	// 시트에서 지워진 회원도 바로 로그아웃
	if (!m) return { ok: false, expired: true, error: '다시 로그인해 주세요.' };
	// 생년월일(=비밀번호)·나이는 절대 내보내지 않음
	return { ok: true, me: { name: m.name, grade: m.grade, area: m.area, phone: formatPhone(m.phone), photo: profilePhotos()[phone] || '' } };
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

// ── 소모임 정모 ──
// [{title, date: '11.07 토', time: '오후 1:00', start: ISO, place, fee, count, cap}] — 참석자 얼굴·이름은 안 가져옴
function somoim() {
	const cache = CacheService.getScriptCache();
	const hit = cache.get('somoim');
	if (hit) return JSON.parse(hit);
	const res = UrlFetchApp.fetch(SOMOIM_URL, { muteHttpExceptions: true, followRedirects: true });
	if (res.getResponseCode() !== 200) return { ok: false, url: SOMOIM_URL, error: '소모임 페이지를 열 수 없어요.' };
	const meetups = parseSomoim(res.getContentText(), new Date());
	const out = { ok: true, url: SOMOIM_URL, meetups };
	cache.put('somoim', JSON.stringify(out), SOMOIM_CACHE_SEC);
	return out;
}

// 공개 모임 페이지 HTML → 정모 목록 (지난 정모 제외, 날짜순)
function parseSomoim(htmlText, now) {
	const i = htmlText.indexOf('정모 일정');
	if (i < 0) return [];
	const j = htmlText.indexOf('</section>', i);
	const sec = htmlText.slice(i, j < 0 ? undefined : j);
	const text = (s) => decodeHtml(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
	const after = (it, icon) => { const m = new RegExp(icon + '[^]*?<p[^>]*>([^]*?)</p>').exec(it); return m ? text(m[1]) : ''; };
	const today = new Date(now);
	today.setHours(0, 0, 0, 0);
	const list = [];
	for (const it of sec.split('<div class="flex space-x-3">').slice(1)) {
		const title = text((/<h3[^>]*>([^]*?)<\/h3>/.exec(it) || [])[1]);
		if (!title) continue;
		const flat = text(it);
		// 날짜: 이미지 파일 이름의 yyyymmddHHMM → 없으면 '11/7(토) 오후 1:00' 에서 (연도 추정)
		let start = null;
		const stamp = /(\d{12})s\d+\.png/.exec(it);
		if (stamp) {
			const d = stamp[1];
			start = new Date(Number(d.slice(0, 4)), Number(d.slice(4, 6)) - 1, Number(d.slice(6, 8)), Number(d.slice(8, 10)), Number(d.slice(10, 12)));
		} else {
			const md = /(\d{1,2})\/(\d{1,2})\(/.exec(flat);
			const hm = /(오전|오후)\s*(\d{1,2}):(\d{2})/.exec(flat);
			if (md) {
				let y = today.getFullYear();
				const guess = new Date(y, Number(md[1]) - 1, Number(md[2]));
				if (guess < new Date(today - 60 * 864e5)) y++; // 두 달 넘게 지난 날짜면 내년
				let h = hm ? Number(hm[2]) % 12 + (hm[1] === '오후' ? 12 : 0) : 0;
				start = new Date(y, Number(md[1]) - 1, Number(md[2]), h, hm ? Number(hm[3]) : 0);
			}
		}
		if (!start || start < today) continue;
		const nums = /(\d+)\s*\/\s*(\d+)\s*$/.exec(flat);
		const hm = /(오전|오후)\s*\d{1,2}:\d{2}/.exec(flat);
		list.push({
			title,
			date: dayLabel(start),
			time: hm ? hm[0] : '',
			start: start.toISOString(),
			place: after(it, 'i_location'),
			fee: after(it, 'i_currency'),
			count: nums ? Number(nums[1]) : null,
			cap: nums ? Number(nums[2]) : null,
		});
	}
	return list.sort((a, b) => (a.start < b.start ? -1 : 1));
}

function decodeHtml(s) {
	return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

// ── 프로필 사진 ──
// {token, data: 256px JPG, small: 96px JPG} 저장 / {token, remove: true} 삭제
// 드라이브 폴더에 저장, 드라이브가 안 되면(권한 등) 작은 사진을 '프로필' 탭에. 예전 드라이브 사진은 휴지통으로
function avatar(b) {
	const phone = verify(b.token);
	if (!phone || !readMembers().some((m) => m.phone === phone)) return { ok: false, expired: true, error: '회원 로그인이 필요해요.' };
	const jpeg = (v, max) => { const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(v || '')); return m && m[1].length <= max ? m[1] : null; };
	let id = '';
	let small = '';
	if (!b.remove) {
		const big = jpeg(b.data, AVATAR_MAX);
		if (!big) return { ok: false, error: '사진을 확인해 주세요. (JPG, 너무 큰 사진은 안 돼요)' };
		const blob = Utilities.newBlob(Utilities.base64Decode(big), 'image/jpeg', `avatar-${Utilities.getUuid().slice(0, 8)}.jpg`); // 파일 이름에 번호 안 넣음
		try {
			const file = avatarFolder().createFile(blob);
			id = file.getId();
			try {
				file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
			} catch (err) {
				// 계정·조직 정책으로 링크 공유가 막혀도 원본은 폴더에 두고, 화면엔 시트의 작은 사진을 씀 (항상 보이게)
				console.error('avatar share 거부 → 시트 작은 사진으로 표시', err);
				small = jpeg(b.small, SMALL_MAX) ? String(b.small) : '';
			}
		} catch (err) {
			// 대개 드라이브 쓰기 권한 미승인 또는 폴더 편집 권한 없음 → 시트에 작은 사진으로
			console.error('avatar drive save (시트에 작은 사진으로 대신 저장)', err);
			const s = jpeg(b.small, SMALL_MAX);
			if (!s) return { ok: false, error: '사진을 저장하지 못했어요. 운영진에게 알려주세요. (드라이브 폴더 권한 확인)' };
			small = 'data:image/jpeg;base64,' + s;
		}
	}
	const lock = LockService.getScriptLock();
	lock.waitLock(10000);
	try {
		const sheet = tabOf(PROFILE_SHEET, PROFILE_HEAD);
		let t = applyTable(sheet);
		// 예전에 만든 탭이면 머리글 칸 채우기 (사진데이터 열 추가 등)
		PROFILE_HEAD.forEach((h) => {
			if (!t.labels.includes(h)) sheet.getRange(1, t.labels.filter(Boolean).length + 1).setValue(h), (t = applyTable(sheet));
		});
		const at = t.rows.findIndex((r) => normPhone(r['연락처']) === phone);
		const old = at >= 0 ? String(t.rows[at]['사진ID'] || '') : '';
		const line = new Array(t.labels.length).fill('');
		const put = (h, v) => (line[t.labels.indexOf(h)] = v);
		put('연락처', formatPhone(phone));
		put('사진ID', id);
		put('변경일시', new Date());
		put('사진데이터', small);
		if (at >= 0) sheet.getRange(at + 2, 1, 1, line.length).setValues([line]);
		else if (id || small) sheet.appendRow(line);
		if (old && old !== id) {
			try {
				DriveApp.getFileById(old).setTrashed(true);
			} catch (err) {} // 이미 지워졌으면 무시
		}
	} finally {
		lock.releaseLock();
	}
	return { ok: true, photo: small || id };
}

// 연락처 → 사진: 시트 작은 사진이 있으면 그것(드라이브 링크 공유가 막힌 경우 등), 없으면 드라이브 파일 id
function profilePhotos() {
	const book = SpreadsheetApp.getActiveSpreadsheet();
	const sheet = book.getSheetByName(PROFILE_SHEET);
	const out = {};
	if (!sheet) return out;
	for (const r of applyTable(sheet).rows) {
		const photo = String(r['사진데이터'] || '').trim() || String(r['사진ID'] || '').trim();
		if (photo) out[normPhone(r['연락처'])] = photo;
	}
	return out;
}

// 프로필 사진 폴더: AVATAR_FOLDER_ID 지정 폴더 → 없으면 스크립트 주인 드라이브에 만든 폴더 (id는 스크립트 속성에 기억)
function avatarFolder() {
	if (AVATAR_FOLDER_ID) return DriveApp.getFolderById(AVATAR_FOLDER_ID);
	const props = PropertiesService.getScriptProperties();
	const saved = props.getProperty('AVATAR_FOLDER_ID');
	if (saved) {
		try {
			return DriveApp.getFolderById(saved);
		} catch (err) {} // 폴더가 지워졌으면 새로 만듦
	}
	const it = DriveApp.getFoldersByName(AVATAR_FOLDER);
	const folder = it.hasNext() ? it.next() : DriveApp.createFolder(AVATAR_FOLDER);
	props.setProperty('AVATAR_FOLDER_ID', folder.getId());
	return folder;
}

// ── 모임 ──
// 다가오는 모임 + 참석 인원. 회원 토큰이면 내가 신청했는지(mine)와 참석자 이름(names)도 — 비회원에겐 이름 안 보냄, 번호는 누구에게도 안 보냄
function events(token) {
	const phone = token ? verify(token) : null;
	const isMember = !!(phone && readMembers().some((m) => m.phone === phone));
	const going = rsvpTable().t.rows.filter((r) => String(r['상태']).trim() === '참석');
	const photos = isMember ? profilePhotos() : {};
	const list = upcomingEvents().map((e) => {
		const mine = going.filter((r) => String(r['모임ID']) === e.id);
		const out = { id: e.id, date: dayLabel(e.start), end: e.end ? dayLabel(e.end) : '', place: e.place, note: e.note, tag: e.tag, cap: e.cap, count: mine.length, mine: isMember && mine.some((r) => normPhone(r['연락처']) === phone) };
		if (isMember) {
			out.names = mine.map((r) => String(r['이름']).trim()); // 신청 순서대로
			out.people = mine.map((r) => ({ name: String(r['이름']).trim(), photo: photos[normPhone(r['연락처'])] || '' }));
		}
		return out;
	});
	return { ok: true, member: isMember, expired: !!token && !isMember, events: list };
}

// 참석(go: true) / 취소(go: false). 회원만, 정원 넘으면 거부. 잠금으로 동시 신청 막음
function rsvp(b) {
	const phone = verify(b.token);
	const me = phone ? readMembers().find((m) => m.phone === phone) : null;
	if (!me) return { ok: false, expired: true, error: '회원 로그인이 필요해요.' };
	const lock = LockService.getScriptLock();
	lock.waitLock(10000);
	try {
		const ev = upcomingEvents().find((e) => e.id === String(b.id));
		if (!ev) return { ok: false, error: '신청할 수 없는 모임이에요. (지났거나 없는 모임)' };
		const { sheet, t } = rsvpTable();
		const at = t.rows.findIndex((r) => String(r['모임ID']) === ev.id && normPhone(r['연락처']) === phone);
		const goingNow = t.rows.filter((r) => String(r['모임ID']) === ev.id && String(r['상태']).trim() === '참석').length;
		const already = at >= 0 && String(t.rows[at]['상태']).trim() === '참석';
		const go = b.go === true;
		if (go && !already && ev.cap && goingNow >= ev.cap) return { ok: false, error: '정원이 다 찼어요.' };
		if (go !== already) {
			if (at >= 0) {
				sheet.getRange(at + 2, t.labels.indexOf('상태') + 1).setValue(go ? '참석' : '취소');
				sheet.getRange(at + 2, t.labels.indexOf('변경일시') + 1).setValue(new Date());
			} else if (go) {
				sheet.appendRow([ev.id, rangeLabel(ev), ev.place, me.name, formatPhone(phone), '참석', new Date()]);
			}
		}
	} finally {
		lock.releaseLock();
	}
	return events(b.token);
}

// 아직 안 끝난 모임(종료일, 없으면 시작일이 오늘 이후), 시작일순. ID 칸이 비었으면 만들어서 시트에 적음 (신청 기록과 연결되는 키)
function upcomingEvents() {
	const sheet = tabOf(EVENT_SHEET, EVENT_HEAD);
	const t = applyTable(sheet);
	const idCol = t.labels.indexOf('ID') + 1;
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const list = [];
	t.rows.forEach((r, k) => {
		const start = toDate(r['시작일'] ?? r['날짜']);
		let end = toDate(r['종료일']);
		if (end && start && end <= start) end = null; // 같은 날이거나 거꾸로 적으면 하루짜리로
		const place = String(r['장소'] || '').trim();
		if (!start || !place) return;
		let id = String(r['ID'] || '').trim();
		if (!id && idCol) {
			id = Utilities.getUuid().slice(0, 8);
			sheet.getRange(k + 2, idCol).setValue(id);
		}
		if ((end || start) >= today) list.push({ id, start, end, place, note: String(r['내용'] || '').trim(), tag: String(r['태그'] || '').trim(), cap: Number(r['정원']) || 0 });
	});
	return list.sort((a, b) => a.start - b.start);
}

function rsvpTable() {
	const sheet = tabOf(RSVP_SHEET, RSVP_HEAD);
	return { sheet, t: applyTable(sheet) };
}

// 탭이 없으면 머리글과 함께 만듦
function tabOf(name, head) {
	const book = SpreadsheetApp.getActiveSpreadsheet();
	let sheet = book.getSheetByName(name);
	if (!sheet) {
		sheet = book.insertSheet(name);
		sheet.appendRow(head);
		sheet.setFrozenRows(1);
	}
	return sheet;
}

// 날짜 칸: 날짜 셀 또는 '2026-12-13' / '2026.12.13' 글자
function toDate(v) {
	if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v) ? null : v;
	const m = String(v || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
	return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

// '01.10 토 ~ 01.11 일' (하루짜리는 시작일만)
function rangeLabel(e) {
	return e.end ? `${dayLabel(e.start)} ~ ${dayLabel(e.end)}` : dayLabel(e.start);
}

// 12.13 토
function dayLabel(d) {
	const p = (n) => String(n).padStart(2, '0');
	return `${p(d.getMonth() + 1)}.${p(d.getDate())} ${'일월화수목금토'[d.getDay()]}`;
}

// 갤러리 사진 목록 [{id, caption}] — 공개 정보만 (파일 id·이름)
function gallery() {
	const cache = CacheService.getScriptCache();
	const hit = cache.get('gallery');
	if (hit) return { ok: true, photos: JSON.parse(hit) };
	const files = DriveApp.getFolderById(GALLERY_FOLDER_ID).getFiles();
	const list = [];
	while (files.hasNext()) {
		const f = files.next();
		if (!/^image\//.test(f.getMimeType())) continue;
		list.push({ id: f.getId(), caption: photoCaption(f.getName()), t: f.getDateCreated().getTime() });
	}
	list.sort((a, b) => b.t - a.t); // 최신순
	const photos = list.map(({ id, caption }) => ({ id, caption }));
	try {
		cache.put('gallery', JSON.stringify(photos), GALLERY_CACHE_SEC);
	} catch (err) {} // 목록이 너무 크면 캐시만 건너뜀
	return { ok: true, photos };
}

// 파일 이름 → 설명. 휴대폰 기본 이름(IMG_1234 등)이면 설명 없음
function photoCaption(name) {
	const n = String(name).replace(/\.[^.]+$/, '').replace(/_+/g, ' ').trim();
	return /^(IMG|DSC|PXL|MVIMG|KakaoTalk|Screenshot|스크린샷|\d{8})/i.test(n) ? '' : n;
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
