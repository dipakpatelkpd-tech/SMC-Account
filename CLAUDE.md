# SMC school accounts – web dashboard

## What we are building
A web app where a Gujarat government primary school's School Management Committee (SMC) enters its grant
accounts once (opening balances, grant receipts, bills, cheques) and prints the standard audit registers:
Rojmel (cash book), Khatavahi (ledger per grant head), grant register, cheque register, bill register,
vouchers, પત્રક-D, Annexure 9 (bank reconciliation) and Annexure 10 (annual grant statement).
The user interface and all printed reports are in Gujarati.

## Read before designing or coding
- `docs/SPEC.md` – the full domain explanation, data model, every formula, every report layout, validation
  rules, known errors in the client files, and open questions. It is the source of truth.
- `reference/` – the client's original Excel workbook and the 7 PDF reports the app must reproduce.
  Their Gujarati is in a legacy font, so **view the PDFs as page images; do not trust extracted text.**
- `reference/sample_data_2025-26.json` – corrected data for one school-year, with `expected_results`.
- `tools/lmg_arun_to_unicode.py` – best-effort converter for the legacy-font Gujarati in the Excel.

## Rules
- Store each fact once: school, grant heads, opening balances, receipts, bills, cheques (with the
  allocation of each cheque to grant heads). Every report number is computed, never stored or typed.
- A cheque's allocation is computed from its linked bills (reimbursement / direct cheques). Only grant-return
  cheques take a manually typed amount per grant head.
- Money: integer paise or a decimal type, never floats. Dates: ISO in storage, DD/MM/YYYY when printed.
- Bill numbers such as `1/2` are text. Never parse them as dates.
- All Gujarati text is Unicode. PDFs must embed a Unicode Gujarati font with proper conjunct shaping.
- Rojmel prints Latin digits; the other reports print Gujarati digits (SPEC §6).
- Do not copy the mistakes listed in SPEC §9. The sample JSON already has corrected values.
- Reports are pure functions of stored data. Automated tests must reproduce every number in
  `expected_results` of the sample JSON (SPEC §8) before a report is considered done.

## How to work with the developer
- First, summarise your understanding in a few lines and ask the developer to confirm the tech stack and the
  open questions in SPEC §11. Do not pick a stack without asking.
- Suggested build order: data model + seed from sample JSON → calculation engine + tests →
  data-entry screens → Annexure 10 → ledgers → cash book (with pagination and page numbers) → registers,
  voucher, પત્રક-D, Annexure 9 → PDF export → year closing (closing balances become next year's openings).
