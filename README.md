# Générique de fin de journée

Un petit générateur web qui transforme le récit d'une journée banale en générique de fin de film.

Tu racontes ce qui s'est passé, l'application demande à Gemini d'en extraire les personnages, objets, lieux et micro-événements, puis elle déroule un générique absurde, tendre et beaucoup trop solennel pour la situation.

```text
Distribution du jour
premier rôle liquide..........................le café froid
grand ennemi du jour..........................le bus raté
apparition salvatrice.........................ma copine

Équipe technique du jour
direction de la lumière.......................les néons blafards
bruitage additionnel..........................le bip des caisses
gestion des flux..............................la porte automatique
```

## Fonctionnalités

- Génération d'un vrai générique de fin à partir d'un texte libre.
- Extraction par LLM avec `gemini-2.5-flash-lite`.
- Section `Distribution du jour` pour les acteurs de la journée.
- Section `Équipe technique du jour` pour le contexte spatio-temporel: lieux, lumières, objets, sons, transports, magasins, bureaux, météo, surfaces, files d'attente.
- Slider de niveau de tragédie, de doux à totalement disproportionné.
- Styles de générique: film d'auteur fatigué, blockbuster du rien, documentaire Arte, thriller administratif, sitcom domestique.
- Bouton de copie du générique.
- Script Windows `.bat` pour lancer le serveur et ouvrir `localhost`.

## Lancement rapide

Sur Windows, double-clique sur:

```text
lancer-generique.bat
```

Le script:

- redémarre le serveur local si le port `5173` est déjà occupé ;
- lance `server.js` ;
- ouvre automatiquement l'application dans le navigateur.

Adresse locale:

```text
http://localhost:5173
```

## Configuration Gemini

Crée un fichier `.env` à la racine du projet:

```env
GEMINI_API_KEY=ta_cle_api
```

Le fichier `.env` est ignoré par Git.

Pour vérifier que la clé est bien lue:

```text
http://localhost:5173/api/status
```

La réponse doit contenir:

```json
{
  "hasGeminiApiKey": true
}
```

## Lancement manuel

Si tu préfères lancer sans le `.bat`:

```powershell
node server.js
```

Puis ouvre:

```text
http://localhost:5173
```

## Structure du projet

```text
.
├── app.js                 # Logique front: appel API, rendu du générique, copie
├── index.html             # Interface de saisie et écran de générique
├── styles.css             # Mise en scène visuelle
├── server.js              # Serveur local + appel Gemini
├── lancer-generique.bat   # Lancement Windows
├── .gitignore             # Ignore .env
└── README.md
```

## Comment ça marche

Le navigateur envoie le texte de la journée à:

```text
POST /api/extract
```

Le serveur construit un prompt strict et demande à Gemini un JSON contenant:

- `actors`: les éléments principaux de la journée ;
- `technicalCredits`: les crédits techniques contextuels ;
- `finalLine`: la phrase finale du générique.

Le front ne demande pas à Gemini d'écrire du HTML. Il reçoit des données structurées et les met en scène dans le moteur de générique.

## Exemple de payload attendu

```json
{
  "actors": [
    {
      "thing": "le café froid",
      "creditRole": "premier rôle liquide",
      "technicalRole": "régie caféine"
    }
  ],
  "technicalCredits": [
    {
      "role": "direction de la lumière",
      "thing": "les néons du magasin"
    }
  ],
  "finalLine": "Aucune grande décision n'a été prise pendant cette production."
}
```

## Notes de développement

Le projet n'a pas de dépendances npm pour l'instant. Il utilise uniquement Node.js natif côté serveur et du HTML/CSS/JS côté client.

Vérifier la syntaxe:

```powershell
node --check server.js
node --check app.js
```

## Idée directrice

Le but n'est pas de résumer une journée. Le but est de lui donner une dignité cinématographique parfaitement excessive.

Une file d'attente devient un poste de coordination.
Un néon devient directeur photo.
Un café froid obtient enfin le crédit qu'il mérite.
