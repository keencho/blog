// 이 파일만 고치면 다른 블로그가 된다.
// src/ 안에는 사이트 고유 값을 박지 않는다 (grep -r "keencho" src/ 가 비어야 함)

export type MermaidMode = 'build' | 'client' | 'off';

export interface BlogConfig {
  title: string;
  description: string;
  url: string;
  author: string;
  lang: string;

  contentDir: string;
  imageDir: string;

  mermaid: MermaidMode;
  search: boolean;
  comments: { repo: string; repoId: string; category: string; categoryId: string } | false;
  analytics: string | null;

  nav: { href: string; label: string }[];
  links: { label: string; href: string }[];

  postsPerPage: number;
  accent: { light: string; dark: string };
  measure: string;
  bodySize: string;
}

const config: BlogConfig = {
  title: "keencho's blog",
  description: '이것저것 정리하는 블로그.',
  url: 'https://blog.keencho.com',
  author: 'keencho',
  lang: 'ko',

  // 글 저장소를 분리하면 이 줄만 바꾼다
  contentDir: './content/posts',
  imageDir: './public/assets/img',

  // 무거운 것은 옵트인. 템플릿 기본값은 'client' 로 둔다
  mermaid: 'build',
  search: true,
  comments: false,
  analytics: 'G-DKP01F3102',

  nav: [
    { href: '/', label: '글' },
    { href: '/categories/', label: '분류' },
    { href: '/about/', label: '소개' },
  ],
  links: [
    { label: '이력서', href: 'https://keencho.com' },
    { label: 'GitHub', href: 'https://github.com/keencho' },
    { label: '메일', href: 'mailto:seyoung050412@gmail.com' },
  ],

  postsPerPage: 10,
  accent: { light: '#1d47a5', dark: '#8ab0ee' },
  measure: '47.5rem',
  bodySize: '17px',
};

export default config;
