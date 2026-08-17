/**
 * sw.js — Service worker Web Push. Rôle minimal : afficher la notification reçue
 * et ouvrir le lien au tap. Aucun cache, aucune logique produit ici.
 * Le corps du message est un JSON { titre, corps, url } écrit côté serveur.
 */
self.addEventListener('push', (event) => {
	let data = { titre: 'Muscle Ton Jeu', corps: '', url: '/' };
	try {
		if (event.data) data = { ...data, ...event.data.json() };
	} catch (_e) {
		if (event.data) data.corps = event.data.text();
	}
	event.waitUntil(
		self.registration.showNotification(data.titre, {
			body: data.corps,
			// Icône de la notif (grande vignette) + badge (petite pastille Android, en
			// haut de l'écran). Fichiers servis depuis /static.
			icon: '/mtj-logo-192.png',
			badge: '/mtj-logo-192.png',
			data: { url: data.url || '/' },
			tag: data.url || 'mtj' // remplace une notif du même sujet plutôt que d'empiler
		})
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = (event.notification.data && event.notification.data.url) || '/';
	event.waitUntil(
		clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
			// Si un onglet du site est déjà ouvert, on le réutilise ; sinon on ouvre.
			for (const w of wins) {
				if ('focus' in w) {
					w.navigate ? w.navigate(url) : null;
					return w.focus();
				}
			}
			return clients.openWindow(url);
		})
	);
});
