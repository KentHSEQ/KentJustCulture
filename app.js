/* Just Culture Decision Tool (online-friendly)
   - No central/server logging
   - Optional per-user localStorage "Remember"
   - PDF download via browser print (Save as PDF)
   - Right-side top-to-bottom decision flow list
*/

const STORAGE_KEY = "justCultureRemember_v2";

const NODES = {
  Q1: { q: "Were the rules / procedures known and understood?", yes: "Q2",  no: "END_SUPERVISOR" },
  Q2: { q: "Were the rules / procedures followed?",              yes: "END_EXPECTED", no: "Q3" },
  Q3: { q: "Was the individual instructed not to follow the rules / procedures?", yes: "END_SUPERVISOR", no: "Q4" },
  Q4: { q: "Did the individual intentionally not follow procedures and not care about the consequences?", yes: "END_DELIBERATE", no: "Q5" },
  Q5: { q: "Was it a conscious decision not to follow the rules or procedure?", yes: "Q6", no: "Q8" },
  Q6: { q: "Are the procedures reasonable and workable?",         yes: "END_RECKLESS", no: "END_SYSTEM_INDUCED" },
  Q8: { q: "Would another person with similar experience make the same decision?", yes: "Q9", no: "Q10" },
  Q9: { q: "Has the individual been found not to follow the rules / procedures before?", yes: "END_KNOWLEDGE", no: "END_HUMAN_ERROR" },
  Q10:{ q: "Were procedures, training, selection process or experience requirements clear and adequate?", yes: "END_NEGLIGENT", no: "END_SYSTEM_PRODUCED" },

  END_EXPECTED:       { end:true, outcome:"Expected Behaviour → Recognition", pill:"Expected", matrix:"expected",
                        summary:"Classification: Expected Behaviour\nRecommended response: Recognition" },
  END_SUPERVISOR:     { end:true, outcome:"Supervisor subject to Just Culture Process", pill:"Supervisor", matrix:"supervisor",
                        summary:"Classification: Supervisor subject to Just Culture Process\nRecommended response: Apply the Just Culture Process for supervisory instruction/expectations." },
  END_DELIBERATE:     { end:true, outcome:"Deliberate Act → Dismissal", pill:"Deliberate", matrix:"dismissal",
                        summary:"Classification: Deliberate Act\nRecommended response: Dismissal (per matrix)" },
  END_RECKLESS:       { end:true, outcome:"Reckless Violation → Written Warning", pill:"Reckless", matrix:"warning",
                        summary:"Classification: Reckless Violation\nRecommended response: Written Warning (Initial, Subsequent or Final)" },
  END_SYSTEM_INDUCED: { end:true, outcome:"System Induced Violation → Coaching", pill:"System-induced", matrix:"coaching",
                        summary:"Classification: System Induced Violation\nRecommended response: Coaching (and improve system/procedure)" },
  END_NEGLIGENT:      { end:true, outcome:"Negligent Error → Written Warning", pill:"Negligent", matrix:"warning",
                        summary:"Classification: Negligent Error\nRecommended response: Written Warning" },
  END_SYSTEM_PRODUCED:{ end:true, outcome:"System Produced Error → Coaching", pill:"System-produced", matrix:"coaching",
                        summary:"Classification: System Produced Error\nRecommended response: Coaching (and improve training/procedure/requirements)" },
  END_KNOWLEDGE:      { end:true, outcome:"Knowledge-based / Rule-based Mistake → Written Warning", pill:"Knowledge-based", matrix:"warning",
                        summary:"Classification: Knowledge-based / Rule-based Mistake\nRecommended response: Written Warning" },
  END_HUMAN_ERROR:    { end:true, outcome:"Human Error (Slip or Lapse) → Coaching", pill:"Human error", matrix:"coaching",
                        summary:"Classification: Human Error (Slip or Lapse)\nRecommended response: Coaching" }
};

// UI
const el = (id) => document.getElementById(id);
const badge = el("badge");
const question = el("question");
const progress = el("progress");
const outcomePill = el("outcomePill");

const btnStart = el("btnStart");
const btnYes = el("btnYes");
const btnNo = el("btnNo");
const btnBack = el("btnBack");
const btnCopy = el("btnCopy");
const btnPDF = el("btnPDF");
const btnNew = el("btnNew");
const btnRemember = el("btnRemember");

const resultWrap = el("resultWrap");
const resultText = el("resultText");

const caseRef = el("caseRef");
const assessor = el("assessor");
const notes = el("notes");

const flowList = el("flowList");

// State
let currentId = null;
let history = []; // stack of {id, answerText}
let path = [];    // array of strings
let currentResult = null;
let rememberOn = false;

function setBadge(text){ badge.textContent = text; }

function pillColor(matrixKey){
  const m = matrixKey || "other";
  const varName = {
    expected: "--m-expected",
    coaching: "--m-coaching",
    warning: "--m-warning",
    dismissal:"--m-dismissal",
    supervisor:"--m-supervisor",
    other: "--m-other"
  }[m] || "--m-other";
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || "#64748b";
}

function renderFlow(){
  flowList.innerHTML = "";
  if(path.length === 0){
    const empty = document.createElement("div");
    empty.className = "flow-empty muted";
    empty.textContent = "No decisions yet. Click Start.";
    flowList.appendChild(empty);
    return;
  }

  path.forEach((p, idx) => {
    // p format: "<question> → Yes/No"
    const isYes = p.trim().endsWith("→ Yes");
    const step = document.createElement("div");
    step.className = "flow-step";

    const top = document.createElement("div");
    top.className = "step-top";

    const num = document.createElement("div");
    num.className = "step-num";
    num.textContent = "Step " + (idx + 1);

    const pill = document.createElement("div");
    pill.className = "answer-pill " + (isYes ? "answer-yes" : "answer-no");
    pill.textContent = isYes ? "YES" : "NO";

    top.appendChild(num);
    top.appendChild(pill);

    const q = document.createElement("div");
    q.className = "qtext";
    q.textContent = p.replace(" → Yes", "").replace(" → No", "");

    step.appendChild(top);
    step.appendChild(q);
    flowList.appendChild(step);
  });
}

function renderNode(){
  const node = NODES[currentId];
  resultWrap.classList.add("hidden");
  currentResult = null;

  renderFlow();

  if(!node){
    setBadge("Error");
    question.textContent = "Node not found: " + currentId;
    btnYes.disabled = true; btnNo.disabled = true;
    return;
  }

  if(node.end){
    setBadge("Complete");
    question.textContent = "Outcome: " + node.outcome;
    progress.textContent = "Steps completed: " + path.length;
    resultText.textContent = buildSummary(node);
    resultWrap.classList.remove("hidden");
    btnYes.disabled = true; btnNo.disabled = true;
    btnBack.disabled = history.length === 0;
    currentResult = node;

    outcomePill.textContent = node.pill || "—";
    const c = pillColor(node.matrix);
    outcomePill.style.borderColor = c;
    outcomePill.style.color = c;
    outcomePill.style.background = "rgba(0,0,0,.02)";

    if(rememberOn) saveRemember();
    return;
  }

  setBadge("Question");
  question.textContent = node.q;
  progress.textContent = "Steps completed: " + path.length;
  btnYes.disabled = false; btnNo.disabled = false;
  btnBack.disabled = history.length === 0;

  outcomePill.textContent = "—";
  outcomePill.removeAttribute("style");

  if(rememberOn) saveRemember();
}

function buildSummary(endNode){
  const meta = {
    caseRef: caseRef.value.trim(),
    assessor: assessor.value.trim(),
    notes: notes.value.trim()
  };

  const metaLines = [];
  if(meta.caseRef) metaLines.push("Case Ref: " + meta.caseRef);
  if(meta.assessor) metaLines.push("Assessor: " + meta.assessor);
  if(meta.notes) metaLines.push("Notes: " + meta.notes);

  const metaBlock = metaLines.length ? (metaLines.join("\n") + "\n\n") : "";
  const flowBlock = "Decision Flow:\n- " + (path.length ? path.join("\n- ") : "—") + "\n\n";
  return metaBlock + endNode.summary + "\n\n" + flowBlock + "Timestamp: " + new Date().toLocaleString();
}

function answer(isYes){
  const node = NODES[currentId];
  if(!node || node.end) return;

  const answerText = isYes ? "Yes" : "No";
  history.push({ id: currentId, answerText });
  path.push(node.q + " → " + answerText);
  currentId = isYes ? node.yes : node.no;
  renderNode();
}

function back(){
  if(history.length === 0) return;
  const last = history.pop();
  currentId = last.id;
  path.pop();
  renderNode();
}

function start(){
  currentId = "Q1";
  history = [];
  path = [];
  setBadge("In progress");
  btnStart.disabled = true;
  renderNode();
}

function resetAssessment(){
  currentId = null;
  history = [];
  path = [];
  currentResult = null;
  btnStart.disabled = false;
  btnYes.disabled = true; btnNo.disabled = true; btnBack.disabled = true;
  setBadge("Ready");
  question.textContent = "Click Start to begin.";
  progress.textContent = "";
  outcomePill.textContent = "—";
  resultWrap.classList.add("hidden");
  renderFlow();
  if(rememberOn) saveRemember();
}

/* ----- Remember (localStorage) ----- */
function loadRemember(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return null;
    return JSON.parse(raw);
  }catch{ return null; }
}

function saveRemember(){
  const payload = {
    rememberOn,
    meta:{ caseRef: caseRef.value, assessor: assessor.value, notes: notes.value },
    currentId, history, path
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function toggleRemember(){
  rememberOn = !rememberOn;
  btnRemember.textContent = "Remember: " + (rememberOn ? "On" : "Off");
  if(!rememberOn){
    localStorage.removeItem(STORAGE_KEY);
  }else{
    saveRemember();
  }
}

function restoreIfRemembered(){
  const data = loadRemember();
  if(!data || !data.rememberOn) return;
  rememberOn = true;
  btnRemember.textContent = "Remember: On";

  if(data.meta){
    caseRef.value = data.meta.caseRef || "";
    assessor.value = data.meta.assessor || "";
    notes.value = data.meta.notes || "";
  }
  currentId = data.currentId;
  history = data.history || [];
  path = data.path || [];

  if(currentId){
    btnStart.disabled = true;
    renderNode();
  }else{
    resetAssessment();
  }
}

/* ----- PDF download (print to PDF) ----- */
function downloadPDF(){
  if(!currentResult){
    alert("Finish the decision first.");
    return;
  }
  // For PDF: ensure the flow list is visible and up-to-date then print.
  renderFlow();
  window.print();
}

/* ----- Copy summary ----- */
function copySummary(){
  if(!currentResult) return;
  const text = buildSummary(currentResult);
  navigator.clipboard.writeText(text).then(
    () => alert("Copied to clipboard."),
    () => alert("Could not copy (browser blocked). You can manually select and copy the text.")
  );
}

// Events
btnStart.addEventListener("click", start);
btnYes.addEventListener("click", () => answer(true));
btnNo.addEventListener("click", () => answer(false));
btnBack.addEventListener("click", back);
btnCopy.addEventListener("click", copySummary);
btnPDF.addEventListener("click", downloadPDF);
btnNew.addEventListener("click", resetAssessment);
btnRemember.addEventListener("click", toggleRemember);

// Save meta changes if remember is on
[caseRef, assessor, notes].forEach(inp => inp.addEventListener("input", () => { if(rememberOn) saveRemember(); }));

// Init
resetAssessment();
restoreIfRemembered();
