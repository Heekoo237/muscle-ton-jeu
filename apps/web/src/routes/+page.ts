// Landing 100 % statique : prérendue en HTML, servie du CDN (TTFB quasi nul, ni
// fonction serveur ni appel Supabase). Le seul élément dynamique — le bouton
// « Se connecter » / « Mon compte » — est résolu côté client, sans scintillement,
// par le script de app.html (cookie-indice non sensible).
export const prerender = true;
