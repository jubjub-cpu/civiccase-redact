# Case Study: Separating Detection From Disclosure

## Challenge

A privacy tool can find obvious identifiers and still create a risky workflow. False positives need a reversible keep action, indirect identifiers need manual additions, unresolved spans must stay visible, and protected output should not be downloadable before a person owns the review.

## Product decision

CivicCase Redact treats detection, transformation, and release as separate states. Every suggestion receives stable character offsets, a category, confidence, provenance, and a reason. The protected preview masks pending findings, applies accepted tokens, and restores reviewer-kept text without changing the source.

## Implementation

Four synthetic notes exercise dense direct identifiers, an invalid government-ID fixture, repeated guardian and participant references, and a de-identified control. Labeled names seed exact repeated-name findings. Policy controls can remove internal IDs, contact fields, or demographic IDs and raise the rule threshold.

A reviewer can add an exact phrase not covered by the rules. That span enters the same reversible decision model as automatic suggestions. The release gate counts pending findings independently from the review note, so neither bulk automation nor a written note can bypass the other requirement.

## Privacy boundary

The source stays in browser memory. The release manifest records type, offsets, confidence, source, and decision but never copies the removed value. A one-way fingerprint connects the local source to the release artifact without embedding the note. Protected text is exported only after the human gate.

## Outcome

The final product demonstrates privacy-preserving text processing, character-offset algorithms, overlapping-span resolution, contextual repeat detection, reversible state, local file handling, evidence-oriented export, responsive frontend work, and responsible human control.

## What this does not claim

The deterministic rule set is not complete PII detection, an identity model, legal review, a production records platform, or a regulated disclosure system. It uses no real case note and makes no claim that configured confidence is a measured probability.
