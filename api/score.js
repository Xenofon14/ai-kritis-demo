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
      // Αν το req.body υπάρχει ήδη (π.χ. σε Vercel), το χρησιμοποιούμε
      body =
        typeof req.body === "object" && req.body !== null
          ? req.body
          : JSON.parse(await req.text());
    } catch (err) {
      console.error("❌ Αποτυχία ανάγνωσης ή ανάλυσης body:", err);
      return res.status(400).json({ error: "Μη έγκυρη μορφή αιτήματος." });
    }

    const { transcript, mission } = body;

    if (!process.env.OPENAI_API_KEY) {
      console.error("❌ Λείπει το OPENAI_API_KEY στο περιβάλλον!");
      return res.status(500).json({ error: "API key λείπει από το περιβάλλον." });
    }

    if (!transcript || transcript.trim() === "") {
      return res.status(400).json({ error: "Καμία απάντηση για αξιολόγηση." });
    }

    // 🧠 Δημιουργία prompt
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

    const start = Date.now();

    // ✅ Κλήση προς OpenAI
    const completion = await client.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
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

Πρέπει να επιστρέφεις ΜΟΝΟ ένα έγκυρο JSON της μορφής:
{"criteria":{"Θέση":0-2,"Τεκμηρίωση":0-2,"Συνάφεια":0-2,"Σαφήνεια":0-2,"Αντίρρηση":0-2},"total":0-10,"feedback":"Σύντομο σχόλιο του Σωκράτη"}
`
        },
        {
          role: "user",
          content: `
Αποστολή: ${mission?.title || "—"}
Ερώτημα: ${mission?.question || "—"}
Απάντηση μαθητή: ${transcript}
Επιστρέψτε μόνο το JSON, χωρίς markdown, χωρίς περιττό κείμενο.
`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 350
    });

    const aiText = (completion.choices?.[0]?.message?.content || "").trim();
    console.log("📩 AI raw output:", aiText);

    // ✅ Καθαρισμός JSON
    let cleaned = (aiText || "")
      .replace(/```json|```/g, "")
      .trim();

    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }

    console.log("🧹 Καθαρισμένο JSON:", cleaned);

    let data;
    try {
      data = JSON.parse(cleaned);
    } catch (err) {
      console.error("❌ Αποτυχία parsing JSON:", cleaned);
      data = { criteria: {}, total: 0, feedback: cleaned };
    }

    if (typeof data.feedback === "string") {
      data.feedback = data.feedback.replace(/```json|```/g, "").trim();
    }

    console.log("💬 Καθαρό feedback:", data.feedback);

    const duration = Date.now() - start;
    console.log("⏱️ Χρόνος απάντησης OpenAI:", duration, "ms");

    return res.status(200).json(data);
  } catch (err) {
    console.error("❌ Σφάλμα AI Κριτή:", err.response?.data || err.message || err);
    return res.status(500).json({ error: "Αποτυχία σύνδεσης με τον AI Κριτή." });
  }
}
