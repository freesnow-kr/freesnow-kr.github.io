"""구글 시트(파일 → 다운로드 → .xlsx) → D1 SQL. 한 번 옮기는 용도.

    python3 -I backend/scripts/import.py 시트.xlsx 출력.sql
    cd backend && npx wrangler d1 execute DB --remote --file 출력.sql

- 원본 시트는 읽기만 함. 출력 SQL·xlsx에는 개인정보가 있으니 저장소에 두지 말 것.
- 출력 SQL은 맨 앞에서 옮겨 오는 테이블을 비우고 다시 채움 → 운영 시작 전에만 다시 돌릴 것
  (비밀번호·세션·로그인 이력도 비움: 회원 ID가 바뀔 수 있어서).
- 회원 ID = 'm' + SHA-256(전화번호) 앞 12자리 → 다시 돌려도 같은 ID.
- 연락처로 회원을 못 찾은 줄은 버리지 않고 끝에 목록으로 알려 줌.
"""
import hashlib
import re
import sys
from datetime import date, datetime, timedelta, timezone

import openpyxl

KST = timezone(timedelta(hours=9))
src, out = sys.argv[1], sys.argv[2]
book = openpyxl.load_workbook(src, data_only=True)
report, skipped = [], []


def norm_phone(v):  # Apps Script normPhone과 같은 규칙
    d = digits(v)
    if d.startswith('8210') and len(d) >= 12:
        d = '0' + d[2:]
    if len(d) == 10 and d.startswith('10'):
        d = '0' + d
    if len(d) == 8:
        d = '010' + d
    return d


def digits(v):  # 엑셀 숫자 칸은 1984.0 처럼 소수로 옴 → '1984'
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return re.sub(r'\D', '', str(v if v is not None else ''))


def ymd(v):
    if isinstance(v, datetime):
        return v.strftime('%Y-%m-%d')
    if isinstance(v, date):
        return v.isoformat()
    m = re.match(r'\s*(\d{4})\D+(\d{1,2})\D+(\d{1,2})', str(v or ''))
    return f'{int(m[1]):04d}-{int(m[2]):02d}-{int(m[3]):02d}' if m else ''


def when(v):  # 시트의 날짜시각(한국 시간) → UTC ISO
    if isinstance(v, datetime):
        return (v if v.tzinfo else v.replace(tzinfo=KST)).astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')
    d = ymd(v)
    return d + 'T00:00:00.000Z' if d else '2026-01-01T00:00:00.000Z'


def text(v, n=300):
    s = '' if v is None else str(v)
    s = re.sub(r'\s+', ' ', s).strip()
    return s[1:] if s.startswith("'") else s[:n]  # 시트 수식 주입 방지로 붙였던 ' 는 뗌


def num(v):
    try:
        return None if v is None or str(v).strip() == '' else float(v)
    except ValueError:
        return None


def q(v):
    if v is None:
        return 'NULL'
    if isinstance(v, bool):
        return '1' if v else '0'
    if isinstance(v, (int, float)):
        return str(int(v)) if float(v).is_integer() else str(v)
    return "'" + str(v).replace("'", "''") + "'"


sql = []


def insert(table, cols, rows, conflict='OR IGNORE'):
    for r in rows:
        sql.append(f"INSERT {conflict} INTO {table} ({', '.join(cols)}) VALUES ({', '.join(q(x) for x in r)});")
    report.append(f'{table}: {len(rows)}')


def table(name, head_has=None):
    """탭 → [{머리글: 값}]. head_has가 있으면 그 머리글이 다 있는 줄을 머리글로 (위에 제목 줄 허용)"""
    if name not in book.sheetnames:
        report.append(f'(탭 없음: {name})')
        return []
    rows = list(book[name].iter_rows(values_only=True))
    h = 0
    if head_has:
        h = next((i for i, r in enumerate(rows) if all(x in [str(c).strip() for c in r if c is not None] for x in head_has)), None)
        if h is None:
            raise SystemExit(f"'{name}' 탭에서 {head_has} 머리글을 못 찾았어요.")
    labels = [str(c).strip() if c is not None else '' for c in rows[h]]
    return [dict(zip(labels, r)) for r in rows[h + 1 :] if any(c is not None and str(c).strip() for c in r)]


# backend/src/region.ts regionOf와 같은 규칙: 지역이면 짧게, 운영진·마스터면 거주지로 시도 찾기, 경기는 북부·남부
REGIONS = __import__('json').load(open(__import__('os').path.join(__import__('os').path.dirname(__file__), '../../src/data/regions.json'), encoding='utf-8'))
NORTH = ['의정부', '남양주', '구리', '양주', '포천', '동두천', '가평', '고양', '파주', '연천', '하남', '김포']
SHORT = {'충청북도': '충북', '충청남도': '충남', '경상북도': '경북', '경상남도': '경남', '전라북도': '전북', '전북특별자치도': '전북', '전라남도': '전남', '전남광주통합특별시': '전남'}
bare = lambda a: re.sub(r'[시군]$', '', a) if len(a) > 2 else a


def region_of(given, area):
    g, a = (given or '').strip(), bare((area or '').strip())
    sido = g if g and g not in ('운영진', '마스터', '회원') else ''
    if not sido and a:
        hits = [k for k, v in REGIONS.items() if any(bare(x) == a for x in v)]
        sido = hits[0] if len(hits) == 1 else ''
    if not sido:
        return ''
    if sido.startswith('경기'):
        return sido if re.search('북부|남부', sido) else ('경기북부' if a in NORTH else '경기남부')
    return SHORT.get(sido) or re.sub(r'(특별자치시|특별자치도|특별시|광역시|도)$', '', sido)


now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')
mid = lambda phone: 'm' + hashlib.sha256(phone.encode()).hexdigest()[:12]

# ── 회원 ──
member_tab = next((t for t in ['회원현황', '회원명부'] if t in book.sheetnames), book.sheetnames[0])
members, phones = [], {}
for i, r in enumerate(table(member_tab, ['이름', '비상연락망'])):
    name, phone = text(r.get('이름'), 40), norm_phone(r.get('비상연락망'))
    if not name or not phone:
        if name:
            skipped.append(f'연락처 없음: {name} — 로그인할 수 없어 빼고 옮김')
        continue
    if phone in phones:
        skipped.append(f'회원 중복 연락처 {phone[-4:]} ({name}) — 첫 줄만 씀')
        continue
    y, mo, d = digits(r.get('나이')), digits(r.get('(생일)월')), digits(r.get('(생일)일'))
    birth = f'{y}-{int(mo):02d}-{int(d):02d}' if len(y) == 4 and mo and d and 1 <= int(mo) <= 12 and 1 <= int(d) <= 31 else None
    grade = text(r.get('구분'), 20)  # 시트 '구분' = 지역 또는 운영진·마스터
    role = {'운영진': 'staff', '마스터': 'master'}.get(grade, 'member')  # 관리자(admin)는 옮긴 뒤 운영진 화면에서 지정
    gender = text(r.get('성별'), 2)
    phones[phone] = mid(phone)
    members.append([phones[phone], phone, name, gender if gender in ('남', '여') else None, birth, region_of(grade, text(r.get('거주지'), 40)), text(r.get('거주지'), 40), text(r.get('비공개연락처'), 60) or None, role, 'active', i + 1, now, now])
    if not birth:
        skipped.append(f'생년월일 없음: {name} — 첫 로그인을 못 하니 운영진이 초기화해 줘야 함')

sql += [f'DELETE FROM {t};' for t in ['meetup_attendees', 'meetups', 'ride_checks', 'room_owners', 'room_stays', 'snowlive_records', 'snowlive_links', 'season_passes', 'expense_logs', 'ride_logs', 'profiles', 'signup_requests', 'admin_logs', 'login_logs', 'sessions', 'member_credentials', 'members']]
insert('members', ['id', 'phone', 'name', 'gender', 'birth', 'region', 'area', 'private_contact', 'role', 'status', 'sort_no', 'created_at', 'updated_at'], members)


def who(v, tab, line):
    m = phones.get(norm_phone(v))
    if not m:
        skipped.append(f'{tab}: 회원을 못 찾은 줄 ({line})')
    return m


# ── 가입신청 (대기만) ──
rows = []
for r in table('가입신청'):
    p = norm_phone(r.get('비상연락망'))
    if str(r.get('상태') or '').strip() != '대기' or p in phones:
        continue
    y, mo, d = (digits(r.get(k)) for k in ['나이', '(생일)월', '(생일)일'])
    rows.append([when(r.get('신청일시')), text(r.get('이름'), 20), text(r.get('성별'), 2), f'{y}-{int(mo or 0):02d}-{int(d or 0):02d}', text(r.get('시도'), 20), text(r.get('거주지'), 20), p])
insert('signup_requests', ['created_at', 'name', 'gender', 'birth', 'sido', 'area', 'phone'], rows)

# ── 프로필 사진 ──
rows = []
for r in table('프로필'):
    m = who(r.get('연락처'), '프로필', text(r.get('사진ID'), 20))
    photo = text(r.get('사진데이터'), 10**6) or text(r.get('사진ID'), 200)
    if m and photo:
        rows.append([m, photo, when(r.get('변경일시'))])
insert('profiles', ['member_id', 'photo', 'updated_at'], rows, 'OR REPLACE')

# ── SHRED LOG ──
VISIT = {'date': '날짜', 'resort': '스키장', 'slot': '시간대', 'snow': '설질', 'style': '스타일', 'weather': '날씨', 'crew': '동행', 'temp': '기온', 'runs': '런수', 'hours': '라이딩시간', 'rating': '만족도', 'gear': '세팅', 'memo': '메모'}
rows = []
for r in table('출격기록'):
    m = who(r.get('연락처'), '출격기록', ymd(r.get('날짜')))
    if m:
        rows.append([m, str(r.get('ID')), ymd(r.get('날짜')), text(r.get('스키장'), 100)] + [text(r.get(VISIT[k]), 300 if k == 'memo' else 100) for k in ['slot', 'snow', 'style', 'weather', 'crew', 'gear', 'memo']] + [num(r.get(VISIT[k])) for k in ['temp', 'runs', 'hours', 'rating']] + [when(r.get('기록일시'))])
insert('ride_logs', ['member_id', 'id', 'date', 'resort', 'slot', 'snow', 'style', 'weather', 'crew', 'gear', 'memo', 'temp', 'runs', 'hours', 'rating', 'created_at'], rows)
rows = []
for r in table('지출기록'):
    m = who(r.get('연락처'), '지출기록', ymd(r.get('날짜')))
    if m and num(r.get('금액')):
        rows.append([m, str(r.get('ID')), ymd(r.get('날짜')), text(r.get('분류'), 40), int(num(r.get('금액'))), text(r.get('메모'), 100), text(r.get('출격ID'), 64) or None, when(r.get('기록일시'))])
insert('expense_logs', ['member_id', 'id', 'date', 'cat', 'amount', 'memo', 'visit_id', 'created_at'], rows)
rows = []
for r in table('시즌권'):
    m = who(r.get('연락처'), '시즌권', r.get('시즌'))
    if m:
        rows.append([m, text(r.get('시즌'), 5), int(num(r.get('시즌권가격')) or 0), int(num(r.get('일일권가격')) or 0), when(r.get('변경일시'))])
insert('season_passes', ['member_id', 'season', 'price', 'day_price', 'updated_at'], rows, 'OR REPLACE')

# ── 스노우라이브 ──
links, recs = {}, []
for r in table('스노우라이브기록'):
    m = who(r.get('연락처'), '스노우라이브기록', r.get('시즌'))
    sid = digits(r.get('스노우라이브ID'))
    if not m or not sid:
        continue
    links.setdefault(m, [m, sid, when(r.get('가져온시각'))])
    if text(r.get('시즌'), 5) and str(r.get('데이터') or '').startswith('{'):
        recs.append([m, text(r.get('시즌'), 5), str(r.get('데이터')), when(r.get('가져온시각'))])
insert('snowlive_links', ['member_id', 'snowlive_id', 'linked_at'], list(links.values()))
insert('snowlive_records', ['member_id', 'season', 'data', 'fetched_at'], recs, 'OR REPLACE')


# ── 시즌방·출격체크: 회원·날짜당 한 줄, 여러 줄이면 체크시각이 늦은 것 ──
def daily(tab, default):
    best = {}
    for r in table(tab):
        m, d = who(r.get('연락처'), tab, ymd(r.get('날짜'))), ymd(r.get('날짜'))
        if not m or not d:
            continue
        t = when(r.get('체크시각')) if r.get('체크시각') else '2000-01-01T00:00:00.000Z'
        k = text(r.get('구분'), 4) or default
        if (m, d) not in best or best[(m, d)][3] <= t:
            best[(m, d)] = [m, d, k, t]
    return list(best.values())


insert('room_stays', ['member_id', 'date', 'kind', 'updated_at'], daily('시즌방', '숙박'))
insert('ride_checks', ['member_id', 'date', 'status', 'updated_at'], daily('출격체크', '출격'))
rows = []
for r in table('시즌방주주'):
    m = who(r.get('연락처'), '시즌방주주', r.get('이름'))
    if m and text(r.get('시즌'), 5):
        rows.append([text(r.get('시즌'), 5), m])
insert('room_owners', ['season', 'member_id'], rows)

# ── 소모임 정모 이력 ──
rows = []
for r in table('소모임정모'):
    key = text(r.get('키'), 300)
    if key:
        start = key.split('|')[0]
        rows.append(['somoim:' + key, 'somoim', text(r.get('제목'), 100), start, text(r.get('장소'), 100), text(r.get('회비'), 100), num(r.get('정원')), num(r.get('인원')), when(r.get('처음본시각')), when(r.get('마지막본시각'))])
insert('meetups', ['id', 'source', 'title', 'starts_at', 'place', 'fee', 'capacity', 'somoim_count', 'first_seen_at', 'updated_at'], rows)

open(out, 'w', encoding='utf-8').write('\n'.join(sql) + '\n')
print('\n'.join(report))
if skipped:
    print('\n확인 필요:\n- ' + '\n- '.join(skipped))
