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
  const start = Date.now(); // 🕒 Έναρξη μέτρησης χρόνου
  try {
    let body;
    try {
      body = await req.json();
    } catch {
      console.error("❌ Αποτυχία ανάγνωσης ή ανάλυσης body");
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

   

    const completion = await client.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        { role: "system", content: "Είσαι ο Σωκράτης και λειτουργείς ως εκπαιδευτικός κριτής." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 250
    });

    const aiText = completion.choices[0].message.content.trim();
    console.log("📩 AI raw output:", aiText);

    // ✅ Καθαρισμός JSON
    let cleaned = aiText.replace(/```json|```/g, "").trim();
    let data;

    try {
      data = JSON.parse(cleaned);
    } catch (err) {
      console.warn("⚠️ Μη έγκυρο JSON, προσπάθεια εξαγωγής...");
      const match = cleaned.match(/\{[\s\S]*\}/);
      data = match ? JSON.parse(match[0]) : { criteria: {}, total: 0, feedback: cleaned };
    }

    // ✅ Αν υπάρχει nested feedback, διάβασε το
    if (typeof data.feedback === "string" && data.feedback.trim().startsWith("{")) {
      try {
        const nested = JSON.parse(data.feedback);
        if (nested.feedback) data.feedback = nested.feedback;
        if (nested.criteria) data.criteria = nested.criteria;
        if (nested.total) data.total = nested.total;
      } catch {
        // αγνόησε
      }
    }
// ✅ Καθαρισμός feedback
if (typeof data.feedback === "string") {
  data.feedback = data.feedback.replace(/```json|```/g, "").trim();
}

console.log("💬 Καθαρό feedback:", data.feedback);

const duration = Date.now() - start;
console.log("⏱️ Χρόνος απάντησης OpenAI:", duration, "ms");
    console.warn("⚙️ Χρόνος (ms):", duration);

return res.status(200).json(data);

   } catch (err) {
    console.error("❌ Σφάλμα AI Κριτή:", err.response?.data || err.message || err);
    return res.status(500).json({ error: "Αποτυχία σύνδεσης με τον AI Κριτή." });
  } finally {
    const totalTime = Date.now() - start;
    console.log("⏱️ Συνολικός χρόνος εκτέλεσης /api/score:", totalTime, "ms");
    console.warn("⚙️ Σύνολο (ms):", totalTime);
  }
}





