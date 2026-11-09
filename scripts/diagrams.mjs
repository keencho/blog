/**
 * 글 안의 mermaid 블록을 SVG 로 구워 content/diagrams/ 에 저장한다.
 *
 *   npm run diagrams
 *
 * 이미 구워진 것은 건너뛴다. 그래서 바뀐 다이어그램만 다시 굽는다.
 * 결과 SVG 를 커밋해두면 빌드에는 Playwright 가 필요 없다.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'node:fs/promises';
import { DIAGRAM_DIR, ICON_DIR, ROOT, THEME, diagramId, tokenize } from './mermaid-shared.mjs';

const POSTS = path.join(ROOT, 'content', 'posts');
const MERMAID_UMD = path.join(ROOT, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js');

async function listMarkdown(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listMarkdown(p)));
    else if (e.name.endsWith('.md') || e.name.endsWith('.mdx')) out.push(p);
  }
  return out;
}

/** 글에서 mermaid 블록을 뽑는다 */
async function collect() {
  const found = new Map(); // id -> { code, posts: [] }
  for (const file of await listMarkdown(POSTS)) {
    const src = await fs.readFile(file, 'utf8');
    for (const m of src.matchAll(/^```mermaid[^\n]*\n([\s\S]*?)^```/gm)) {
      const code = m[1].trim();
      const id = diagramId(code);
      if (!found.has(id)) found.set(id, { code, posts: [] });
      found.get(id).posts.push(path.relative(POSTS, file));
    }
  }
  return found;
}

async function loadIconPacks() {
  let names = [];
  try {
    names = (await fs.readdir(ICON_DIR)).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  return Promise.all(
    names.map(async (f) => ({
      name: path.basename(f, '.json'),
      body: JSON.parse(await fs.readFile(path.join(ICON_DIR, f), 'utf8')),
    }))
  );
}

async function render(items) {
  const { chromium } = await import('playwright');
  const iconPacks = await loadIconPacks();

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');
  await page.addScriptTag({ path: MERMAID_UMD });

  await page.evaluate(
    ({ theme, packs }) => {
      // 아이콘 팩을 등록해야 architecture-beta 의 AWS 아이콘이 나온다
      if (packs.length && window.mermaid.registerIconPacks) {
        window.mermaid.registerIconPacks(
          packs.map((p) => ({ name: p.name, loader: () => p.body }))
        );
      }
      window.mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', ...theme });
    },
    { theme: THEME, packs: iconPacks }
  );

  const out = [];
  for (const [id, { code }] of items) {
    const svg = await page.evaluate(async ([id, code]) => {
      const { svg } = await window.mermaid.render('d' + id, code);
      return svg;
    }, [id, code]);
    out.push([id, svg]);
  }

  await browser.close();
  return out;
}

async function main() {
  await fs.mkdir(DIAGRAM_DIR, { recursive: true });
  const found = await collect();

  const have = new Set(
    (await fs.readdir(DIAGRAM_DIR).catch(() => [])).filter((f) => f.endsWith('.svg'))
      .map((f) => path.basename(f, '.svg'))
  );

  const todo = new Map([...found].filter(([id]) => !have.has(id)));

  // --check : 빠진 게 있는지만 본다. 굽지 않는다
  if (process.argv.includes('--check')) {
    if (todo.size) {
      console.log(`${todo.size}개를 구워야 한다`);
      process.exit(1);
    }
    console.log(`다이어그램 ${found.size}개 모두 준비됨`);
    return;
  }

  console.log(`다이어그램 ${found.size}개 · 이미 구워진 것 ${found.size - todo.size}개`);

  if (todo.size) {
    console.log(`${todo.size}개를 굽는다…`);
    const started = Date.now();
    for (const [id, svg] of await render(todo)) {
      await fs.writeFile(path.join(DIAGRAM_DIR, `${id}.svg`), tokenize(svg), 'utf8');
      console.log(`  ${id}  ${found.get(id).posts[0]}`);
    }
    console.log(`${((Date.now() - started) / 1000).toFixed(1)}초`);
  }

  // 글에서 사라진 다이어그램은 지운다
  const stale = [...have].filter((id) => !found.has(id));
  for (const id of stale) await fs.unlink(path.join(DIAGRAM_DIR, `${id}.svg`));
  if (stale.length) console.log(`안 쓰는 그림 ${stale.length}개 지움`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
