// 서비스 워커 — 홈 화면에 앱으로 설치(PWA) + 앱 알림(웹 푸시) (사용자 요구 2026-10-26)
// 화면·데이터는 아무것도 저장하지 않음: 늘 서버에서 새로 (예전 화면이 남는 문제 없게)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// 운영진 알림 (backend/src/push.ts가 암호화해 보낸 {title, body, url, tag})
self.addEventListener('push', (e) => {
	let m = {};
	try {
		m = e.data ? e.data.json() : {};
	} catch {}
	e.waitUntil(
		self.registration.showNotification(m.title || 'FREE SNOW', {
			body: m.body || '',
			icon: 'icon-192.png',
			badge: 'icon-192.png',
			tag: m.tag, // 같은 종류는 최신 것 하나만
			renotify: !!m.tag,
			data: { url: new URL(m.url || './', self.registration.scope).href },
		}),
	);
});
// 알림을 누르면 그 주소 (열린 창이 있으면 그 창으로)
self.addEventListener('notificationclick', (e) => {
	e.notification.close();
	const url = e.notification.data && e.notification.data.url;
	e.waitUntil(
		self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
			const win = list.find((c) => 'focus' in c);
			if (win) return win.navigate(url).then((c) => (c || win).focus());
			return self.clients.openWindow(url);
		}),
	);
});
