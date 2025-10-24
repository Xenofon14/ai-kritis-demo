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
      { role: "system", content: "Είσαι ο Σωκράτης και λειτουργείς ως εκπαιδευτικός κριτής." },
      { role: "user", content: prompt }
    ],
    temperature: 0.3,
    max_tokens: 250,          // ✂️ περιορίζει το μέγεθος της απάντησης
    presence_penalty: 0,      // σταθερό ύφος
    frequency_penalty: 0      // αποφυγή επαναλήψεων
  });

} catch (error) {
  console.error("❌ Σφάλμα OpenAI API:", error);
  return res.status(500).json({ error: "Πρόβλημα με τον AI Κριτή." });

} finally {
  // 🧭 Μετράει χρόνο σε κάθε περίπτωση (ακόμη κι αν γίνει σφάλμα)
  const duration = Date.now() - start;
  console.log("⏱️ Χρόνος απάντησης OpenAI:", duration, "ms");
  console.warn("⚙️ Χρόνος (ms):", duration); // ✅ το βλέπεις πάντα στα Vercel Runtime Logs
}

// ✅ Μόνο μετά από εδώ είναι ασφαλές να διαβάσεις το completion
if (!completion || !completion.choices || !completion.choices[0]) {
  console.error("⚠️ Το AI δεν επέστρεψε απάντηση:", completion);
  return res.status(500).json({ error: "Δεν λήφθηκε απάντηση από τον AI Κριτή." });
}

const aiText = completion.choices[0].message.content.trim();
console.log("📩 AI raw output:", aiText);

// ✨ Καθαρισμός απάντησης αν περιέχει markdown code block (```json ... ```)
let cleaned = aiText.trim();

// 1️⃣ Αφαίρεση code fences (```json ... ```)
if (cleaned.startsWith("```")) {
  cleaned = cleaned.replace(/```json|```/g, "").trim();
}

// 2️⃣ Αν περιέχει JSON μέσα σε feedback string, απομόνωσέ το
let data;
try {
  // Αν είναι έγκυρο JSON, τέλεια
  data = JSON.parse(cleaned);
} catch {
  // Αν όχι, έλεγξε μήπως έχει JSON μέσα του
  const innerMatch = cleaned.match(/\{[\s\S]*\}/);
  if (innerMatch) {
    try {
      data = JSON.parse(innerMatch[0]);
    } catch {
      data = { criteria: {}, total: 0, feedback: cleaned };
    }
  } else {
    data = { criteria: {}, total: 0, feedback: cleaned };
  }
}

// 3️⃣ Αν έχει feedback που ξεκινά με ```json, καθάρισέ το
if (typeof data.feedback === "string") {
  data.feedback = data.feedback.replace(/```json|```/g, "").trim();
}

res.status(200).json(data);


// Αν όλα πάνε καλά, στέλνουμε πίσω την απάντηση του AI
res.status(200).json(data);

} catch (err) {
  console.error("❌ Σφάλμα AI Κριτή:", err.response?.data || err.message || err);
  res.status(500).json({ error: "Αποτυχία σύνδεσης με τον AI Κριτή." });
}
}









