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
        // Αν το body υπάρχει ήδη (π.χ. σε Node runtime)
        body = req.body;
      } else {
        // Διαφορετικά, διάβασε το ως text και κάνε parse
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
      console.warn("⏱️ Χρόνος απάντησης OpenAI:", duration + " ms");
      process.stdout.write(`🔥 AI Response Time: ${duration} ms\n`);
    }

    if (!completion || !completion.choices || !completion.choices[0]) {
      console.error("⚠️ Το AI δεν επέστρεψε απάντηση:", completion);
      return res.status(500).json({ error: "Δεν λήφθηκε απάντηση από τον AI Κριτή." });
    }

    const aiText = completion.choices[0].message.content.trim();
    console.log("📩 AI raw output:", aiText);

    // ✨ Καθαρισμός από code blocks
    const cleaned = aiText.replace(/```json|```/g, "").trim();

    let data;
    try {
      data = JSON.parse(cleaned);
    } catch (err) {
      console.warn("⚠️ AI έδωσε μη έγκυρο JSON:", aiText);
      data = {
        criteria: {},
        total: 0,
        feedback: aiText
      };
    }

    // ✨ Εξασφάλιση ότι το feedback είναι καθαρό string
    if (typeof data.feedback === "string") {
      data.feedback = data.feedback.replace(/```json|```/g, "").trim();
    }

    // ✅ Επιστροφή αποτελέσματος
    return res.status(200).json(data);

  } catch (err) {
    console.error("❌ Σφάλμα AI Κριτή:", err.response?.data || err.message || err);
    return res.status(500).json({ error: "Αποτυχία σύνδεσης με τον AI Κριτή." });
  }
}
