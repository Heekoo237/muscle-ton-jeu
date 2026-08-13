import { describe, it, expect } from 'vitest';
import { renderShareSvg, type ShareVM } from './shareImage';

const vm: ShareVM = {
	probaTotalePct: 1.3,
	probaRenforceePct: 7.5,
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
});
