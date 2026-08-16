import { describe, it, expect } from 'vitest';
import { PAYS, paysDe, validerNumero, msisdnComplet } from './operators';

describe('operators — les quatre pays, sans déduction d’opérateur', () => {
	it('les quatre pays sont présents avec indicatif et opérateurs', () => {
		expect(PAYS.map((p) => p.code)).toEqual(['CM', 'GA', 'BJ', 'CI']);
		for (const p of PAYS) {
			expect(p.indicatif).toMatch(/^\+\d+$/);
			expect(p.operateurs.length).toBeGreaterThan(0);
		}
	});

	it('Wave est proposé en Côte d’Ivoire (70 % du marché) et au Cameroun', () => {
		expect(paysDe('CI')!.operateurs.some((o) => o.id === 'wave')).toBe(true);
		expect(paysDe('CM')!.operateurs.some((o) => o.id === 'wave')).toBe(true);
	});
});

describe('validerNumero — longueur par pays, message clair, en cas de doute on accepte', () => {
	const CM = paysDe('CM')!;
	const CI = paysDe('CI')!;

	it('vide → aucune erreur affichée', () => {
		expect(validerNumero('', CM)).toMatchObject({ ok: false, message: '' });
	});

	it('incomplet → message CLAIR nommant le pays et le nombre de chiffres', () => {
		const r = validerNumero('69123', CM);
		expect(r.ok).toBe(false);
		expect(r.message).toBe('Un numéro camerounais a 9 chiffres.');
		expect(r.message).not.toContain('invalide'); // jamais « format invalide »
	});

	it('bonne longueur → valide (Cameroun 9, Côte d’Ivoire 10)', () => {
		expect(validerNumero('691234567', CM).ok).toBe(true); // 9
		expect(validerNumero('0701234567', CI).ok).toBe(true); // 10
	});

	it('tolère les espaces (on ne compte que les chiffres)', () => {
		expect(validerNumero('69 12 34 567', CM).ok).toBe(true);
	});

	it('trop long → message clair, pas un rejet muet', () => {
		expect(validerNumero('6912345678', CM).message).toContain('9 chiffres');
	});

	it('msisdn complet = indicatif + national', () => {
		expect(msisdnComplet(CM, '691234567')).toBe('+237 691234567');
	});
});
