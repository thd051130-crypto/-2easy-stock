// 홈 화면 앱용 서비스워커: 열 때마다 서버에 새 버전이 있는지 확인해서 띄우고, 오프라인이면 마지막으로 받은 화면·데이터를 보여줘요.
const CACHE = "easystock-v4";
const SHELL = ["./", "index.html", "style.css", "app.js", "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png"];

// 쿼리(?t=…)는 빼고 저장해요. 안 그러면 data.json을 열 때마다 캐시가 하나씩 쌓여요.
const keyOf = (url) => url.split("?")[0];

self.addEventListener("install", (e) => {
  // 오프라인용으로 미리 받아 두기. 하나가 실패해도 새 버전 설치는 막지 않아요.
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.all(SHELL.map((u) => {
      const url = new URL(u, self.location).href;
      return fetch(url, { cache: "reload" }).then((res) => (res.ok ? c.put(url, res) : null)).catch(() => null);
    })))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  // 전부 네트워크 먼저, 실패하면 캐시. GitHub Pages는 파일을 10분 동안 다시 묻지 말고 쓰라고 해서
  // 새 화면이 배포돼도 예전 화면이 떴어요. 그래서 매번 서버에 바뀐 게 있는지 물어봐요 (안 바뀌었으면 짧은 304 응답).
  const key = keyOf(req.url);
  e.respondWith(
    fetch(req, { cache: req.cache === "no-store" ? "no-store" : "no-cache" }).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(key, copy));
      }
      return res;
    }).catch(() => caches.match(key, { ignoreVary: true }).then((hit) => hit || Response.error()))
  );
});
