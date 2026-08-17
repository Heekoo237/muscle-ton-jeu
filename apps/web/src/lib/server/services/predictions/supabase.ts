/**
 * supabase.ts — Lecture RÉELLE de la table `predictions` (règles d'archi n°1/2).
 *
 * Le chemin temps réel LIT ; il ne calcule jamais. On prend la DERNIÈRE ligne
 * connue par (match, marché) — clé (fixture_id, marche, jour_calcul) —, ce qui
 * donne la probabilité annoncée aujourd'hui. Une ligne absente = null (le match
 * ou le marché n'est pas analysé ; l'appelant ne facture ni ne retire).
 */
import type { PredictionsService } from './index';
import type { Market, Prediction } from '$lib/types';
import { supabaseAdmin } from '$lib/server/supabase';

interface Row {
	fixture_id: number;
	marche: Market;
	probabilite: string | number;
	confiance: string | number;
	seuil_fragile: string | number | null;
	source: 'odds' | 'model' | 'repli' | null;
	jour_calcul: string;
}

function toPrediction(r: Row): Prediction {
	return {
		fixtureId: Number(r.fixture_id),
		marche: r.marche,
		probabilite: Number(r.probabilite),
		confiance: Number(r.confiance),
		seuilFragile: r.seuil_fragile === null ? null : Number(r.seuil_fragile),
		source: r.source ?? undefined
	};
}

const COLS = 'fixture_id, marche, probabilite, confiance, seuil_fragile, source, jour_calcul';

export class SupabasePredictions implements PredictionsService {
	async get(fixtureId: number, marche: Market): Promise<Prediction | null> {
		const { data, error } = await supabaseAdmin()
			.from('predictions')
			.select(COLS)
			.eq('fixture_id', fixtureId)
			.eq('marche', marche)
			.order('jour_calcul', { ascending: false })
			.limit(1);
		if (error) throw error;
		const row = data?.[0] as Row | undefined;
		return row ? toPrediction(row) : null;
	}

	async forFixture(fixtureId: number): Promise<Prediction[]> {
		const { data, error } = await supabaseAdmin()
			.from('predictions')
			.select(COLS)
			.eq('fixture_id', fixtureId)
			.order('jour_calcul', { ascending: false });
		if (error) throw error;
		// Plusieurs jours possibles par marché : on garde la ligne la plus récente.
		const seen = new Set<Market>();
		const out: Prediction[] = [];
		for (const r of (data ?? []) as Row[]) {
			if (seen.has(r.marche)) continue;
			seen.add(r.marche);
			out.push(toPrediction(r));
		}
		return out;
	}

	async forFixtures(fixtureIds: number[]): Promise<Map<number, Prediction[]>> {
		const out = new Map<number, Prediction[]>();
		if (fixtureIds.length === 0) return out;
		// UNE requête pour tous les matchs demandés (au lieu d'une par match). Tri par
		// jour décroissant : on garde la ligne la plus récente par (match, marché).
		const { data, error } = await supabaseAdmin()
			.from('predictions')
			.select(COLS)
			.in('fixture_id', fixtureIds)
			.order('jour_calcul', { ascending: false });
		if (error) throw error;
		const seen = new Map<number, Set<Market>>();
		for (const r of (data ?? []) as Row[]) {
			const fid = Number(r.fixture_id);
			let marches = seen.get(fid);
			if (!marches) {
				marches = new Set();
				seen.set(fid, marches);
			}
			if (marches.has(r.marche)) continue; // déjà pris la ligne la plus récente
			marches.add(r.marche);
			const list = out.get(fid) ?? [];
			list.push(toPrediction(r));
			out.set(fid, list);
		}
		return out;
	}
}
