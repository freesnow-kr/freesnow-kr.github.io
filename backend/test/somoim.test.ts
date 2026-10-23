// 소모임 정모 — Apps Script 테스트(apps-script/Code.test.mjs 7번)와 같은 가짜 HTML. 한국 시간 계산, 이력 저장, 1시간 캐시
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { env, post, useDb } from './setup.ts';
import { parseSomoim } from '../src/somoim.ts';

useDb([]);
const y = new Date().getFullYear() + 1;
const item = (stamp: string, md: string, hm: string, title: string, place: string, fee: string, n: number, cap: number) =>
	`<div class="flex space-x-3"><div class="relative"><img src="https://cdn.example/group1${stamp}s1.png"/><p>${md}</p><p>${hm}</p></div><div><h3 class="x">${title}</h3><div><img src="/i_clock.svg"/></div><p>${md} ${hm}</p><div><img src="/i_location2.svg" alt=""/></div><p class="t">${place}</p><div><img src="/i_currency.svg" alt=""/></div><p class="t">${fee}</p><img src="https://cdn.example/face1t.png" alt="member face"/><div><span>${n}</span><span>/</span><span>${cap}</span></div></div></div>`;
const page = (count = 13) =>
	`<section><h2>정모 일정 <!-- -->3</h2><div class="grid">${item(`${y}11071300`, '11/7(토)', '오후 1:00', '●왁싱벙● &amp; 시즌준비', '온사이드 (양주)', '먹고놀고 앤분의하나', 18, 30)}${item(`${y}01102300`, '1/10(일)', '오후 11:00', '시즌방', '강촌', '10만원', count, 15)}${item('202001011000', '1/1(수)', '오전 10:00', '지난 정모', '어딘가', '', 1, 2)}</div></section>`;

let html = page();
let fetches = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (u: any, init?: any) => {
	if (!String(u).startsWith('https://somoim.example/')) return realFetch(u, init);
	fetches++;
	return new Response(html);
}) as typeof fetch;

test('읽기: Apps Script와 같은 목록, 시각은 한국 시간', () => {
	const list = parseSomoim(page(), new Date());
	assert.deepEqual(list.map((m) => [m.title, m.date.slice(0, 5), m.time, m.place, m.fee, m.count, m.cap]), [
		['시즌방', '01.10', '오후 11:00', '강촌', '10만원', 13, 15],
		['●왁싱벙● & 시즌준비', '11.07', '오후 1:00', '온사이드 (양주)', '먹고놀고 앤분의하나', 18, 30],
	]);
	assert.equal(list[0].start, `${y}-01-10T14:00:00.000Z`); // 23:00 KST
	assert.ok(list[0].date.endsWith('일'), '요일도 한국 날짜 기준');
	assert.equal(JSON.stringify(list).includes('face'), false);
	assert.deepEqual(parseSomoim('<html>바뀐 페이지</html>', new Date()), []);
});

test('이력 저장 + 1시간 캐시, 다시 읽으면 같은 줄의 인원만 바뀜, 지난 정모는 안 지움', async () => {
	const r = await post({ action: 'somoim' });
	assert.equal(r.ok, true);
	assert.equal(r.meetups.length, 2);
	await post({ action: 'somoim' });
	assert.equal(fetches, 1, '1시간 안엔 소모임에 다시 안 감');

	await env.DB.prepare("UPDATE cache SET expires_at = '2000-01-01T00:00:00.000Z'").run();
	html = page(14);
	await post({ action: 'somoim' });
	assert.equal(fetches, 2);
	const rows = (await env.DB.prepare('SELECT title, somoim_count, source, first_seen_at < updated_at OR first_seen_at = updated_at AS ok FROM meetups ORDER BY starts_at').all()).results;
	assert.deepEqual(rows.map((x: any) => [x.title, x.somoim_count, x.source]), [['시즌방', 14, 'somoim'], ['●왁싱벙● & 시즌준비', 18, 'somoim']]);

	await env.DB.prepare("UPDATE cache SET expires_at = '2000-01-01T00:00:00.000Z'").run();
	html = '<section><h2>정모 일정</h2></section>'; // 정모가 다 지나서 목록이 비어도
	assert.deepEqual((await post({ action: 'somoim' })).meetups, []);
	assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM meetups').first()).n, 2, '이력은 그대로');
});
