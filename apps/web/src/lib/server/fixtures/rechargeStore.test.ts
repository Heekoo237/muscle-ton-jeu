import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	creerTransaction,
	confirmerRecharge,
	rechargeEnCours,
	getTransaction,
	echouerRecharge,
	listerTransactions,
	genererReference,
	EXPIRATION_MINUTES,
	_resetMem
} from './rechargeStore';

const NEUF = { userId: 42, montant: 500, credits: 5, pays: 'CM', operateur: 'mtn', msisdn: '+237 691234567' };

beforeEach(() => _resetMem());

describe('rechargeStore — idempotence de la confirmation', () => {
	it('DEUX confirmations → UN SEUL crédit (non négociable)', async () => {
		const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const t = await creerTransaction(NEUF);

		const un = await confirmerRecharge(t.reference);
		expect(un).toEqual({ credite: 5, doubleConfirmation: false }); // crédit posé une fois

		const deux = await confirmerRecharge(t.reference);
		expect(deux).toEqual({ credite: 0, doubleConfirmation: true }); // JAMAIS un second crédit

		// Toute double confirmation est journalisée (le jour où l'agrégateur le fait, on le voit).
		expect(spy.mock.calls.flat().join(' ')).toContain('DOUBLE CONFIRMATION');
		spy.mockRestore();
	});

	it('une confirmation après un échec ne crédite pas', async () => {
		const t = await creerTransaction(NEUF);
		await echouerRecharge(t.reference);
		const r = await confirmerRecharge(t.reference);
		expect(r.credite).toBe(0);
		expect((await getTransaction(t.reference))?.statut).toBe('failed');
	});

	it('confirmer une référence inconnue ne crédite rien (et n’est pas une double conf.)', async () => {
		const r = await confirmerRecharge('MTJ-ZZZZZZ');
		expect(r).toEqual({ credite: 0, doubleConfirmation: false });
	});
});

describe('rechargeStore — garde double-recharge', () => {
	it('une transaction en attente est « en cours » pour l’utilisateur', async () => {
		const t = await creerTransaction(NEUF);
		const enCours = await rechargeEnCours(42);
		expect(enCours?.reference).toBe(t.reference);
	});

	it('après confirmation, plus de recharge en cours', async () => {
		const t = await creerTransaction(NEUF);
		await confirmerRecharge(t.reference);
		expect(await rechargeEnCours(42)).toBeNull();
	});

	it('après échec, plus de recharge en cours', async () => {
		const t = await creerTransaction(NEUF);
		await echouerRecharge(t.reference);
		expect(await rechargeEnCours(42)).toBeNull();
	});
});

describe('rechargeStore — expiration', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('une transaction dépasse le délai → « expired », et ne bloque plus', async () => {
		vi.setSystemTime(new Date('2026-08-16T12:00:00Z'));
		const t = await creerTransaction(NEUF);
		expect((await getTransaction(t.reference))?.statut).toBe('pending');

		// Au-delà du délai d'expiration.
		vi.setSystemTime(new Date(Date.now() + (EXPIRATION_MINUTES + 1) * 60_000));
		expect((await getTransaction(t.reference))?.statut).toBe('expired');
		expect(await rechargeEnCours(42)).toBeNull(); // une expirée ne bloque pas une nouvelle recharge
	});

	it('une transaction expirée ne peut plus être créditée', async () => {
		vi.setSystemTime(new Date('2026-08-16T12:00:00Z'));
		const t = await creerTransaction(NEUF);
		vi.setSystemTime(new Date(Date.now() + (EXPIRATION_MINUTES + 1) * 60_000));
		await getTransaction(t.reference); // déclenche l'expiration paresseuse
		const r = await confirmerRecharge(t.reference);
		expect(r.credite).toBe(0);
	});
});

describe('rechargeStore — références et historique', () => {
	it('la référence est lisible et unique (préfixe MTJ-)', () => {
		const a = genererReference();
		expect(a).toMatch(/^MTJ-[A-Z2-9]{6}$/);
		expect(a).not.toBe(genererReference());
	});

	it('l’historique liste les transactions de l’utilisateur, récentes d’abord', async () => {
		await creerTransaction(NEUF);
		await creerTransaction({ ...NEUF, montant: 2000, credits: 25 });
		const h = await listerTransactions(42);
		expect(h).toHaveLength(2);
		expect(h[0].creeLeMs).toBeGreaterThanOrEqual(h[1].creeLeMs);
	});
});
