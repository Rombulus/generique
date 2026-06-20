const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;

function loadEnvFile() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim().replace(/^\uFEFF/, "");
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile();

const port = Number(process.env.PORT || 5173);
const provider = process.env.LLM_PROVIDER || "gemini";
const model = process.env.LLM_MODEL || (provider === "gemini" ? "gemini-2.5-flash-lite" : "qwen3:8b");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 80_000) {
        request.destroy();
        reject(new Error("Body too large"));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function sendJson(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

function sendStatus(response) {
  sendJson(response, 200, {
    provider,
    model,
    cwd: process.cwd(),
    envPath: path.join(root, ".env"),
    hasGeminiApiKey: Boolean(process.env.GEMINI_API_KEY),
    geminiApiKeyLength: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 0
  });
}

const DRAMA_TONE_BY_LEVEL = {
  1: "Ton tres doux et attendri. Les petits soucis sont traites avec tendresse, presque rien n'est un vrai probleme.",
  2: "Ton leger et amuse. Les soucis du jour sont des peripeties mineures, traitees avec legerete.",
  3: "Ton mi-ironique mi-tendre, fatigue mais affectueux. Les petites galeres sont gonflees juste assez pour faire sourire.",
  4: "Ton emphatique et un peu absurde. Chaque petit incident est traite comme un evenement quasi historique.",
  5: "Ton totalement excessif et grandiloquent. Boire un cafe froid devient une tragedie antique. Pousse l'exageration au maximum tout en restant tendre, jamais mechant."
};

function extractionPrompt(text, dramaLevel) {
  const tone = DRAMA_TONE_BY_LEVEL[dramaLevel] || DRAMA_TONE_BY_LEVEL[3];

  return [
    "Tu es le generateur de \"Roll Credits\", un outil qui transforme le recit d'une journee banale en generique de fin de film.",
    "Tu recois un texte libre ecrit par une personne qui raconte sa journee. Tu dois produire UNIQUEMENT un objet JSON valide, sans balise markdown, sans texte autour.",
    "",
    "=== SCHEMA EXACT ATTENDU ===",
    "{",
    "  \"actors\": [",
    "    { \"thing\": \"string\", \"creditRole\": \"string\", \"technicalRole\": \"string\" }",
    "  ],",
    "  \"technicalCredits\": [",
    "    { \"role\": \"string\", \"thing\": \"string\" }",
    "  ],",
    "  \"finalLine\": \"string\"",
    "}",
    "",
    "=== REGLES DE CONTENU ===",
    "1. Identifie entre 4 et 12 moments ou elements reels du recit pour \"actors\" (objets, personnes, evenements, lieux). Plus le recit est riche, plus tu en prends ; un recit pauvre donne moins d'acteurs, ne force jamais a 12.",
    "2. Priorise les moments qui ont le plus de potentiel comique ou dramatique (un echec, une victoire minuscule, une personne, un objet recurrent) plutot que les details neutres ou vagues.",
    "3. Ignore completement les fragments flous, les meta-commentaires ou les phrases sans contenu concret (ex: \"avec qui je me suis senti mieux\", \"comme d'habitude\").",
    "4. \"thing\" est un groupe nominal court (2 a 6 mots), jamais une phrase complete, jamais un verbe conjugue. Garde les qualificatifs savoureux du texte original (\"mon connard de patron\" est meilleur que \"mon patron\"). Coupe les relatives inutiles (\"ma copine que j'aime\" devient \"ma copine\").",
    "5. \"creditRole\" est un role de generique invente, drole, specifique a CE moment precis (jamais generique comme \"figurant\" ou \"acteur\"). 2 a 6 mots. Exemples: \"antagoniste de proximite\", \"premier role liquide\", \"apparition salvatrice\", \"grand ennemi du jour\".",
    "6. \"technicalRole\" est un poste d'equipe technique de cinema invente pour ce meme moment, dans le registre regie/post-production/effets speciaux. 2 a 7 mots. Exemples: \"regie cafeine\", \"coordination des retards\", \"tension dramatique\", \"montage des regrets\".",
    "7. \"creditRole\" et \"technicalRole\" doivent etre DIFFERENTS l'un de l'autre et ne jamais se repeter entre deux acteurs de la meme liste.",
    "8. \"technicalCredits\" est un vrai generique long: 12 a 28 lignes si le texte contient un lieu concret (magasin, metro, bureau, maison, rue, restaurant, etc.), minimum 8 lignes sinon. Ces lignes ne sont PAS limitees aux acteurs. Elles doivent construire le decor spatio-temporel et social de la scene.",
    "9. Dans \"technicalCredits\", remercie ou credite les lieux, horaires, institutions, objets, lumieres, sons, surfaces, infrastructures, files d'attente, rayons, enseignes, transports, meteo, notifications, meubles, odeurs, sacs, tickets, portes, escaliers, lampes, tapis, caisses, panneaux, trottoirs, ascenseurs, tables, ecrans, etc. Un magasin peut donner: \"partenariat institutionnel\" -> \"la chaine de magasin\", \"direction de la lumiere\" -> \"les neons du rayon frais\", \"guidage spirituel\" -> \"les fleches promotionnelles\", \"bruitage additionnel\" -> \"le bip des caisses\".",
    "10. Les credits techniques doivent etre ridicules mais concrets. Ne remercie pas des abstractions vagues si un detail materiel est disponible. Prefere \"les lampes du parking\" a \"l'ambiance\". N'utilise pas un role hors-contexte: pas de \"standard familial\" s'il n'y a pas de famille, pas de \"coordination des retards\" s'il n'y a pas de trajet ou attente.",
    "11. Tu peux inferer prudemment le contexte a partir du texte: si la personne dit \"magasin\", tu peux parler de caisse, rayons, neons, tickets, sacs, porte automatique. Si elle dit \"metro\", tu peux parler de quai, bip du portique, correspondance, sieges, annonces. Si elle dit \"bureau\", tu peux parler de badge, table, chaise, ecran, open space, Slack, climatisation. Reste plausible, jamais fantastique.",
    "12. Pour un magasin, pense a: enseigne ou chaine de magasin, porte automatique, neons, rayon frais, rayon sec, sol trop brillant, file d'attente, bip de caisse, ticket, panier, sac, promotions, etiquette prix, vigile, tapis de caisse.",
    "13. Pour un transport, pense a: quai, portique, siege, annonce, correspondance, lumiere du wagon, freinage, plan de ligne, ticket, controle, foule, retard affiche.",
    "14. Pour un bureau, pense a: badge, open space, chaise, ecran, clavier, notification, badgeuse, machine a cafe, lumiere froide, salle de reunion, climatisation, moquette.",
    "15. \"finalLine\" est une phrase de cloture courte (max 18 mots), absurde mais tendre, qui resume l'esprit de la journee sans repeter les acteurs deja cites.",
    "16. N'invente AUCUN evenement majeur qui n'est pas dans le texte source. Tu peux enrichir le decor plausible autour d'un lieu mentionne, jamais ajouter une action nouvelle.",
    "",
    `=== TON A ADOPTER (niveau de tragedie ${dramaLevel}/5) ===`,
    tone,
    "",
    "=== EXEMPLE COMPLET ===",
    "Texte source: \"J'ai bu un cafe froid, rate le bus, repondu a trois mails, oublie d'acheter du pain, appele ma mere, perdu vingt minutes sur YouTube et range deux assiettes.\"",
    "Sortie attendue:",
    "{\"actors\":[",
    "{\"thing\":\"le cafe froid\",\"creditRole\":\"premier role liquide\",\"technicalRole\":\"regie cafeine\"},",
    "{\"thing\":\"le bus rate\",\"creditRole\":\"grand ennemi du jour\",\"technicalRole\":\"coordination des retards\"},",
    "{\"thing\":\"trois mails\",\"creditRole\":\"figurants administratifs\",\"technicalRole\":\"bureau des obligations\"},",
    "{\"thing\":\"le pain oublie\",\"creditRole\":\"grand absent de la boulangerie\",\"technicalRole\":\"inventaire incomplet\"},",
    "{\"thing\":\"ma mere\",\"creditRole\":\"appel entrant de l'origine\",\"technicalRole\":\"ligne directe avec l'origine\"},",
    "{\"thing\":\"vingt minutes sur YouTube\",\"creditRole\":\"cameo de l'algorithme\",\"technicalRole\":\"montage des distractions\"},",
    "{\"thing\":\"deux assiettes rangees\",\"creditRole\":\"victoire minuscule\",\"technicalRole\":\"cascade menagere\"}",
    "],\"technicalCredits\":[",
    "{\"role\":\"direction de la lumiere\",\"thing\":\"la cuisine de fin de journee\"},",
    "{\"role\":\"partenariat institutionnel\",\"thing\":\"la boulangerie jamais atteinte\"},",
    "{\"role\":\"bruitage additionnel\",\"thing\":\"les notifications en sourdine\"},",
    "{\"role\":\"coordination des retards\",\"thing\":\"l'arret de bus\"},",
    "{\"role\":\"accessoires non ranges\",\"thing\":\"les assiettes survivantes\"},",
    "{\"role\":\"montage parallele\",\"thing\":\"l'algorithme YouTube\"},",
    "{\"role\":\"standard familial\",\"thing\":\"le telephone de ma mere\"},",
    "{\"role\":\"supervision des miettes\",\"thing\":\"le pain absent\"}",
    "],\"finalLine\":\"Aucune grande decision n'a ete prise pendant cette production.\"}",
    "",
    "=== TEXTE SOURCE A TRAITER ===",
    text
  ].join("\n");
}

function parseJsonLoose(value) {
  const trimmed = String(value || "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    if (start === -1) throw new Error("No JSON object found");

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < trimmed.length; index += 1) {
      const character = trimmed[index];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (character === "\\") {
        escaped = true;
        continue;
      }

      if (character === "\"") {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (character === "{") depth += 1;
      if (character === "}") depth -= 1;

      if (depth === 0) {
        return JSON.parse(trimmed.slice(start, index + 1));
      }
    }

    throw new Error("Unclosed JSON object");
  }
}

async function extractWithGemini(text, dramaLevel) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      generationConfig: {
        temperature: 0.6,
        responseMimeType: "application/json",
        maxOutputTokens: 4096
      },
      contents: [
        {
          role: "user",
          parts: [{ text: extractionPrompt(text, dramaLevel) }]
        }
      ]
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini HTTP ${response.status}: ${errorBody.slice(0, 500)}`);
  }

  const data = await response.json();

  const promptBlockReason = data.promptFeedback?.blockReason;
  if (promptBlockReason) {
    throw new Error(`Gemini a bloque le prompt: ${promptBlockReason}`);
  }

  const candidate = data.candidates?.[0];
  if (!candidate) {
    throw new Error(`Gemini n'a renvoye aucun candidat. Reponse brute: ${JSON.stringify(data).slice(0, 500)}`);
  }

  if (candidate.finishReason && candidate.finishReason !== "STOP") {
    throw new Error(`Gemini s'est arrete avant la fin (finishReason: ${candidate.finishReason}). Augmente maxOutputTokens ou raccourcis le texte.`);
  }

  const rawText = candidate.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error(`Gemini a renvoye un candidat sans texte. Reponse brute: ${JSON.stringify(candidate).slice(0, 500)}`);
  }

  return parseJsonLoose(rawText);
}

async function extractWithOllama(text, dramaLevel) {
  const baseUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      format: "json",
      messages: [
        { role: "system", content: "Tu reponds uniquement en JSON valide." },
        { role: "user", content: extractionPrompt(text, dramaLevel) }
      ],
      options: {
        temperature: 0.5
      }
    })
  });

  if (!response.ok) throw new Error(`Ollama error ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return parseJsonLoose(data.message?.content);
}

async function extractWithLmStudio(text, dramaLevel) {
  const baseUrl = process.env.OPENAI_BASE_URL || "http://127.0.0.1:1234/v1";
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY || "lm-studio"}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.5,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Tu reponds uniquement en JSON valide." },
        { role: "user", content: extractionPrompt(text, dramaLevel) }
      ]
    })
  });

  if (!response.ok) throw new Error(`OpenAI-compatible error ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return parseJsonLoose(data.choices?.[0]?.message?.content);
}

function sanitizeLlmField(value, maxWords) {
  const cleaned = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  const words = cleaned.split(" ");
  return words.length > maxWords ? words.slice(0, maxWords).join(" ") : cleaned;
}

function validateActors(rawActors) {
  if (!Array.isArray(rawActors)) return [];

  const seen = new Set();
  const cleaned = [];

  for (const item of rawActors) {
    const thing = sanitizeLlmField(item?.thing, 8);
    const creditRole = sanitizeLlmField(item?.creditRole, 7);
    const technicalRole = sanitizeLlmField(item?.technicalRole, 7);

    if (!thing || !creditRole || !technicalRole) continue;

    const key = thing.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    cleaned.push({ thing, creditRole, technicalRole });
    if (cleaned.length >= 12) break;
  }

  return cleaned;
}

function validateTechnicalCredits(rawCredits) {
  if (!Array.isArray(rawCredits)) return [];

  const seen = new Set();
  const cleaned = [];

  for (const item of rawCredits) {
    const role = sanitizeLlmField(item?.role, 8);
    const thing = sanitizeLlmField(item?.thing, 10);

    if (!role || !thing) continue;

    const key = `${role.toLowerCase()}|${thing.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    cleaned.push({ role, thing });
    if (cleaned.length >= 28) break;
  }

  return cleaned;
}

async function handleExtract(request, response) {
  try {
    const body = JSON.parse(await readBody(request));
    const text = String(body.text || "").slice(0, 6000);
    const dramaLevel = Math.min(5, Math.max(1, Number(body.dramaLevel) || 3));

    if (!text.trim()) return sendJson(response, 200, { actors: [], finalLine: "" });

    const payload = provider === "gemini"
      ? await extractWithGemini(text, dramaLevel)
      : provider === "lmstudio"
        ? await extractWithLmStudio(text, dramaLevel)
        : await extractWithOllama(text, dramaLevel);

    const actors = validateActors(payload.actors);
    if (!actors.length) {
      throw new Error("Le LLM a repondu mais sans acteur exploitable apres validation.");
    }

    const technicalCredits = validateTechnicalCredits(payload.technicalCredits);

    sendJson(response, 200, {
      provider,
      model,
      actors,
      technicalCredits,
      finalLine: sanitizeLlmField(payload.finalLine, 15)
    });
  } catch (error) {
    console.error(`[extract] echec provider=${provider} model=${model}:`, error.message);
    sendJson(response, 502, {
      provider,
      model,
      actors: [],
      technicalCredits: [],
      finalLine: "",
      error: error.message
    });
  }
}

function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.resolve(root, `.${requestedPath}`);

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream"
    });
    response.end(data);
  });
}

const server = http.createServer((request, response) => {
  if (request.method === "GET" && request.url === "/api/status") {
    sendStatus(response);
    return;
  }

  if (request.method === "POST" && request.url === "/api/extract") {
    handleExtract(request, response);
    return;
  }

  if (request.method === "GET" || request.method === "HEAD") {
    serveStatic(request, response);
    return;
  }

  response.writeHead(405);
  response.end("Method not allowed");
});

server.listen(port, () => {
  console.log(`Generique app: http://localhost:${port}`);
  console.log(`LLM provider: ${provider}, model: ${model}`);
  console.log(`Gemini API key loaded: ${process.env.GEMINI_API_KEY ? "yes" : "no"}`);
});
