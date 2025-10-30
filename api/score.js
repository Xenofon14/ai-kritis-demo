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
  // ✅ Καθαρισμός από τυχόν markdown ή σχόλια του μοντέλου
  const cleaned = raw
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .replace(/^[^{]*({[\s\S]*})[^}]*$/, "$1")  // κρατά μόνο το JSON block
    .trim();

  parsed = JSON.parse(cleaned);
} catch (err) {
 
console.warn("⚠️ JSON parse error, επιχειρώ διόρθωση…");

  // 💊 Επιδιόρθωση κοινών σφαλμάτων JSON από το μοντέλο
  let fixed = raw.trim()
    .replace(/[\u0000-\u001F]+/g, "")        // αφαιρεί αόρατους χαρακτήρες
    .replace(/“|”/g, '"')                    // αντικαθιστά ελληνικά εισαγωγικά
    .replace(/(\w)"(\w)/g, '$1"$2')          // διορθώνει “κολλητά” εισαγωγικά
    .replace(/,$/, "")                       // αφαιρεί κόμμα στο τέλος
    // ✅ Αν λείπει το τέλος του feedback, το συμπληρώνουμε σωστά
    .replace(/"feedback":"([^}]*)$/, (_, p1) => `"feedback":"${p1.replace(/"$/, "")}"} }`);

 try {
  parsed = JSON.parse(fixed);
} catch {
  console.warn("⚠️ Αποτυχία και μετά τη διόρθωση:", fixed);

  // 🩹 Αν το JSON τελειώνει χωρίς κλείσιμο, προσθέτουμε ασφάλεια
  if (!fixed.trim().endsWith("}")) {
    fixed = fixed.trim().replace(/"?\s*$/, "\"} }");
    try {
      parsed = JSON.parse(fixed);
      console.log("✅ Επανόρθωση JSON πέτυχε μετά το auto-fix");
    } catch (err2) {
      console.error("❌ Αποτυχία και στο auto-fix:", err2.message);
      parsed = { criteria: {}, feedback: "⚠️ JSON error (incomplete output)" };
    }
    } else {
    parsed = { criteria: {}, feedback: "⚠️ JSON error" };
  }
}  // ✅ κλείνει το εξωτερικό try/catch
}    // ✅ κλείνει το εξωτερικό catch (err)

    
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
