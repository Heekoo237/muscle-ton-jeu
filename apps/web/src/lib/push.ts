/**
 * push.ts — Abonnement Web Push côté NAVIGATEUR. Rien de secret ici : seule la clé
 * PUBLIQUE VAPID est utilisée. On demande la permission au bon moment (écran de
 * résultat), jamais à l'arrivée, et on gère explicitement le cas iOS.
 */
import { env } from '$env/dynamic/public';

/** État de capacité de l'appareil pour les notifications. */
export type PushEtat =
	| 'pret' // supporté, on peut demander
	| 'ios-a-installer' // iPhone en Safari, pas encore ajouté à l'écran d'accueil
	| 'non-supporte' // navigateur sans Web Push
	| 'refuse' // l'utilisateur a déjà refusé (on ne redemande jamais)
	| 'active'; // déjà autorisé

function estIOS(): boolean {
	if (typeof navigator === 'undefined') return false;
	const ua = navigator.userAgent;
	// iPhone/iPad classiques + iPad récent qui se déclare « Mac » mais tactile.
	return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function estInstalle(): boolean {
	if (typeof window === 'undefined') return false;
	return (
		window.matchMedia?.('(display-mode: standalone)').matches ||
		// iOS expose navigator.standalone quand l'app est lancée depuis l'écran d'accueil.
		(navigator as unknown as { standalone?: boolean }).standalone === true
	);
}

/** Diagnostic de capacité, pour afficher la bonne aide plutôt qu'un échec muet. */
export function pushCapability(): PushEtat {
	if (typeof window === 'undefined') return 'non-supporte';
	const supporte = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
	// iPhone hors app installée : Web Push indisponible → on explique, pas d'échec muet.
	if (estIOS() && !estInstalle()) return 'ios-a-installer';
	if (!supporte) return 'non-supporte';
	if (Notification.permission === 'granted') return 'active';
	if (Notification.permission === 'denied') return 'refuse';
	return 'pret';
}

/** VAPID base64url → Uint8Array attendu par pushManager.subscribe. */
function vapidToBytes(base64: string): Uint8Array {
	const pad = '='.repeat((4 - (base64.length % 4)) % 4);
	const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
	const raw = atob(b64);
	const out = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
	return out;
}

export type SubscribeResultat = 'ok' | 'refuse' | 'non-supporte' | 'erreur';

/**
 * Enregistre le service worker, demande la permission, s'abonne et envoie
 * l'abonnement au serveur. Renvoie un résultat explicite (jamais d'exception au
 * caller). Si l'utilisateur refuse, on ne redemande JAMAIS (posture du navigateur).
 */
export async function activerNotifications(): Promise<SubscribeResultat> {
	try {
		const cle = env.PUBLIC_VAPID_PUBLIC_KEY;
		if (!cle) return 'non-supporte';
		if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'non-supporte';

		const permission = await Notification.requestPermission();
		if (permission !== 'granted') return 'refuse';

		const reg = await navigator.serviceWorker.register('/sw.js');
		await navigator.serviceWorker.ready;

		const sub =
			(await reg.pushManager.getSubscription()) ??
			(await reg.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: vapidToBytes(cle) as BufferSource
			}));

		const res = await fetch('/api/push/subscribe', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(sub.toJSON())
		});
		return res.ok ? 'ok' : 'erreur';
	} catch (e) {
		console.error('[push] activation échouée', e);
		return 'erreur';
	}
}

/** Déclenche une notification de test vers les appareils de l'utilisateur. */
export async function envoyerTest(): Promise<boolean> {
	try {
		const res = await fetch('/api/push/test', { method: 'POST' });
		return res.ok;
	} catch {
		return false;
	}
}
