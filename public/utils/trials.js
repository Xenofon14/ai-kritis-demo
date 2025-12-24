// js/trials.js
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
  clearInterval(timerInterval);
  timerInterval = null;
}

function startTimer(seconds) {
  stopTimer();
  remaining = seconds;
  $("trialTimer").textContent = formatTime(remaining);

  timerInterval = setInterval(() => {
    remaining -= 1;
    $("trialTimer").textContent = formatTime(Math.max(0, remaining));

    if (remaining <= 0) {
      stopTimer();
      $("trialTimer").textContent = "⏰ Τέλος!";
    }
  }, 1000);
}

function renderTrialList() {
  const list = $("trialsList");
  list.innerHTML = "";

  // ομαδοποίηση ανά category
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
      btn.textContent = `${t.title}`;
      btn.addEventListener("click", () => openTrial(t.id));
      list.appendChild(btn);
    });
  });
}

function openTrial(trialId) {
  activeTrial = TRIALS.find(t => t.id === trialId);
  if (!activeTrial) return;

  $("trialTitle").textContent = activeTrial.title;
  $("trialIntro").textContent = activeTrial.intro;
  $("trialInstructions").textContent = activeTrial.instructions;
  $("trialMeta").textContent = `Φιλόσοφος: ${activeTrial.philosopher} • Χρόνος: ${formatTime(activeTrial.timeSec)}`;

  // options
  const optBox = $("trialOptions");
  optBox.innerHTML = "";
  if (activeTrial.options && activeTrial.options.length) {
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

  // rules
  const rulesBox = $("trialRules");
  rulesBox.innerHTML = "";
  if (activeTrial.rules && activeTrial.rules.length) {
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

  $("trialSuccess").textContent = activeTrial.success || "—";
  $("trialTimer").textContent = formatTime(activeTrial.timeSec);

  // show details panel
  $("trialDetails").style.display = "block";
  stopTimer();
}

function showScreen(screenId) {
  // κρύβουμε/δείχνουμε μόνο τα trials/welcome για τώρα
  // (δεν πειράζουμε το setup/app — τα έχεις ήδη)
  const welcome = $("welcomeScreen");
  const trials = $("trialsScreen");

  if (welcome) welcome.style.display = (screenId === "welcome") ? "flex" : "none";
  if (trials) trials.style.display = (screenId === "trials") ? "flex" : "none";
}

async function loadTrials() {
  const res = await fetch("data/trials.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Δεν φορτώθηκε το data/trials.json");
  const data = await res.json();
  TRIALS = data.trials || [];
}

function bindUI() {
  // κουμπί από welcome → trials
  const startTrialsBtn = $("startTrialsBtn");
  if (startTrialsBtn && !startTrialsBtn.dataset.bound) {
    startTrialsBtn.addEventListener("click", async () => {
      showScreen("trials");
      // lazy-load
      if (!TRIALS.length) {
        try {
          await loadTrials();
          renderTrialList();
          // ανοίγουμε την πρώτη δοκιμασία για ευκολία
          if (TRIALS[0]) openTrial(TRIALS[0].id);
        } catch (e) {
          alert("⚠️ Δεν μπόρεσα να φορτώσω τις Δοκιμασίες.");
          console.error(e);
        }
      }
    });
    startTrialsBtn.dataset.bound = "true";
  }

  // πίσω
  const backBtn = $("trialsBackBtn");
  if (backBtn && !backBtn.dataset.bound) {
    backBtn.addEventListener("click", () => {
      stopTimer();
      showScreen("welcome");
    });
    backBtn.dataset.bound = "true";
  }

  // start timer
  const goBtn = $("trialStartBtn");
  if (goBtn && !goBtn.dataset.bound) {
    goBtn.addEventListener("click", () => {
      if (!activeTrial) return;
      startTimer(activeTrial.timeSec);
    });
    goBtn.dataset.bound = "true";
  }

  // stop timer
  const stopBtn = $("trialStopBtn");
  if (stopBtn && !stopBtn.dataset.bound) {
    stopBtn.addEventListener("click", () => {
      stopTimer();
      if (activeTrial) $("trialTimer").textContent = formatTime(activeTrial.timeSec);
    });
    stopBtn.dataset.bound = "true";
  }

  // success/fail (προς το παρόν απλά feedback)
  const okBtn = $("trialSuccessBtn");
  const noBtn = $("trialFailBtn");

  if (okBtn && !okBtn.dataset.bound) {
    okBtn.addEventListener("click", () => alert("✅ Καταγράφηκε: Επιτυχία (προσωρινά)."));
    okBtn.dataset.bound = "true";
  }
  if (noBtn && !noBtn.dataset.bound) {
    noBtn.addEventListener("click", () => alert("❌ Καταγράφηκε: Αποτυχία (προσωρινά)."));
    noBtn.dataset.bound = "true";
  }
}

window.addEventListener("DOMContentLoaded", () => {
  bindUI();
});
