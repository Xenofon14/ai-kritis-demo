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
    let completion; // δηλώνουμε μεταβλητή εδώ για να είναι ορατή και στο finally

    try {
      completion = await client.chat.completions.create({
        model: "gpt-4-turbo",
        messages: [
          { role: "system
