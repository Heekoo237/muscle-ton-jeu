import { test, expect, type Page, type Route, type Request } from '@playwright/test';

/**
 * Le chemin d'UPLOAD — ce que tous les utilisateurs touchent en premier. On teste
 * le moteur de réessai côté client en MOCKANT la réponse de l'action serveur
 * (page.route), sans vision réelle ni base : déterministe, rapide, reproductible.
 *
 * Quatre cas : succès direct · échec puis réussite à l'essai 2 · double échec
 * (message + captures conservées) · HEIC refusé au bon message sans rien envoyer.
 */

// 1×1 PNG transparent (décodable par le navigateur) et octets NON décodables (~HEIC).
const PNG_1PX = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAdKzy8sAAAAASUVORK5CYII=',
	'base64'
);
const HEIC_BOGUS = Buffer.alloc(3000, 0);

// Réponses au FORMAT action SvelteKit (deserialize) : redirect sans data ; failure
// avec data dévalué (`[{erreur:1},"..."]`).
const redirectBody = (location: string) => JSON.stringify({ type: 'redirect', status: 303, location });
const failBody = (erreur: string) =>
	JSON.stringify({ type: 'failure', status: 422, data: JSON.stringify([{ erreur: 1 }, erreur]) });
const JSONH = { status: 200, contentType: 'application/json' };

/** Ouvre /analyser en ATTENDANT l'hydratation (sinon onPick n'est pas encore câblé
 *  en dev : les gestionnaires d'événements arrivent après le premier `load`). */
async function ouvrirAnalyser(page: Page) {
	await page.goto('/analyser', { waitUntil: 'networkidle' });
}

async function poserImageValide(page: Page) {
	await page
		.locator('input[name="capture_0"]')
		.setInputFiles({ name: 'ticket.png', mimeType: 'image/png', buffer: PNG_1PX });
	await expect(page.locator('.slot.filled img')).toBeVisible(); // onPick a accepté la capture
}

const estPostAction = (req: Request) => req.method() === 'POST';

test('succès au premier essai', async ({ page }) => {
	let posts = 0;
	await page.route('**/analyser', async (route: Route, req: Request) => {
		if (!estPostAction(req)) return route.fallback();
		posts += 1;
		await route.fulfill({ ...JSONH, body: redirectBody('/analyser?ok=1') });
	});

	await ouvrirAnalyser(page);
	await poserImageValide(page);
	await page.locator('button[type=submit]').click();

	await page.waitForURL('**/analyser?ok=1', { timeout: 10_000 });
	expect(posts).toBe(1); // aucun réessai
});

test('échec réseau puis réussite à l’essai 2', async ({ page }) => {
	let posts = 0;
	await page.route('**/analyser', async (route: Route, req: Request) => {
		if (!estPostAction(req)) return route.fallback();
		posts += 1;
		if (posts === 1) return route.fulfill({ ...JSONH, status: 422, body: failBody('incomplete') });
		await new Promise((r) => setTimeout(r, 600)); // laisse voir « On réessaie »
		await route.fulfill({ ...JSONH, body: redirectBody('/analyser?ok=1') });
	});
	let beacon: unknown = null;
	await page.route('**/api/analyse-retry', async (route: Route, req: Request) => {
		beacon = req.postDataJSON();
		await route.fulfill({ ...JSONH, body: '{"ok":true}' });
	});

	await ouvrirAnalyser(page);
	await poserImageValide(page);
	await page.locator('button[type=submit]').click();

	// L'utilisateur SAIT qu'on réessaie, avec un ordre de grandeur du temps.
	await expect(page.getByText(/On réessaie une dernière fois/)).toBeVisible();
	await page.waitForURL('**/analyser?ok=1', { timeout: 15_000 });
	expect(posts).toBe(2);
	expect(beacon).toEqual({ echec: false }); // l'essai 2 a sauvé → compté, non-échec
});

test('échec sur les DEUX essais → message honnête, captures conservées, échec compté', async ({
	page
}) => {
	let posts = 0;
	await page.route('**/analyser', async (route: Route, req: Request) => {
		if (!estPostAction(req)) return route.fallback();
		posts += 1;
		await route.fulfill({ ...JSONH, status: 422, body: failBody('incomplete') });
	});
	let beacon: unknown = null;
	await page.route('**/api/analyse-retry', async (route: Route, req: Request) => {
		beacon = req.postDataJSON();
		await route.fulfill({ ...JSONH, body: '{"ok":true}' });
	});

	await ouvrirAnalyser(page);
	await poserImageValide(page);
	await page.locator('button[type=submit]').click();

	// Message final : ni faute de l'outil, ni accusation de l'utilisateur.
	await expect(page.getByText(/n'est pas arrivée entière/)).toBeVisible({ timeout: 15_000 });
	// La capture reste affichée : un tap pour réessayer, sans refaire le geste.
	await expect(page.locator('.slot.filled img')).toBeVisible();
	expect(posts).toBe(2);
	// Le « bloqué à la porte » remonte bien (essai2_echec) — sinon il serait invisible.
	expect(beacon).toEqual({ echec: true });
});

test('HEIC refusé au bon message, aucun envoi', async ({ page }) => {
	let posted = false;
	await page.route('**/analyser', async (route: Route, req: Request) => {
		if (estPostAction(req)) posted = true;
		return route.fallback();
	});

	await ouvrirAnalyser(page);
	await page
		.locator('input[name="capture_0"]')
		.setInputFiles({ name: 'photo.heic', mimeType: 'image/heic', buffer: HEIC_BOGUS });

	await expect(page.getByText(/Fais plutôt une capture d'écran/)).toBeVisible();
	expect(posted).toBe(false); // rien n'est parti : inutile d'envoyer un fichier illisible
});
