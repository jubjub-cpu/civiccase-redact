# Architecture

## Runtime

CivicCase Redact is a dependency-free static web application. GitHub Pages serves HTML, CSS, JavaScript modules, four synthetic JSON fixtures, and one local-import text fixture. There is no backend, database, build step, AI endpoint, identity service, analytics service, or persistence layer.

## Data flow

1. `data/cases.json` supplies fictional notes and explicit fixture disclosure.
2. `detectIdentifiers()` applies enabled rules, calculates capture-group offsets, expands labeled people into exact repeated-name findings, and removes overlaps by confidence.
3. `renderSourceSegments()` preserves the original string and maps findings onto non-mutating source segments.
4. `applyRedactions()` builds a preview from ordered decisions. Pending spans use question-mark tokens; accepted spans use typed numbered tokens; kept spans remain visible.
5. `buildReleaseBundle()` refuses pending findings or a missing human release decision, then emits protected text and a value-free manifest.

No step sends text outside the browser.

## State boundaries

- **Source:** immutable text held in browser memory.
- **Suggestion:** rule, context, or human-added span with offsets and confidence.
- **Decision:** pending, redact, or keep; reversible until a release is exported.
- **Release:** human note plus source fingerprint and reviewed protected output.

The release artifact omits the source string and all removed values. Offsets remain useful for auditing the transform against the locally held source.

## Rule scope

Patterns cover labeled people, repeated exact names, email, fictional `555` phone numbers, labeled addresses, labeled birth dates, invalid test government IDs, and three synthetic case-ID prefixes. These narrow rules are intentionally inspectable and testable. They are not presented as complete PII detection.

## Test strategy

- Engine tests assert exact counts, categories, offsets, policy changes, repeated names, manual redaction, reversibility, and value-free export.
- Static validation checks required evidence, fixture boundaries, disclosures, accessibility hooks, privacy patterns, and engine execution.
- Playwright validates the complete human review, local import, release gate, downloads, responsive layouts, keyboard entry, network failure state, and browser errors.
