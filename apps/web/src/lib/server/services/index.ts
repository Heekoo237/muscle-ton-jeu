/**
 * services — La frontière (brief §1). Au-dessus : code déterministe (domain).
 * En dessous : LLM et fournisseurs externes, chacun derrière son interface.
 * Toute la logique métier importe depuis ici, jamais un fournisseur directement.
 */
export { sports } from './sports';
export { predictions } from './predictions';
export { vision } from './vision';
export { writing } from './writing';
export { stats } from './stats';
export { payment } from './payment';
export { notifications } from './notifications';
export { auth } from './auth';
