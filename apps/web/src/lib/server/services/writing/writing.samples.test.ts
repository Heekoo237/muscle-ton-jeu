/**
 * writing.samples.test.ts — Harnais des CINQ échantillons (brief : « je juge »).
 *
 * Fait tourner la rédaction sur cinq tickets réalistes et IMPRIME les textes,
 * pour qu'un humain juge s'ils se comprennent en dix secondes. Chaque texte
 * passe les mêmes garde-fous que la production (nombres, vocabulaire, causalité).
 *
 * - Sans clé (`MTJ_WRITER_KEY` / `ANTHROPIC_API_KEY`) : rédacteur FACTICE. On
 *   vérifie la structure et les garde-fous, on imprime le rendu déterministe.
 * - Avec clé : VRAI modèle (Haiku 4.5). Lance :
 *       MTJ_WRITER_KEY=sk-ant-… npx vitest run writing.samples --reporter verbose
 *   Les textes réels et le coût par rédaction s'affichent dans la console.
 *
 * Coût attendu (Haiku 4.5, 1 $/M entrée · 5 $/M sortie) : ~900 tokens d'entrée
 * (prompt système + ticket) et ~200 de sortie, soit ~0,0019 $ par rédaction
 * (~1,1 F CFA). À 1 000 tickets : ~1,9 $. À 20 000 : ~38 $. Avec la mise en
 * cache du prompt système, l'entrée retombe et le coût baisse encore. Loin des
 * 10 % du prix (500 F CFA) : la rédaction n'est pas un poste sensible.
 */
import { describe, it, expect } from 'vitest';
import { ECHANTILLONS } from './samples';
import { FakeWriting } from './fake';
import { AnthropicWriting, realWriterConfigured } from './anthropic';
import { allowedNumbersFor } from './allowed';
import { checkGeneratedText } from '$lib/server/domain/guards';
import type { WritingInput, WritingService } from './index';

/** Noms propres du ticket à masquer avant le contrôle des nombres. */
function masque(input: WritingInput): string[] {
	const noms = new Set<string>();
	for (const r of input.retraits) {
		const label = r.libelleFr.split(' — ')[0];
		noms.add(label);
		for (const p of label.split(' – ')) if (p.trim()) noms.add(p.trim());
	}
	return [...noms];
}

const reel = realWriterConfigured();
const writer: WritingService = reel ? new AnthropicWriting() : new FakeWriting();

describe(`échantillons de rédaction (${reel ? 'VRAI modèle' : 'factice'})`, () => {
	for (const ech of ECHANTILLONS) {
		it(ech.nom, async () => {
			const a = await writer.writeAnalysis(ech.input);
			const plein = [a.synthese, ...a.parSelection.map((p) => p.texte)].join('\n');

			// Trace lisible pour juger à l'œil.
			console.log(`\n=== ${ech.nom} ===`);
			console.log(`Synthèse : ${a.synthese}`);
			for (const p of a.parSelection) console.log(`  · [${p.ordre}] ${p.texte}`);

			// Mêmes garde-fous qu'en production.
			const controle = checkGeneratedText(plein, allowedNumbersFor(ech.input), masque(ech.input));
			if (!controle.ok) {
				console.error('Garde-fou:', JSON.stringify(controle, null, 2));
			}
			expect(controle.ok).toBe(true);
			expect(a.parSelection).toHaveLength(ech.input.retraits.length);
		});
	}
});
