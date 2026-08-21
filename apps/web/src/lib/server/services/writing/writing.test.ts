import { describe, it, expect } from 'vitest';
import { FakeWriting } from './fake';
import { allowedNumbersFor } from './allowed';
import type { WritingInput, RetraitEnrichi } from './index';
import { checkGeneratedText, checkCausality } from '$lib/server/domain/guards';
import { chanceSur, chanceSurMot, faitsDescriptifs, enMots, syntheseDeterministe } from './enrich';
import type { FaitsMatch } from '$lib/server/services/stats';

function retrait(over: Partial<RetraitEnrichi> = {}): RetraitEnrichi {
	return {
		ordre: 2,
		libelleFr: 'Napoli – Roma — Napoli gagne',
		avecBadge: true,
		chanceSur: 2,
		chanceSurMot: 'une fois sur deux',
		cote: null,
		faits: ['Napoli a perdu deux fois à domicile.'],
		...over
	};
}

function input(retraits: RetraitEnrichi[], over: Partial<WritingInput> = {}): WritingInput {
	return {
		probaTotalePct: 1.4,
		probaRenforceePct: 7.8,
		nbRetirees: retraits.length,
		nbMatchs: 9,
		nbFragiles: retraits.filter((r) => r.avecBadge).length,
		retraits,
		rienARetirer: false,
		...over
	};
}

const texteComplet = (a: { synthese: string; parSelection: { texte: string }[] }): string =>
	[a.synthese, ...a.parSelection.map((p) => p.texte)].join('\n');

describe('rédaction — sortie deux niveaux, sous garde-fous', () => {
	it('produit une synthèse et une explication par retrait, et passe le garde-fou', async () => {
		const inp = input([retrait({ ordre: 2 }), retrait({ ordre: 4, avecBadge: false, chanceSur: 3, chanceSurMot: 'une fois sur trois' })]);
		const a = await new FakeWriting().writeAnalysis(inp);
		expect(a.synthese.length).toBeGreaterThan(0);
		expect(a.parSelection.map((p) => p.ordre)).toEqual([2, 4]);
		const controle = checkGeneratedText(texteComplet(a), allowedNumbersFor(inp), [
			'Napoli – Roma',
			'Napoli',
			'Roma'
		]);
		expect(controle.ok).toBe(true);
	});

	it('« Rien à retirer » : synthèse sobre, aucune explication', async () => {
		const a = await new FakeWriting().writeAnalysis(input([], { rienARetirer: true }));
		expect(a.parSelection).toHaveLength(0);
		expect(a.synthese).toContain('Rien à retirer');
	});
});

describe('règle de causalité (brief §4.4)', () => {
	it('rejette « parce que », « car », « c’est pourquoi », « donc … retiré »', () => {
		expect(checkCausality('On retire ce match parce que Napoli est faible.').ok).toBe(false);
		expect(checkCausality('Napoli est risqué car il perd souvent.').ok).toBe(false);
		expect(checkCausality("Napoli perd. C'est pourquoi on l'écarte.").ok).toBe(false);
		expect(checkCausality("Napoli perd souvent, donc on a retiré ce match.").ok).toBe(false);
		expect(checkCausality('Roma encaisse peu, donc défend bien dehors.').ok).toBe(false);
	});

	it('accepte une description sans causalité (faits côte à côte)', () => {
		const ok = 'Napoli gagne, c’est risqué. Napoli a perdu deux fois à domicile. Une fois sur deux, pas plus.';
		expect(checkCausality(ok).ok).toBe(true);
		expect(checkGeneratedText(ok, [2]).causality.ok).toBe(true);
	});

	it('le texte factice n’emploie aucune tournure causale', async () => {
		const a = await new FakeWriting().writeAnalysis(input([retrait()]));
		expect(checkCausality(texteComplet(a)).ok).toBe(true);
	});
});

describe('synthèse neutre — un retrait sans badge ne se contredit pas', () => {
	it('ne dit ni « rien à retirer » ni « aucun fragile » suivi d’un retrait sec', () => {
		const inp = input([retrait({ avecBadge: false })], { nbFragiles: 0, nbMatchs: 6 });
		const s = syntheseDeterministe(inp);
		expect(s).toContain('moins solide'); // le retrait est reconnu
		expect(s).not.toMatch(/rien à retirer/i); // réservé au vrai zéro retrait (gratuit)
		expect(s).toMatch(/vraiment|juste/); // ton qui reconnaît la tension
	});

	it('accorde le pluriel selon le nombre de retraits', () => {
		const un = syntheseDeterministe(input([retrait({ avecBadge: false })], { nbFragiles: 0, nbMatchs: 6 }));
		expect(un).toContain('la sélection la moins solide');
		const deux = syntheseDeterministe(
			input([retrait({ ordre: 2, avecBadge: false }), retrait({ ordre: 4, avecBadge: false })], {
				nbFragiles: 0,
				nbMatchs: 7
			})
		);
		expect(deux).toContain('les sélections les moins solides');
	});

	it('(c) toutes fragiles : jamais « tient debout », on le DIT', () => {
		const s = syntheseDeterministe(
			input([], { rienARetirer: true, toutesFragiles: true, nbMatchs: 1, nbFragiles: 1 })
		);
		expect(s).toContain('Toutes tes sélections sont trop justes');
		expect(s).toContain('sans le vider');
		expect(s).not.toContain('tient debout');
	});

	it('(b) rien de fragile et rien de serré : « Ton ticket tient. Rien à retirer. »', () => {
		const s = syntheseDeterministe(input([], { rienARetirer: true, nbMatchs: 4, nbSerrees: 0 }));
		expect(s).toBe('Ton ticket tient. Rien à retirer.');
	});
});

describe('exclusivité faits / aveu « c’est la cote »', () => {
	it('avec un fait : pas d’aveu sur la cote', async () => {
		const a = await new FakeWriting().writeAnalysis(
			input([retrait({ faits: ['Braga marque peu à l’extérieur.'] })])
		);
		expect(a.parSelection[0].texte).not.toMatch(/\bcote\b/i);
	});

	it('sans fait : l’aveu sur la cote apparaît', async () => {
		const a = await new FakeWriting().writeAnalysis(input([retrait({ faits: [] })]));
		expect(a.parSelection[0].texte).toMatch(/\bcote\b/i);
	});
});

describe('badge rouge vs mention neutre', () => {
	it('avecBadge → ton « risqué » ; sans badge → « la moins solide », jamais « fragile »', async () => {
		const badge = await new FakeWriting().writeAnalysis(input([retrait({ avecBadge: true })]));
		expect(badge.parSelection[0].texte).toContain('risqué');

		const neutre = await new FakeWriting().writeAnalysis(
			input([retrait({ avecBadge: false, libelleFr: 'Monaco – Lille — Double chance Monaco' })])
		);
		expect(neutre.parSelection[0].texte).toContain('la moins solide');
		expect(neutre.parSelection[0].texte).not.toMatch(/fragile|risqué/i);
	});
});

describe('« une fois sur X » déterministe', () => {
	it('arrondit 1/proba, borné à deux, en toutes lettres', () => {
		expect(chanceSur(0.5)).toBe(2);
		expect(chanceSur(0.33)).toBe(3);
		expect(chanceSur(0.28)).toBe(4);
		expect(chanceSur(0.9)).toBe(2); // jamais « une fois sur une »
		expect(chanceSur(null)).toBeNull();
		expect(chanceSurMot(0.5)).toBe('une fois sur deux');
		expect(enMots(3)).toBe('trois');
	});
});

describe('garde-fou des nombres (règle d’or n°1)', () => {
	it('un pourcentage inventé est rejeté, même avec un nom d’équipe présent', () => {
		const inp = input([retrait({ libelleFr: 'FSV Mainz 05 – Leverkusen — Plus de 2,5 buts' })]);
		const texte = 'FSV Mainz 05 est le maillon faible. Tes chances montent à 87 %.';
		const controle = checkGeneratedText(texte, allowedNumbersFor(inp), [
			'FSV Mainz 05 – Leverkusen',
			'FSV Mainz 05',
			'Leverkusen'
		]);
		expect(controle.ok).toBe(false);
		expect(controle.numbers.offending).toContain(87);
	});

	it('le « 05 » d’un nom d’équipe masqué n’est pas compté comme un nombre', () => {
		const inp = input([retrait({ libelleFr: 'FSV Mainz 05 – Leverkusen — Plus de 2,5 buts' })]);
		const controle = checkGeneratedText('FSV Mainz 05 joue gros ce soir.', allowedNumbersFor(inp), [
			'FSV Mainz 05 – Leverkusen',
			'FSV Mainz 05',
			'Leverkusen'
		]);
		expect(controle.ok).toBe(true);
	});

	it('un compteur inventé EN TOUTES LETTRES est rejeté (« six matchs » pour huit)', () => {
		const inp = input([retrait({ ordre: 1 })], { nbMatchs: 8, nbFragiles: 2 });
		// Le modèle fabrique « six » alors que le ticket tient sur huit matchs.
		const controle = checkGeneratedText('Ton ticket tient sur six matchs.', allowedNumbersFor(inp));
		expect(controle.ok).toBe(false);
		expect(controle.numbers.offending).toContain(6);
	});

	it('le vrai compteur en toutes lettres passe (« huit matchs » quand nbMatchs=8)', () => {
		const inp = input([retrait({ ordre: 1 })], { nbMatchs: 8, nbFragiles: 2 });
		const controle = checkGeneratedText('Ton ticket tient sur huit matchs.', allowedNumbersFor(inp));
		expect(controle.ok).toBe(true);
	});

	it('un fait fourni en toutes lettres n’est pas rejeté (« cinq derniers matchs »)', () => {
		const inp = input([
			retrait({ faits: ['Rennes a perdu trois de ses cinq derniers matchs.'] })
		]);
		const controle = checkGeneratedText(
			'Rennes a perdu trois de ses cinq derniers matchs.',
			allowedNumbersFor(inp),
			['Rennes']
		);
		expect(controle.ok).toBe(true);
	});

	it('les seuils de marché (2,5) et « une fois sur X » sont autorisés, pas les autres', () => {
		const inp = input([retrait({ libelleFr: 'Lens – Nice — Plus de 3,5 buts', chanceSur: 4 })]);
		const allowed = allowedNumbersFor(inp);
		expect(allowed).toContain(3.5); // seuil marché
		expect(allowed).toContain(4); // « une fois sur quatre »
		expect(allowed).toContain(1.4); // proba totale
		expect(allowed).not.toContain(87);
	});
});

describe('faits descriptifs (qualitatifs, en toutes lettres)', () => {
	const fait: FaitsMatch = {
		fixtureId: 1,
		home: {
			nom: 'Napoli',
			forme: ['D', 'D', 'D', 'V', 'N'],
			butsMarquesDom: 0.8,
			butsEncaissesDom: 1.9,
			butsMarquesExt: 1.0,
			butsEncaissesExt: 1.2,
			joues: 10
		},
		away: {
			nom: 'Roma',
			forme: ['V', 'V', 'N', 'D', 'V'],
			butsMarquesDom: 1.5,
			butsEncaissesDom: 1.0,
			butsMarquesExt: 0.9,
			butsEncaissesExt: 0.7,
			joues: 10
		},
		h2h: ['D', 'D', 'V']
	};

	it('rend des phrases qualitatives, sans chiffre extractible', () => {
		const phrases = faitsDescriptifs(fait, 'WIN_HOME');
		expect(phrases.length).toBeGreaterThan(0);
		// Aucune phrase ne doit contenir de chiffre (tout est en toutes lettres).
		for (const p of phrases) expect(p).not.toMatch(/\d/);
	});

	it('match inconnu ou marché sans direction → aucun fait', () => {
		expect(faitsDescriptifs(undefined, 'WIN_HOME')).toEqual([]);
		expect(faitsDescriptifs(fait, null)).toEqual([]);
		// « match nul » et « un ou l'autre » (12) n'ont pas de sens directionnel.
		expect(faitsDescriptifs(fait, 'DRAW')).toEqual([]);
		expect(faitsDescriptifs(fait, 'DC_HOME_AWAY')).toEqual([]);
	});
});

describe('orientation des faits (brief §3 — pas de contresens de lecture)', () => {
	// Un match qui offre à la fois un fait « plus de buts » et un fait « moins de buts ».
	const fait: FaitsMatch = {
		fixtureId: 2,
		home: {
			nom: 'Real',
			forme: ['V', 'N', 'D', 'V', 'N'], // rien de distinctif
			butsMarquesDom: 2.0, // marque BEAUCOUP à domicile → « plus » de buts
			butsEncaissesDom: 1.2,
			butsMarquesExt: 1.2,
			butsEncaissesExt: 1.2,
			joues: 10
		},
		away: {
			nom: 'Sevilla',
			forme: ['V', 'N', 'N', 'V', 'D'],
			butsMarquesDom: 1.2,
			butsEncaissesDom: 1.2,
			butsMarquesExt: 1.1,
			butsEncaissesExt: 0.6, // encaisse PEU à l'extérieur → « moins » de buts
			joues: 10
		},
		h2h: []
	};

	it('« Plus de 2,5 buts » fragile : seuls les faits « moins de buts » sont retenus', () => {
		const phrases = faitsDescriptifs(fait, 'OVER_2_5');
		expect(phrases).toContain("Sevilla encaisse peu à l'extérieur."); // va vers moins de buts
		expect(phrases.join(' ')).not.toContain('marque beaucoup'); // « plus » exclu
		expect(phrases.every((p) => !p.includes('beaucoup'))).toBe(true);
	});

	it('« Moins de 2,5 buts » fragile : c’est l’inverse (les faits « plus de buts »)', () => {
		const phrases = faitsDescriptifs(fait, 'UNDER_2_5');
		expect(phrases).toContain('Real marque beaucoup à domicile.'); // va vers plus de buts
		expect(phrases.join(' ')).not.toContain('encaisse peu');
	});
});

describe('synthèse « rien à retirer » — solide vs serré (« pas retiré » ≠ « solide »)', () => {
	const base: WritingInput = {
		probaTotalePct: 30, probaRenforceePct: 30, nbRetirees: 0, nbMatchs: 3,
		nbFragiles: 0, retraits: [], rienARetirer: true
	};

	it('tout solide → « Ton ticket tient. Rien à retirer. » (jamais « ça passe »)', () => {
		const s = syntheseDeterministe({ ...base, nbSerrees: 0 });
		expect(s).toBe('Ton ticket tient. Rien à retirer.');
		expect(s).not.toMatch(/tient debout|solide|sûr|passe/i);
	});

	it('une serrée → on le DIT, sans « tient debout »', () => {
		const s = syntheseDeterministe({ ...base, nbSerrees: 1 });
		expect(s).toMatch(/serrée/i);
		expect(s).not.toMatch(/tient debout/i);
	});

	it('plusieurs serrées → pluriel, sans « tient debout »', () => {
		const s = syntheseDeterministe({ ...base, nbSerrees: 2 });
		expect(s).toMatch(/serrées/i);
		expect(s).not.toMatch(/tient debout/i);
	});

	it('toutes fragiles prime : jamais « tient » ni « serré »', () => {
		const s = syntheseDeterministe({ ...base, toutesFragiles: true, nbSerrees: 0 });
		expect(s).toMatch(/trop justes/i);
		expect(s).not.toMatch(/tient|serré/i);
	});
});
