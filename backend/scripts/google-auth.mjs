// 시즌 사진을 드라이브로 보관하고 운영진 알림 메일(강습 요청)을 보내려고 Worker에 구글 권한을 한 번 연결 (동호회 구글 계정으로 로그인)
//   1) 구글 클라우드 콘솔에서 OAuth 클라이언트(데스크톱 앱)를 만들고 backend/.dev.vars 에
//      GOOGLE_CLIENT_ID=… / GOOGLE_CLIENT_SECRET=… 를 적음
//   2) cd backend && node scripts/google-auth.mjs → 브라우저에서 허용
//   → 세 값을 Worker secret으로 넣음 (화면·파일에 리프레시 토큰을 남기지 않음)
// 권한은 drive.file(이 앱이 만든 폴더·파일만 — 다른 드라이브 파일은 못 봄) + gmail.send(메일 보내기만 — 받은 메일은 못 읽음)
// 구글 클라우드 콘솔에서 Gmail API를 '사용'으로 켜 둘 것
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const vars = Object.fromEntries(readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split('\n').map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2]]));
const { GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: secret } = vars;
if (!id || !secret) throw new Error('backend/.dev.vars 에 GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET 을 먼저 적어 주세요.');

const port = 8976;
const redirect = `http://localhost:${port}`;
const url = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: id, redirect_uri: redirect, response_type: 'code', scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/gmail.send', access_type: 'offline', prompt: 'consent' })}`;
console.log('브라우저에서 이 주소를 열어 동호회 구글 계정으로 허용해 주세요:\n\n' + url + '\n');
try {
	execFileSync('open', [url]);
} catch {}

const server = createServer(async (req, res) => {
	const code = new URL(req.url, redirect).searchParams.get('code');
	if (!code) return res.end('code가 없어요.');
	const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: redirect, grant_type: 'authorization_code' }) });
	const token = await r.json();
	if (!token.refresh_token) {
		res.end('실패했어요. 터미널을 보세요.');
		console.error('리프레시 토큰을 못 받았어요:', token.error ?? token);
		return server.close();
	}
	const put = (name, value) => execFileSync('npx', ['wrangler', 'secret', 'put', name], { input: value, stdio: ['pipe', 'inherit', 'inherit'] });
	put('GOOGLE_CLIENT_ID', id);
	put('GOOGLE_CLIENT_SECRET', secret);
	put('GOOGLE_REFRESH_TOKEN', token.refresh_token);
	res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end('연결됐어요. 이 창을 닫아도 돼요.');
	console.log('\n✅ 연결됐어요. /admin → 사진 보관, 강습 요청 → 시험 메일로 확인해 보세요.');
	server.close();
});
server.listen(port);
