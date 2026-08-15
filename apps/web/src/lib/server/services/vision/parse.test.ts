import { describe, it, expect } from 'vitest';
import { extractJson, parseVisionResponse, toTicketRead } from './parse';

describe('extractJson — tolère le bavardage et les blocs markdown', () => {
	it('lit un JSON nu', () => {
		expect(extractJson('{"a":1}')).toEqual({ a: 1 });
	});
	it('lit un bloc ```json', () => {
		expect(extractJson('Voici:\n```json\n{"a":2}\n```\nvoilà')).toEqual({ a: 2 });
	});
	it('renvoie null sur du non-JSON', () => {
		expect(extractJson('pas de json ici')).toBeNull();
		expect(extractJson('')).toBeNull();
	});
});

describe('toTicketRead — normalisation et échecs explicites', () => {
	it('transforme les lignes en champs structurés + texte brut', () => {
		const r = toTicketRead({
			estTicket: true,
			lisible: true,
			manuscrit: false,
			lignes: [
				{ match: 'Arsenal - Liverpool', marche: '1X', cote: '1.42' },
				{ match: 'Lens - Nice', marche: 'BTTS', cote: '1.72' }
			],
			coteTotale: '2.44'
		});
		expect(r.echec).toBeUndefined();
		expect(r.lignes).toHaveLength(2);
		expect(r.lignes[0]).toMatchObject({ matchText: 'Arsenal - Liverpool', marketText: '1X', coteText: '1.42' });
		expect(r.lignes[0].texteBrut).toBe('Arsenal - Liverpool  1X  1.42');
		expect(r.coteTotaleLue).toBe('2.44');
	});

	it('pas un ticket → échec pas_un_ticket', () => {
		expect(toTicketRead({ estTicket: false, lignes: [] }).echec).toBe('pas_un_ticket');
	});
	it('manuscrit → échec manuscrit (priorité sur les lignes)', () => {
		expect(toTicketRead({ estTicket: true, manuscrit: true, lignes: [{ match: 'A - B' }] }).echec).toBe('manuscrit');
	});
	it('illisible ou sans ligne exploitable → échec illisible', () => {
		expect(toTicketRead({ estTicket: true, lisible: false, lignes: [] }).echec).toBe('illisible');
		expect(toTicketRead({ estTicket: true, lignes: [] }).echec).toBe('illisible');
		expect(toTicketRead({ estTicket: true, lignes: [{ match: '', marche: '', cote: '' }] }).echec).toBe('illisible');
	});
	it('entrée non-objet → échec illisible', () => {
		expect(toTicketRead(null).echec).toBe('illisible');
		expect(parseVisionResponse('rien du tout').echec).toBe('illisible');
	});
});

describe('toTicketRead — lecture du CONCEPT (liste fermée)', () => {
	it('RESULTAT_1X2 + choix : concept validé, texte brut conservé', () => {
		const r = toTicketRead({
			estTicket: true,
			lisible: true,
			lignes: [{ match: 'Rio Ave - FC Porto', marche: 'FC Porto 1 N 2', cote: '1.32', famille: 'RESULTAT_1X2', choix: 'FC Porto' }]
		});
		expect(r.lignes[0].marketText).toBe('FC Porto 1 N 2'); // texte conservé (secours + checksum)
		expect(r.lignes[0].concept).toEqual({ famille: 'RESULTAT_1X2', choix: 'FC Porto' });
	});

	it('PLUS_MOINS : direction + seuil normalisés (nombre ou chaîne « 2,5 »)', () => {
		const r = toTicketRead({
			estTicket: true,
			lignes: [{ match: 'A - B', marche: '+ de 2,5 buts', cote: '1.9', famille: 'plus_moins', direction: 'plus', seuil: '2,5' }]
		});
		expect(r.lignes[0].concept).toEqual({ famille: 'PLUS_MOINS', direction: 'PLUS', seuil: 2.5 });
	});

	it('DOUBLE_CHANCE : composantes filtrées (chaînes non vides)', () => {
		const r = toTicketRead({
			estTicket: true,
			lignes: [{ match: 'A - B', marche: 'A ou Nul', cote: '1.2', famille: 'DOUBLE_CHANCE', composantes: ['A', '', 'NUL', 3] }]
		});
		expect(r.lignes[0].concept).toEqual({ famille: 'DOUBLE_CHANCE', composantes: ['A', 'NUL'] });
	});

	it('famille absente ou exotique → pas de concept (on retombe sur le texte)', () => {
		const r = toTicketRead({
			estTicket: true,
			lignes: [
				{ match: 'A - B', marche: '1X', cote: '1.4' },
				{ match: 'C - D', marche: 'X', cote: '3.1', famille: 'RESULTAT_MATCH' }
			]
		});
		expect(r.lignes[0].concept).toBeUndefined();
		expect(r.lignes[1].concept).toBeUndefined();
	});

	it('NON_COUVERT / INCONNU : famille seule, aucun champ de choix', () => {
		const r = toTicketRead({
			estTicket: true,
			lignes: [
				{ match: 'A - B', marche: 'Buteur', cote: '2.1', famille: 'NON_COUVERT' },
				{ match: 'C - D', marche: '???', cote: '1.5', famille: 'INCONNU' }
			]
		});
		expect(r.lignes[0].concept).toEqual({ famille: 'NON_COUVERT' });
		expect(r.lignes[1].concept).toEqual({ famille: 'INCONNU' });
	});
});
