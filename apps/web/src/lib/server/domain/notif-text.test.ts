import { describe, it, expect } from 'vitest';
import { buildSettleNotification, buildMorningNotification, type SettleVerdictText } from './notif-text';
import { checkVocabulary } from './guards';

const base: SettleVerdictText = {
	originale: 'tombe',
	renforce: 'tombe',
	premierPerduMatchLabel: 'Rio Ave – Porto',
	premierPerduFragile: false,
	aRetire: false
};

describe('buildSettleNotification — quatre cas déterministes', () => {
	it('ticket passé → « Bien joué », sans promesse', () => {
		const n = buildSettleNotification({ ...base, originale: 'passe', renforce: 'passe' });
		expect(n?.corps).toBe('Ton ticket est passé. Bien joué.');
	});

	it('tombé, le renforcé aurait tenu → « Le renforcé serait passé »', () => {
		const n = buildSettleNotification({ ...base, aRetire: true, renforce: 'passe' });
		expect(n?.corps).toBe('Ton ticket est tombé sur Rio Ave – Porto. Le renforcé serait passé.');
	});

	it('tombé sur une ligne marquée fragile → on l’avait signalée', () => {
		const n = buildSettleNotification({ ...base, premierPerduFragile: true });
		expect(n?.corps).toBe(
			"Ton ticket est tombé sur Rio Ave – Porto. C'était la sélection qu'on avait marquée fragile."
		);
	});

	it('tombé sur une ligne gardée non fragile → simple, rien d’inventé', () => {
		const n = buildSettleNotification({ ...base });
		expect(n?.corps).toBe('Ton ticket est tombé sur Rio Ave – Porto.');
	});

	it('en attente → aucune notification', () => {
		expect(buildSettleNotification({ ...base, originale: 'en_attente' })).toBeNull();
	});

	it('porte l’URL du ticket quand fournie', () => {
		const n = buildSettleNotification({ ...base, originale: 'passe', renforce: 'passe' }, '/dashboard/historique/12');
		expect(n?.url).toBe('/dashboard/historique/12');
	});
});

describe('règle d’or n°2 — AUCUN vocabulaire de gain dans une notification', () => {
	// Tous les textes possibles passent le garde-fou de vocabulaire interdit.
	const variantes: SettleVerdictText[] = [
		{ ...base, originale: 'passe', renforce: 'passe' },
		{ ...base, aRetire: true, renforce: 'passe' },
		{ ...base, premierPerduFragile: true },
		{ ...base },
		{ ...base, premierPerduMatchLabel: null }
	];
	for (const v of variantes) {
		it(`« ${buildSettleNotification(v)?.corps ?? '—'} » ne contient aucun mot interdit`, () => {
			const n = buildSettleNotification(v);
			if (!n) return;
			expect(checkVocabulary(`${n.titre} ${n.corps}`).ok).toBe(true);
		});
	}

	it('le rendez-vous du matin (deux variantes) ne contient aucun mot interdit', () => {
		const offerte = buildMorningNotification(true, '/analyser');
		const habitue = buildMorningNotification(false, '/analyser');
		expect(offerte.corps).toBe("Ta première analyse est offerte. Les matchs du jour t'attendent.");
		expect(habitue.corps).toBe('Les matchs du jour sont analysés. Vérifie ton ticket avant de le valider.');
		// Un habitué ne s'entend JAMAIS promettre une gratuité.
		expect(habitue.corps).not.toContain('offerte');
		expect(checkVocabulary(`${offerte.titre} ${offerte.corps}`).ok).toBe(true);
		expect(checkVocabulary(`${habitue.titre} ${habitue.corps}`).ok).toBe(true);
	});
});
