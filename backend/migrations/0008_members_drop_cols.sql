-- members에서 안 쓰는 열 지움 (사용자 요구 2026-10-23)
--   is_active: 회원은 status(활동·정지·탈퇴)로 관리 — 다른 테이블의 is_active(소프트 삭제)는 그대로
--   role_old: 0006에서 role을 새로 만들며 남겨 둔 예전 열
ALTER TABLE members DROP COLUMN is_active;
ALTER TABLE members DROP COLUMN role_old;
