/**
 * samples.ts — Cinq tickets réalistes pour juger la rédaction « à l'œil » : un
 * cousin qui parie chaque week-end doit comprendre en dix secondes pourquoi un
 * match a été retiré. Sert au harnais `writing.samples.test.ts` (vrai modèle si
 * une clé est présente, sinon rédacteur factice).
 *
 * Les faits sont écrits en toutes lettres, comme le producteur réel (enrich.ts).
 * Un des tickets a une double chance retirée en MENTION NEUTRE (avecBadge=false),
 * un autre a TROIS fragiles — les deux cas exigés au brief.
 */
import type { WritingInput, RetraitEnrichi } from './index';

function r(o: Partial<RetraitEnrichi> & Pick<RetraitEnrichi, 'ordre' | 'libelleFr'>): RetraitEnrichi {
	return {
		avecBadge: true,
		chanceSur: 2,
		chanceSurMot: 'une chance sur deux',
		cote: null,
		faits: [],
		...o
	};
}

export interface Echantillon {
	nom: string;
	input: WritingInput;
}

export const ECHANTILLONS: Echantillon[] = [
	{
		nom: 'Trois fragiles',
		input: {
			probaTotalePct: 2.1,
			probaRenforceePct: 9.4,
			nbRetirees: 3,
			nbMatchs: 9,
			nbFragiles: 3,
			rienARetirer: false,
			retraits: [
				r({
					ordre: 2,
					libelleFr: 'Napoli – Roma — Napoli gagne',
					chanceSur: 2,
					chanceSurMot: 'une chance sur deux',
					faits: ['Napoli a perdu deux fois à domicile.', 'Roma encaisse peu à l’extérieur.']
				}),
				r({
					ordre: 5,
					libelleFr: 'Lens – Nice — Plus de 2,5 buts',
					chanceSur: 2,
					chanceSurMot: 'une chance sur deux',
					faits: ['Lens marque peu à domicile.', 'Nice encaisse peu à l’extérieur.']
				}),
				r({
					ordre: 7,
					libelleFr: 'Milan – Torino — Milan gagne',
					chanceSur: 3,
					chanceSurMot: 'une chance sur trois',
					faits: ['Milan reste sur trois matchs sans victoire.']
				})
			]
		}
	},
	{
		nom: 'Double chance retirée (mention neutre)',
		input: {
			probaTotalePct: 6.8,
			probaRenforceePct: 11.2,
			nbRetirees: 1,
			nbMatchs: 6,
			nbFragiles: 0,
			rienARetirer: false,
			retraits: [
				r({
					ordre: 4,
					libelleFr: 'Monaco – Lille — Monaco ou match nul',
					avecBadge: false,
					chanceSur: 2,
					chanceSurMot: 'une chance sur deux',
					faits: ['Monaco encaisse souvent à domicile.', 'Lille marque beaucoup à l’extérieur.']
				})
			]
		}
	},
	{
		nom: 'Un seul fragile',
		input: {
			probaTotalePct: 12.5,
			probaRenforceePct: 18.0,
			nbRetirees: 1,
			nbMatchs: 5,
			nbFragiles: 1,
			rienARetirer: false,
			retraits: [
				r({
					ordre: 3,
					libelleFr: 'Porto – Braga — Les deux équipes marquent',
					chanceSur: 2,
					chanceSurMot: 'une chance sur deux',
					faits: ['Braga marque peu à l’extérieur.']
				})
			]
		}
	},
	{
		nom: 'Deux fragiles, buts et vainqueur',
		input: {
			probaTotalePct: 3.9,
			probaRenforceePct: 10.1,
			nbRetirees: 2,
			nbMatchs: 8,
			nbFragiles: 2,
			rienARetirer: false,
			retraits: [
				r({
					ordre: 1,
					libelleFr: 'Real – Sevilla — Plus de 3,5 buts',
					chanceSur: 3,
					chanceSurMot: 'une chance sur trois',
					faits: ['Sevilla encaisse peu à l’extérieur.']
				}),
				r({
					ordre: 6,
					libelleFr: 'Lyon – Rennes — Rennes gagne',
					chanceSur: 4,
					chanceSurMot: 'une chance sur quatre',
					faits: ['Rennes a perdu trois de ses cinq derniers matchs.', 'Lyon marque beaucoup à domicile.']
				})
			]
		}
	},
	{
		nom: 'Un fragile sans fait distinctif',
		input: {
			probaTotalePct: 8.3,
			probaRenforceePct: 14.6,
			nbRetirees: 1,
			nbMatchs: 7,
			nbFragiles: 1,
			rienARetirer: false,
			retraits: [
				r({
					ordre: 2,
					libelleFr: 'Benfica – Sporting — Benfica gagne',
					chanceSur: 2,
					chanceSurMot: 'une chance sur deux',
					faits: []
				})
			]
		}
	}
];
