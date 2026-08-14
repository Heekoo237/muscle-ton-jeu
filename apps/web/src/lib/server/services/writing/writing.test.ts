import { describe, it, expect } from 'vitest';
import { FakeWriting } from './fake';
import { allowedNumbersFor } from './allowed';
import type { WritingInput } from './index';
import { checkGeneratedText } from '$lib/server/domain/guards';
import { marketLabelFr } from '$lib/server/domain/market-map';

function inputAvecFragile(libelleFr: string): WritingInput {
	return {
		probaTotalePct: 1.4,
		probaRenforceePct: 7.8,
		nbRetirees: 1,
		fragiles: [{ libelleFr }],
		confiance: 'correcte',
		rienARetirer: false
	};
}

describe('rédaction — un fragile plus/moins ne dégrade plus vers le template', () => {
	it('« Plus de 2,5 buts » produit un texte riche qui passe le garde-fou', async () => {
		const libelle = `Real Madrid – Barcelone — ${marketLabelFr('OVER_2_5', 'Real Madrid', 'Barcelone')}`;
		expect(libelle).toContain('2,5'); // le seuil est bien dans le libellé
		const input = inputAvecFragile(libelle);
		const texte = await new FakeWriting().writeAnalysis(input);

		expect(texte).toContain('2,5'); // le texte riche nomme la sélection
		const controle = checkGeneratedText(texte, allowedNumbersFor(input));
		expect(controle.ok).toBe(true); // garde-fou OK → PAS de bascule template
	});

	it('les seuils du libellé sont bien dans les nombres autorisés', () => {
		const input = inputAvecFragile('Lens – Nice — Plus de 3,5 buts');
		const allowed = allowedNumbersFor(input);
		expect(allowed).toContain(3.5); // seuil marché autorisé
		expect(allowed).toContain(1.4); // proba totale toujours là
		expect(allowed).toContain(7.8); // proba renforcée toujours là
	});

	it('jeu STRICT : un numéro de nom d’équipe (« Mainz 05 ») n’est PAS autorisé', () => {
		const input = inputAvecFragile('FSV Mainz 05 – Leverkusen — Plus de 2,5 buts');
		const allowed = allowedNumbersFor(input);
		expect(allowed).toContain(2.5); // seuil marché : oui
		expect(allowed).not.toContain(5); // « 05 » du nom d’équipe : non
	});

	// Le vrai correctif : masquer les noms propres AVANT d'extraire les nombres.
	const MASQUE_MAINZ = ['FSV Mainz 05 – Leverkusen', 'FSV Mainz 05', 'Leverkusen'];

	it('1. « FSV Mainz 05 · Plus de 2,5 buts » → texte RICHE (nom masqué), pas le template', async () => {
		const input = inputAvecFragile('FSV Mainz 05 – Leverkusen — Plus de 2,5 buts');
		const texte = await new FakeWriting().writeAnalysis(input);
		expect(texte).toContain('FSV Mainz 05'); // le nom figure bien dans le texte
		const controle = checkGeneratedText(texte, allowedNumbersFor(input), MASQUE_MAINZ);
		expect(controle.ok).toBe(true); // « 05 » masqué → aucune bascule injustifiée
	});

	it('2. un nombre inventé (« 87 % ») reste rejeté même avec un nom d’équipe présent', () => {
		const input = inputAvecFragile('FSV Mainz 05 – Leverkusen — Plus de 2,5 buts');
		const texte = 'FSV Mainz 05 est le maillon faible. Tes chances montent à 87 %.';
		const controle = checkGeneratedText(texte, allowedNumbersFor(input), MASQUE_MAINZ);
		expect(controle.ok).toBe(false);
		expect(controle.numbers.offending).toContain(87);
	});

	it('un nombre fabriqué reste rejeté (le garde-fou n’est pas désactivé)', () => {
		const input = inputAvecFragile('Lens – Nice — Plus de 2,5 buts');
		// 42 n’est ni une proba, ni un seuil du libellé : doit être refusé.
		const controle = checkGeneratedText('Tes chances montent à 42 %.', allowedNumbersFor(input));
		expect(controle.ok).toBe(false);
		expect(controle.numbers.offending).toContain(42);
	});
});
