// === API ROUTE: /api/score.js ===
import OpenAI from "openai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { type, transcript, mission } = req.body;

  // Ελέγχει αν υπάρχει API key στο περιβάλλον του Vercel
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Missing OpenAI API key." });
  }

  const client = new OpenAI({ apiKey });

  try {
    if (type === "score") {
      // === Βαθμολογία ===
      const rubric = `
Αξιολόγησε την απάντηση σύμφωνα με 5 κριτήρια (0–2 το καθένα):

1. Θέση – σαφής ισχυρισμός 
2. Συνάφεια – μένει στο θέμα 
3. Τεκμηρίωση – παράδειγμα ή αιτιολόγηση 
4. Αντίρρηση – βλέπει άλλη πλευρά 
5. Σαφήνεια – καθαρός και σύντομος λόγος 

Επέστρεψε ΜΟΝΟ JSON της μορφής:
{
 "criteria": {"Θέση":0-2,"Συνάφεια":0-2,"Τεκμηρίωση":0-2,"Αντίρρηση":0-2,"Σαφήνεια":0-2},
 "total": 0-10
}`;

      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0,
        messages: [
          { role: "system", content: "Επέστρεψε μόνο έγκυρο JSON, χωρίς σχόλια." },
          { role: "user", content: rubric },
          { role: "user", content: `Αποστολή: ${mission.title} — ${mission.question}` },
          { role: "user", content: `Απάντηση παίκτη: ${transcript}` }
        ]
      });

      let text = completion.choices[0].message.content.trim();
      text = text.replace(/```json|```/g, "").trim();
      return res.status(200).json(JSON.parse(text));
    }

    if (type === "comment") {
      // === Σχόλιο Σωκράτη ===
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.5,
        messages: [
          { role: "system", content: "Είσαι ο Σωκράτης. Σχολίασε με μαιευτικό ύφος, σε 1-2 προτάσεις. Χωρίς ```." },
          { role: "user", content: `Αποστολή: ${mission.title} — ${mission.question}` },
          { role: "user", content: `Απάντηση παίκτη: ${transcript}` }
        ]
      });

      const text = completion.choices[0].message.content.trim();
      return res.status(200).json({ comment: text });
    }

    return res.status(400).json({ error: "Άγνωστος τύπος αιτήματος." });

  } catch (err) {
    console.error("API Error:", err);
    return res.status(500).json({ error: "Σφάλμα κατά την επικοινωνία με OpenAI." });
  }
}
