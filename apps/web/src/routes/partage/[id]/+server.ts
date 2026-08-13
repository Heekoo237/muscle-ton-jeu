import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTicket } from '$lib/server/fixtures/ticketStore';

/**
 * Image de partage (DESIGN.md §9). Gabarit FIXE, rendu serveur, aucune image
 * générée. Aucun nom de match, aucune cote, aucun montant (celui qui reçoit doit
 * venir sur le site). Format 1080 × 1350.
 *
 * Rendu en SVG ici. La conversion en PNG (Satori/resvg, fonts embarquées) est
 * branchée en même temps que les fichiers de police (Session 8) ; le gabarit,
 * lui, est définitif.
 */
function fmtPct(v: number): string {
	return `${v.toString().replace('.', ',')} %`;
}

function esc(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const GET: RequestHandler = async ({ params }) => {
	const ticket = await getTicket(params.id);
	if (!ticket?.result) error(404, 'Ticket introuvable');
	const { probaTotalePct, probaRenforceePct, nbRetirees } = ticket.result;

	const retraits = nbRetirees <= 1 ? `${nbRetirees} match retiré` : `${nbRetirees} matchs retirés`;
	const anton = "Anton, Oswald, 'Archivo Black', Impact, sans-serif";
	const geist = "Geist, system-ui, 'Segoe UI', sans-serif";

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <rect width="1080" height="1350" fill="#F8F1E4"/>
  <rect width="1080" height="240" fill="#FBEAE3"/>
  <text x="72" y="150" font-family="${anton}" font-size="56" letter-spacing="-1" fill="#C93A1A">MUSCLE TON JEU</text>

  <text x="306" y="410" text-anchor="middle" font-family="${geist}" font-weight="600" font-size="40" letter-spacing="2" fill="#6E6357">MON TICKET</text>
  <text x="774" y="410" text-anchor="middle" font-family="${geist}" font-weight="600" font-size="40" letter-spacing="2" fill="#6E6357">RENFORCÉ</text>

  <text x="306" y="700" text-anchor="middle" font-family="${geist}" font-weight="600" font-size="180" letter-spacing="-6" fill="#24201B" style="font-feature-settings:'tnum' 1">${esc(fmtPct(probaTotalePct))}</text>
  <text x="774" y="700" text-anchor="middle" font-family="${geist}" font-weight="600" font-size="180" letter-spacing="-6" fill="#C93A1A" style="font-feature-settings:'tnum' 1">${esc(fmtPct(probaRenforceePct))}</text>

  <line x1="72" y1="820" x2="1008" y2="820" stroke="#C9B79A" stroke-width="1"/>

  <text x="72" y="920" font-family="${geist}" font-weight="600" font-size="64" fill="#24201B">${esc(retraits)}</text>

  <text x="72" y="1180" font-family="${geist}" font-weight="400" font-size="32" fill="#6E6357">Outil d'analyse — pas un pronostic garanti · 18+</text>
  <text x="72" y="1264" font-family="${anton}" font-size="48" fill="#24201B">muscletonjeu.com</text>
</svg>`;

	return new Response(svg, {
		headers: {
			'Content-Type': 'image/svg+xml; charset=utf-8',
			'Cache-Control': 'public, max-age=3600'
		}
	});
};
