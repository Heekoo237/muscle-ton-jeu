import type { StatsService, FaitsMatch, FaitsEquipe, Issue } from './index';

/**
 * Faits DÉTERMINISTES pour le développement : mêmes (fixture, équipe) → mêmes
 * faits, comme une lecture en table. Aucune probabilité ici — que des résultats
 * et des moyennes de buts, bruts. Le vrai lecteur (SupabaseStats) les remplace.
 */
function seed(n: number): () => number {
	let h = 2166136261 ^ n;
	return () => {
		h = Math.imul(h ^ (h >>> 15), 2246822507);
		h = Math.imul(h ^ (h >>> 13), 3266489909);
		return ((h ^= h >>> 16) >>> 0) / 4294967296;
	};
}

const ISSUES: Issue[] = ['V', 'N', 'D'];

function forme(rng: () => number, n: number): Issue[] {
	return Array.from({ length: n }, () => ISSUES[Math.floor(rng() * 3)]);
}

/** Moyenne de buts plausible [0,5..2,5], arrondie au dixième. */
function moyenneButs(rng: () => number): number {
	return Math.round((0.5 + rng() * 2) * 10) / 10;
}

function faitsEquipe(nom: string, graine: number): FaitsEquipe {
	const rng = seed(graine);
	return {
		nom,
		forme: forme(rng, 5),
		butsMarquesDom: moyenneButs(rng),
		butsEncaissesDom: moyenneButs(rng),
		butsMarquesExt: moyenneButs(rng),
		butsEncaissesExt: moyenneButs(rng),
		joues: 10
	};
}

export class FakeStats implements StatsService {
	async forFixtures(fixtureIds: number[]): Promise<Map<number, FaitsMatch>> {
		const out = new Map<number, FaitsMatch>();
		for (const id of fixtureIds) {
			const rng = seed(id);
			out.set(id, {
				fixtureId: id,
				home: faitsEquipe(`Domicile ${id}`, id * 7 + 1),
				away: faitsEquipe(`Extérieur ${id}`, id * 7 + 2),
				h2h: forme(rng, 3)
			});
		}
		return out;
	}
}
