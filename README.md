# blog

Astro 로 만든 개인 블로그. `blog.keencho.com`

## 쓰는 법

```bash
npm install
npm run dev       # 다이어그램 확인 후 개발 서버
npm run build     # 다이어그램 + 빌드 + 검색 색인
```

글을 쓰려면 `content/posts/<연도>/<날짜>-<주소>/index.md` 를 만든다.
이미지는 **같은 폴더에 두고 `./이름.png` 로 부른다.** 그래야 WebP 변환과 크기 지정이 자동으로 붙는다.

```
content/posts/2026/2026-11-09-my-post/
├─ index.md
└─ shot.png        →  ![설명](./shot.png)
```

```yaml
---
title: 제목
author: keencho
date: 2026-11-09 20:00:00 +0900
categories: [AWS]
tags: [AWS, Security]
---
```

주소는 폴더 이름에서 날짜를 뗀 `/posts/my-post/` 가 된다.

## 아직 안 낼 글

`content/drafts/` 에 둔다. **`contentDir` 밖이라 수집조차 안 된다.** 날짜가 지나도 저절로 올라가지 않는다.
낼 때가 되면 `content/posts/<연도>/` 로 옮긴다. 이 폴더는 gitignore 다.

## 시리즈

주소가 `이름-숫자` 로 끝나고 **2편 이상**이면 시리즈로 본다. 글 끝에 전체 목차와 앞뒤 편이 붙는다.

```
aws-cicd-1 … aws-cicd-6            →  "6편 중 3편"
```

숫자는 **두 자리까지만** 본다. `java-17`, `aws-alb-static-ip-2021` 같은 건 시리즈가 아니다.
시리즈가 아닌 글에는 태그가 겹치는 **비슷한 글 3개**가 붙는다.

## 고치는 곳

**`blog.config.ts` 하나만 고치면 다른 블로그가 된다.** `src/` 안에는 사이트 고유 값을 두지 않는다.

```bash
grep -r "keencho" src/     # 아무것도 안 나와야 한다
```

| 설정 | 하는 일 |
|---|---|
| `contentDir` | 글이 있는 곳. 글 저장소를 분리하면 이 줄만 바꾼다 |
| `mermaid` | `'build'` 미리 구운 SVG · `'client'` 브라우저 렌더 · `'off'` 끔 |
| `search` | Pagefind 검색 |
| `analytics` | GA 측정 ID. 비우면 스크립트가 안 들어간다 |
| `accent` `measure` `bodySize` | 액센트 색 · 본문 폭 · 글자 크기 |

## 다이어그램

```bash
npm run diagrams          # 바뀐 것만 굽는다
npm run diagrams --check  # 빠진 게 있는지만 본다
```

mermaid 블록을 SVG 로 구워 `content/diagrams/<해시>.svg` 에 둔다. **그 SVG 를 커밋해두면 빌드에 Playwright 가 필요 없다.**

- 파일 이름이 다이어그램 내용의 해시라, 안 고친 것은 다시 굽지 않는다
- 색은 구울 때 CSS 변수로 바뀌어 저장된다. 그래서 한 번 구운 그림이 밝을 때·어두울 때 다 맞는다
- 아이콘 팩은 `content/icons/*.json` 에 넣는다. 파일 이름이 접두사가 된다 (`aws.json` → `aws:amazon-rds`)
- 굽는 조건을 바꿨으면 `scripts/mermaid-shared.mjs` 의 `RECIPE` 를 올린다

## 공유 이미지

```bash
npm run og    # 설정이 바뀌었을 때만
```

## 배포

GitHub Actions 에서 빌드하고 `wrangler` 로 Cloudflare Pages 에 올린다.

필요한 비밀값: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`

> Cloudflare Pages 는 **Git 연동과 Direct Upload 중 하나를 프로젝트 만들 때 정하고 나중에 못 바꾼다.**
> 이 저장소는 Direct Upload 를 쓴다.

## 기존 주소

Jekyll(Chirpy) 에서 넘어왔다. 기존 주소 149개를 그대로 재현한다.

- 태그·분류 주소는 Jekyll `slugify` 와 같은 규칙 (`src/lib/slug.ts`)
- `/page2/`~`/page9/` 는 `public/_redirects` 로 홈에 보낸다
