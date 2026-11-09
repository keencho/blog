import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'posts'>;

/**
 * 글을 가져오는 통로. 모든 페이지가 여기만 쓴다.
 * 여러 군데서 getCollection 을 직접 부르면 목록에선 빠졌는데
 * RSS 에는 남는 식으로 어긋난다.
 *
 * 아직 낼 때가 안 된 글은 content/drafts/ 에 있어 수집 대상이 아니다.
 */
export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection('posts', ({ data }) => !data.draft);
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

// ── 시리즈 ──────────────────────────────────────────────
// 주소 끝의 숫자로 묶는다.  aws-cicd-1 … aws-cicd-6
// 'java-17', 'aws-alb-static-ip-2021' 처럼 숫자가 번호가 아닌 것은 걸러야 한다.

const SERIES_RE = /^(.*?)-(\d{1,2})$/;   // 한두 자리만 — 연도(2021)는 안 걸린다

export interface Series {
  key: string;
  items: { no: number; post: Post }[];
  index: number;   // 이 글이 몇 번째인가 (0부터)
}

/** 같은 시리즈 글을 번호순으로 묶는다. 2편 이상일 때만 시리즈로 본다 */
export function buildSeries(posts: Post[]): Map<string, Series> {
  const groups = new Map<string, { no: number; post: Post }[]>();

  for (const post of posts) {
    const m = SERIES_RE.exec(post.id);
    if (!m) continue;
    const [, base, no] = m;
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base)!.push({ no: Number(no), post });
  }

  const out = new Map<string, Series>();
  for (const [key, items] of groups) {
    if (items.length < 2) continue;          // 혼자면 시리즈가 아니다
    items.sort((a, b) => a.no - b.no);
    items.forEach(({ post }, index) => out.set(post.id, { key, items, index }));
  }
  return out;
}

// ── 관련 글 ─────────────────────────────────────────────

/** 태그가 겹치는 글을 고른다. 같은 분류면 점수를 더 준다 */
export function related(post: Post, posts: Post[], limit = 3): Post[] {
  const tags = new Set(post.data.tags.map((t) => t.toLowerCase()));
  const cats = new Set(post.data.categories.map((c) => c.toLowerCase()));

  return posts
    .filter((p) => p.id !== post.id)
    .map((p) => {
      const tagHit = p.data.tags.filter((t) => tags.has(t.toLowerCase())).length;
      const catHit = p.data.categories.filter((c) => cats.has(c.toLowerCase())).length;
      return { p, score: tagHit * 2 + catHit };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.p.data.date.valueOf() - a.p.data.date.valueOf())
    .slice(0, limit)
    .map((x) => x.p);
}
