/**
 * golden-resolution.test.ts — GOLDEN SET, couche A (déterministe, sans réseau).
 *
 * On rejoue des sorties vision enregistrées (concept + texte brut) à travers
 * `resolveTicket` et on vérifie la RÉSOLUTION du CODE — la moitié qu'on peut
 * prouver, à chaque commit, sans modèle ni réseau. La couche B (vision réelle,
 * stochastique) est de la MESURE, jamais un test bloquant : elle n'est pas ici.
 *
 * EXIGENCE : ce jeu contient des CAS PIÈGES (ordre inversé, seuil ambigu, seuil
 * mal lu, non-couvert exotique, capture partielle, issue vide). Le test vérifie
 * qu'ils tombent en INCONNU / non_couvert OU sont correctement REDRESSÉS — jamais
 * devinés. Ajouter un bookmaker = ajouter un cas dans le JSON, pas du code.
 */
import { describe, it, expect, vi } from 'vitest';
import { resolveTicket, incompleteReads } from './resolve';
import type { Fixture, Market, ResolutionState, Team } from '$lib/types';
import type { MarketConcept, RawTicketRead } from '$lib/server/services/vision';
import golden from './__golden__/vision-resolution.json';

interface GoldenLine {
	matchText?: string;
	marketText?: string;
	coteText?: string;
	concept?: MarketConcept;
}
interface Attendu {
	ordre: number;
	etatResolution: ResolutionState;
	marche?: Market;
	raison?: string;
	fixtureId?: number | null;
	coteSaisie?: number;
	candidates?: Market[];
}
interface Cas {
	nom: string;
	teams?: Team[];
	fixtures?: Fixture[];
	lignes: GoldenLine[];
	attendu: Attendu[];
	attendLectureIncomplete?: boolean;
}

const base = golden.base as { teams: Team[]; fixtures: Fixture[] };

/** Une ligne golden → RawLine (texteBrut reconstruit comme le fait la vision). */
function toRead(lignes: GoldenLine[]): RawTicketRead {
	return {
		lignes: lignes.map((l) => {
			const texteBrut = [l.matchText, l.marketText, l.coteText].filter(Boolean).join('  ');
			return {
				texteBrut,
				matchText: l.matchText ?? '',
				marketText: l.marketText ?? '',
				coteText: l.coteText ?? '',
				...(l.concept ? { concept: l.concept } : {})
			};
		})
	};
}

describe('Golden set — résolution déterministe des sorties vision (concept + secours)', () => {
	for (const cas of golden.cas as Cas[]) {
		it(cas.nom, () => {
			// On tait les avertissements attendus (non_couvert, lecture incomplète…) mais
			// on garde le spy pour vérifier le marqueur de lecture incomplète quand requis.
			const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			const teams = cas.teams ?? base.teams;
			const fixtures = cas.fixtures ?? base.fixtures;
			const read = toRead(cas.lignes);
			const out = resolveTicket(read, fixtures, teams);

			expect(out).toHaveLength(cas.attendu.length);
			for (const exp of cas.attendu) {
				const s = out.find((x) => x.ordre === exp.ordre);
				expect(s, `sélection ordre ${exp.ordre}`).toBeDefined();
				if (!s) continue;
				expect(s.etatResolution, `${cas.nom} — état`).toBe(exp.etatResolution);
				if ('marche' in exp) expect(s.marche, `${cas.nom} — marché`).toBe(exp.marche);
				if ('raison' in exp) expect(s.raison, `${cas.nom} — raison`).toBe(exp.raison);
				if ('fixtureId' in exp) expect(s.fixtureId, `${cas.nom} — fixtureId`).toBe(exp.fixtureId);
				if ('coteSaisie' in exp) expect(s.coteSaisie, `${cas.nom} — cote`).toBe(exp.coteSaisie);
				if (exp.candidates) expect(s.candidates, `${cas.nom} — candidats`).toEqual(exp.candidates);
			}

			// Cas « issue vide » : la lecture incomplète DOIT être détectée (déclenche le retry).
			if (cas.attendLectureIncomplete) {
				expect(incompleteReads(out, read), `${cas.nom} — lecture incomplète`).toBeGreaterThan(0);
			}
			spy.mockRestore();
		});
	}
});
