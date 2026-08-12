import type { VisionService, RawTicketRead } from './index';

/**
 * Lecture factice d'un ticket type : un mélange de marchés couverts, un cas
 * ambigu (seuil manquant) et un marché non couvert (mi-temps) pour exercer
 * l'écran de validation. Le vrai modèle vision (Session 8) rend le même JSON.
 */
export class FakeVision implements VisionService {
	async readTicket(): Promise<RawTicketRead> {
		return {
			lignes: [
				{ texteBrut: 'Arsenal - Liverpool  1X  1.42' },
				{ texteBrut: 'Man Utd - Tottenham  Over 2.5  1.85' },
				{ texteBrut: 'Lens - Nice  BTTS  1.72' },
				{ texteBrut: 'Marseille - Lyon  1  2.10' },
				{ texteBrut: 'Chelsea - Man City  X2  1.55' },
				{ texteBrut: 'PSG - Monaco  Over 1.5  1.28' },
				{ texteBrut: 'Atletico - Séville  BTTS Non  1.90' },
				{ texteBrut: 'Dortmund - Leipzig  2  2.40' },
				{ texteBrut: 'Real Madrid - Barcelone  TB  1.95' }, // seuil manquant → ambigu
				{ texteBrut: 'Arsenal - Liverpool  1MT  2.30' } // mi-temps → non couvert
			],
			coteTotaleLue: '312.50'
		};
	}
}
