-- 동의받는 내용(문구)을 시행일별로 보관 (사용자 요구 2026-10-26): 회원, 신청의 policy(= lib.ts POLICY_VERSION)가 이 표의 version을 가리킴
-- → 그 회원이 '어떤 문구'에 동의했는지 나중에도 확인 가능. 문구를 바꾸면 이 줄을 고치지 말고 새 version으로 줄을 더하고 POLICY_VERSION, privacy.astro 시행일도 같이
-- type: age14(만 14세 확인) / required(필수 동의) / optional(선택 동의) / emergency(비상 연락처 사용 체크) / notice(가입 화면 수집, 이용 안내 전체) / warning(허위 가입 안내) / policy(개인정보처리방침)
CREATE TABLE consent_terms (
  id INTEGER PRIMARY KEY,
  version TEXT NOT NULL,                      -- 시행일 '2026-10-26'
  type TEXT NOT NULL,
  required INTEGER NOT NULL CHECK (required IN (0, 1)),
  title TEXT NOT NULL,                        -- 체크박스, 제목 문구 그대로
  body TEXT NOT NULL,                         -- 함께 보여 준 안내 문구 그대로 (없으면 '')
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT,
  updated_at TEXT,
  UNIQUE (version, type)
);
CREATE TRIGGER consent_terms_stamp_insert AFTER INSERT ON consent_terms WHEN NEW.created_at IS NULL OR NEW.updated_at IS NULL
BEGIN
  UPDATE consent_terms SET created_at = coalesce(NEW.created_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at = coalesce(NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE rowid = NEW.rowid;
END;
CREATE TRIGGER consent_terms_stamp_update AFTER UPDATE ON consent_terms WHEN NEW.updated_at IS OLD.updated_at
BEGIN
  UPDATE consent_terms SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE rowid = NEW.rowid;
END;

-- 2026-10-26 가입 화면 (src/pages/signup.astro) 문구 그대로
INSERT INTO consent_terms (version, type, required, title, body) VALUES
('2026-10-26', 'age14', 1, '만 14세 이상이에요 (필수)', ''),
('2026-10-26', 'required', 1, '필수 항목 수집, 이용에 동의해요 (필수)',
 '필수 항목: 휴대폰 번호(아이디 — 알아볼 수 없게 바꿔서 저장), 비밀번호, 이름, 성별 — 회원 로그인, 중복 가입 방지, 출격, 시즌방 명단, 정모 조 편성
보유 기간: 탈퇴 또는 가입 거절 시 지체 없이 삭제
필수 항목에 동의하지 않으면 가입할 수 없어요.'),
('2026-10-26', 'optional', 0, '선택 항목(출생연도, 거주지, 비상 연락처 사용) 수집, 이용에 동의해요 (선택)',
 '선택 항목: 출생연도, 거주지, 휴대폰 번호의 비상 연락처 사용 — 가입 확인(오픈채팅 닉네임과 맞춰 보기), 회원 명부 지역별 정리, 비상시 연락(운영진만 봐요)
보유 기간: 탈퇴 또는 가입 거절 시 지체 없이 삭제
선택 항목은 동의하지 않아도 가입할 수 있어요.'),
('2026-10-26', 'emergency', 0, '이 번호를 비상 연락처로도 써요 (선택) — 스키장 사고 등 비상시 운영진만 봐요', '선택 항목 동의를 함께 해야 저장돼요.'),
('2026-10-26', 'notice', 1, '개인정보 수집, 이용 안내',
 '필수 항목: 휴대폰 번호(아이디 — 알아볼 수 없게 바꿔서 저장), 비밀번호, 이름, 성별 — 회원 로그인, 중복 가입 방지, 출격, 시즌방 명단, 정모 조 편성
선택 항목: 출생연도, 거주지, 휴대폰 번호의 비상 연락처 사용 — 가입 확인(오픈채팅 닉네임과 맞춰 보기), 회원 명부 지역별 정리, 비상시 연락(운영진만 봐요)
보유 기간: 탈퇴 또는 가입 거절 시 지체 없이 삭제
필수 항목에 동의하지 않으면 가입할 수 없어요. 선택 항목은 동의하지 않아도 가입할 수 있어요.
서버는 해외(Cloudflare 등)에 있어요. 자세한 건 처리방침을 봐 주세요.'),
('2026-10-26', 'warning', 1, '가입 정보가 일치하지 않거나 허위 정보로 가입한 경우 예고 없이 탈퇴 처리돼요.', ''),
('2026-10-26', 'policy', 1, '개인정보처리방침 (시행일 2026년 10월 26일)', 'https://freesnow-kr.github.io/privacy/ — 저장소 src/pages/privacy.astro 의 2026-10-26 판');

-- 승인, 거절한 가입 신청 줄은 이제 바로 삭제함 (admin.signupDecide) — 예전에 처리하고 남은 줄도 지움
DELETE FROM signup_requests WHERE status != 'pending';
