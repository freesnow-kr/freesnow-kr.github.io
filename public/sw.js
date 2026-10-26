// 서비스 워커 — 홈 화면에 앱으로 설치(PWA)할 수 있게 하는 최소한 (사용자 요구 2026-10-26)
// 아무것도 저장하지 않음: 화면·데이터는 늘 서버에서 새로 (예전 화면이 남는 문제 없게). 나중에 운영진 앱 알림(웹 푸시)을 여기에
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
