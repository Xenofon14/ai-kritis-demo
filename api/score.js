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

    const { transcript, mission, round } = body;
    if (!transcript) {
      return res.status(400).json({ error: "Καμία απάντηση για αξιολόγηση." });
    }

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
Απάντησε *μόνο* με έγκυρο JSON στη μορφή:
{"criteria":{"Θέση":0-2,"Τεκμηρίωση":0-2,"Συνάφεια":0-2,"Σαφήνεια":0-2,"Αντίρρηση":0-2},"feedback":"κείμενο"}.
Μην προσθέτεις τίποτα άλλο πριν ή μετά.
`
        },
        {
          role: "user",
          content: `
Γύρος: ${round || 1}
Ερώτημα: ${mission?.question || "—"}
Απάντηση: ${transcript}`
        }
      ]
    });

    // --- Ανάγνωση απάντησης ---
    const raw = completion.choices?.[0]?.message?.content || "{}";
    let parsed = {};

    try {
      // Δοκιμή 1: κανονικό JSON
      parsed = typeof raw === "string" ? JSON.parse(raw) : raw;

      // Δοκιμή 2: διπλο-ενθυλακωμένο JSON (stringified μέσα σε string)
      if (typeof parsed === "string") parsed = JSON.parse(parsed);
    } catch (err) {
      console.error("⚠️ JSON parse error:", err, raw);
      parsed = { criteria: {}, feedback: "⚠️ JSON error" };
    }

    // --- Εσωτερική βαθμολόγηση ---
    const c = parsed.criteria || {};
    const roundNum = Number(round) || 1;
    const C = {
      Θέση: Number(c["Θέση"]) || 0,
      Τεκμηρίωση: Number(c["Τεκμηρίωση"]) || 0,
      Συνάφεια: Number(c["Συνάφεια"]) || 0,
      Σαφήνεια: Number(c["Σαφήνεια"]) || 0,
      Αντίρρηση: Number(c["Αντίρρηση"]) || 0
    };

    // Περιορισμοί ανά γύρο
    if (roundNum === 1) C["Αντίρρηση"] = 0;
    if (roundNum > 1) C["Θέση"] = 0;

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

    return res.status(200).json(result);
  } catch (err) {
    console.error("❌ Σφάλμα AI Κριτή:", err);
    return res
      .status(500)
      .json({ error: err.message || "Σφάλμα στον διακομιστή." });
  }
}
