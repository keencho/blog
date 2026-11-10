/*
 * 스스로를 지우는 서비스 워커.
 *
 * 예전 Jekyll(Chirpy) 블로그가 이 경로에 PWA 워커를 깔아뒀다. 그게 살아 있으면
 * 새 사이트를 올려도 방문자는 캐시에 남은 옛 index.html 을 계속 본다.
 * 브라우저는 등록된 워커가 있으면 이 파일을 주기적으로 다시 받아 바뀌었는지 보는데,
 * 그때 이 코드가 들어가 캐시를 비우고 자기 등록을 지운 뒤 열린 탭을 새로 고친다.
 *
 * 옛 방문자가 전부 한 번씩 다녀가고 나면(몇 달 뒤) 이 파일은 지워도 된다.
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();

      // 지금 열려 있는 탭들을 새로 고쳐 새 사이트를 받게 한다
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        if ('navigate' in client) client.navigate(client.url);
      }
    })(),
  );
});

// 혹시 활성화 전에 요청이 오면 캐시를 거치지 않고 그대로 통과시킨다
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
