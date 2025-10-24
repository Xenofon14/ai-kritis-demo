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
    {
      role: "system",
      content: `
        Είσαι ο φιλόσοφος Σωκράτης και λειτουργείς ως εκπαιδευτικός κριτής.
        Πρέπει να επιστρέφεις ΜΟΝΟ ένα ΕΓΚΥΡΟ JSON με τα εξής πεδία:
        {
          "criteria": { "Θέση": 0-2, "Τεκμηρίωση": 0-2, "Συνάφεια": 0-2, "Σαφήνεια": 0-2, "Αντίρρηση": 0-2 },
          "total": άθροισμα όλων,
          "feedback": "ένα σύντομο σχόλιο του Σωκράτη προς τον μαθητή, σε φυσική ελληνική γλώσσα"
        }
        ⚠️ Το feedback είναι ΚΕΙΜΕΝΟ, όχι JSON, όχι πίνακας, όχι επανάληψη της δομής criteria.
        Δεν πρέπει να ξεκινά με '{' ή να περιέχει JSON μέσα του.
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
max_tokens: 500  // ✅ ήταν 200, τώρα επιτρέπει πλήρες feedback
   });

    const aiText = (completion.choices?.[0]?.message?.content || "").trim();
    console.log("📩 AI raw output:", aiText);

if (!aiText) {
  console.error("❌ Κενή απάντηση από το μοντέλο:", completion);
  return res.status(502).json({ error: "Κενή απάντηση από το μοντέλο." });
}

    console.log("📩 AI raw output:", aiText);

    // ✅ Καθαρισμός JSON
    let cleaned = aiText.replace(/```json|```/g, "").trim();
    // Αν το JSON κόπηκε από το μοντέλο, συμπλήρωσε το τελευταίο κλείσιμο
if (!cleaned.trim().endsWith("}")) {
  cleaned = cleaned.trim() + "}";
}
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

// ✅ Αν το feedback περιέχει JSON μέσα του (όπως τώρα συμβαίνει)
if (typeof data.feedback === "string" && data.feedback.includes('"criteria"')) {
  try {
    // Προσπάθεια για καθαρό parsing
    const nestedText = data.feedback
      .replace(/[“”]/g, '"')
      .replace(/(\r\n|\n|\r)/gm, " ")
      .replace(/'/g, '"');
    const nested = JSON.parse(nestedText);

    // Αν μέσα έχει βαθμολογία, πάρε την
    if (nested.criteria) data.criteria = nested.criteria;
    if (nested.total) data.total = nested.total;

    // Αν έχει κανονικό feedback, κράτα αυτό ως κείμενο
    if (nested.feedback && typeof nested.feedback === "string") {
      data.feedback = nested.feedback;
    } else {
      // Αν όχι, φτιάξε σύντομο κείμενο από τα ίδια τα δεδομένα
      data.feedback = "Ο Σωκράτης αξιολόγησε την απάντηση και υπολόγισε τη βαθμολογία.";
    }
  } catch (err) {
    console.warn("⚠️ Δεν έγινε parse nested feedback:", err.message);
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












