// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
// 주소 https://freesnow.org/ (저장소 freesnow-kr/freesnow-kr.github.io, GitHub Pages 사용자 지정 도메인 → 하위 경로 없음. 예전 github.io 주소는 GitHub가 여기로 넘김)
export default defineConfig({
	site: 'https://freesnow.org',
	redirects: { '/ride': '/' }, // 예전 /ride 링크 → 메인
});
