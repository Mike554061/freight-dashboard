# FleetView tools

## `extract_questions.py` — Bid Vault document intake

Pulls clean, line-structured text out of a solicitation so it can go straight
into the Bid Vault paste box. Runs locally; nothing is uploaded.

```bash
python3 tools/extract_questions.py rfp.pdf --clipboard        # copy, then paste
python3 tools/extract_questions.py questionnaire.docx -o q.txt
python3 tools/extract_questions.py rfp.pdf --questions        # preview the split
```

| Format | How it's read | Install needed |
|---|---|---|
| `.pdf` | pymupdf, falling back to pypdf | one of them (both common) |
| `.pdf` (fillable) | pypdf AcroForm field names + tooltips | pypdf |
| `.docx` | the `.docx` zip's `word/document.xml`, read directly | none |
| `.doc` / `.rtf` / `.odt` | macOS `textutil` | none (macOS) |
| `.txt` / `.md` / `.csv` | read as-is | none |

### What it does

* Rejoins prose that PDF extraction wrapped mid-sentence, without welding
  separate numbered items together.
* De-hyphenates words broken across a line break.
* Drops bare page numbers and ALL-CAPS section headings (`--keep-headings` to
  keep them). A line ending in `:` or `?` is never treated as a heading, so
  `LEGAL BUSINESS NAME:` survives.
* Turns Word vendor-form table rows into `Label:` lines — including the common
  case where the answer cell is empty, which is what makes Bid Vault read them
  as form fields rather than stray sentences.
* Lists a fillable PDF's form fields first, de-duplicated against the page text
  that prints the same labels next to the boxes.

### What it deliberately does not do

It does not decide what counts as a question. `parseQuestions()` in
`js/bidvault-data.js` is the single authority on that, so the browser and this
script can't drift apart. `--questions` only *previews* that split.
