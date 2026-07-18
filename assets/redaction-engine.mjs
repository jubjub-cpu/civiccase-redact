export const DEFAULT_POLICY = Object.freeze({
  minConfidence: 0.8,
  includeInternalIds: true,
  includeContact: true,
  includeDemographic: true
});

const DEFINITIONS = [
  {
    type: "email",
    label: "Email address",
    confidence: 0.99,
    group: 0,
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    reason: "Direct digital contact identifier"
  },
  {
    type: "phone",
    label: "Phone number",
    confidence: 0.98,
    group: 0,
    pattern: /(?:\(555\)|\b555)[ .-]?\d{3}[ .-]?\d{4}\b/g,
    reason: "Direct telephone contact identifier"
  },
  {
    type: "government-id",
    label: "Government ID",
    confidence: 0.99,
    group: 0,
    pattern: /\b000-\d{2}-\d{4}\b/g,
    reason: "Government-identifier format in a labeled synthetic fixture"
  },
  {
    type: "case-id",
    label: "Case identifier",
    confidence: 0.97,
    group: 0,
    pattern: /\b(?:CASE|APP|REF)-\d{4}-\d{4}\b/g,
    reason: "Internal record identifier"
  },
  {
    type: "date-of-birth",
    label: "Date of birth",
    confidence: 0.98,
    group: 1,
    pattern: /(?:DOB|Date of birth):\s*(\d{2}\/\d{2}\/\d{4})/gi,
    reason: "Date appears in an explicit birth-date field"
  },
  {
    type: "address",
    label: "Street address",
    confidence: 0.94,
    group: 1,
    pattern: /(?:Address|Residence):\s*([^\n]+)/gi,
    reason: "Location appears in an explicit address field"
  },
  {
    type: "person",
    label: "Person name",
    confidence: 0.91,
    group: 1,
    pattern: /(?:Client|Resident|Guardian):\s*([A-Z][a-z]+\s+[A-Z][a-z]+)/g,
    reason: "Name appears in an explicit person field"
  }
];

const typeEnabled = (type, policy) => {
  if (type === "case-id") return policy.includeInternalIds;
  if (type === "email" || type === "phone" || type === "address") return policy.includeContact;
  if (type === "date-of-birth" || type === "government-id") return policy.includeDemographic;
  return true;
};

function matchesForDefinition(text, definition) {
  const regex = new RegExp(definition.pattern.source, definition.pattern.flags);
  const matches = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    const value = match[definition.group];
    const relative = definition.group === 0 ? 0 : match[0].lastIndexOf(value);
    const start = match.index + relative;
    matches.push({
      id: `${definition.type}-${start}-${start + value.length}`,
      type: definition.type,
      label: definition.label,
      start,
      end: start + value.length,
      confidence: definition.confidence,
      reason: definition.reason,
      source: "rule",
      decision: "pending"
    });
    if (match[0].length === 0) regex.lastIndex += 1;
  }
  return matches;
}

function removeOverlaps(findings) {
  const accepted = [];
  for (const finding of [...findings].sort((a, b) => b.confidence - a.confidence || a.start - b.start)) {
    if (!accepted.some((item) => finding.start < item.end && finding.end > item.start)) accepted.push(finding);
  }
  return accepted.sort((a, b) => a.start - b.start || a.end - b.end);
}

export function detectIdentifiers(text, policy = DEFAULT_POLICY) {
  if (typeof text !== "string") throw new TypeError("Case-note text must be a string.");
  const findings = DEFINITIONS
    .filter((definition) => definition.confidence >= policy.minConfidence && typeEnabled(definition.type, policy))
    .flatMap((definition) => matchesForDefinition(text, definition));
  const labeledPeople = findings.filter((finding) => finding.type === "person");
  for (const labeled of labeledPeople) {
    const value = text.slice(labeled.start, labeled.end);
    let start = text.indexOf(value);
    while (start >= 0) {
      if (start !== labeled.start) findings.push({
        id: `person-${start}-${start + value.length}`,
        type: "person",
        label: "Repeated person name",
        start,
        end: start + value.length,
        confidence: 0.86,
        reason: "Exact repeat of a person introduced in a labeled field",
        source: "context",
        decision: "pending"
      });
      start = text.indexOf(value, start + value.length);
    }
  }
  return removeOverlaps(findings);
}

export function addManualFinding(text, phrase, type = "manual") {
  const value = String(phrase || "").trim();
  if (value.length < 2) throw new Error("Enter at least two characters for a manual redaction.");
  const start = text.indexOf(value);
  if (start < 0) throw new Error("That exact phrase was not found in the current note.");
  return {
    id: `manual-${start}-${start + value.length}-${type}`,
    type,
    label: type === "manual" ? "Manual sensitive span" : type,
    start,
    end: start + value.length,
    confidence: 1,
    reason: "Added explicitly by the human reviewer",
    source: "manual",
    decision: "redact"
  };
}

export function applyRedactions(text, findings, { includePending = true } = {}) {
  const counters = new Map();
  let cursor = 0;
  let output = "";
  for (const finding of [...findings].sort((a, b) => a.start - b.start)) {
    if (finding.decision === "keep" || (finding.decision === "pending" && !includePending)) continue;
    if (finding.start < cursor) continue;
    output += text.slice(cursor, finding.start);
    const number = (counters.get(finding.type) || 0) + 1;
    counters.set(finding.type, number);
    const token = finding.type.toUpperCase().replaceAll("-", "_");
    output += finding.decision === "pending" ? `[${token}?]` : `[${token}_${number}]`;
    cursor = finding.end;
  }
  return output + text.slice(cursor);
}

export function renderSourceSegments(text, findings) {
  const boundaries = new Set([0, text.length]);
  findings.forEach((finding) => { boundaries.add(finding.start); boundaries.add(finding.end); });
  const sorted = [...boundaries].sort((a, b) => a - b);
  const segments = [];
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index];
    const end = sorted[index + 1];
    const finding = findings.find((item) => item.start <= start && item.end >= end);
    segments.push({ start, end, text: text.slice(start, end), findingId: finding?.id || null, decision: finding?.decision || null, type: finding?.type || null });
  }
  return segments;
}

export function sourceFingerprint(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function summarizeReview(findings) {
  const summary = { total: findings.length, pending: 0, redact: 0, keep: 0, manual: 0, highConfidence: 0 };
  for (const finding of findings) {
    summary[finding.decision] += 1;
    if (finding.source === "manual") summary.manual += 1;
    if (finding.confidence >= 0.95) summary.highConfidence += 1;
  }
  return summary;
}

export function buildReleaseBundle(caseRecord, text, findings, releaseDecision) {
  const summary = summarizeReview(findings);
  if (summary.pending) throw new Error("Every finding must be reviewed before release.");
  if (!releaseDecision || releaseDecision.action !== "released") throw new Error("A human release decision is required.");
  return {
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    synthetic: !caseRecord.local,
    source: { id: caseRecord.caseId, fingerprint: sourceFingerprint(text), characters: text.length, local: Boolean(caseRecord.local) },
    redactedText: applyRedactions(text, findings, { includePending: false }),
    manifest: findings.map(({ id, type, start, end, confidence, source, decision }) => ({ id, type, start, end, confidence, source, decision })),
    reviewSummary: summary,
    humanRelease: releaseDecision,
    privacyBoundary: "The bundle excludes original text and removed identifier values.",
    limitations: [
      "Deterministic rules can miss identifiers or flag harmless text.",
      "A qualified reviewer must inspect context before any real disclosure.",
      "This browser demo is not a regulated records system."
    ]
  };
}
