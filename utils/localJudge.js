// ===============================
// Local Judge - Σωκράτης (Offline)
// ===============================

import fs from "fs";
import path from "path";

// --- 1. Φόρτωση rubric
export function loadRubric() {
  const filePath = path.join(process.cwd(), "public", "data", "rubricWeights.json");
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return data.criteria;
}

// --- 2. Φόρτωση cards λεξικού
export function loadCardsCatalog() {
  const filePath = path.join(process.cwd(), "public", "data", "cardsImagesMetaphors.json");
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return data;
}

// --- 3. Κύρια συνάρτηση τοπικής αξιολόγησης
export function localJudge({ transcript, mission, round, mode, cards = {}, philosopherContext = {} }) {
  if (!transcript || transcript.trim() === "")
    return { error: "Καμία απάντηση για αξιολόγηση." };

  const roundNum = Number(round) || 1;
  const isAdvanced = mode === "advanced";
  const rubric = loadRubric();

  // --- Φιλτράρουμε τα ενεργά κριτήρια όπως στον AI Κριτή
  const activeCriteria = rubric
    .filter(c => (isAdvanced ? c.advanced : c.simple))
    .filter(c => (roundNum === 1 && c.rounds.first) || (roundNum > 1 && c.rounds.later));

  // --- Ανάκτηση λεξικού καρτών
  const cardsCatalog = loadCardsCatalog();

  // --- Ενεργές κάρτες του παίκτη
  const imageCards = (cards.images || []).map(id =>
    (cardsCatalog.images || []).find(c => c.id === id)
  ).filter(Boolean);

  const metaphorCards = (cards.metaphors || []).map(id =>
    (cardsCatalog.metaphors || []).find(c => c.id === id)
  ).filter(Boolean);

  // --- 4. Βαθμολόγηση με απλούς κανόνες (offline)
  const C = {};

  for (const criterion of activeCriteria) {
    const key = criterion.key;
    let score = 0;

    switch (key) {
      case "Θέση":
        if (philosopherContext?.philosopher && transcript.includes(philosopherContext.philosopher))
          score = 3;
        if (transcript.toLowerCase().includes(philosopherContext?.position?.split(" ")[0]?.toLowerCase()))
          score = 4;
        break;

      case "Επιχειρηματολογία":
        // πολύ πρόχειρη λογική, θα τη βελτιώσουμε
        const argumentCount = transcript.split(/[γιατί|επειδή|διότι]/i).length - 1;
        score = Math.min(6, argumentCount);
        break;

      case "Εικόνα/Μεταφορά":
        const text = transcript.toLowerCase();
        const allKeywords = [
          ...imageCards.flatMap(c => c.keywords || []),
          ...metaphorCards.flatMap(c => c.keywords || [])
        ];
        const matches = allKeywords.filter(k => text.includes(k.toLowerCase()));
        score = matches.length > 2 ? 3 : matches.length > 0 ? 2 : 0;
        if (imageCards.length && metaphorCards.length && matches.length > 3)
          score = Math.min(4, score + 1); // bonus
        break;

      case "Παράδειγμα":
        if (text.includes("π.χ.") || text.includes("όπως"))
          score = 2;
        if (text.includes("π.χ.") && text.includes("όπως"))
          score = 3;
        break;

      case "Αντίρρηση":
        if (/δεν συμφωνώ|όμως|αντίθετα|παρόλα αυτά|σε απάντηση/i.test(transcript))
          score = 3;
        if (/γιατί το επιχείρημά σου δεν στέκει/i.test(transcript))
          score = 4;
        break;
    }

    C[key] = Math.min(score, criterion.max);
  }

  // --- 5. Υπολογισμός συνόλου & out_of
  const total = Object.values(C).reduce((a, b) => a + b, 0);
  const outOf = activeCriteria.reduce((sum, c) => sum + c.max, 0) + (activeCriteria.some(c => c.bonus) ? 1 : 0);

  return {
    criteria: C,
    total,
    out_of: outOf,
    feedback: "🧠 Τοπική εκτίμηση χωρίς AI."
  };
}

