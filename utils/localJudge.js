// utils/localJudge.js
// (browser build) — δεν χρησιμοποιούμε fs/path


// ✅ Βοηθητικά για ελληνικά: αφαίρεση τόνων + ασφαλές includes με οριοθέτηση λέξης
function normalizeGreek(str = "") {
  return str
    .toLowerCase()
    .normalize("NFD")                 // διαχωρίζει γράμμα/τόνο
    .replace(/[\u0300-\u036f]/g, ""); // αφαιρεί τόνους
}

function hasWord(text, ...patterns) {
  return patterns.some((p) => {
    const pat = normalizeGreek(p).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // οριοθέτηση λέξης (δέχεται ελληνικούς χαρακτήρες)
    const re = new RegExp(`(^|[^\\p{L}])${pat}([^\\p{L}]|$)`, "u");
    return re.test(text);
  });
}

export async function localJudge({ transcript, mission, rubric, round = 1, philosopherContext = {}, cards = {} }) {

  if (!transcript || !rubric?.criteria) {
    return {
      criteria: {},
      total: 0,
      out_of: 0,
      comment: "Δεν υπάρχουν δεδομένα για αξιολόγηση."
    };
  }

  const lower = normalizeGreek(transcript);
  const active = rubric.criteria;

  // ✅ Φόρτωση καρτών (λεξικό εικόνων/μεταφορών) — browser fetch από /data/...
  let cardsCatalog = {};
  try {
    const res = await fetch("/data/cardsImagesMetaphors.json", { cache: "no-store" });
    if (res.ok) {
      cardsCatalog = await res.json();
    } else {
      console.warn("⚠️ Δεν φορτώθηκε cardsImagesMetaphors.json:", res.status);
    }
  } catch (err) {
    console.warn("⚠️ Σφάλμα φόρτωσης cardsImagesMetaphors.json:", err?.message || err);
  }

  function findCards(list, section) {
    const all = cardsCatalog[section] || [];
    return (list || []).map(id => all.find(c => c.id === id)).filter(Boolean);
  }

  const imageCards = findCards(cards.images, "images");
  const metaphorCards = findCards(cards.metaphors, "metaphors");

  const imageKeywords = imageCards.flatMap(c => c.keywords || []);
  const metaphorKeywords = metaphorCards.flatMap(c => c.keywords || []);

    let total = 0;
  const results = {};

  for (const c of active) {
    let score = 0;

    // ✅ Ελέγχουμε αν το κριτήριο είναι ενεργό στον γύρο
    const isFirstRound = round === 1;
    const isLaterRound = round > 1;
    const validThisRound =
      (isFirstRound && c.rounds?.first) ||
      (isLaterRound && c.rounds?.later);

    if (!validThisRound) {
      results[c.key] = 0;
      continue;
    }

    // --- Απλοί κανόνες εντοπισμού ---
   if (c.key.includes("Θέση")) {
  if (lower.includes("ο φιλόσοφος") ||
      lower.includes("είπε") ||
      lower.includes(philosopherContext.philosopher?.toLowerCase() || "")) score = c.max;
  else if (lower.includes("πιστεύω") || lower.includes("θεωρώ")) score = c.max * 0.5;
}

  else if (c.key.includes("Επιχειρηματολογία")) {
  if (hasWord(lower, "γιατί", "γιατι", "επειδή", "επειδη")) score = c.max * 0.5;
  if (hasWord(lower, "άρα", "αρα", "συνεπώς", "συνεπως")) score = c.max;
}

 else if (c.key.includes("Εικόνα")) {
  const usedImages = imageKeywords.some(k => hasWord(lower, k));
  const usedMetaphors = metaphorKeywords.some(k => hasWord(lower, k));

  if (usedImages && usedMetaphors) score = c.max;
  else if (usedImages || usedMetaphors) score = c.max * 0.6;
  else if (hasWord(lower, "όπως", "οπως")) score = c.max * 0.5;
  else if (hasWord(lower, "σαν", "μοιάζει", "μοιαζει")) score = c.max;

  if (c.bonus && usedImages && usedMetaphors) {
    results["Μπόνους Εικόνας/Μεταφοράς"] = 1;
    total += 1;
  }
}



   else if (c.key.includes("Παράδειγμα")) {
  if (hasWord(lower, "παράδειγμα", "παραδειγμα", "π.χ.", "πχ", "όπως", "οπως")) score = c.max;
}

   else if (c.key.includes("Αντίρρηση")) {
  if (hasWord(lower, "όμως", "ομως", "δεν συμφωνώ", "δεν συμφωνω")) score = c.max * 0.5;
  if (hasWord(lower, "αντίθετα", "αντιθετα", "αντίρρηση", "αντιρρηση")) score = c.max;
}

    const safe = Math.max(0, Math.min(c.max, Number(score.toFixed(1))));
results[c.key] = safe;
total += safe;


  const out_of = active
    .filter(c => (round === 1 && c.rounds.first) || (round > 1 && c.rounds.later))
    .reduce((sum, c) => sum + c.max, 0);

  let comment = "Καλή προσπάθεια!";
  if (total >= out_of * 0.8)
    comment = "Εξαιρετική απάντηση! Ο Σωκράτης θα ήταν περήφανος.";
  else if (total < out_of * 0.4)
    comment = "Χρειάζεται περισσότερη τεκμηρίωση και παραδείγματα.";

  // ✅ Αν γνωρίζουμε ποιον φιλόσοφο εκπροσωπεί ο παίκτης, προσαρμόζουμε το σχόλιο
  if (comment.includes("Εξαιρετική")) {
    comment = `Εξαιρετική απάντηση! Ο ${philosopherContext.philosopher || "Σωκράτης"} θα ήταν περήφανος.`;
  }
  
  return {
    criteria: results,
    total: Number(total.toFixed(1)),
    out_of,
    comment
  };
}
