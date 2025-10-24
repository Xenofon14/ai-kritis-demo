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
  body = typeof req.body === "object" && req.body !== null
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

    const completion = await client.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        { role: "system", content: "Είσαι ο Σωκράτης και λειτουργείς ως εκπαιδευτικός κριτής." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 250
    });

    const aiText = (completion.choices?.[0]?.message?.content || "").trim();
if (!aiText) {
  console.error("❌ Κενή απάντηση από το μοντέλο:", completion);
  return res.status(502).json({ error: "Κενή απάντηση από το μοντέλο." });
}

    console.log("📩 AI raw output:", aiText);

    // ✅ Καθαρισμός JSON
    let cleaned = aiText.replace(/```json|```/g, "").trim();
    let data;

   try {
  // Δοκιμάζουμε πρώτα κανονικά
  data = JSON.parse(cleaned);
} catch (err) {
  console.warn("⚠️ Μη έγκυρο JSON από AI:", err.message);
  // Καθαρίζουμε πιθανά “έξυπνα” εισαγωγικά ή άκυρους χαρακτήρες
  const fixed = cleaned
    .replace(/[“”]/g, '"')   // αντικαθιστά ελληνικά/τυπογραφικά εισαγωγικά
    .replace(/(\r\n|\n|\r)/gm, " ")  // αφαιρεί αλλαγές γραμμής
    .replace(/'/g, '"');     // μονά εισαγωγικά → διπλά
  try {
    data = JSON.parse(fixed);
  } catch (err2) {
    console.error("❌ Αποτυχία parsing μετά τον καθαρισμό:", fixed);
    data = { criteria: {}, total: 0, feedback: fixed };
  }
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

    return res.status(200).json(data);

  } catch (err) {
    console.error("❌ Σφάλμα AI Κριτή:", err.response?.data || err.message || err);
    return res.status(500).json({ error: "Αποτυχία σύνδεσης με τον AI Κριτή." });
  }
}





