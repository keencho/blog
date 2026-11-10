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

/* 바탕은 액센트를 그대로 쓰지 않고 밝기만 50% 로 맞춘다.
   액센트(#1d47a5)는 본문 글자 옆에서 읽히라고 어둡게 잡은 색이라,
   16px 아이콘으로 쓰면 어두운 탭 막대에 묻힌다.
   실측 — 어두운 탭과의 구분: 1.91 → 2.80, 흰 글자 대비: 5.75 (기준 4.5) */
const toHsl = (h) => {
  const n = parseInt(h.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  const L = (mx + mn) / 2;
  const S = d === 0 ? 0 : d / (1 - Math.abs(2 * L - 1));
  let H = 0;
  if (d !== 0) H = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [H * 60, S, L];
};
const toHex = (H, S, L) => {
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const x = c * (1 - Math.abs(((H / 60) % 2) - 1));
  const m = L - c / 2;
  const [r, g, b] =
    H < 60 ? [c, x, 0] : H < 120 ? [x, c, 0] : H < 180 ? [0, c, x]
    : H < 240 ? [0, x, c] : H < 300 ? [x, 0, c] : [c, 0, x];
  const f = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return '#' + f(r) + f(g) + f(b);
};
/** 흰 글자와 짙은 글자 중 바탕에 더 잘 보이는 쪽을 고른다 */
const pickFg = (bg) => {
  const lin = (v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  const n = parseInt(bg.slice(1), 16);
  const lum = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  const onWhite = 1.05 / (lum + 0.05);
  const onInk = (lum + 0.05) / 0.07;
  return onWhite >= onInk ? '#ffffff' : '#0f1115';
};

const [h, s] = toHsl(cfg.accent.light);
const BG = toHex(h, s, 0.5);
const FG = pickFg(BG);

// 소문자 k — 선이 아니라 면으로 그렸다. 대각선이 세로획에 붙어 활자처럼 보인다
const GLYPH = 'M19 13h8v22.5l11.5-11.5h10L36.5 35.5 49 51h-10L27 36.5V51h-8z';

/** rx: 모서리 둥글기. iOS 는 제가 알아서 자르므로 0 으로 준다.
 *
 *  width·height 를 반드시 적는다. viewBox 만 있으면 브라우저가 SVG 의 기본 크기를
 *  300×150 으로 보고, 정사각형 그림을 가운데 맞춰 넣으면서 위아래에 흰 띠를 남긴다.
 *  크롬은 .ico 보다 SVG 를 먼저 쓰기 때문에 탭에서 바로 드러난다. */
const icon = (rx) => `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
<rect width="64" height="64" rx="${rx}" fill="${BG}"/>
<path fill="${FG}" d="${GLYPH}"/>
</svg>`;

const pub = (f) => path.join(ROOT, 'public', f);

// 1) 브라우저 탭용 — 벡터 그대로
await fs.writeFile(pub('favicon.svg'), icon(14), 'utf8');

// 2) 래스터 — 구형 브라우저와 iOS 홈 화면용
//
// 브라우저 스크린샷으로 굽지 않는다. SVG 가 inline 요소라 베이스라인만큼 아래로
// 밀리고, 16px 에서는 그 1픽셀 때문에 맨 윗줄이 흰 띠로 남는다.
// sharp 는 지정한 크기에 그대로 그려서 밀릴 여지가 없다.
const sharp = (await import('sharp')).default;

async function png(svg, size, out) {
  const buf = await sharp(Buffer.from(svg), { density: 384 })
    .resize(size, size, { fit: 'fill' })
    .png({ compressionLevel: 9 })
    .toBuffer();
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
