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

const setupPage = document.querySelector("#setupPage");
const creditsPage = document.querySelector("#creditsPage");
const input = document.querySelector("#dayInput");
const styleSelect = document.querySelector("#styleSelect");
const dramaRange = document.querySelector("#dramaRange");
const output = document.querySelector("#creditsOutput");
const generateButton = document.querySelector("#generateButton");
const statusBox = document.querySelector("#extractionStatus");
const creditsMusic = new Audio();

creditsMusic.loop = false;
creditsMusic.volume = 0.42;

let isGenerating = false;
let hasRenderedCredits = false;
let musicLibrary = {};
let musicLibraryPromise = null;
let lastTrackSrcByStyle = {};
let preparedMusicTrack = null;

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

function showSetupPage() {
  setupPage.hidden = false;
  creditsPage.hidden = true;
  stopMusic();
  output.classList.remove("paused", "rolling");
}

function showCreditsPage() {
  setupPage.hidden = true;
  creditsPage.hidden = false;
}

function pushCreditsHistory() {
  if (window.location.hash !== "#credits") {
    window.history.pushState({ page: "credits" }, "", "#credits");
  }
}

async function loadMusicLibrary() {
  try {
    const response = await fetch("/api/music");
    musicLibrary = response.ok ? await response.json() : {};
  } catch {
    musicLibrary = {};
  }
  return musicLibrary;
}

function ensureMusicLibrary() {
  if (!musicLibraryPromise) musicLibraryPromise = loadMusicLibrary();
  return musicLibraryPromise;
}

function pickRandomTrack(style) {
  const tracks = Array.isArray(musicLibrary[style]) ? musicLibrary[style] : [];
  if (!tracks.length) return null;

  const availableTracks = tracks.length > 1
    ? tracks.filter((track) => track.src !== lastTrackSrcByStyle[style])
    : tracks;
  const track = availableTracks[Math.floor(Math.random() * availableTracks.length)];
  lastTrackSrcByStyle[style] = track.src;
  return track;
}

function stopMusic() {
  preparedMusicTrack = null;
  creditsMusic.pause();
  creditsMusic.removeAttribute("src");
  creditsMusic.load();
}

function waitForMusicDuration() {
  if (Number.isFinite(creditsMusic.duration) && creditsMusic.duration > 0) {
    return Promise.resolve(creditsMusic.duration);
  }

  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(() => cleanup(30), 2500);

    function cleanup(duration) {
      window.clearTimeout(timeoutId);
      creditsMusic.removeEventListener("loadedmetadata", handleMetadata);
      creditsMusic.removeEventListener("error", handleError);
      resolve(duration);
    }

    function handleMetadata() {
      const duration = Number.isFinite(creditsMusic.duration) && creditsMusic.duration > 0
        ? creditsMusic.duration
        : 30;
      cleanup(duration);
    }

    function handleError() {
      cleanup(30);
    }

    creditsMusic.addEventListener("loadedmetadata", handleMetadata, { once: true });
    creditsMusic.addEventListener("error", handleError, { once: true });
    creditsMusic.load();
  });
}

function prepareStyleMusic(style) {
  const track = pickRandomTrack(style);
  if (!track) {
    stopMusic();
    return null;
  }

  preparedMusicTrack = { ...track, style };
  creditsMusic.src = track.src;
  creditsMusic.currentTime = 0;
  creditsMusic.load();
  return preparedMusicTrack;
}

async function getPreparedMusicDuration(style) {
  await ensureMusicLibrary();
  const track = preparedMusicTrack?.style === style
    ? preparedMusicTrack
    : prepareStyleMusic(style);
  if (!track) return 30;
  return waitForMusicDuration();
}

async function playStyleMusic(style) {
  await ensureMusicLibrary();
  const track = preparedMusicTrack?.style === style
    ? preparedMusicTrack
    : pickRandomTrack(style);
  preparedMusicTrack = null;

  if (!track) {
    stopMusic();
    return;
  }

  if (creditsMusic.getAttribute("src") !== track.src) creditsMusic.src = track.src;
  creditsMusic.currentTime = 0;
  creditsMusic.play().catch(() => {
    setStatus("info", "Musique prete. Si le navigateur la bloque, relance le generique.");
  });
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
  output.classList.remove("paused", "rolling");
  output.innerHTML = "";

  const title = document.createElement("h2");
  title.textContent = "...";
  output.appendChild(title);

  const p = document.createElement("p");
  p.textContent = message;
  output.appendChild(p);
}

function startCreditsRoll(durationSeconds = 30) {
  const screen = output.closest(".screen");
  const screenHeight = screen ? screen.clientHeight : window.innerHeight;
  const rollDuration = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 30;

  output.classList.remove("rolling");
  output.style.setProperty("--roll-duration", `${rollDuration}s`);
  output.style.setProperty("--roll-start", `${screenHeight}px`);

  window.requestAnimationFrame(() => {
    const contentHeight = Math.max(output.scrollHeight, output.clientHeight);
    output.style.setProperty("--roll-end", `${-contentHeight}px`);
    output.classList.add("rolling");
  });
}

function renderCreditsFromActors(actors, technicalCredits, finalLine, style) {
  hasRenderedCredits = true;
  output.classList.remove("paused", "rolling");
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

  stopMusic();
  setBusy(true);
  setStatus("info", "Generation en cours...");
  output.innerHTML = "";
  await ensureMusicLibrary();
  prepareStyleMusic(style);

  const result = await requestExtraction(text, dramaLevel);

  setBusy(false);

  if (!result.ok) {
    stopMusic();
    setStatus("error", `IA indisponible: ${result.error}`);
    renderEmptyState("Le generique n'a pas pu etre genere. Verifie le badge ci-contre pour le detail de l'erreur.");
    return;
  }

  const musicDuration = await getPreparedMusicDuration(style);
  setStatus("ok", `IA active (${result.actors.length} acteurs, ${result.technicalCredits.length} credits techniques).`);
  showCreditsPage();
  renderCreditsFromActors(result.actors, result.technicalCredits, result.finalLine, style);
  pushCreditsHistory();
  startCreditsRoll(musicDuration);
  await playStyleMusic(style);
}

generateButton.addEventListener("click", () => {
  renderCredits();
});
input.addEventListener("input", () => {
  hasRenderedCredits = false;
  output.classList.add("paused");
});

styleSelect.addEventListener("change", () => {
  stopMusic();
});

window.addEventListener("resize", () => {
  if (output.classList.contains("rolling")) {
    const duration = Number.parseFloat(output.style.getPropertyValue("--roll-duration")) || 30;
    startCreditsRoll(duration);
  }
});

window.addEventListener("popstate", () => {
  if (window.location.hash === "#credits" && hasRenderedCredits) {
    showCreditsPage();
  } else {
    showSetupPage();
  }
});

output.addEventListener("animationend", (event) => {
  if (event.animationName === "roll") stopMusic();
});

if (window.location.hash === "#credits") {
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}

ensureMusicLibrary();
showSetupPage();
