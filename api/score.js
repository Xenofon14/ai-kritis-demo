// ===============================
// API ENDPOINT: /api/score
// AI Κριτής "Σωκράτης" (σταθερή JSON απόκριση)
// ===============================

import OpenAI from "openai";
import { config } from "dotenv";

config(); // ✅ φορτώνει το κλειδί τοπικά αν χρειαστεί

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export default async function handler(req, res) {

console.log("⚙️ AI Κριτής ενεργός, API key μήκος:", process.env.OPENAI_API_KEY?.length || 0);

  try {
    // --- Ανάγνωση body (ασφαλής για Edge functions) ---
    let body = {};
    try {
      if (req.body) {
        body = req.body;
      } else {
        let raw = "";
        for await (const chunk of req) raw += chunk;
        body = JSON.parse(raw || "{}");
      }
    } catch (err) {
      console.error("❌ Αποτυχία ανάγνωσης body:", err);
      return res.status(400).json({ error: "Μη έγκυρη μορφή αιτήματος." });
    }

    const { transcript, mission, round, mode } = body;
    if (!transcript) {
      return res.status(400).json({ error: "Καμία απάντηση για αξιολόγηση." });
    }

    // --- Round & Mode ---
    const roundNum = Number(round) || 1;
    const isFirstRound = roundNum === 1;
    const isAdvanced = (mode === "advanced");

    // --- Περιγραφή rubric ανά έκδοση ---
    // Κλειδιά νέου rubric:
    // Θέση (0–4, μόνο 1ος γύρος), Επιχειρηματολογία (0–6, όλοι οι γύροι),
    // Εικόνα/Μεταφορά (0–4, όλοι οι γύροι), Παράδειγμα (0–3, μόνο advanced),
    // Αντίρρηση (0–4, από 2ο γύρο).
    const rubricText = isAdvanced
      ? `Κριτήρια (Προχωρημένη Έκδοση):
- Θέση: 0–4 (μόνο 1ος γύρος· στους επόμενους γύρους δεν προσμετράται)
- Επιχειρηματολογία: 0–6
- Εικόνα/Μεταφορά: 0–4
- Παράδειγμα: 0–3
- Αντίρρηση: 0–4 (μόνο από 2ο γύρο και μετά)`
      : `Κριτήρια (Απλή Έκδοση):
- Θέση: 0–4 (μόνο 1ος γύρος· στους επόμενους γύρους δεν προσμετράται)
- Επιχειρηματολογία: 0–6
- Εικόνα/Μεταφορά: 0–4
- Αντίρρηση: 0–4 (μόνο από 2ο γύρο και μετά)
(Δεν υπάρχει κριτήριο "Παράδειγμα"· θεώρησέ το 0)`;

    // --- Prompt προς το μοντέλο ---
    const completion = await client.responses.create({
      model: "gpt-4o-mini",
      input: [
        {
          role: "system",
          content: `
Είσαι ο φιλόσοφος Σωκράτης.
Απάντησε ΜΟΝΟ με έγκυρο JSON, στη ΜΟΡΦΗ:
{"criteria":{"Θέση":0-4,"Επιχειρηματολογία":0-6,"Εικόνα/Μεταφορά":0-4,"Παράδειγμα":0-3,"Αντίρρηση":0-4},"feedback":"κείμενο"}
(Χωρίς markdown, χωρίς σχόλια, χωρίς ```json)
- Έκδοση: ${isAdvanced ? "Προχωρημένη" : "Απλή"}
- ${rubricText}
`
        },
        {
          role: "user",
          content: `
Γύρος: ${roundNum}
Ερώτημα: ${mission?.question || "—"}
Απάντηση: ${transcript}`
        }
      ]
    });

    const raw = completion.output_text || "{}";

    
let parsed = {};

try {
  // 🔹 Αφαίρεση markdown και περίσσιων χαρακτήρων
  const cleaned = raw
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .replace(/^[^{]*({[\s\S]*})[^}]*$/, "$1")
    .trim();

  parsed = JSON.parse(cleaned);
} catch (err) {
  console.warn("⚠️ JSON parse error, επιχειρώ διόρθωση…");
  let fixed = raw
    .replace(/```json|```/g, "")
    .replace(/[\u0000-\u001F]+/g, "")
    .replace(/“|”/g, '"')
    .replace(/([a-zA-ZΑ-Ωα-ω])"([a-zA-ZΑ-Ωα-ω])/g, '$1"$2')
    .replace(/\n/g, " ")
    .trim();

  // 🔹 Εξασφαλίζουμε ότι υπάρχει κλείσιμο JSON
  if (!fixed.endsWith("}")) {
    const lastBrace = fixed.lastIndexOf("}");
    fixed = lastBrace === -1 ? fixed + "}" : fixed.slice(0, lastBrace + 1);
  }

  try {
    parsed = JSON.parse(fixed);
  } catch (err2) {
    console.error("❌ Αποτυχία JSON parsing:", err2.message);
    console.log("🧩 Απάντηση AI (truncated):", raw.slice(0, 200));
    parsed = {
      criteria: {
        "Θέση": 0,
        "Επιχειρηματολογία": 0,
        "Εικόνα/Μεταφορά": 0,
        "Παράδειγμα": 0,
        "Αντίρρηση": 0
      },
      feedback: "⚠️ JSON error (incomplete output)"
    };
  }
}

// --- Εσωτερική βαθμολόγηση ---
const c = parsed.criteria || {};

// ✅ Ενοποίηση ονομάτων από παλιό & νέο rubric
const mapped = {
  ...c,
  "Τεκμηρίωση": c["Τεκμηρίωση"] ?? c["Επιχειρηματολογία"] ?? 0,
  "Συνάφεια": c["Συνάφεια"] ?? c["Εικόνα/Μεταφορά"] ?? 0,
  "Σαφήνεια": c["Σαφήνεια"] ?? c["Παράδειγμα"] ?? 0
};

const C = {
  Θέση:       Number(mapped["Θέση"])       || 0,
  Τεκμηρίωση: Number(mapped["Τεκμηρίωση"]) || 0,
  Συνάφεια:   Number(mapped["Συνάφεια"])   || 0,
  Σαφήνεια:   Number(mapped["Σαφήνεια"])   || 0,
  Αντίρρηση:  Number(mapped["Αντίρρηση"])  || 0
};

// ✅ Περιορισμοί ανά γύρο ΜΕΤΑ τον ορισμό του C
if (roundNum === 1) C["Αντίρρηση"] = 0;
if (roundNum > 1)  C["Θέση"] = 0;

let total = Object.values(C).reduce((a, b) => a + b, 0);
if (total > 8) total = 8;
const scaled = Math.round((total / 8) * 10);

    // --- Τελικό αποτέλεσμα ---
    const result = {
      criteria: C,
      total,
      out_of: 8,
      scaled,
      feedback:
        typeof parsed.feedback === "string"
          ? parsed.feedback
          : "Ο Σωκράτης σιώπησε."
    };

    console.log(`📊 Σκορ γύρος ${roundNum}: ${total}/8 (${scaled}/10)`);

   try {
  const safeResult = JSON.parse(JSON.stringify(result)); // καθαρισμός για αποστολή
  return res.status(200).json(safeResult);
} catch (e) {
  console.error("❌ Σφάλμα κατά την αποστολή JSON:", e);
  return res.status(500).json({ error: "Σφάλμα στην αποστολή δεδομένων." });
}

  } catch (err) {
    console.error("❌ Σφάλμα AI Κριτή:", err);
    return res
      .status(500)
      .json({ error: err.message || "Σφάλμα στον διακομιστή." });
  }
}
