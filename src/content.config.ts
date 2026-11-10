import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import config from '../blog.config';

// blog.config.ts 의 contentDir 한 줄만 바꾸면 글 저장소를 분리할 수 있다
const posts = defineCollection({
  loader: glob({
    pattern: '**/*.{md,mdx}',
    base: config.contentDir,
    // 파일은 연도 폴더 안에 날짜를 붙여 두지만 주소는 slug 만 쓴다.
    //   2021/2021-06-21-aws-cicd-1/index.md  ->  aws-cicd-1
    // 기본 규칙은 파일명을 소문자 kebab 으로 바꿔버리므로
    // 기존 주소(JPA-cache, jpa3.1)를 지키려면 직접 뽑아야 한다.
    generateId: ({ entry }) => {
      const dir = entry.replace(/\/index\.(md|mdx)$/, '').split('/').pop()!;
      return dir.replace(/^\d{4}-\d{2}-\d{2}-/, '');
    },
  }),
  schema: z.object({
    title: z.string(),
    author: z.string().optional(),
    date: z.coerce.date(),
    // 글을 실제로 고쳤을 때만 손으로 적는다. git 의 마지막 커밋을 쓰면
    // 오타 하나 고쳐도 「갱신됨」 이 찍혀 거짓이 된다 (실제로 제목 단계만
    // 바꾼 23편이 전부 그날짜로 찍혔다).
    // 화면에는 안 띄운다 — 날짜 한 줄은 무엇이 바뀌었는지 못 알려준다.
    // 바뀐 내용은 본문 그 자리에 적고, 이 값은 검색 엔진에만 나간다
    // (article:modified_time · JSON-LD dateModified).
    updated: z.coerce.date().optional(),
    categories: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    mermaid: z.boolean().optional(),
    draft: z.boolean().optional(),
  }),
});

export const collections = { posts };
