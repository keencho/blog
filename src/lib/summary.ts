// 글을 공유했을 때 보일 요약을 본문에서 뽑는다.
//
// 그냥 "30자 넘는 첫 줄" 을 쓰면 엉뚱한 것이 잡힌다. 실제로 겪은 것:
//   - 소제목이 걸린다       `## **Terraform으로 … - 1. 개요**` → 검색 결과에 제목이 두 번
//   - 목차 줄이 걸린다      `1. [개요](/posts/…)` → 링크 글자만 남아 뜻이 없다
// 그래서 문단으로 보이지 않는 줄은 건너뛰고, 짧으면 다음 문단을 이어 붙인다.

/** 검색 결과에 보일 길이. 구글은 한글 기준 70~80자쯤 보여준다 */
const 넉넉한길이 = 150;
/** 이만큼은 모아야 한 줄짜리 문단에서 끝나지 않는다 */
const 모자란길이 = 70;

/** 글자만 남겨 견준다 — 공백·따옴표·가운뎃점 차이로 다른 문장이 되지 않게 */
const 뼈대 = (s: string) => s.replace(/[\s\-–—·:()[\]{}'"“”‘’.,!?]/g, '').toLowerCase();

/** 제목을 그대로 옮겨 적은 줄인가 (연재물 소제목에서 흔하다) */
function 제목되풀이(line: string, title: string): boolean {
  const a = 뼈대(line);
  const b = 뼈대(title);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  // 앞부분이 길게 겹치면 같은 제목에 꼬리만 다른 것으로 본다
  let i = 0;
  while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++;
  return i >= Math.min(12, Math.ceil(b.length * 0.6));
}

/** 문단이 아니라 구조물인 줄 — 소제목 · 목록 · 인용 · 표 · 구분선 · 원시 HTML */
function 구조물(line: string): boolean {
  return (
    /^#{1,6}\s/.test(line) ||
    /^(\d+[.)]|[-*+])\s/.test(line) ||
    /^[>|]/.test(line) ||
    /^(-{3,}|={3,}|\*{3,}|~{3,}|`{3,})\s*$/.test(line) ||
    /^<\/?\w/.test(line)
  );
}

/** 마크다운 꾸밈을 걷어 평문으로 */
const 평문 = (s: string) =>
  s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*`_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export function summarize(body: string | undefined, title = ''): string | undefined {
  if (!body) return undefined;

  const lines = body
    .replace(/^---[\s\S]*?---/, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/~~~[\s\S]*?~~~/g, '')
    .split(/\r?\n/);

  const 모음: string[] = [];
  for (const raw of lines) {
    const t = raw.trim();
    if (!t || 구조물(t)) continue;

    const s = 평문(t);
    if (s.length < 20) continue;
    if (제목되풀이(s, title)) continue;

    모음.push(s);
    if (모음.join(' ').length >= 모자란길이) break;
  }

  const out = 모음.join(' ').trim();
  return out ? out.slice(0, 넉넉한길이) : undefined;
}
