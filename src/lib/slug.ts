// Jekyll 의 slugify(default 모드)와 같은 규칙.
// 기존 주소를 그대로 재현하려면 이 규칙이어야 한다.
//   'Spring Boot' -> 'spring-boot'
//   'Next.js'     -> 'next-js'
//   한글은 그대로 남는다
export const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
