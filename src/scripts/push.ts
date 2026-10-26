// 앱 알림(웹 푸시) 켜기·끄기 — 브라우저 쪽 (서버 backend/src/push.ts, 알림 띄우기 public/sw.js)
// 아이폰은 홈 화면에 설치한 앱에서만 됨(애플 정책: iOS 16.4+, Safari 탭에선 PushManager가 없음)
import { app, call, store } from './session';

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
// 'on' | 'off' | 'denied'(설정에서 막음) | 'install'(아이폰 — 먼저 앱으로) | 'unsupported'
export async function pushState(): Promise<string> {
	if (!pushSupported()) return app.ios() && !app.installed() ? 'install' : 'unsupported';
	if (Notification.permission === 'denied') return 'denied';
	const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
	return sub && Notification.permission === 'granted' ? 'on' : 'off';
}
const keyBytes = (k: string) => Uint8Array.from(atob(k.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (k.length % 4)) % 4)), (c) => c.charCodeAt(0));

// 켜기: 알림 허락 → 구독 → 서버에 저장 → 시험 알림. 실패하면 이유 문구를 던짐
export async function pushOn() {
	if ((await Notification.requestPermission()) !== 'granted') throw new Error('알림이 허락되지 않았어요. 휴대폰 설정에서 FREE SNOW 알림을 허용해 주세요.');
	const token = store.get();
	const k = await call({ action: 'push.key', token });
	if (!k?.key) throw new Error(k?.error ?? '앱 알림이 아직 준비되지 않았어요.');
	const reg = await navigator.serviceWorker.ready;
	const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(k.key) }));
	const r = await call({ action: 'push.subscribe', token, subscription: sub.toJSON() });
	if (!r?.ok) throw new Error(r?.error ?? '서버에 연결하지 못했어요.');
	await call({ action: 'push.test', token }).catch(() => null);
}
export async function pushOff() {
	const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
	if (!sub) return;
	await call({ action: 'push.unsubscribe', token: store.get(), endpoint: sub.endpoint }).catch(() => null);
	await sub.unsubscribe();
}
