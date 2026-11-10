/**
 * 탭 아이콘(파비콘)을 만든다.
 *
 *   npm run favicon
 *
 * 액센트 색은 blog.config.ts 에서 가져온다.
 * 글자를 바꾸려면 아래 GLYPH 의 path 하나만 갈아끼우면 된다 (64×64 기준).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const cfg = (await import('../blog.config.ts')).default;

const BG = cfg.accent.light;
const FG = '#ffffff';

// 소문자 k — 선이 아니라 면으로 그렸다. 대각선이 세로획에 붙어 활자처럼 보인다
const GLYPH = 'M19 13h8v22.5l11.5-11.5h10L36.5 35.5 49 51h-10L27 36.5V51h-8z';

/** rx: 모서리 둥글기. iOS 는 제가 알아서 자르므로 0 으로 준다 */
const icon = (rx) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="${rx}" fill="${BG}"/>
<path fill="${FG}" d="${GLYPH}"/>
</svg>`;

const pub = (f) => path.join(ROOT, 'public', f);

// 1) 브라우저 탭용 — 벡터 그대로
await fs.writeFile(pub('favicon.svg'), icon(14), 'utf8');

// 2) 래스터 — 구형 브라우저와 iOS 홈 화면용
const { chromium } = await import('playwright');
const browser = await chromium.launch();

async function png(svg, size, out) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<body style="margin:0"><div style="width:${size}px;height:${size}px">${svg}</div></body>`,
    { waitUntil: 'load' },
  );
  const buf = await page.screenshot({ type: 'png' });
  await page.close();
  if (out) await fs.writeFile(pub(out), buf);
  return buf;
}

// iOS 홈 화면 — 모서리를 iOS 가 자르므로 각진 사각으로 굽는다
await png(icon(0), 180, 'apple-touch-icon.png');
// 안드로이드 홈 화면
await png(icon(14), 192, 'icon-192.png');
await png(icon(14), 512, 'icon-512.png');

const p32 = await png(icon(14), 32, null);
const p16 = await png(icon(14), 16, null);
await browser.close();

// 3) favicon.ico — PNG 를 그대로 담을 수 있다
function ico(images) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0); // 예약
  head.writeUInt16LE(1, 2); // 1 = 아이콘
  head.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const dirs = [];
  for (const { size, buf } of images) {
    const d = Buffer.alloc(16);
    d.writeUInt8(size >= 256 ? 0 : size, 0); // 너비
    d.writeUInt8(size >= 256 ? 0 : size, 1); // 높이
    d.writeUInt8(0, 2); // 팔레트 없음
    d.writeUInt8(0, 3); // 예약
    d.writeUInt16LE(1, 4); // 평면
    d.writeUInt16LE(32, 6); // 색 깊이
    d.writeUInt32LE(buf.length, 8);
    d.writeUInt32LE(offset, 12);
    dirs.push(d);
    offset += buf.length;
  }
  return Buffer.concat([head, ...dirs, ...images.map((i) => i.buf)]);
}

await fs.writeFile(
  pub('favicon.ico'),
  ico([
    { size: 16, buf: p16 },
    { size: 32, buf: p32 },
  ]),
);

// 4) 안드로이드가 홈 화면에 추가할 때 읽는 파일
const manifest = {
  name: cfg.title,
  short_name: cfg.title,
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
  ],
  theme_color: BG,
  background_color: '#fcfcfb',
  display: 'browser',
  start_url: '/',
};
await fs.writeFile(pub('site.webmanifest'), JSON.stringify(manifest, null, 2), 'utf8');

console.log(`파비콘 — 바탕 ${BG}`);
console.log('  favicon.svg · favicon.ico(16+32) · apple-touch-icon.png(180)');
console.log('  icon-192.png · icon-512.png · site.webmanifest');
