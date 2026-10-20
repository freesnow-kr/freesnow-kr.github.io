// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	site: 'https://yunj8649.github.io',
	base: '/free-snow',
	redirects: { '/ride': '/free-snow/' }, // 예전 /ride 링크 → 메인. 대상엔 base 자동으로 안 붙음
});
