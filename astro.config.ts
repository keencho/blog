import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { unified } from '@astrojs/markdown-remark';
import rehypeMermaidCached from './plugins/rehype-mermaid-cached.mjs';
import cfg from './blog.config';

// mermaid 는 Astro 코어 기능이 아니다. blog.config.ts 의 mermaid 값으로 고른다.
//   'build'  미리 구워둔 SVG 를 끼운다. 굽는 일은 `npm run diagrams` 가 한다
//            (독자가 받는 JS 0 · 빌드에 Playwright 불필요)
//   'client' 브라우저에서 그린다. mermaid JS 를 받아야 한다
//   'off'    코드블록 그대로
const rehypePlugins: any[] = [];
if (cfg.mermaid === 'build') {
  rehypePlugins.push(rehypeMermaidCached);
}

export default defineConfig({
  site: cfg.url,
  integrations: [mdx(), sitemap()],
  markdown: {
    // Astro 7 의 기본 처리기(Sätteri)는 rehype 플러그인을 실행하지 않는다
    processor: unified({ rehypePlugins }),

    // Shiki 가 먼저 돌면 mermaid 코드블록을 가로챈다
    syntaxHighlight: { type: 'shiki', excludeLangs: ['mermaid', 'math'] },
    shikiConfig: {
      // 두 테마를 같이 구워 CSS 변수로 전환한다 (JS 없이 다크모드)
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: false,
      wrap: false,
      // 글에 쓰던 표기를 그대로 쓸 수 있게 이름을 이어 붙인다.
      // 이게 없으면 회색 민무늬로 나온다
      langAlias: {
        Dockerfile: 'dockerfile',
        gradle: 'groovy',
        conf: 'ini',
        yml: 'yaml',
        sh: 'bash',
        shell: 'bash',
      },
    },
  },
});
