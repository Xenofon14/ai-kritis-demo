// utils/localJudge.js

export async function localJudge({ transcript, mission, rubric }) {
  if (!transcript || !rubric?.criteria) {
    return {
      criteria: {},
      total: 0,
      out_of: 0,
      comment: "Δεν υπάρχουν δεδομένα για αξιολόγηση."
    };
  }

  const lower = transcript.toLowerCase();
  const active = rubric.criteria;

  let total = 0;
  const results = {};

  for (const c of active) {
    let score = 0;

    if (c.key.includes("Θέση")) {
      if (lower.includes("πιστεύω") || lower.includes("θεωρώ")) score = c.max * 0.5;
      if (lower.includes("ο φιλόσοφος") || lower.includes("είπε")) score = c.max;
    }

    else if (c.key.includes("Επιχειρηματολογία")) {
      if (lower.includes("γιατί") || lower.includes("επειδή")) score = c.max * 0.5;
      if (lower.includes("άρα") || lower.includes("συνεπώς")) score = c.max;
    }

    else if (c.key.includes("Εικόνα")) {
      if (lower.includes("όπως")) score = c.max * 0.5;
      if (lower.includes("σαν") || lower.includes("μοιάζει")) score = c.max;
    }

    else if (c.key.includes("Παράδειγμα")) {
      if (lower.includes("παράδειγμα")) score = c.max;
    }

    else if (c.key.includes("Αντίρρηση")) {
      if (lower.includes("όμως") || lower.includes("δεν συμφωνώ")) score = c.max * 0.5;
      if (lower.includes("αντίθετα") || lower.includes("αντίρρηση")) score = c.max;
    }

    results[c.key] = Math.round(score);
    total += score;
  }

  const out_of = active.reduce((sum, c) => sum + c.max, 0);
  let comment = "Καλή προσπάθεια!";

  if (total >= out_of * 0.8)
    comment = "Εξαιρετική απάντηση! Ο Σωκράτης θα ήταν περήφανος.";
  else if (total < out_of * 0.4)
    comment = "Χρειάζεται περισσότερη τεκμηρίωση και παραδείγματα.";

  return {
    criteria: results,
    total: Math.round(total),
    out_of,
    comment
  };
}
