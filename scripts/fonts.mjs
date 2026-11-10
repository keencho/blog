/**
 * 본문 폰트를 블로그에 실제로 쓰인 글자만 담아 다시 굽는다.
 *
 *   npm run fonts
 *
 * Pretendard 가 기본으로 주는 건 유니코드 범위별로 쪼갠 조각 92개(3.2MB)다.
 * 브라우저는 글에 나온 글자가 걸린 조각만 받지만, 한글이 여러 조각에 흩어져 있어
 * 글 한 편에 13개 · 326KB 를 받는다.
 *
 * 블로그 전체가 쓰는 글자는 1,100여 자뿐이라(완성형 11,172자의 9%)
 * 그것만 담으면 조각 하나 151KB 로 끝난다.
 *
 * 굵기 축은 400~700 으로 좁힌다 — 블로그가 쓰는 범위다.
 * 실측: 통째로 210KB · 400~700 151KB · 고정 2벌 170KB · 고정 3벌 256KB
 *
 * 글을 새로 쓰면 글자가 늘 수 있으므로 build 가 이 스크립트를 먼저 돌린다.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const cfg = (await import('../blog.config.ts')).default;

const SRC = path.join(
  ROOT,
  'node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2',
);
const OUT_FONT = 'pretendard-subset.woff2';
const FONT_DIR = path.join(ROOT, 'public', 'fonts');

/** 글자가 들어 있을 만한 곳을 전부 훑는다 */
const SOURCES = [
  { dir: path.join(ROOT, cfg.contentDir), exts: ['.md', '.mdx'] },
  { dir: path.join(ROOT, 'src'), exts: ['.astro', '.ts', '.css'] },
  { dir: path.join(ROOT, 'content'), exts: ['.md', '.mdx'] },
];

/** 글에 없더라도 늘 들어가야 하는 것 — 숫자·영문·기호·한글 자모 */
const ALWAYS =
  ' !"#$%&\'()*+,-./0123456789:;<=>?@' +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`' +
  'abcdefghijklmnopqrstuvwxyz{|}~' +
  '·…‘’“”—–→←↑↓↔×÷≈≥≤°※「」『』〈〉《》' +
  'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';

async function walk(dir, exts, out) {
  let items;
  try {
    items = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const it of items) {
    const p = path.join(dir, it.name);
    if (it.isDirectory()) await walk(p, exts, out);
    else if (exts.some((e) => it.name.endsWith(e))) out.push(p);
  }
}

const files = [];
for (const s of SOURCES) await walk(s.dir, s.exts, files);

let text = ALWAYS + cfg.title + cfg.description + cfg.author;
for (const f of files) text += await fs.readFile(f, 'utf8');
for (const n of cfg.nav) text += n.label;
for (const l of cfg.links) text += l.label;

// 제어문자는 뺀다
const chars = [...new Set(text)]
  .filter((c) => c.codePointAt(0) > 31)
  .sort()
  .join('');

const src = await fs.readFile(SRC);
const subset = await subsetFont(src, chars, {
  targetFormat: 'woff2',
  variationAxes: { wght: { min: 400, max: 700 } },
});

await fs.mkdir(FONT_DIR, { recursive: true });
await fs.writeFile(path.join(FONT_DIR, OUT_FONT), subset);

const css = `/* Pretendard — SIL Open Font License 1.1
   https://github.com/orioncactus/pretendard
   이 파일과 ${OUT_FONT} 는 scripts/fonts.mjs 가 만든다. 직접 고치지 말 것. */
@font-face {
  font-family: 'Pretendard Variable';
  font-style: normal;
  font-display: swap;
  font-weight: 400 700;
  src: url(/fonts/${OUT_FONT}) format('woff2-variations');
}
`;
await fs.writeFile(path.join(FONT_DIR, 'pretendard.css'), css, 'utf8');

// 예전 방식으로 쪼개둔 조각들은 더 이상 쓰지 않는다
const oldDir = path.join(FONT_DIR, 'pretendard');
try {
  const n = (await fs.readdir(oldDir)).length;
  await fs.rm(oldDir, { recursive: true, force: true });
  console.log(`옛 조각 ${n}개 지움`);
} catch {}

const kb = (n) => (n / 1024).toFixed(0);
console.log(`글자 ${chars.length}자  ·  파일 ${files.length}개에서 모음`);
console.log(`${OUT_FONT}  ${kb(src.length)} KB → ${kb(subset.length)} KB`);
