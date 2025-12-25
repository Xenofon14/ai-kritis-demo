// utils/trialsEngine.js
console.log("✅ trialsEngine.js loaded");

let TRIALS = [];
let activeTrial = null;

let timerInterval = null;
let remaining = 0;

function $(id) { return document.getElementById(id); }

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
}

function startTimer(seconds) {
  stopTimer();
  remaining = Number(seconds || 0);
  const el = $("trialTimer");
  if (el) el.textContent = formatTime(remaining);

  timerInterval = setInterval(() => {
    remaining -= 1;
    if (el) el.textContent = formatTime(Math.max(0, remaining));

    if (remaining <= 0) {
      stopTimer();
      if (el) el.textContent = "⏰ Τέλος!";
    }
  }, 1000);
}

async function loadTrials() {
  const res = await fetch("/data/trials.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Δεν φορτώθηκε το /data/trials.json");
  const data = await res.json();
  TRIALS = Array.isArray(data?.trials) ? data.trials : [];
  console.log("✅ trials.json loaded:", TRIALS.length, "trials", data);
}

/* ----------------- RENDER: είτε dropdown είτε list ----------------- */

function renderTrialsSelect() {
  const sel = $("trialSelect"); // αν υπάρχει dropdown UI
  if (!sel) return false;

  sel.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "— Διάλεξε Δοκιμασία —";
  sel.appendChild(placeholder);

  TRIALS.forEach(t => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.title;
    sel.appendChild(opt);
  });

  sel.addEventListener("change", (e) => {
    const id = e.target.value;
    if (id) openTrial(id);
  });

  return true;
}

function renderTrialList() {
  const list = $("trialsList"); // αν υπάρχει list UI
  if (!list) return false;

  list.innerHTML = "";

  const groups = TRIALS.reduce((acc, t) => {
    acc[t.category] = acc[t.category] || [];
    acc[t.category].push(t);
    return acc;
  }, {});

  Object.entries(groups).forEach(([category, items]) => {
    const h = document.createElement("div");
    h.style.marginTop = "12px";
    h.style.opacity = "0.9";
    h.style.fontWeight = "800";
    h.textContent = category;
    list.appendChild(h);

    items.forEach(t => {
      const btn = document.createElement("button");
      btn.className = "btn-secondary";
      btn.style.marginTop = "8px";
      btn.textContent = t.title;
      btn.addEventListener("click", () => openTrial(t.id));
      list.appendChild(btn);
    });
  });

  return true;
}

function openTrial(trialId) {
  activeTrial = TRIALS.find(t => t.id === trialId);
  if (!activeTrial) return;

  if ($("trialTitle")) $("trialTitle").textContent = activeTrial.title || "—";
  if ($("trialIntro")) $("trialIntro").textContent = activeTrial.intro || "—";
  if ($("trialInstructions")) $("trialInstructions").textContent = activeTrial.instructions || "—";

  if ($("trialMeta")) {
    $("trialMeta").textContent =
      `Φιλόσοφος: ${activeTrial.philosopher || "—"} • Χρόνος: ${formatTime(activeTrial.timeSec || 0)}`;
  }

  // options
  const optBox = $("trialOptions");
  if (optBox) {
    optBox.innerHTML = "";
    if (Array.isArray(activeTrial.options) && activeTrial.options.length) {
      const p = document.createElement("div");
      p.style.marginTop = "10px";
      p.style.fontWeight = "700";
      p.textContent = "Επιλογές:";
      optBox.appendChild(p);

      activeTrial.options.forEach(o => {
        const chip = document.createElement("div");
        chip.style.display = "inline-block";
        chip.style.padding = "6px 10px";
        chip.style.margin = "6px 6px 0 0";
        chip.style.borderRadius = "999px";
        chip.style.background = "rgba(255,255,255,0.12)";
        chip.textContent = o;
        optBox.appendChild(chip);
      });
    }
  }

  // rules
  const rulesBox = $("trialRules");
  if (rulesBox) {
    rulesBox.innerHTML = "";
    if (Array.isArray(activeTrial.rules) && activeTrial.rules.length) {
      const p = document.createElement("div");
      p.style.marginTop = "10px";
      p.style.fontWeight = "700";
      p.textContent = "Κανόνες:";
      rulesBox.appendChild(p);

      const ul = document.createElement("ul");
      ul.style.textAlign = "left";
      ul.style.margin = "6px 0 0 18px";
      activeTrial.rules.forEach(r => {
        const li = document.createElement("li");
        li.textContent = r;
        ul.appendChild(li);
      });
      rulesBox.appendChild(ul);
    }
  }

  if ($("trialSuccess")) $("trialSuccess").textContent = activeTrial.success || "—";
  if ($("trialTimer")) $("trialTimer").textContent = formatTime(activeTrial.timeSec || 0);

  const details = $("trialDetails");
  if (details) details.style.display = "block";

  stopTimer();
}

function bindTrialsButtons() {

  const startBtn = $("trialStartBtn");
  if (startBtn && !startBtn.dataset.bound) {
    startBtn.addEventListener("click", () => {
      if (!activeTrial) return;
      startTimer(activeTrial.timeSec || 0);
    });
    startBtn.dataset.bound = "true";
  }

  const successBtn = $("trialSuccessBtn");
  if (successBtn && !successBtn.dataset.bound) {
    successBtn.addEventListener("click", () => {
      stopTimer();
      alert("✅ Επιτυχία!");
      const details = $("trialDetails");
      if (details) details.style.display = "none";
    });
    successBtn.dataset.bound = "true";
  }

  const failBtn = $("trialFailBtn");
  if (failBtn && !failBtn.dataset.bound) {
    failBtn.addEventListener("click", () => {
      stopTimer();
      alert("❌ Αποτυχία!");
      const details = $("trialDetails");
      if (details) details.style.display = "none";
    });
    failBtn.dataset.bound = "true";
  }
}

async function initTrialsUI() {
  // αν δεν υπάρχει κανένα trials στοιχείο στη σελίδα, μην κάνεις τίποτα
  const hasAny =
    $("trialsList") || $("trialSelect") || $("trialTitle") || $("trialTimer") || $("trialStartBtn");
  if (!hasAny) return;

  await loadTrials();

  const rendered = renderTrialsSelect() || renderTrialList();
  bindTrialsButtons();

  // άνοιξε την πρώτη δοκιμασία για να μη φαίνεται "άδειο"
  if (rendered && TRIALS[0]) {
    openTrial(TRIALS[0].id);
    const sel = $("trialSelect");
    if (sel) sel.value = TRIALS[0].id;
  }
}

window.addEventListener("DOMContentLoaded", () => {
  initTrialsUI().catch(err => console.error("⚠️ Trials init error:", err));
});
