// ===============================
// API ENDPOINT: /api/score
// AI Κριτής "Σωκράτης" (σταθερή JSON απόκριση)
// ===============================

import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
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
    const completion = await client.chat.completions.create({
      model: "gpt-4-turbo",
      temperature: 0,
      max_tokens: 250,
      messages: [
        {
          role: "system",
          content: `
Είσαι ο φιλόσοφος Σωκράτης.
Απάντησε *μόνο* με έγκυρο JSON, στη ΜΟΡΦΗ:
{
  "criteria": {
    "Θέση": 0-4,
    "Επιχειρηματολογία": 0-6,
    "Εικόνα/Μεταφορά": 0-4,
    "Παράδειγμα": 0-3,
    "Αντίρρηση": 0-4
  },
  "feedback": "κείμενο"
}

Κανόνες:
- "${isAdvanced ? "Προχωρημένη" : "Απλή"}" έκδοση.
- ΜΟΝΟ στον 1ο γύρο βαθμολογείται η "Θέση". Σε επόμενους γύρους βάλε "Θέση": 0.
- Η "Αντίρρηση" βαθμολογείται ΜΟΝΟ από τον 2ο γύρο και μετά. Στον 1ο γύρο βάλε "Αντίρρηση": 0.
- Στην Απλή Έκδοση το "Παράδειγμα" θεωρείται 0 (μη διαθέσιμο).
- ${rubricText}

Μην προσθέτεις τίποτα άλλο εκτός από το JSON.
`
        },
        {
          role: "user",
          content: `
Γύρος: ${roundNum}
Έκδοση: ${isAdvanced ? "Προχωρημένη" : "Απλή"}
Ερώτημα: ${mission?.question || "—"}
Απάντηση: ${transcript}`
        }
      ]


      
    });

    // --- Ανάγνωση απάντησης ---
   const raw = completion.choices?.[0]?.message?.content || "{}";
let parsed = {};

try {
  // Κανονική προσπάθεια
  parsed = JSON.parse(raw);
} catch (err) {
  console.warn("⚠️ JSON parse error, επιχειρώ διόρθωση…");

  // 💊 Επιδιόρθωση κοινών σφαλμάτων JSON από το μοντέλο
  let fixed = raw.trim()
    .replace(/[\u0000-\u001F]+/g, "")        // αφαιρεί αόρατους χαρακτήρες
    .replace(/“|”/g, '"')                    // αντικαθιστά ελληνικά εισαγωγικά
    .replace(/(\w)"(\w)/g, '$1"$2')          // διορθώνει “κολλητά” εισαγωγικά
    .replace(/,$/, "")                       // αφαιρεί κόμμα στο τέλος
    .replace(/"feedback":"([^"]*)$/, '"feedback":"$1"}'); // κλείνει feedback

  try {
    parsed = JSON.parse(fixed);
  } catch {
    console.error("⚠️ Αποτυχία και μετά τη διόρθωση:", fixed);
    parsed = { criteria: {}, feedback: "⚠️ JSON error" };
  }
}


       // --- Εσωτερική βαθμολόγηση (ΝΕΟ rubric) ---
    const c = parsed.criteria || {};

    // Τιμές από το μοντέλο (με προστασία NaN)
    let scores = {
      "Θέση": Number(c["Θέση"]) || 0,
      "Επιχειρηματολογία": Number(c["Επιχειρηματολογία"]) || 0,
      "Εικόνα/Μεταφορά": Number(c["Εικόνα/Μεταφορά"]) || 0,
      "Παράδειγμα": Number(c["Παράδειγμα"]) || 0,
      "Αντίρρηση": Number(c["Αντίρρηση"]) || 0
    };

    // Weights
    const WEIGHTS = {
      "Θέση": 4,
      "Επιχειρηματολογία": 6,
      "Εικόνα/Μεταφορά": 4,
      "Παράδειγμα": (isAdvanced ? 3 : 0),
      "Αντίρρηση": 4
    };

    // Ενεργοποίηση/Απενεργοποίηση ανά γύρο
    if (isFirstRound) {
      // 1ος γύρος: δεν μετρά η Αντίρρηση
      scores["Αντίρρηση"] = 0;
    } else {
      // 2ος+ γύρος: δεν μετρά η Θέση
      scores["Θέση"] = 0;
    }

    // Στην Απλή: Παράδειγμα = 0
    if (!isAdvanced) {
      scores["Παράδειγμα"] = 0;
    }

    // Κλάμπινγκ ανά weight
    const clamped = Object.fromEntries(
      Object.entries(scores).map(([k, v]) => [k, Math.max(0, Math.min(v, WEIGHTS[k]))])
    );

    // Σύνολο & out_of
    const out_of = (isAdvanced ? 17 : 14); // Advanced: 6+4+3+(4 ή 4) + Θέση/Αντίρρηση ανά γύρο => 17 max ανά γύρο
    let total = Object.entries(clamped).reduce((sum, [k, v]) => sum + v, 0);

    // Επιπλέον ασφαλιστική δικλείδα: μη ξεπερνάς το θεωρητικό μέγιστο ανά γύρο
    if (total > out_of) total = out_of;

    const scaled = Math.round((total / out_of) * 10);


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

    return res.status(200).json(result);
  } catch (err) {
    console.error("❌ Σφάλμα AI Κριτή:", err);
    return res
      .status(500)
      .json({ error: err.message || "Σφάλμα στον διακομιστή." });
  }
}
