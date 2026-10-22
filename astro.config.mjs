// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
// 주소 https://freesnow-kr.github.io/ (저장소 freesnow-kr/freesnow-kr.github.io → 하위 경로 없음)
export default defineConfig({
	site: 'https://freesnow-kr.github.io',
	redirects: { '/ride': '/' }, // 예전 /ride 링크 → 메인
});
