// ===============================
// API ENDPOINT: /api/score
// Αξιολόγηση AI Κριτή "Σωκράτης"
// ===============================

import OpenAI from "openai";

export const config = {
  runtime: "nodejs"
};

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export default async function handler(req, res) {
  try {
    // --- Ανάγνωση σώματος αιτήματος ---
    let body;
    try {
      if (req.body && typeof req.body === "object") {
        body = req.body;
      } else {
        const text = await req.text();
        body = JSON.parse(text);
      }
    } catch (err) {
      console.error("❌ Σφάλμα ανάγνωσης body:", err);
      return res.status(400).json({ error: "Μη έγκυρη μορφή αιτήματος." });
    }

    const { transcript, mission, philosopher, initial_thesis, warmup } = body;

    // --- Warm-up test ---
    if (warmup === true) {
      return res.status(200).json({ ok: true, warmed: true });
    }

    if (!transcript || transcript.trim() === "") {
      return res.status(400).json({ error: "Καμία απάντηση για αξιολόγηση." });
    }

    console.log("📥 Λήψη δεδομένων:", { transcript, mission, philosopher, initial_thesis });

    // --- Prompt ---
    const messages = [
      {
        role: "system",
        content: `
Είσαι ο φιλόσοφος Σωκράτης και λειτουργείς ως εκπαιδευτικός κριτής.
Αξιολογείς την απάντηση ενός μαθητή με βάση τα εξής κριτήρια (0–2 βαθμοί το καθένα):
- Θέση
- Τεκμηρίωση
- Συνάφεια
- Σαφήνεια
- Αντίρρηση

Πρέπει να επιστρέφεις ΜΟΝΟ έγκυρο JSON της μορφής:
{"criteria":{"Θέση":0-2,"Τεκμηρίωση":0-2,"Συνάφεια":0-2,"Σαφήνεια":0-2,"Αντίρρηση":0-2},"total":0-8,"feedback":"Σύντομο σχόλιο του Σωκράτη"}
        `
      },
      {
        role: "user",
        content: `
Αποστολή: ${mission?.title || "—"}
Ερώτημα: ${mission?.question || "—"}
Απάντηση μαθητή: ${transcript}
        `
      }
    ];

    // --- Κλήση OpenAI ---
    const completion = await client.chat.completions.create({
      model: "gpt-4-turbo",
      messages,
      temperature: 0,
      max_tokens: 250
    });

    const aiText = completion.choices?.[0]?.message?.content?.trim() || "";
    console.log("📩 AI raw output:", aiText);

    // --- Parsing JSON ---
    let cleaned = aiText.replace(/```json|```/g, "").trim();
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first !== -1 && last > first) cleaned = cleaned.slice(first, last + 1);

    let data;
    try {
      data = JSON.parse(cleaned);
    } catch {
      data = { criteria: {}, total: 0, feedback: "⚠️ Μη έγκυρη απάντηση." };
    }

    const criteria = data.criteria || {};
    const totalScore = Object.values(criteria).reduce((a, b) => a + (Number(b) || 0), 0);
    const maxScore = 8;

    data.total = totalScore;
    data.out_of = maxScore;
    console.log(`📊 Υπολογισμός σκορ: ${totalScore}/${maxScore}`);

    return res.status(200).json(data);
  } catch (err) {
    console.error("❌ Σφάλμα AI Κριτή:", err);
    return res.status(500).json({ error: "Αποτυχία σύνδεσης με τον AI Κριτή." });
  }
}
