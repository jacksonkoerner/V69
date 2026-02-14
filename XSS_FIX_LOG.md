# XSS Fix Log — 2025-07-16

Commit: `08e432b` (pushed to origin/main)

## Fixes Applied

### Fix 1: `js/interview/guided-sections.js` ~line 90
**Issue:** QA/QC notes injected raw into innerHTML via `${note}`.
**Fix:** Wrapped with `${escapeHtml(note)}`.

### Fix 2: `js/interview/guided-sections.js` ~line 353
**Issue:** Photo caption interpolated directly inside `<textarea>...</textarea>` innerHTML string — user content rendered as HTML.
**Fix:** Removed `${p.caption || ''}` from inside the textarea tag. Added a post-render loop that sets each `textarea.value` via DOM after innerHTML assignment.

### Fix 3: `js/interview/freeform.js` ~line 375
**Issue:** Same as Fix 2 but in freeform/minimal photo mode (`updateMinimalPhotoCaption`).
**Fix:** Same approach — empty textarea in template, then `grid.querySelector(...)` + `.value` assignment in a post-render loop.

### Fix 4: `js/report/form-fields.js` ~line 232
**Issue:** Work summary text from `getValue('guidedNotes.workSummary', '')` injected raw into textarea innerHTML string.
**Fix:** Wrapped with `escapeHtml()`.

### Fix 5: `js/report/original-notes.js` ~line 65
**Issue:** Weather fields (`highTemp`, `lowTemp`, `generalCondition`, `jobSiteCondition`) inserted into innerHTML unescaped.
**Fix:** Wrapped each field with `escapeHtml()`.

## Approach
- Used `escapeHtml()` from `js/ui-utils.js` (already loaded on all pages) for simple text-in-HTML cases.
- For textarea content, switched from string interpolation to DOM `.value` assignment to avoid content being parsed as HTML.
- All fixes are minimal and surgical — no surrounding code was refactored.
