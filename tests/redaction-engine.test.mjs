import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { DEFAULT_POLICY, addManualFinding, applyRedactions, buildReleaseBundle, detectIdentifiers, renderSourceSegments, sourceFingerprint, summarizeReview } from "../assets/redaction-engine.mjs";

const manifest = JSON.parse(await fs.readFile(new URL("../data/cases.json", import.meta.url), "utf8"));
const byId = Object.fromEntries(manifest.cases.map((item) => [item.id, item]));
const detect = (id, policy = DEFAULT_POLICY) => detectIdentifiers(byId[id].text, policy);

assert.equal(manifest.cases.length, 4);

const housing = detect("housing-intake");
assert.equal(housing.length, 7);
assert.equal(housing.filter((item) => item.type === "person").length, 2);
assert.deepEqual(new Set(housing.map((item) => item.type)), new Set(["case-id", "person", "date-of-birth", "address", "phone", "email"]));
assert.equal(summarizeReview(housing).pending, 7);
assert.match(applyRedactions(byId["housing-intake"].text, housing), /\[PERSON\?\]/);
assert.equal(renderSourceSegments(byId["housing-intake"].text, housing).filter((segment) => segment.findingId).length >= 7, true);

const sensitiveOnly = detect("housing-intake", { ...DEFAULT_POLICY, minConfidence: 0.95 });
assert.equal(sensitiveOnly.length, 4);
assert.equal(sensitiveOnly.some((item) => item.type === "person"), false);
assert.equal(detect("housing-intake", { ...DEFAULT_POLICY, includeInternalIds: false }).some((item) => item.type === "case-id"), false);
assert.equal(detect("housing-intake", { ...DEFAULT_POLICY, includeContact: false }).some((item) => ["email", "phone", "address"].includes(item.type)), false);

const benefits = detect("benefits-appeal");
assert.equal(benefits.length, 7);
assert.ok(benefits.some((item) => item.type === "government-id"));
const youth = detect("youth-referral");
assert.equal(youth.length, 7);
assert.equal(youth.filter((item) => item.type === "person").length, 4);
assert.equal(detect("deidentified-control").length, 0);

const manual = addManualFinding(byId["housing-intake"].text, "temporary housing support", "manual");
assert.equal(manual.decision, "redact");
assert.equal(manual.source, "manual");
assert.throws(() => addManualFinding(byId["housing-intake"].text, "not present"), /not found/);

const reviewed = housing.map((item) => ({ ...item, decision: "redact" }));
const email = reviewed.find((item) => item.type === "email");
email.decision = "keep";
const protectedText = applyRedactions(byId["housing-intake"].text, reviewed, { includePending: false });
assert.match(protectedText, /avery\.example@example\.test/);
assert.doesNotMatch(protectedText, /Avery Example/);
assert.doesNotMatch(protectedText, /412 Example Avenue/);

assert.throws(() => buildReleaseBundle(byId["housing-intake"], byId["housing-intake"].text, housing, null), /Every finding/);
const release = { action: "released", note: "Synthetic fixture reviewed for public demonstration.", at: "2026-07-17T18:00:00.000Z", reviewer: "human" };
const bundle = buildReleaseBundle(byId["housing-intake"], byId["housing-intake"].text, reviewed, release);
assert.equal(bundle.synthetic, true);
assert.equal(bundle.source.fingerprint, sourceFingerprint(byId["housing-intake"].text));
assert.equal(bundle.humanRelease.action, "released");
assert.equal(bundle.manifest.some((item) => Object.hasOwn(item, "value")), false);
assert.equal(Object.hasOwn(bundle.source, "text"), false);
assert.doesNotMatch(JSON.stringify(bundle.manifest), /Avery|Example Avenue|example\.test/);
assert.equal(bundle.limitations.length, 3);

console.log("CIVICCASE ENGINE TESTS PASSED");
console.log(JSON.stringify({ fixtures: 4, offsetSpans: true, repeatedNames: true, reversibleDecisions: true, manualRedaction: true, valueFreeManifest: true, humanRelease: true }));
