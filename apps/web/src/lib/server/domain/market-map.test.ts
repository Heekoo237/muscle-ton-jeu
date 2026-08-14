import { describe, it, expect } from 'vitest';
import { resolveMarket, marketLabelFr } from './market-map';

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
});

describe('marketLabelFr — jamais de notation bookmaker', () => {
	it('rend les marchés en français avec les noms d’équipes', () => {
		expect(marketLabelFr('DC_HOME_DRAW', 'Arsenal', 'Liverpool')).toBe('Arsenal ou match nul');
		expect(marketLabelFr('WIN_AWAY', 'Arsenal', 'Liverpool')).toBe('Liverpool gagne');
		expect(marketLabelFr('OVER_2_5', 'Arsenal', 'Liverpool')).toBe('Plus de 2,5 buts');
		expect(marketLabelFr('BTTS_YES', 'Arsenal', 'Liverpool')).toBe('Les deux équipes marquent');
	});
});
