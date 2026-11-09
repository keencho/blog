/**
 * 공유했을 때 보이는 기본 이미지(og.png)를 만든다.
 *
 *   npm run og
 *
 * 설정(제목·설명·액센트)이 바뀌었을 때만 다시 돌리면 된다.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const cfg = (await import('../blog.config.ts')).default;

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#fcfcfb"/>
  <rect width="1200" height="10" fill="${cfg.accent.light}"/>
  <text x="92" y="318" font-family="Pretendard, 'Malgun Gothic', -apple-system, sans-serif"
        font-size="78" font-weight="700" fill="#18242b" letter-spacing="-2.5">${esc(cfg.title)}</text>
  <text x="92" y="382" font-family="Pretendard, 'Malgun Gothic', -apple-system, sans-serif"
        font-size="31" fill="#5e6e78">${esc(cfg.description)}</text>
  <rect x="92" y="436" width="70" height="4" fill="${cfg.accent.light}"/>
</svg>`;

await fs.writeFile(path.join(ROOT, 'public', 'og.svg'), svg, 'utf8');

// 공유 미리보기는 SVG 를 안 받는 곳이 많아 PNG 로도 굽는다
const { chromium } = await import('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(`<body style="margin:0">${svg}</body>`, { waitUntil: 'load' });
await page.screenshot({ path: path.join(ROOT, 'public', 'og.png') });
await browser.close();

console.log(`og.png — ${cfg.title} / ${cfg.description}`);
