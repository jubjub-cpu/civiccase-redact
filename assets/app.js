import { DEFAULT_POLICY, addManualFinding, applyRedactions, buildReleaseBundle, detectIdentifiers, renderSourceSegments, sourceFingerprint, summarizeReview } from "./redaction-engine.mjs";

const workspace = document.querySelector("#workspace");
const state = {
  suite: "",
  notice: "",
  cases: [],
  texts: new Map(),
  findings: new Map(),
  selectedId: "housing-intake",
  policy: { ...DEFAULT_POLICY },
  releaseDecision: null,
  reviewerNote: "",
  audit: []
};

const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const selectedCase = () => state.cases.find((item) => item.id === state.selectedId) || state.cases[0];
const selectedText = () => state.texts.get(state.selectedId) || "";
const selectedFindings = () => state.findings.get(state.selectedId) || [];
const time = (value) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function addAudit(action, detail) {
  state.audit.unshift({ at: new Date().toISOString(), action, detail });
  renderAudit();
}

function shell() {
  workspace.innerHTML = `<div class="redaction-shell">
    <aside class="case-rail" aria-labelledby="case-heading">
      <div class="rail-heading"><p class="eyebrow">Synthetic review set</p><h1 id="case-heading">Case notes</h1><p>${esc(state.suite)}</p></div>
      <div id="case-list" class="case-list"></div>
      <label class="import-control" for="text-import"><span>Open local text</span><small>TXT or MD / 100 KB maximum</small></label><input id="text-import" type="file" accept="text/plain,.txt,.md"><p id="import-error" class="form-error" role="alert"></p>
      <div class="privacy-note"><strong>Browser boundary</strong><p>${esc(state.notice)}</p><span>Original text and removed values are never included in the JSON release bundle.</span></div>
    </aside>
    <section class="review-workspace" aria-labelledby="review-heading">
      <div class="review-heading"><div><p class="eyebrow">Direct-identifier review</p><h2 id="review-heading"></h2><p id="case-profile"></p></div><div class="heading-actions"><span id="review-status" class="status"></span><button id="export-bundle" class="secondary" type="button" disabled>Export JSON</button><button id="download-text" class="secondary" type="button" disabled>Download text</button></div></div>
      <section class="privacy-strip" aria-label="Privacy controls"><div><span>Processing</span><strong>Local browser</strong><small>No request endpoint</small></div><div><span>Source fingerprint</span><strong id="source-fingerprint"></strong><small>Original text excluded from audit</small></div><div><span>Rule mode</span><strong>Deterministic</strong><small>No model or identity lookup</small></div></section>
      <section id="metric-strip" class="metric-strip" aria-label="Review metrics"></section>
      <section class="editor-section" aria-labelledby="editor-heading"><div class="panel-heading"><div><p class="eyebrow">Reversible text transform</p><h3 id="editor-heading">Source and protected preview</h3></div><span>Pending spans stay masked with a question mark</span></div><div class="editor-grid"><article><header><strong>Original / local view</strong><span>Detected spans highlighted</span></header><pre id="source-text"></pre></article><article><header><strong>Protected preview</strong><span>Accepted and pending substitutions</span></header><pre id="preview-text"></pre></article></div></section>
      <div class="review-grid">
        <section class="findings-section" aria-labelledby="findings-heading"><div class="panel-heading"><div><p class="eyebrow">Human review queue</p><h3 id="findings-heading">Identifier spans</h3></div><div class="bulk-actions"><button id="redact-high" class="text-button" type="button">Redact high confidence</button><button id="redact-all" class="text-button" type="button">Redact all</button></div></div><div id="findings-list" class="findings-list"></div></section>
        <section class="rules-section" aria-labelledby="rules-heading"><div class="panel-heading"><div><p class="eyebrow">Detection policy</p><h3 id="rules-heading">Rule controls</h3></div><button id="reset-policy" class="text-button" type="button">Reset</button></div><div id="policy-controls" class="policy-controls"></div><form id="manual-form" class="manual-form"><p class="eyebrow">Human-added span</p><h4>Manual exact phrase</h4><label for="manual-phrase">Phrase<input id="manual-phrase" type="text" maxlength="100" placeholder="Exact text in source"></label><label for="manual-type">Category<select id="manual-type"><option value="manual">Sensitive text</option><option value="person">Person name</option><option value="address">Address</option><option value="organization">Organization</option></select></label><button type="submit">Add redaction</button><p id="manual-error" class="form-error" role="alert"></p></form></section>
      </div>
      <section class="release-section" aria-labelledby="release-heading"><div><p class="eyebrow">Human release gate</p><h3 id="release-heading">Protected-note decision</h3><p>Every suggestion must be marked redact or keep. A reviewer then records why this version is appropriate to release.</p><p id="release-summary" class="release-summary">Release is blocked while findings remain pending.</p></div><div class="release-form"><label for="reviewer-note">Release evidence<input id="reviewer-note" type="text" maxlength="180" placeholder="Reason this protected note is ready"></label><div><button id="release-document" type="button">Release protected note</button><button id="return-review" class="return" type="button">Return to review</button></div><p id="release-error" class="form-error" role="alert"></p></div></section>
      <section class="audit-section" aria-labelledby="audit-heading"><div class="panel-heading"><div><p class="eyebrow">Local review evidence</p><h3 id="audit-heading">Decision audit</h3></div><span>Current session</span></div><ol id="audit-list"></ol></section>
    </section>
  </div>`;
}

function renderCases() {
  document.querySelector("#case-list").innerHTML = state.cases.map((item) => {
    const summary = summarizeReview(state.findings.get(item.id) || []);
    return `<button class="case-button" type="button" data-case="${esc(item.id)}" aria-pressed="${item.id === state.selectedId}"><span>${esc(item.caseId)}</span><strong>${esc(item.title)}</strong><small>${summary.total} span${summary.total === 1 ? "" : "s"} / ${summary.pending} pending</small><i class="case-state ${summary.total ? summary.pending ? "pending" : "reviewed" : "clear"}"></i></button>`;
  }).join("");
}

function renderHeading() {
  const item = selectedCase();
  const summary = summarizeReview(selectedFindings());
  document.querySelector("#review-heading").textContent = `${item.caseId} / ${item.title}`;
  document.querySelector("#case-profile").textContent = `${item.program}. ${item.profile}`;
  document.querySelector("#source-fingerprint").textContent = sourceFingerprint(selectedText());
  const status = document.querySelector("#review-status");
  const label = state.releaseDecision ? "released" : summary.pending ? "review needed" : summary.total ? "ready for gate" : "clear";
  status.className = `status ${state.releaseDecision ? "released" : summary.pending ? "pending" : "ready"}`;
  status.textContent = label;
  document.querySelector("#export-bundle").disabled = !state.releaseDecision;
  document.querySelector("#download-text").disabled = !state.releaseDecision;
}

function renderMetrics() {
  const summary = summarizeReview(selectedFindings());
  const byType = new Set(selectedFindings().map((item) => item.type)).size;
  const items = [
    ["Detected spans", summary.total, `${byType} identifier categories`],
    ["Pending", summary.pending, "requires human decision"],
    ["Redact", summary.redact, "included in protected output"],
    ["Keep", summary.keep, "restored in protected output"],
    ["High confidence", summary.highConfidence, "95% or greater"],
    ["Manual", summary.manual, "human-added spans"]
  ];
  document.querySelector("#metric-strip").innerHTML = items.map(([label, value, note]) => `<div><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join("");
}

function renderEditors() {
  const findings = selectedFindings();
  document.querySelector("#source-text").innerHTML = renderSourceSegments(selectedText(), findings).map((segment) => segment.findingId ? `<mark class="${segment.decision}" data-source-finding="${esc(segment.findingId)}" title="${esc(segment.type)} / ${esc(segment.decision)}">${esc(segment.text)}</mark>` : esc(segment.text)).join("");
  document.querySelector("#preview-text").textContent = applyRedactions(selectedText(), findings, { includePending: true });
}

function renderFindings() {
  const findings = selectedFindings();
  const list = document.querySelector("#findings-list");
  if (!findings.length) {
    list.innerHTML = '<div class="clear-state"><strong>No configured direct identifiers detected.</strong><p>A reviewer still owns contextual inspection and can add a manual span.</p></div>';
    return;
  }
  list.innerHTML = findings.map((finding) => {
    const value = selectedText().slice(finding.start, finding.end);
    return `<article class="finding ${finding.decision}" data-finding="${esc(finding.id)}"><div class="finding-meta"><span>${esc(finding.label)}</span><strong>${Math.round(finding.confidence * 100)}%</strong></div><div><code>${esc(value)}</code><p>${esc(finding.reason)} / characters ${finding.start}-${finding.end}</p></div><div class="finding-actions"><button type="button" data-decision="redact" data-id="${esc(finding.id)}" aria-pressed="${finding.decision === "redact"}">Redact</button><button type="button" data-decision="keep" data-id="${esc(finding.id)}" aria-pressed="${finding.decision === "keep"}">Keep</button></div></article>`;
  }).join("");
}

function renderPolicy() {
  document.querySelector("#policy-controls").innerHTML = `<label for="minConfidence"><span>Minimum confidence<output>${Math.round(state.policy.minConfidence * 100)}%</output></span><input id="minConfidence" data-policy="minConfidence" type="range" min="0.8" max="0.99" step="0.01" value="${state.policy.minConfidence}"></label><label class="check-row" for="includeInternalIds"><input id="includeInternalIds" data-policy="includeInternalIds" type="checkbox" ${state.policy.includeInternalIds ? "checked" : ""}><span><strong>Internal case IDs</strong><small>Record identifiers</small></span></label><label class="check-row" for="includeContact"><input id="includeContact" data-policy="includeContact" type="checkbox" ${state.policy.includeContact ? "checked" : ""}><span><strong>Contact fields</strong><small>Email, phone, address</small></span></label><label class="check-row" for="includeDemographic"><input id="includeDemographic" data-policy="includeDemographic" type="checkbox" ${state.policy.includeDemographic ? "checked" : ""}><span><strong>Demographic IDs</strong><small>Birth date and government ID</small></span></label>`;
}

function renderRelease() {
  const summary = summarizeReview(selectedFindings());
  const releaseSummary = document.querySelector("#release-summary");
  document.querySelector("#reviewer-note").value = state.reviewerNote;
  document.querySelector("#release-error").textContent = "";
  if (state.releaseDecision) {
    releaseSummary.className = "release-summary released";
    releaseSummary.textContent = `Protected note released by human reviewer. Evidence: ${state.releaseDecision.note}`;
  } else if (summary.pending) {
    releaseSummary.className = "release-summary blocked";
    releaseSummary.textContent = `Release blocked: ${summary.pending} finding${summary.pending === 1 ? " remains" : "s remain"} pending.`;
  } else {
    releaseSummary.className = "release-summary ready";
    releaseSummary.textContent = "All findings reviewed. A written release decision is still required.";
  }
}

function renderAudit() {
  const list = document.querySelector("#audit-list");
  if (!list) return;
  list.innerHTML = state.audit.map((item) => `<li><time>${time(item.at)}</time><strong>${esc(item.action)}</strong><span>${esc(item.detail)}</span></li>`).join("");
}

function renderAll() {
  renderCases(); renderHeading(); renderMetrics(); renderEditors(); renderFindings(); renderPolicy(); renderRelease(); renderAudit();
}

function invalidateRelease() {
  state.releaseDecision = null;
  document.querySelector("#export-bundle")?.setAttribute("disabled", "");
  document.querySelector("#download-text")?.setAttribute("disabled", "");
}

function updateFinding(id, decision) {
  const finding = selectedFindings().find((item) => item.id === id);
  if (!finding) return;
  finding.decision = decision;
  invalidateRelease();
  renderAll();
  addAudit(decision === "redact" ? "Span marked redact" : "Span marked keep", `${finding.label} at ${finding.start}-${finding.end}.`);
}

function setBulk(predicate, action) {
  let changed = 0;
  selectedFindings().forEach((finding) => { if (finding.decision === "pending" && predicate(finding)) { finding.decision = "redact"; changed += 1; } });
  invalidateRelease(); renderAll(); addAudit(action, `${changed} pending span(s) marked redact.`);
}

function reanalyzeAll() {
  for (const item of state.cases) state.findings.set(item.id, detectIdentifiers(state.texts.get(item.id), state.policy));
  invalidateRelease(); state.reviewerNote = ""; renderAll();
  addAudit("Policy recalculated", `${selectedCase().caseId}: ${selectedFindings().length} suggested span(s).`);
}

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; document.body.append(anchor);
  window.setTimeout(() => { anchor.click(); window.setTimeout(() => { anchor.remove(); URL.revokeObjectURL(url); }, 10000); }, 0);
}

function currentBundle() {
  return buildReleaseBundle(selectedCase(), selectedText(), selectedFindings(), state.releaseDecision);
}

function releaseDocument() {
  const summary = summarizeReview(selectedFindings());
  const error = document.querySelector("#release-error");
  if (summary.pending) { error.textContent = "Review every pending finding before release."; return; }
  const note = state.reviewerNote.trim();
  if (note.length < 12) { error.textContent = "A 12-character release evidence note is required."; return; }
  state.releaseDecision = { action: "released", note, at: new Date().toISOString(), reviewer: "human", sourceFingerprint: sourceFingerprint(selectedText()) };
  addAudit("Protected note released", `${selectedCase().caseId}: ${summary.redact} redacted and ${summary.keep} kept.`);
  renderAll();
}

function addManual(event) {
  event.preventDefault();
  const error = document.querySelector("#manual-error"); error.textContent = "";
  try {
    const finding = addManualFinding(selectedText(), document.querySelector("#manual-phrase").value, document.querySelector("#manual-type").value);
    if (selectedFindings().some((item) => finding.start < item.end && finding.end > item.start)) throw new Error("That phrase overlaps an existing finding.");
    selectedFindings().push(finding); selectedFindings().sort((a, b) => a.start - b.start);
    document.querySelector("#manual-phrase").value = "";
    invalidateRelease(); renderAll(); addAudit("Manual span added", `${finding.type} at ${finding.start}-${finding.end}; value remains local.`);
  } catch (errorValue) { error.textContent = errorValue.message; }
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const caseButton = event.target.closest("[data-case]");
    if (caseButton) {
      state.selectedId = caseButton.dataset.case; state.releaseDecision = null; state.reviewerNote = "";
      renderAll(); addAudit("Case selected", `${selectedCase().caseId}: ${selectedCase().title}.`); return;
    }
    const decision = event.target.closest("[data-decision]");
    if (decision) { updateFinding(decision.dataset.id, decision.dataset.decision); return; }
    if (event.target.id === "redact-high") { setBulk((finding) => finding.confidence >= 0.95, "High-confidence spans reviewed"); return; }
    if (event.target.id === "redact-all") { setBulk(() => true, "All suggestions reviewed"); return; }
    if (event.target.id === "reset-policy") { state.policy = { ...DEFAULT_POLICY }; reanalyzeAll(); return; }
    if (event.target.id === "release-document") { releaseDocument(); return; }
    if (event.target.id === "return-review") { invalidateRelease(); renderAll(); addAudit("Release returned", `${selectedCase().caseId} reopened for review.`); return; }
    if (event.target.id === "export-bundle" && state.releaseDecision) { download("civiccase-release.json", JSON.stringify(currentBundle(), null, 2), "application/json"); addAudit("Release bundle exported", "Manifest excludes original and removed values."); return; }
    if (event.target.id === "download-text" && state.releaseDecision) { download("civiccase-protected.txt", currentBundle().redactedText, "text/plain"); addAudit("Protected text downloaded", `${selectedCase().caseId} redacted text exported locally.`); return; }
  });
  document.addEventListener("input", (event) => { if (event.target.id === "reviewer-note") state.reviewerNote = event.target.value; });
  document.addEventListener("change", (event) => {
    if (!event.target.matches("[data-policy]")) return;
    state.policy[event.target.dataset.policy] = event.target.type === "checkbox" ? event.target.checked : Number(event.target.value);
    reanalyzeAll();
  });
  document.querySelector("#manual-form").addEventListener("submit", addManual);
  document.querySelector("#text-import").addEventListener("change", async (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    const error = document.querySelector("#import-error"); error.textContent = "";
    try {
      if (file.size > 100000) throw new Error("Choose a text file smaller than 100 KB.");
      const text = await file.text(); if (!text.trim()) throw new Error("The selected text file is empty.");
      const id = `local-${Date.now()}`;
      const item = { id, caseId: "LOCAL-TEXT", title: file.name, program: "Local browser review", profile: "This source remains in browser memory and is not uploaded.", local: true };
      state.cases.push(item); state.texts.set(id, text); state.findings.set(id, detectIdentifiers(text, state.policy)); state.selectedId = id; state.releaseDecision = null; state.reviewerNote = "";
      renderAll(); addAudit("Local text opened", `${text.length} characters analyzed locally; content omitted from audit.`);
    } catch (errorValue) { error.textContent = errorValue.message; }
  });
}

async function initialize() {
  try {
    const response = await fetch("data/cases.json"); if (!response.ok) throw new Error(`Case fixture request failed with ${response.status}`);
    const manifest = await response.json(); if (!Array.isArray(manifest.cases) || manifest.cases.length !== 4) throw new Error("Expected four synthetic case-note fixtures.");
    state.suite = manifest.suite; state.notice = manifest.notice; state.cases = manifest.cases; state.texts.clear(); state.findings.clear(); state.audit = []; state.releaseDecision = null;
    for (const item of state.cases) { state.texts.set(item.id, item.text); state.findings.set(item.id, detectIdentifiers(item.text, state.policy)); }
    shell(); bindEvents(); renderAll(); addAudit("Synthetic suite loaded", `${state.cases.length} fictional notes; no external service connection.`);
  } catch (error) {
    workspace.innerHTML = `<section class="error-state"><p class="eyebrow">Fixture load failed</p><h1>The synthetic case-note fixtures could not be prepared.</h1><p>${esc(error.message)}</p><button id="retry-load" type="button">Retry</button></section>`;
  }
}

document.addEventListener("click", (event) => { if (event.target.id === "retry-load") initialize(); });
initialize();
