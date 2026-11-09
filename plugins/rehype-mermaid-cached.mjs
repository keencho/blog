import fs from 'node:fs';
import path from 'node:path';
import { visit } from 'unist-util-visit';
import { fromHtml } from 'hast-util-from-html';
import { DIAGRAM_DIR, diagramId } from '../scripts/mermaid-shared.mjs';

/**
 * mermaid 코드블록을 미리 구워둔 SVG 로 바꾼다.
 * 굽는 일은 `npm run diagrams` 가 하고, 여기서는 읽어서 끼우기만 한다.
 * 그래서 빌드에는 Playwright 가 필요 없다.
 */
export default function rehypeMermaidCached() {
  const cache = new Map();
  const missing = new Set();

  return (tree, file) => {
    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName !== 'pre' || !parent || index == null) return;
      const code = node.children?.find((c) => c.tagName === 'code');
      if (!code) return;

      const className = code.properties?.className ?? [];
      const isMermaid =
        (Array.isArray(className) && className.includes('language-mermaid')) ||
        code.properties?.dataLanguage === 'mermaid';
      if (!isMermaid) return;

      const source = code.children
        .map((c) => (c.type === 'text' ? c.value : ''))
        .join('')
        .trim();
      if (!source) return;

      const id = diagramId(source);
      if (!cache.has(id)) {
        const svgPath = path.join(DIAGRAM_DIR, `${id}.svg`);
        cache.set(id, fs.existsSync(svgPath) ? fs.readFileSync(svgPath, 'utf8') : null);
      }
      const svg = cache.get(id);

      if (!svg) {
        // 아직 안 구워진 다이어그램. 코드블록을 그대로 두고 한 번만 알린다
        if (!missing.has(id)) {
          missing.add(id);
          console.warn(
            `[mermaid] 구워지지 않은 다이어그램 ${id} (${file?.path ?? '?'}) — npm run diagrams`
          );
        }
        return;
      }

      const fragment = fromHtml(svg, { fragment: true, space: 'svg' });
      const el = fragment.children.find((c) => c.type === 'element');
      if (!el) return;

      // 본문에서 가운데 정렬·크기 제어를 하기 위한 표시
      el.properties = { ...el.properties, dataMermaid: '' };
      parent.children.splice(index, 1, el);
      return index + 1;
    });
  };
}
