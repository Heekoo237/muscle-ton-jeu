/**
 * pair-calibration.test.ts — LA CALIBRATION EST UN LIVRABLE, pas un réglage.
 *
 * Même méthode que l'ECE du modèle : on mesure sur la vérité terrain (la carte
 * d'alias curée), on IMPRIME le rapport, et on VERROUILLE les garanties par des
 * assertions. Le rapport sort dans la sortie du test (`vitest --reporter=verbose`
 * ou le `console.log` ci-dessous) : distributions, TAU retenu, rappel et taux de
 * fausse paire à ce TAU. Montrer les chiffres, pas les supposer.
 *
 * Vérité terrain : chaque couple (source → référence) est un MÊME club sous deux
 * noms → un VRAI positif. Les FAUX appariements = chaque source contre toutes les
 * AUTRES références (le pire cas, le plus dangereux). La ressemblance testée est
 * EXACTEMENT celle de production (`teamSimilarity`).
 */
import { describe, it, expect } from 'vitest';
import { teamSimilarity } from './similarity';
import { TAU_PAIRE } from './pair-match';
import corpus from './__golden__/alias-corpus.json';

const pairs = corpus.pairs as Array<{ source: string; reference: string }>;
const references = [...new Set(pairs.map((p) => p.reference))];

function quantile(sorted: number[], p: number): number {
	return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}
function resume(nom: string, xs: number[]): string {
	const s = [...xs].sort((a, b) => a - b);
	const med = s[Math.floor(s.length / 2)];
	return `${nom}: n=${s.length} min=${s[0].toFixed(3)} p05=${quantile(s, 0.05).toFixed(3)} ` +
		`p25=${quantile(s, 0.25).toFixed(3)} med=${med.toFixed(3)} max=${s[s.length - 1].toFixed(3)}`;
}

describe('Calibration de la ressemblance de paire (vérité terrain = carte d’alias)', () => {
	// Vrais positifs : similarité du BON couple. Faux : pire similarité contre un AUTRE.
	const vp = pairs.map((p) => teamSimilarity(p.source, p.reference));
	const fpMax = pairs.map((p) =>
		Math.max(...references.filter((r) => r !== p.reference).map((r) => teamSimilarity(p.source, r)))
	);

	it('imprime le rapport de calibration (distributions + rappel/fausse-paire par TAU)', () => {
		const lignes: string[] = [];
		lignes.push('=== CALIBRATION RESSEMBLANCE DE PAIRE — sim = max(Dice bigrammes, contenance tokens) ===');
		lignes.push(resume('VRAIS POSITIFS   ', vp));
		lignes.push(resume('FAUX (pire cas)  ', fpMax));
		lignes.push('TAU\trappel(VP≥TAU)\tfausse-paire(FPmax≥TAU)');
		for (const tau of [0.45, 0.5, 0.55, 0.6, 0.65]) {
			const rec = (vp.filter((x) => x >= tau).length / vp.length) * 100;
			const fpr = (fpMax.filter((x) => x >= tau).length / fpMax.length) * 100;
			lignes.push(`${tau.toFixed(2)}\t${rec.toFixed(1)}%\t\t${fpr.toFixed(1)}%`);
		}
		const durs = pairs
			.map((p, i) => ({ p, s: vp[i] }))
			.filter((x) => x.s < TAU_PAIRE)
			.sort((a, b) => a.s - b.s);
		lignes.push(`Sous TAU=${TAU_PAIRE} (→ alias requis, jamais devinés) : ` +
			durs.map((d) => `${d.p.source}→${d.p.reference} (${d.s.toFixed(2)})`).join(' · '));
		console.log('\n' + lignes.join('\n') + '\n');
		expect(lignes.length).toBeGreaterThan(0);
	});

	it('GARANTIE — au TAU de production, aucune fausse paire sur le corpus', () => {
		const fausses = fpMax.filter((x) => x >= TAU_PAIRE).length;
		expect(fausses, 'un faux appariement passe le seuil : baisser TAU serait dangereux').toBe(0);
	});

	it('GARANTIE — au TAU de production, le rappel reste élevé (≥ 90 %)', () => {
		const rappel = vp.filter((x) => x >= TAU_PAIRE).length / vp.length;
		expect(rappel).toBeGreaterThanOrEqual(0.9);
	});

	it('les cas SÉMANTIQUES restent hors de portée de la ressemblance (mission de l’alias)', () => {
		// Preuve chiffrée que la carte ne disparaît jamais : ces couples sont sous le seuil.
		expect(teamSimilarity('guimaraes', 'vitoria')).toBeLessThan(TAU_PAIRE);
		expect(teamSimilarity('corum belediyespor', 'corum fk')).toBeLessThan(TAU_PAIRE);
	});
});
