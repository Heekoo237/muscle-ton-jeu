import { describe, it, expect } from 'vitest';
import { resolveMarket, marketLabelFr, splitResultMarket, uncoveredFamily } from './market-map';

describe('uncoveredFamily — nommer le refus (le garde-fou sait déjà quelle famille)', () => {
	it('nomme chaque famille non couverte', () => {
		expect(uncoveredFamily('1ère mi-temps, Total: (1) Plus de')).toBe('mi_temps');
		expect(uncoveredFamily('Anytime Goalscorer')).toBe('buteur');
		expect(uncoveredFamily('Total des corners +9')).toBe('corners');
		expect(uncoveredFamily('Cartons — plus de 3')).toBe('cartons');
		expect(uncoveredFamily('Total Shots')).toBe('tirs');
		expect(uncoveredFamily('Correct Score 2-1')).toBe('score_exact');
		expect(uncoveredFamily('Handicap -1')).toBe('handicap');
	});

	it('renvoie null sur un marché COUVERT (piège « both teams to score »)', () => {
		expect(uncoveredFamily('both teams to score')).toBeNull();
		expect(uncoveredFamily('+ de 2,5 buts')).toBeNull();
		expect(uncoveredFamily('Résultat du match')).toBeNull();
	});
});

describe('splitResultMarket — « Résultat du match (t. rég) » Betclic', () => {
	it('avec l’issue : type 1X2 reconnu, bruit « (t. rég) » retiré, CHOIX conservé', () => {
		// C'est la notation qui DOIT résoudre : l'issue choisie est présente.
		expect(splitResultMarket('FC Porto Résultat du match (t. rég)')).toEqual({
			kind: '1x2',
			choice: 'fc porto'
		});
		expect(splitResultMarket('Nul Résultat du match (t. rég)')).toEqual({ kind: '1x2', choice: 'nul' });
	});

	it('SANS issue : type reconnu mais CHOIX vide — la ligne restera « à corriger »', () => {
		// Le bug observé : la vision a renvoyé le libellé de marché SANS l'issue pariée.
		// Le parseur fait ce qu'il peut (1X2), mais sans choix la sélection est
		// inanalysable — c'est en AMONT (lecture vision) qu'il faut capter l'issue.
		expect(splitResultMarket('Résultat du match (t. rég)')).toEqual({ kind: '1x2', choice: '' });
	});
});

describe('resolveMarket — table stricte (règle d’archi n°3)', () => {
	it('reconnaît les notations couvertes avec certitude', () => {
		expect(resolveMarket('1X')).toMatchObject({ state: 'certain', market: 'DC_HOME_DRAW' });
		expect(resolveMarket('Over 2.5')).toMatchObject({ state: 'certain', market: 'OVER_2_5' });
		expect(resolveMarket('BTTS')).toMatchObject({ state: 'certain', market: 'BTTS_YES' });
		expect(resolveMarket('  nul ')).toMatchObject({ state: 'certain', market: 'DRAW' });
	});

	it('marque « non couvert » les marchés interdits, sans jamais les deviner', () => {
		expect(resolveMarket('Corners +9')).toMatchObject({ state: 'inconnu', raison: 'non_couvert' });
		expect(resolveMarket('1MT')).toMatchObject({ state: 'inconnu', raison: 'non_couvert' });
		expect(resolveMarket('Buteur')).toMatchObject({ state: 'inconnu', raison: 'non_couvert' });
	});

	it('reconnaît aussi les notations ANGLAISES non couvertes (bookmakers)', () => {
		// Le piège Betclic : « Goalscorer » n'était pas reconnu → l'utilisateur
		// devait choisir un marché couvert (faux). Désormais : non couvert.
		expect(resolveMarket('Goalscorer')).toMatchObject({ state: 'inconnu', raison: 'non_couvert' });
		expect(resolveMarket('Anytime Goalscorer')).toMatchObject({ raison: 'non_couvert' });
		expect(resolveMarket('Half Time Result')).toMatchObject({ raison: 'non_couvert' });
		expect(resolveMarket('Total Cards')).toMatchObject({ raison: 'non_couvert' });
		expect(resolveMarket('Correct Score')).toMatchObject({ raison: 'non_couvert' });
	});

	it('MI-TEMPS / période : toutes les graphies FR+EN → non couvert (filet élargi)', () => {
		// Le cas réel testeur, tel quel, et ses variantes. Un total de PÉRIODE lu comme
		// couvert = mensonge silencieux : le filet doit ratisser large.
		for (const notation of [
			'1ère mi-temps, Total: (1) Plus de', // capture réelle du testeur
			'mi-temps',
			'Total mi temps',
			'1ère période',
			'2ème période Plus de 0,5',
			'1T Plus de 0,5 but',
			'Score (1T)',
			'HT/FT',
			'HT Over 0.5',
			'First Half Total Goals',
			'2nd Half Over 1.5'
		]) {
			expect(resolveMarket(notation)).toMatchObject({ raison: 'non_couvert' });
		}
	});

	it('les vrais marchés couverts ne sont PAS pris pour de la mi-temps (zéro faux positif)', () => {
		expect(resolveMarket('+ de 2,5 buts')).toMatchObject({ state: 'certain', market: 'OVER_2_5' });
		expect(resolveMarket('nul')).toMatchObject({ state: 'certain', market: 'DRAW' });
		expect(resolveMarket('1X')).toMatchObject({ state: 'certain', market: 'DC_HOME_DRAW' });
	});

	it('rend INCONNU tout ce qui n’est pas dans la table — jamais « probable »', () => {
		const r = resolveMarket('xyz truc bizarre');
		expect(r.state).toBe('inconnu');
		expect(r.market).toBeNull();
	});
});

describe('resolveMarket — notations « plus/moins de buts » complètes (Betclic)', () => {
	it('« + de 1,5 - Nombre total de buts (t. rég) » → OVER_1_5', () => {
		expect(resolveMarket('+ de 1,5 - Nombre total de buts (t. rég)')).toMatchObject({
			state: 'certain',
			market: 'OVER_1_5'
		});
	});
	it('« - de 2,5 buts » → UNDER_2_5, et « + de 3,5 buts » → OVER_3_5', () => {
		expect(resolveMarket('- de 2,5 buts')).toMatchObject({ state: 'certain', market: 'UNDER_2_5' });
		expect(resolveMarket('+ de 3,5 buts')).toMatchObject({ state: 'certain', market: 'OVER_3_5' });
	});
	it('« moins de 2,5 buts » (mots) → UNDER_2_5', () => {
		expect(resolveMarket('moins de 2,5 buts')).toMatchObject({ state: 'certain', market: 'UNDER_2_5' });
	});
	it('sans seuil visible → reste ambigu ou inconnu, jamais deviné', () => {
		// « nombre total de buts » sans 1,5/2,5/3,5 ne doit pas inventer un seuil.
		expect(resolveMarket('nombre total de buts')).not.toMatchObject({ market: 'OVER_1_5' });
	});

	// Notation « Total: (1.5) Plus de » — le bookmaker écrit « Total » sans jamais dire
	// « buts ». Vrai ticket (Racing–Elche) : la ligne ressortait non_couvert à tort.
	it('« Total: (1.5) Plus de » (sans le mot « buts ») → OVER_1_5', () => {
		expect(resolveMarket('Total: (1.5) Plus de')).toMatchObject({
			state: 'certain',
			market: 'OVER_1_5'
		});
	});
	it('« Total: (2.5) Moins de » → UNDER_2_5', () => {
		expect(resolveMarket('Total: (2.5) Moins de')).toMatchObject({
			state: 'certain',
			market: 'UNDER_2_5'
		});
	});
	it('« Total » ne fait PAS passer un total NON-buts pour un total de buts', () => {
		// Corners : filtré non-couvert en amont → jamais un total de buts (market null).
		expect(resolveMarket('Total corners (9.5) Plus de').market).toBeNull();
		// Mi-temps : « Total » présent + seuil couvert, mais mi-temps filtré AVANT parseTotals.
		expect(resolveMarket('1ère mi-temps, Total: (1.5) Plus de')).toMatchObject({
			raison: 'non_couvert'
		});
	});
});

describe('marketLabelFr — jamais de notation bookmaker', () => {
	it('rend les marchés en français avec les noms d’équipes', () => {
		expect(marketLabelFr('DC_HOME_DRAW', 'Arsenal', 'Liverpool')).toBe('Arsenal ou match nul');
		expect(marketLabelFr('WIN_AWAY', 'Arsenal', 'Liverpool')).toBe('Liverpool gagne');
		expect(marketLabelFr('OVER_2_5', 'Arsenal', 'Liverpool')).toBe('Plus de 2,5 buts');
		expect(marketLabelFr('BTTS_YES', 'Arsenal', 'Liverpool')).toBe('Les deux équipes marquent');
	});
});
