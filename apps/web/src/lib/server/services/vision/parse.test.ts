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
