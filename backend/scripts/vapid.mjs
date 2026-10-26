// 앱 알림(웹 푸시) 서명 키 만들기 — 한 번만: cd backend && node scripts/vapid.mjs
// P-256 개인키(JWK)를 만들어 Worker secret VAPID_JWK로 바로 넣음 (화면, 파일에 안 남김). 공개키는 Worker가 push.key로 줌
// 다시 만들면 예전 구독은 전부 무효 → 운영진이 마이페이지에서 앱 알림을 다시 켜야 함
import { execFileSync } from 'node:child_process';

const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
execFileSync('npx', ['wrangler', 'secret', 'put', 'VAPID_JWK'], { input: JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d }), stdio: ['pipe', 'inherit', 'inherit'] });
console.log('\n✅ VAPID_JWK를 넣었어요. 마이페이지 → 앱 알림으로 확인해 보세요.');
