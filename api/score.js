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
    // Λαμβάνουμε το κείμενο και την αποστολή από το frontend
    const { transcript, mission } = req.body;

    // Αν δεν υπάρχει απάντηση
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

    // 🧠 Κλήση στο OpenAI API
    const completion = await client.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        { role: "system", content: "Είσαι ο Σωκράτης και λειτουργείς ως εκπαιδευτικός κριτής." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3
    });

    // Λαμβάνουμε την απάντηση
    const aiText = completion.choices[0].message.content.trim();

    // Προσπάθεια μετατροπής του σε JSON
    let data;
    try {
      data = JSON.parse(aiText);
    } catch (err) {
      // Αν το AI δεν δώσει καθαρό JSON, επιστρέφουμε απλό feedback
      data = {
        criteria: {},
        total: 0,
        feedback: aiText
      };
    }

    res.status(200).json(data);
  } catch (err) {
    console.error("❌ Σφάλμα AI Κριτή:", err);
    res.status(500).json({ error: "Αποτυχία σύνδεσης με τον AI Κριτή." });
  }
}
