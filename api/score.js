// ===============================
// API ENDPOINT: /api/score
// Αξιολόγηση AI Κριτή "Σωκράτης"
// ===============================

export const config = {
  runtime: "nodejs"
};

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

   const isWarmup = req.query?.warmup === "1" || body?.warmup === true;

if (isWarmup) {
  try {
    const warm = await client.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        { role: "system", content: "Return only valid JSON: {\"ok\":true}" },
        { role: "user", content: "Ping" }
      ],
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 5
    });
    return res.status(200).json({ ok: true, warmed: true });
  } catch (e) {
    // ακόμη κι αν αποτύχει, μην μπλοκάρεις το app
    return res.status(200).json({ ok: false, warmed: false });
  }
}

    const { transcript, mission, philosopher, initial_thesis } = body;

    console.log("📥 Λήψη δεδομένων για αξιολόγηση:");
console.log("   transcript:", transcript);
console.log("   mission:", mission?.title || "—");
console.log("   philosopher:", philosopher || "(κανένας)");
console.log("   initial_thesis:", initial_thesis || "(καμία)");


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
{"criteria":{"Θέση":X,"Τεκμηρίωση":X,"Συνάφεια":X,"Σαφήνεια":X,"Αντίρρηση":X},"total":0-8,"feedback":"Κείμενο ανατροφοδότησης"}

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

Αν γνωρίζεις ποιον φιλόσοφο εκπροσωπεί ο μαθητής, αξιολόγησε με βάση τις ιδέες του.
Αν γνωρίζεις την αρχική του θέση (όπως διατυπώθηκε στον πρώτο γύρο), 
χρησιμοποίησέ την ως σημείο αναφοράς για να εκτιμήσεις τη συνέπεια και τη συνάφεια των επιχειρημάτων του.

Αν η απάντηση είναι πλήρης, σαφής, τεκμηριωμένη και με αναφορά στον φιλόσοφο,
δώσε συνολική βαθμολογία κοντά στο 10.
Αν λείπουν σαφή επιχειρήματα ή η σύνδεση με τη ρήση, μείωσε αναλόγως τους επιμέρους βαθμούς.

Πρέπει να επιστρέφεις ΜΟΝΟ ένα έγκυρο JSON της μορφής:
{"criteria":{"Θέση":0-2,"Τεκμηρίωση":0-2,"Συνάφεια":0-2,"Σαφήνεια":0-2,"Αντίρρηση":0-2},"total":0-8,"feedback":"Σύντομο σχόλιο του Σωκράτη"}
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
      max_tokens: 250
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

// ✅ Καθαρισμός feedback
if (typeof data.feedback === "string") {
  data.feedback = data.feedback.replace(/```json|```/g, "").trim();
}

// ✅ Νέος έλεγχος: αν το feedback είναι κατά λάθος JSON, αντικατάστησέ το
if (data.feedback.startsWith("{")) {
  data.feedback = "⚠️ Το σχόλιο δεν διαβάστηκε σωστά.";
}

console.log("💬 Καθαρό feedback:", data.feedback);
   

    const duration = Date.now() - start;
    console.log("⏱️ Χρόνος απάντησης OpenAI:", duration, "ms");

// ✅ Αν η απάντηση δεν έχει τα σωστά πεδία, βάλε fallback
if (!data.criteria || typeof data.total === "undefined") {
  data = {
    criteria: {},
    total: 0,
    feedback: "⚠️ Ο Σωκράτης σιώπησε, η απάντηση δεν αξιολογήθηκε σωστά."
  };
}

// === ΚΛΙΜΑΚΩΣΗ ΚΑΙ ΕΝΣΩΜΑΤΩΣΗ ΣΤΑΘΕΡΗΣ ΒΑΣΗΣ ===
try {
  const criteria = data?.criteria && typeof data.criteria === "object" ? data.criteria : {};
  const totalScore = Object.values(criteria).reduce((a, b) => a + (Number(b) || 0), 0);
  const maxScore = 8;
  const scaled = Math.round((totalScore / maxScore) * 10);

  data.total = totalScore;
  data.out_of = maxScore;
  data.scaled = scaled;

  console.log(`📊 Υπολογισμός σκορ: ${data.total}/${data.out_of} (${data.scaled}/10)`);
} catch (err) {
  console.error("❌ Σφάλμα στον υπολογισμό σκορ:", err);
  data.total = 0;
  data.out_of = 8;
  data.scaled = 0;
  data.feedback = "⚠️ Αποτυχία υπολογισμού.";
}

// ✅ Στείλε με ασφάλεια την απάντηση
return res.status(200).json(data);

