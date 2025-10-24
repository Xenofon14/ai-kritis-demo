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

    const start = Date.now();
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

    // ✨ Καθαρισμός και μετατροπή JSON
    let cleaned = aiText.replace(/```json|```/g, "").trim();

    let data;
    try {
      data = JSON.parse(cleaned);
    } catch (err) {
      console.warn("⚠️ AI έδωσε μη έγκυρο JSON:", aiText);
      // Αν το AI δεν δώσει καθαρό JSON, επιστρέφουμε απλό feedback
      data = {
        criteria: {},
        total: 0,
        feedback: aiText
      };
    }

// 🧩 Αν το feedback είναι JSON string, διάβασέ το ξανά και καθάρισε το περιεχόμενο
if (typeof data.feedback === "string") {
  // Αν περιέχει ενσωματωμένο JSON
  if (data.feedback.trim().startsWith("{")) {
    try {
      const nested = JSON.parse(data.feedback);
      if (nested.feedback) data.feedback = nested.feedback;
      if (nested.criteria && !data.criteria?.Θέση) data.criteria = nested.criteria;
      if (nested.total && !data.total) data.total = nested.total;
    } catch {
      // αγνόησέ το, συνεχίζουμε παρακάτω
    }
  }

  // Αφαίρεση πιθανών code fences ```json ... ```
  data.feedback = data.feedback.replace(/```json|```/g, "").trim();

  // Αν μετά το καθάρισμα μοιάζει ακόμα με JSON (π.χ. περιέχει "criteria" ή "total")
  if (data.feedback.includes('"criteria"') || data.feedback.includes('"total"')) {
    const lines = data.feedback.split("\n").filter(l => !l.includes('"criteria"') && !l.includes('"total"'));
    data.feedback = lines.join(" ").trim();
  }
}


   // 🧩 Καθαρισμός και αποσυμπίεση του feedback
if (typeof data.feedback === "string") {
  let cleanedFb = data.feedback.replace(/```json|```/g, "").trim();

  // Αν όλο το feedback μοιάζει με JSON (δηλαδή ξεκινά με { και περιέχει "Θέση")
  if (cleanedFb.startsWith("{") && cleanedFb.includes('"Θέση"')) {
    try {
      const inner = JSON.parse(cleanedFb);
      // Αν αυτό το JSON περιέχει κανονικά πεδία, αντικατέστησε τα
      if (inner.feedback) data.feedback = inner.feedback;
      if (inner.criteria) data.criteria = inner.criteria;
      if (inner.total !== undefined) data.total = inner.total;
      // Αν δεν υπάρχει πεδίο feedback, κράτα μόνο το καθαρό κείμενο (αν υπάρχει)
      if (!inner.feedback) {
        const textOnly = Object.values(inner)
          .filter(v => typeof v === "string")
          .join(" ")
          .trim();
        if (textOnly) data.feedback = textOnly;
      }
    } catch {
      // Αν δεν γίνεται parse, απλά κράτα το καθαρισμένο string
      data.feedback = cleanedFb;
    }
  } else {
    data.feedback = cleanedFb;
  }
}

// ✅ Επιστροφή κανονικής απάντησης
return res.status(200).json(data);
 
  

  } catch (err) {
    console.error("❌ Σφάλμα AI Κριτή:", err.response?.data || err.message || err);
    return res.status(500).json({ error: "Αποτυχία σύνδεσης με τον AI Κριτή." });
  }
}




