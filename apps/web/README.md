# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
pnpm dlx sv@0.17.0 create --template minimal --types ts --install pnpm web
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## Décisions de copie (assumées)

### Titre du bloc « autres issues » : « Voici nos suggestions si tu veux garder ce match »

Sur les lignes **retirées** ET **serrées**, le bloc des autres paris du match
s'intitule **« Voici nos suggestions si tu veux garder ce match »** (avant :
« Sur ce match, voici ce que disent les chances »).

**Ce titre a été choisi contre l'avis de l'assistant, et le porteur du produit
l'assume et le décide.** La raison : *les utilisateurs comprennent mieux
« suggestions » que « ce que disent les chances ».*

Le mot **« suggestions » rapproche du conseil** — c'est la réserve soulevée, à
l'inverse de la discipline « on MONTRE, on ne suggère jamais » (voir
`domain/resultDisplay.ts`). Décision consciente : **seul le titre change**. Le
contenu du bloc reste identique — on affiche les probabilités déjà en base, sans
les classer par recommandation, sans verbe de conseil dans les lignes elles-mêmes.

Noté ici pour que, **si un problème apparaît** (frontière aide-à-la-décision /
pronostic), on sache d'où il vient.
