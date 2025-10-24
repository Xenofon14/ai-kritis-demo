// ===============================
// API ENDPOINT: /api/score
// Αξιολόγηση AI Κριτή "Σωκράτης"
// ===============================

import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export default async function handler(req, res) {
  const start = Date.now(); // 🕒 Έναρξη μέτρησης
  try {
    let body;
    try {
      if (req.body) body = req.body;
      else {
        const text = await req.text();
        body = JSON.parse(text);
      }
    } catch (err) {
      console.error("❌ Body parsing error:", err);
      return res.status(400).json({ error: "Μη έγκυρη μορφή αιτήματος." });
    }

    const { transcript, mission } = body;
    if (!transcript || transcript.trim() === "") {
      return res.status(400).json({ error: "Καμία απάντηση για αξιολόγηση." });
    }

    const prompt = `
    Είσαι ο φιλόσοφος Σωκράτης.
    Αξιολογείς μια απάντηση μαθητή σε μια φιλοσοφική αποστολή,
    με βάση τα κριτήρια:
    Θέση (0-2), Τεκμηρίωση (0-2), Συνάφεια (0-2), Σαφήνεια (0-2), Αντίρρηση (0-2).
    Επιστρέφεις JSON αυτής της μορφής:
    {"criteria":{"Θέση":X,"Τεκμηρίωση":X,"Συνάφεια":X,"Σαφήνεια":X,"Αντίρρηση":X},"total":X,"feedback":"Κείμενο ανατροφοδότησης"}

    Αποστολή: ${mission?.title || "—"}
    Ερώτημα: ${mission?.question || "—"}
    Απάντηση: ${transcript}
    `;

    console.log("═════════════════════════════════════");
    console.log("🧠 Νέα Αξιολόγηση AI Κριτή Σωκράτη");
    console.log("📜 Ερώτημα:", mission?.question);
    console.log("👤 Απόκριση μαθητή:", transcript.slice(0, 100) + "...");

    const completion = await client.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        { role: "system", content: "Είσαι ο Σωκράτης και λειτουργείς ως εκπαιδευτικός κριτής." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 250,
    });

    const aiText = completion?.choices?.[0]?.message?.content?.trim();
    if (!aiText) {
      console.error("⚠️ Το AI δεν επέστρεψε απάντηση:", completion);
      return res.status(500).json({ error: "Δεν λήφθηκε απάντηση από τον AI Κριτή." });
    }

    console.log("📩 AI raw output:", aiText);

    let cleaned = aiText.replace(/```json|```/g, "").trim();
    let data;

    try {
      data = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          data = JSON.parse(match[0]);
        } catch {
          data = { criteria: {}, total: 0, feedback: cleaned };
        }
      } else {
        data = { criteria: {}, total: 0, feedback: cleaned };
      }
    }

    if (typeof data.feedback === "string") {
      data.feedback = data.feedback.replace(/```json|```/g, "").trim();
    }

    // ✅ Καταγραφή χρόνου πριν την αποστολή απάντησης
    const duration = Date.now() - start;
    console.warn("⏱️ Χρόνος απάντησης OpenAI:", duration + " ms");
    process.stdout.write(`🔥 AI Response Time: ${duration} ms\n`);

    return res.status(200).json(data);

  } catch (err) {
    const duration = Date.now() - start;
    console.error("❌ Σφάλμα AI Κριτή:", err.message || err);
    console.error("⏱️ Διάρκεια πριν τη διακοπή:", duration + " ms");
    return res.status(500).json({ error: "Εσωτερικό σφάλμα AI Κριτή." });
  }
}
