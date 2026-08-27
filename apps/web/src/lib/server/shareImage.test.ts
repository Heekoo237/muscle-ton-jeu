import { describe, it, expect } from 'vitest';
import { renderShareSvg, type ShareVM } from './shareImage';

const vm: ShareVM = {
	probaTotalePct: 1.3,
	probaRenforceePct: 7.5,
	probaTotale: 0.013,
	probaRenforcee: 0.075,
	nbRetirees: 3,
	lignes: [
		{ matchLabel: 'ARSENAL – LIVERPOOL', libelleFr: 'Arsenal ou match nul', fragile: false, retiree: false },
		{ matchLabel: 'MARSEILLE – LYON', libelleFr: 'Plus de 2,5 buts', fragile: true, retiree: true },
		{ matchLabel: 'NAPOLI – ROMA', libelleFr: 'Napoli gagne', fragile: true, retiree: true },
		{ matchLabel: 'BAYERN – DORTMUND', libelleFr: 'Les deux marquent', fragile: false, retiree: false },
		{ matchLabel: 'REAL – SEVILLA', libelleFr: 'Real gagne', fragile: false, retiree: false },
		{ matchLabel: 'PSG – NICE', libelleFr: 'Plus de 1,5 but', fragile: false, retiree: false }
	]
};

describe('image de partage — règles de contenu', () => {
	const svg = renderShareSvg(vm, true);

	it('contient les deux valeurs de pourcentage', () => {
		expect(svg).toContain('1,3');
		expect(svg).toContain('7,5');
		expect(svg).toContain('%');
	});

	it('un seul élément en accent de marque (le pourcentage de droite)', () => {
		const occ = svg.split('#C93A1A').length - 1;
		expect(occ).toBe(1);
	});

	it('tronque à 4 sélections par ticket, fragiles prioritaires', () => {
		expect(svg).toContain('… et 2 autres');
		// Les deux fragiles (retirées) figurent dans les 4 affichées.
		expect(svg).toContain('MARSEILLE – LYON');
		expect(svg).toContain('NAPOLI – ROMA');
	});

	it('porte la mention légale et aucune promesse de gain', () => {
		expect(svg).toContain('Pas un pronostic garanti · 18+');
		const sansMention = svg.replace('pronostic garanti', '');
		expect(/gagné|\bgain\b|\bmise\b|garanti/i.test(sansMention)).toBe(false);
	});

	it('affiche le multiplicateur À CÔTÉ des deux pourcentages (pas seul)', () => {
		// vm ci-dessus : 1,3 % » 7,5 %, retrait → ratio ≈ 5,77 → « 6 fois plus de chances ».
		expect(svg).toContain('fois plus de chances');
		expect(svg).toContain('1,3'); // les deux pourcentages RESTENT visibles
		expect(svg).toContain('7,5');
	});
});

describe('image de partage — multiplicateur, mêmes règles que le résultat', () => {
	const base = {
		lignes: [
			{ matchLabel: 'A – B', libelleFr: 'A gagne', fragile: true, retiree: true },
			{ matchLabel: 'C – D', libelleFr: 'C gagne', fragile: false, retiree: false }
		]
	};

	it('TRÈS PETITS CHIFFRES : jamais « 0 % » (= impossible), et multiplicateur sur la VRAIE valeur', () => {
		// Original 0,04 % (0,0004), renforcé 0,14 % (0,0014). Avant : l'original s'affichait
		// « 0 % » (faux : impossible) ET le garde-fou proba<=0 masquait le multiplicateur.
		// Désormais : « 0,04 % » affiché, et ratio réel 3,5 → « 4 fois plus de chances ».
		const svg = renderShareSvg({
			probaTotalePct: 0,
			probaRenforceePct: 0.1,
			probaTotale: 0.0004,
			probaRenforcee: 0.0014,
			nbRetirees: 2,
			...base
		});
		expect(svg).toContain('fois plus de chances');
		expect(svg).toContain('0,04'); // l'original s'affiche « 0,04 % », JAMAIS « 0 % »
		expect(svg).toContain('0,1'); // le renforcé RESTE affiché à côté du mult
		expect(svg).not.toMatch(/>\s*0\s*[  ]%/); // aucun « 0 % » nu affiché
	});

	it('AUCUN retrait → aucun multiplicateur', () => {
		const svg = renderShareSvg({
			probaTotalePct: 5,
			probaRenforceePct: 5,
			probaTotale: 0.05,
			probaRenforcee: 0.05,
			nbRetirees: 0,
			lignes: base.lignes.map((l) => ({ ...l, retiree: false }))
		});
		expect(svg).not.toContain('fois plus de chances');
		expect(svg).not.toContain('un peu plus de chances');
	});

	it('effet invisible à l’affichage (multiplicateur ≈ 1) → aucun multiplicateur', () => {
		// 5,00 % » 5,04 % : identiques après arrondi 1 décimale → on ne prétend à rien.
		const svg = renderShareSvg({
			probaTotalePct: 5,
			probaRenforceePct: 5,
			probaTotale: 0.05,
			probaRenforcee: 0.0504,
			nbRetirees: 1,
			...base
		});
		expect(svg).not.toContain('fois plus de chances');
		expect(svg).not.toContain('un peu plus de chances');
	});
});
