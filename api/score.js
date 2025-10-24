// ===============================
// API ENDPOINT: /api/score
// Αξιολόγηση AI Κριτή "Σωκράτης"
// ===============================

import OpenAI from "openai";

// Δημιουργία client του OpenAI
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Κύρια συνάρτηση handler
export default async function handler(req, res) {
  try {
    let body;
    try {
      if (req.body) {
        body = req.body;
      } else {
        const text = await req.text();
        body = JSON.parse(text);
      }
    } catch (err) {
      console.error("❌ Αποτυχία ανάγνωσης ή ανάλυσης body:", err);
      return res.status(400).json({ error: "Μη έγκυρη μορφή αιτήματος." });
    }

    const { transcript, mission } = body;

    if (!transcript || transcript.trim() === "") {
      return res.status(400).json({ error: "Καμία απάντηση για αξιολόγηση." });
    }

    // ✅ Prompt για το μοντέλο
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

    const start = Date.now(); // 🕒 Έναρξη μέτρησης χρόνου
    let completion;

    try {
      completion = await client.chat.completions.create({
        model: "gpt-4-turbo",
        messages: [
          { role: "system", content: "Είσαι ο Σωκράτης και λειτουργείς ως εκπαιδευτικός κριτής." },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 250,
        presence_penalty: 0,
        frequency_penalty: 0
      });
    } catch (error) {
      console.error("❌ Σφάλμα OpenAI API:", error);
      return res.status(500).json({ error: "Πρόβλημα με τον AI Κριτή." });
    } finally {
      const duration = Date.now() - start;
      console.log("⏱️ Χρόνος απάντησης OpenAI:", duration, "ms");
      console.warn("⚙️ Χρόνος (ms):", duration);
    }

    if (!completion || !completion.choices || !completion.choices[0]) {
      console.error("⚠️ Το AI δεν επέστρεψε απάντηση:", completion);
      return res.status(500).json({ error: "Δεν λήφθηκε απάντηση από τον AI Κριτή." });
    }

    const aiText = completion.choices[0].message.content.trim();
    console.log("📩 AI raw output:", aiText);

    // ✨ Καθαρισμός απάντησης
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

    // ✅ Καθαρισμός feedback (για περιπτώσεις που επιστρέφει JSON μέσα στο feedback)
    if (typeof data.feedback === "string") {
      const fb = data.feedback.replace(/```json|```/g, "").trim();
      try {
        if (fb.startsWith("{") && fb.includes('"Θέση"')) {
          const inner = JSON.parse(fb);
          if (inner.feedback) data.feedback = inner.feedback;
          else data.feedback = "Η απάντησή σου αξιολογήθηκε επιτυχώς.";
          if (inner.criteria) data.criteria = inner.criteria;
          if (inner.total !== undefined) data.total = inner.total;
        } else {
          data.feedback = fb;
        }
      } catch {
        data.feedback = fb;
      }
    }
// ✅ Αν το feedback περιέχει JSON ως string, αποσυμπίεσέ το
if (typeof data.feedback === "string") {
  let fb = data.feedback.replace(/```json|```/g, "").trim();

  // Αν ξεκινά με { και περιέχει "feedback", σημαίνει πως είναι nested JSON
  if (fb.startsWith("{") && fb.includes('"feedback"')) {
    try {
      const inner = JSON.parse(fb);
      if (inner.feedback) data.feedback = inner.feedback;
      if (inner.criteria && Object.keys(data.criteria || {}).length === 0)
        data.criteria = inner.criteria;
      if (inner.total && (!data.total || data.total === 0))
        data.total = inner.total;
    } catch {
      data.feedback = fb; // κράτα το καθαρισμένο string
    }
  } else {
    data.feedback = fb;
  }
}
// ✅ Διορθωτής για nested feedback JSON (οριστική έκδοση)
if (typeof data.feedback === "string") {
  let fb = data.feedback.replace(/```json|```/g, "").trim();

  // 1️⃣ Αν περιέχει JSON, προσπάθησε να το ξεδιπλώσεις
  if (fb.startsWith("{") && fb.includes('"feedback"')) {
    try {
      const inner = JSON.parse(fb);
      // Μεταφέρουμε τα εσωτερικά πεδία στο κύριο αντικείμενο
      if (inner.feedback) data.feedback = inner.feedback;
      if (inner.criteria) data.criteria = inner.criteria;
      if (inner.total) data.total = inner.total;
    } catch {
      data.feedback = fb;
    }
  } else {
    data.feedback = fb;
  }

  // 2️⃣ Αν μετά τον καθαρισμό ακόμα μοιάζει με JSON, κράτα μόνο καθαρό κείμενο
  if (data.feedback.includes('"criteria"') || data.feedback.includes('"total"')) {
    const lines = data.feedback
      .split("\n")
      .filter(l => !l.includes('"criteria"') && !l.includes('"total"'))
      .join(" ")
      .trim();
    data.feedback = lines;
  }

  // 3️⃣ Καθαρισμός από escape χαρακτήρες
  data.feedback = data.feedback.replace(/\\n/g, " ").replace(/\s+/g, " ").trim();
}

console.log("💬 Καθαρό feedback:", data.feedback);

    // ✅ Τελική απάντηση
    return res.status(200).json(data);

  } catch (err) {
    console.error("❌ Σφάλμα AI Κριτή:", err.response?.data || err.message || err);
    return res.status(500).json({ error: "Αποτυχία σύνδεσης με τον AI Κριτή." });
  }
}


