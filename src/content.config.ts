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
    categories: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    mermaid: z.boolean().optional(),
    draft: z.boolean().optional(),
  }),
});

export const collections = { posts };
