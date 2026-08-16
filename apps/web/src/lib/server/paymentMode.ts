/**
 * paymentMode.ts — Décide si le paiement peut avoir lieu, et si c'est du FACTICE.
 *
 * GARDE-FOU (point 8) : le défaut sans configuration est le REFUS. Une variable
 * oubliée n'autorise JAMAIS le factice en production. Pour tester le parcours en
 * factice sur un vrai déploiement, il faut poser EXPLICITEMENT `MTJ_PAYMENT_TEST=1`.
 *
 *  - `paiementReel()`   : un vrai agrégateur Mobile Money est branché (aucun aujourd'hui).
 *  - `paiementActif()`  : le paiement peut se dérouler — réel, OU dev local, OU mode test explicite.
 *  - `paiementModeTest()` : le paiement se déroule en FACTICE → bannière obligatoire, aucun débit réel.
 */
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';

/** Un vrai agrégateur est-il branché ? Non aujourd'hui. Le jour venu : tester ses clés. */
export function paiementReel(): boolean {
	return false;
}

/** Le mode test EXPLICITE est-il posé ? (jamais par défaut — variable exacte requise). */
function modeTestPose(): boolean {
	return env.MTJ_PAYMENT_TEST === '1';
}

/**
 * Le paiement peut-il se dérouler ? Réel, ou dev local, ou mode test explicite. En
 * production SANS `MTJ_PAYMENT_TEST=1` et sans agrégateur réel → false : on affiche un
 * message clair (« paiement bientôt disponible »), jamais une 500.
 */
export function paiementActif(): boolean {
	return paiementReel() || dev || modeTestPose();
}

/** Le paiement en cours est-il FACTICE ? → bannière « Mode test — aucun paiement réel ». */
export function paiementModeTest(): boolean {
	return paiementActif() && !paiementReel();
}
