import type { APIContext } from 'astro';

// 검색 로봇에게 사이트맵 자리를 알려준다. 주소는 설정에서 받아 쓰므로
// 이 파일에는 사이트 고유 값이 들어가지 않는다.
export async function GET({ site }: APIContext) {
  const body = [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${new URL('sitemap-index.xml', site)}`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
