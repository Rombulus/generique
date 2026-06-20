const STYLE_OPENERS = {
  cinema: [
    "Une journee presque normale",
    "Un film de gestes minuscules",
    "Avec la participation involontaire de tout ce qui trainait"
  ],
  blockbuster: [
    "Le monde n'etait pas pret",
    "Aucun immeuble n'a explose, mais l'intention etait la",
    "Une production disproportionnee pour des evenements moderes"
  ],
  arte: [
    "Un documentaire sensible sur l'inertie contemporaine",
    "Voix basse, lumiere grise, assiette dans l'evier",
    "Prix special du detail qui insiste"
  ],
  thriller: [
    "Tout semblait conforme",
    "Puis le quotidien a commence a laisser des traces",
    "D'apres un dossier classe sans suite"
  ],
  sitcom: [
    "Enregistre devant une absence de public",
    "Episode special: les choses arrivent vaguement",
    "Avec rires ajoutes par politesse"
  ]
};

const input = document.querySelector("#dayInput");
const styleSelect = document.querySelector("#styleSelect");
const dramaRange = document.querySelector("#dramaRange");
const output = document.querySelector("#creditsOutput");
const generateButton = document.querySelector("#generateButton");
const copyButton = document.querySelector("#copyButton");
const statusBox = document.querySelector("#extractionStatus");

let isGenerating = false;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;"
    }[character];
  });
}

function makeCredit(role, thing) {
  const line = document.createElement("div");
  line.className = "credit-line";
  line.innerHTML = `
    <span class="role">${escapeHtml(role)}</span>
    <span class="dots" aria-hidden="true"></span>
    <span class="thing">${escapeHtml(thing)}</span>
  `;
  return line;
}

function setStatus(kind, message) {
  if (!statusBox) return;
  if (!message) {
    statusBox.hidden = true;
    statusBox.textContent = "";
    return;
  }
  statusBox.hidden = false;
  statusBox.className = `extraction-status ${kind}`;
  statusBox.textContent = message;
}

function setBusy(busy) {
  isGenerating = busy;
  generateButton.disabled = busy;
  generateButton.textContent = busy ? "Generation en cours..." : "Faire defiler";
}

async function requestExtraction(text, dramaLevel) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, dramaLevel }),
      signal: controller.signal
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload) {
      return {
        ok: false,
        actors: [],
        technicalCredits: [],
        finalLine: "",
        error: payload?.error || `Le serveur a repondu ${response.status}.`
      };
    }

    if (payload.error || !Array.isArray(payload.actors) || !payload.actors.length) {
      return {
        ok: false,
        actors: [],
        technicalCredits: [],
        finalLine: "",
        error: payload.error || "Le LLM n'a renvoye aucun acteur exploitable."
      };
    }

    return {
      ok: true,
      actors: payload.actors,
      technicalCredits: Array.isArray(payload.technicalCredits) ? payload.technicalCredits : [],
      finalLine: payload.finalLine || ""
    };
  } catch (error) {
    const reason = error?.name === "AbortError"
      ? "Le serveur n'a pas repondu a temps (20s). Le modele est peut-etre surcharge."
      : error.message;
    return { ok: false, actors: [], technicalCredits: [], finalLine: "", error: reason };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function renderEmptyState(message) {
  output.classList.remove("paused");
  output.innerHTML = "";

  const title = document.createElement("h2");
  title.textContent = "...";
  output.appendChild(title);

  const p = document.createElement("p");
  p.textContent = message;
  output.appendChild(p);
}

function renderCreditsFromActors(actors, technicalCredits, finalLine, style) {
  output.classList.remove("paused");
  output.innerHTML = "";

  const title = document.createElement("h2");
  title.textContent = "FIN";
  output.appendChild(title);

  STYLE_OPENERS[style].forEach((line) => {
    const p = document.createElement("p");
    p.textContent = line;
    output.appendChild(p);
  });

  const starring = document.createElement("h3");
  starring.textContent = "Distribution du jour";
  output.appendChild(starring);

  actors.forEach((actor) => {
    output.appendChild(makeCredit(actor.creditRole, actor.thing));
  });

  const departments = document.createElement("h3");
  departments.textContent = "Equipe technique du jour";
  output.appendChild(departments);

  if (technicalCredits.length) {
    technicalCredits.forEach((credit) => {
      output.appendChild(makeCredit(credit.role, credit.thing));
    });
  } else {
    actors.forEach((actor) => {
      output.appendChild(makeCredit(actor.technicalRole, actor.thing));
    });
  }

  if (finalLine) {
    const final = document.createElement("p");
    final.className = "final-card";
    final.textContent = finalLine;
    output.appendChild(final);
  }
}

async function renderCredits() {
  if (isGenerating) return;

  const text = input.value.trim();
  const style = styleSelect.value;
  const dramaLevel = Number(dramaRange.value);

  if (!text) {
    setStatus("info", "Ecris ta journee avant de lancer le defile.");
    return;
  }

  setBusy(true);
  setStatus("info", "Generation en cours...");
  renderEmptyState("Le generique se prepare...");

  const result = await requestExtraction(text, dramaLevel);

  setBusy(false);

  if (!result.ok) {
    setStatus("error", `IA indisponible: ${result.error}`);
    renderEmptyState("Le generique n'a pas pu etre genere. Verifie le badge ci-contre pour le detail de l'erreur.");
    return;
  }

  setStatus("ok", `IA active (${result.actors.length} acteurs, ${result.technicalCredits.length} credits techniques).`);
  renderCreditsFromActors(result.actors, result.technicalCredits, result.finalLine, style);
}

function copyCredits() {
  const lines = [...output.querySelectorAll("h2, h3, p, .credit-line")].map((node) => {
    if (node.classList.contains("credit-line")) {
      const role = node.querySelector(".role").textContent;
      const thing = node.querySelector(".thing").textContent;
      return `${role}${".".repeat(Math.max(8, 62 - role.length))}${thing}`;
    }

    return node.textContent;
  });

  const text = lines.join("\n");
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text);
  } else {
    const fallback = document.createElement("textarea");
    fallback.value = text;
    document.body.appendChild(fallback);
    fallback.select();
    document.execCommand("copy");
    fallback.remove();
  }

  output.classList.add("paused");
  copyButton.textContent = "Copie";
  window.setTimeout(() => {
    copyButton.textContent = "Copier";
  }, 1200);
}

generateButton.addEventListener("click", () => {
  renderCredits();
});
copyButton.addEventListener("click", copyCredits);
input.addEventListener("input", () => {
  output.classList.add("paused");
});

renderEmptyState("Ecris ta journee a gauche, puis clique sur \"Faire defiler\".");
