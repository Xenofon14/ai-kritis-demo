// ===============================
// API ENDPOINT: /api/score
// Αξιολόγηση AI Κριτή "Σωκράτης"
// ===============================

import OpenAI from "openai";

// Δημιουργία client του OpenAI
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// -------------------------------
// Κύρια συνάρτηση handler
// -------------------------------
export default async function handler(req, res) {
  try {
    // 📦 Ανάγνωση σώματος αιτήματος
    let body;
    try {
      body =
        typeof req.body === "object" && req.body !== null
          ? req.body
          : JSON.parse(await req.text());
    } catch (err) {
      console.error("❌ Αποτυχία ανάγνωσης ή ανάλυσης body:", err);
      return res.status(400).json({ error: "Μη έγκυρη μορφή αιτήματος." });
    }

    // ⚙️ Προθέρμανση (warmup)
    const isWarmup = req.query?.warmup === "1" || body?.warmup === true;
    if (isWarmup) {
      try {
        await client.chat.completions.create({
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
      } catch {
        return res.status(200).json({ ok: false, warmed: false });
      }
    }

    const { transcript, mission, philosopher, initial_thesis, round } = body;

    console.log("📥 Λήψη δεδομένων για αξιολόγηση:");
    console.log("   transcript:", transcript);
    console.log("   mission:", mission?.title || "—");
    console.log("   philosopher:", philosopher || "(κανένας)");
    console.log("   round:", round || 1);

    if (!transcript || transcript.trim() === "") {
      return res.status(400).json({ error: "Καμία απάντηση για αξιολόγηση." });
    }

    const start = Date.now();

    // ----------------------------------------
    // 🧠 Κλήση προς OpenAI
    // ----------------------------------------
    const completion = await client.chat.completions.create(
      {
        model: "gpt-4-turbo",
        messages: [
          {
            role: "system",
            content: `
Είσαι ο φιλόσοφος Σωκράτης και λειτουργείς ως εκπαιδευτικός κριτής.
ΔΙΝΕΙΣ ΜΟΝΟ ΑΡΙΘΜΟΥΣ 0–2 για κάθε κριτήριο και ένα σύντομο feedback.
ΜΗΝ υπολογίζεις συνολικό σκορ (total). Θα το υπολογίσει ο server.

Επιστρέφεις ΑΥΣΤΗΡΑ JSON:
{
 "criteria":{"Θέση":0-2,"Τεκμηρίωση":0-2,"Συνάφεια":0-2,"Σαφήνεια":0-2,"Αντίρρηση":0-2},
 "feedback":"κείμενο"
}

Ορισμοί:
- "Θέση": καθαρή διατύπωση στάσης.
- "Τεκμηρίωση": ύπαρξη αιτιολόγησης ή παραδείγματος.
- "Συνάφεια": σύνδεση με το ερώτημα/ρήση.
- "Σαφήνεια": δομή και ροή.
- "Αντίρρηση": απάντηση σε αντίθετη θέση (ενεργό από 2ο γύρο).
            `
          },
          {
            role: "user",
            content: `
Γύρος: ${Number(round) || 1}
Αποστολή: ${mission?.title || "—"}
Ερώτημα: ${mission?.question || "—"}
Απάντηση μαθητή:
${transcript}

ΟΔΗΓΙΑ:
- Αν Γύρος=1 αγνόησε "Αντίρρηση" (βάλε 0).
- Αν Γύρος>1 αγνόησε "Θέση" (βάλε 0).
Επέστρεψε ΜΟΝΟ το JSON που ζητήθηκε, χωρίς markdown.
            `
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: 200
      },
      { timeout: 12000 } // ⏱️ προληπτικό όριο 12s
    );

    const aiText = (completion.choices?.[0]?.message?.content || "").trim();
    console.log("📩 AI raw output:", aiText);

    let data;
    try {
      data = JSON.parse(aiText);
    } catch {
      console.error("❌ Αποτυχία parsing JSON:", aiText);
      data = { criteria: {}, feedback: "⚠️ Μη έγκυρο JSON από AI." };
    }

    // ----------------------------------------
    // 📊 Υπολογισμός σκορ στον server
    // ----------------------------------------
    const C = {
      "Θέση": Number(data?.criteria?.["Θέση"]) || 0,
      "Τεκμηρίωση": Number(data?.criteria?.["Τεκμηρίωση"]) || 0,
      "Συνάφεια": Number(data?.criteria?.["Συνάφεια"]) || 0,
      "Σαφήνεια": Number(data?.criteria?.["Σαφήνεια"]) || 0,
      "Αντίρρηση": Number(data?.criteria?.["Αντίρρηση"]) || 0
    };

    // Σκληρά όρια
    for (const k of Object.keys(C)) {
      if (C[k] < 0) C[k] = 0;
      if (C[k] > 2) C[k] = 2;
    }

    const currentRound = Number(round) || 1;
    let total8 = 0;

    if (currentRound === 1) {
      C["Αντίρρηση"] = 0;
      total8 = C["Θέση"] + C["Τεκμηρίωση"] + C["Συνάφεια"] + C["Σαφήνεια"];
    } else {
      C["Θέση"] = 0;
      total8 = C["Τεκμηρίωση"] + C["Συνάφεια"] + C["Σαφήνεια"] + C["Αντίρρηση"];
    }

    // Soft boost στην Τεκμηρίωση αν εντοπιστεί αιτιολόγηση
    const t = String(transcript || "").toLowerCase();
    const hasBecause = /(γιατί|επειδή|λόγω|άρα|αν\s+.*\s*τότε|παράδειγμα|πχ|π\.χ\.)/.test(t);
    if (hasBecause && C["Τεκμηρίωση"] === 0) C["Τεκμηρίωση"] = 1;

    if (total8 < 0) total8 = 0;
    if (total8 > 8) total8 = 8;
    const scaled10 = Math.round((total8 / 8) * 10);

    data = {
      criteria: C,
      total: total8,
      out_of: 8,
      scaled: scaled10,
      feedback:
        typeof data.feedback === "string" && !data.feedback.trim().startsWith("{")
          ? data.feedback.trim()
          : "Ο Σωκράτης σε άκουσε∙ προσπάθησε να εξηγήσεις λίγο περισσότερο το «γιατί»."
    };

    const duration = Date.now() - start;
    console.log(`📊 Σκορ (γύρος ${currentRound}): ${data.total}/8 (${data.scaled}/10)`);
    console.log("⏱️ Χρόνος απάντησης:", duration, "ms");

    return res.status(200).json(data);
  } catch (err) {
    console.error("❌ Σφάλμα AI Κριτή:", err.response?.data || err.message || err);
    return res.status(err.status || 500).json({
      error: err.message || "Αποτυχία σύνδεσης με τον AI Κριτή.",
      code: err.code || "unknown"
    });
  }
}
