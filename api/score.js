// ===============================
// API ENDPOINT: /api/score
// AI Κριτής "Σωκράτης" (σταθερή JSON απόκριση)
// ===============================

import OpenAI from "openai";

import fs from "fs";
import path from "path";

// 🔹 Δυναμική φόρτωση rubricWeights.json
async function loadRubric() {
  const filePath = path.join(process.cwd(), "public", "data", "rubricWeights.json");
  const raw = fs.readFileSync(filePath, "utf8");
  const json = JSON.parse(raw);
  console.log("📘 RubricWeights JSON φορτώθηκε από:", filePath);
  return json;
}

// 🔹 Δυναμική φόρτωση cardsImagesMetaphors.json
async function loadCardsCatalog() {
  const filePath = path.join(process.cwd(), "public", "data", "cardsImagesMetaphors.json");
  const raw = fs.readFileSync(filePath, "utf8");
  const json = JSON.parse(raw);
  console.log("🗂️ Cards catalog φορτώθηκε από:", filePath);
  return json;
}

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
        // 🔹 Φόρτωση λεξικού καρτών
    const cardsCatalog = await loadCardsCatalog();
    // 🔹 Ανάκτηση καρτών & φιλοσοφικού πλαισίου από το body
    const { cards = {}, philosopherContext = {} } = body;

    // Συνάρτηση που βρίσκει τις κάρτες του παίκτη μέσα στο λεξικό
    function findCards(list, section) {
      const all = cardsCatalog[section] || [];
      return (list || []).map(id => all.find(c => c.id === id)).filter(Boolean);
    }

    // Δημιουργία λιστών
    const imageCards = findCards(cards.images, "images");
    const metaphorCards = findCards(cards.metaphors, "metaphors");

    // Αν έχει ενεργοποιήσει συγκεκριμένες κάρτες (προαιρετικά από UI)
    const activatedIds = new Set(cards.activated || []);
    const activatedTitles = [
      ...imageCards.filter(c => activatedIds.has(c.id)).map(c => c.title),
      ...metaphorCards.filter(c => activatedIds.has(c.id)).map(c => c.title)
    ];

    // Δημιουργία περιγραφικού κειμένου για το prompt
    const cardsTextLines = [];

    if (imageCards.length) {
      cardsTextLines.push(`Εικόνες διαθέσιμες: ${imageCards.map(c => `"${c.title}"`).join(", ")}`);
      cardsTextLines.push(`Λέξεις-κλειδιά (εικόνες): ${imageCards.flatMap(c => c.keywords).join(", ")}`);
    }
    if (metaphorCards.length) {
      cardsTextLines.push(`Μεταφορές διαθέσιμες: ${metaphorCards.map(c => `"${c.title}"`).join(", ")}`);
      cardsTextLines.push(`Λέξεις-κλειδιά (μεταφορές): ${metaphorCards.flatMap(c => c.keywords).join(", ")}`);
    }
    if (activatedTitles.length) {
      cardsTextLines.push(`Ενεργοποιήθηκαν ρητά: ${activatedTitles.join(", ")}`);
    }

    const cardsText = cardsTextLines.join("\n");
   
    
    if (!transcript) {
      return res.status(400).json({ error: "Καμία απάντηση για αξιολόγηση." });
    }

    // --- Round & Mode ---
    const roundNum = Number(round) || 1;
    const isAdvanced = mode === "advanced";

        // --- Φόρτωση rubric από το αρχείο ---
    const rubricData = await loadRubric();

    // Φιλτράρισμα ενεργών κριτηρίων βάσει γύρου & έκδοσης
    const activeCriteria = rubricData.criteria.filter(c =>
      (c.simple && !isAdvanced) || (c.advanced && isAdvanced)
    ).filter(c =>
      (roundNum === 1 && c.rounds.first) || (roundNum > 1 && c.rounds.later)
    );

    // Δημιουργία περιγραφικού κειμένου rubric για το prompt
    const rubricText = activeCriteria.map(c => {
      const bonusText = c.bonus ? " (+1 μπόνους)" : "";
      return `- ${c.key}: 0–${c.max}${bonusText}`;
    }).join("\n");

    // --- Prompt προς το μοντέλο ---
    const completion = await client.responses.create({
      model: "gpt-4o-mini",
      input: [
  {
  role: "system",
  content: `
Είσαι ο φιλόσοφος Σωκράτης.
Απάντησε ΜΟΝΟ με έγκυρο JSON:
{"criteria":{"Θέση":0-4,"Επιχειρηματολογία":0-6,"Εικόνα/Μεταφορά":0-4,"Παράδειγμα":0-3,"Αντίρρηση":0-4},"feedback":"κείμενο"}
Χωρίς markdown ή σχόλια.

Κριτήρια γύρου:
- Έκδοση: ${isAdvanced ? "Προχωρημένη" : "Απλή"}
${rubricText}

Οδηγία για Εικόνα/Μεταφορά:
- Έλεγξε αν χρησιμοποιήθηκαν συγκεκριμένες κάρτες που δίνονται παρακάτω (τίτλοι/λέξεις-κλειδιά).
- Αν χρησιμοποιήθηκαν εύστοχα για να ενισχύσουν τη θέση του φιλοσόφου, βαθμολόγησε ανάλογα (0–4).
- Αν αναφέρθηκαν χωρίς νόημα ή απλώς διακοσμητικά, βάλε χαμηλή βαθμολογία.
- Αν χρησιμοποιήθηκαν και Εικόνα και Μεταφορά σωστά, πρόσθεσε +1 μπόνους (χωρίς να ξεπεράσεις το μέγιστο 4).

Κάρτες διαθέσιμες στον παίκτη:
${cardsText || "—"}

Φιλόσοφος που εκπροσωπεί ο παίκτης:
${philosopherContext?.philosopher || "—"}

Θέση του φιλοσόφου:
${philosopherContext?.position || "—"}
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
      parsed = JSON.parse(
        raw.replace(/```json|```/g, "").trim()
      );
    } catch (err) {
      console.error("⚠️ JSON parsing error:", err.message);
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

      // --- Υπολογισμός βαθμολογίας ---
    const c = parsed.criteria || {};
    const C = {
      Θέση: Number(c["Θέση"]) || 0,
      Επιχειρηματολογία: Number(c["Επιχειρηματολογία"]) || 0,
      "Εικόνα/Μεταφορά": Number(c["Εικόνα/Μεταφορά"]) || 0,
      Παράδειγμα: Number(c["Παράδειγμα"]) || 0,
      Αντίρρηση: Number(c["Αντίρρηση"]) || 0
    };

    if (roundNum === 1) C["Αντίρρηση"] = 0;
    if (roundNum > 1) C["Θέση"] = 0;


       // --- Υπολογισμός συνολικής βαθμολογίας ---
    let total = Object.values(C).reduce((a, b) => a + b, 0);

    // --- Υπολογισμός "out_of" από το ενεργό rubric ---
    const maxSum = activeCriteria.reduce((sum, c) => sum + (c.max || 0), 0);
    const hasBonus = activeCriteria.some(c => c.bonus);
    const outOf = maxSum + (hasBonus ? 1 : 0);

    if (total > outOf) total = outOf;

    const result = {
      criteria: C,
      total,
      out_of: outOf,
      feedback: parsed.feedback || "Ο Σωκράτης σιώπησε."
    };

    console.log(`📊 Σκορ γύρος ${roundNum}: ${total}/${outOf}`);
    return res.status(200).json(result);


    console.log(`📊 Σκορ γύρος ${roundNum}: ${total}/8`);
    return res.status(200).json(result);

  } catch (err) {
    console.error("❌ Σφάλμα AI Κριτή:", err);
    return res.status(500).json({ error: err.message || "Σφάλμα στον διακομιστή." });
  }
}
