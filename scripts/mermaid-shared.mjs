import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
export const DIAGRAM_DIR = path.join(ROOT, 'content', 'diagrams');
export const ICON_DIR = path.join(ROOT, 'content', 'icons');

/**
 * mermaid 가 색을 SVG 안에 박아 넣기 때문에, 중립색으로 굽고
 * 그 색을 CSS 변수로 바꿔 둔다. 그래야 한 번 구운 그림이 두 테마에 다 맞는다.
 */
export const THEME = {
  theme: 'base',
  themeVariables: {
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, sans-serif",
    fontSize: '14px',
    background: '#ffffff',
    primaryColor: '#eef1f4',
    primaryBorderColor: '#8d9ba5',
    primaryTextColor: '#18242b',
    secondaryColor: '#e3e8ec',
    tertiaryColor: '#f5f7f8',
    lineColor: '#8d9ba5',
    textColor: '#18242b',
    mainBkg: '#eef1f4',
    nodeBorder: '#8d9ba5',
    clusterBkg: '#f5f7f8',
    clusterBorder: '#c6cfd6',
    edgeLabelBackground: '#ffffff',
    actorBkg: '#eef1f4',
    actorBorder: '#8d9ba5',
    actorTextColor: '#18242b',
    signalColor: '#18242b',
    signalTextColor: '#18242b',
    labelBoxBkgColor: '#eef1f4',
    labelBoxBorderColor: '#8d9ba5',
    labelTextColor: '#18242b',
    loopTextColor: '#18242b',
    noteBkgColor: '#f3f4e8',
    noteBorderColor: '#c9caa8',
    noteTextColor: '#18242b',
    sequenceNumberColor: '#ffffff',
  },
  flowchart: { htmlLabels: false, useMaxWidth: true },
  sequence: { useMaxWidth: true },
  architecture: { useMaxWidth: true },
};

/** 굽는 조건이 바뀌면 올린다. 전부 다시 굽는다 */
export const RECIPE = 'v1';

/** 같은 다이어그램이면 같은 파일 이름이 나온다 */
export function diagramId(code) {
  return createHash('sha256')
    .update(RECIPE + '\n' + JSON.stringify(THEME) + '\n' + code.trim())
    .digest('hex')
    .slice(0, 16);
}

/** 구워진 SVG 의 색을 CSS 변수로 바꾼다 */
const MAP = {
  '#eef1f4': 'var(--mm-fill)',
  '#e3e8ec': 'var(--mm-fill-2)',
  '#f5f7f8': 'var(--mm-cluster)',
  '#c6cfd6': 'var(--mm-cluster-line)',
  '#8d9ba5': 'var(--mm-stroke)',
  '#18242b': 'var(--mm-text)',
  '#0a0807': 'var(--mm-text)',
  '#000000': 'var(--mm-text)',
  '#f3f4e8': 'var(--mm-note)',
  '#c9caa8': 'var(--mm-note-line)',
  '#ffffff': 'var(--mm-label-bg)',
};
const RE = new RegExp(Object.keys(MAP).join('|'), 'gi');

export function tokenize(svg) {
  return svg.replace(RE, (m) => MAP[m.toLowerCase()] ?? m);
}
