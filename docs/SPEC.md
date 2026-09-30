# SMC school accounts – full specification

This document explains the business domain, the data to capture, every calculation, and every report the
software must produce. It was written by reverse-engineering the client's Excel workbook and 7 printed PDF
reports for one sample school (in `reference/`). Section numbers are referenced from `CLAUDE.md`.

---

## 1. What the product is

A web dashboard where a Gujarat government primary school's **School Management Committee (SMC)** keeps its
yearly grant accounts. The user enters each financial fact once; the software prints the standard set of
account registers that the school must submit to the cluster/block education officers (CRC/BRC) for audit.

Today this is done in an Excel workbook with ~10 sheets where the same facts are retyped into each register by
hand, which causes errors (see section 9). The software must remove all retyping.

Sample school in the reference files:

| Field | Value |
|---|---|
| School | બેટાવાડાના મુવાડા પ્રા. શાળા (header prints "SMCE બેટાવાડાના મુવાડા.પ્રા.શાળા") |
| DISE code (ડાયસ કોડ) | 24160201802 |
| Cluster (ક્લસ્ટર) | બારિયાના મુવાડા |
| Taluka (તાલુકો) | કપડવંજ |
| District | ખેડા |
| Bank | Bank of Baroda, branch અંતિસર, account 11590100004295 |
| Member secretary (head teacher) | પટેલ દિપકકુમાર વિઠ્ઠલભાઈ |
| Financial year | 2025-26 = 01/04/2025 to 31/03/2026 (Indian FY, April–March) |

## 2. The domain in two minutes

- Under **Samagra Shiksha** (earlier "Sarva Shiksha Abhiyan", abbreviated **SSA**), the state sends small
  grants into the SMC's bank account. Each grant has a fixed purpose and is tracked as its own
  **grant head** (ગ્રાન્ટ હેડ / ખાતું), e.g. cleanliness grant, parents'-meeting grant, repairs grant.
  The bank also credits **interest** (વ્યાજ), which is tracked as its own head.
- The head teacher acts as **member secretary** (સભ્ય સચિવ, abbreviated મુ.શિ. = મુખ્ય શિક્ષક). He buys things
  through the year, usually paying shops **from his own pocket** (પદર ખર્ચ), and keeps the bills.
- Money only leaves the bank by **cheque**. There are three kinds of cheque:
  1. **Reimbursement** – a cheque to the member secretary himself for a batch of bills he already paid.
     The batch is a **voucher** (વાઉચર). Bills in voucher N are numbered `N/1, N/2 …` (e.g. `1/1` … `1/21`).
     In the cash book the money goes bank → cash (the head teacher "withdraws and takes it in hand"), and then
     each bill is shown as a cash payment. Cash therefore returns to 0.
  2. **Direct payment** – a cheque straight to a supplier or worker (e.g. painter, paint shop). Bank only.
  3. **Grant return** – unspent balances sent back to the CRC coordinator (બચત ગ્રાન્ટ પરત). Bank only.
- Money is tracked **two ways at the same time**:
  - by *where it is*: cash (રોકડ) or bank (બેન્ક);
  - by *which grant head it belongs to*.
- The year starts with an **opening balance per grant head** (last year's closing) and ends with a
  **closing balance per grant head**. Core identity, per head and in total:

  `Opening + Received − Spent − Returned = Closing`

## 3. Glossary (Gujarati terms printed on the reports)

| Gujarati | Meaning |
|---|---|
| રોજમેળ (Rojmel) | Cash book (day book) |
| ખાતાવહી (Khatavahi) | Ledger – one account per grant head |
| ગ્રાન્ટ રજીસ્ટર | Grant (receipts) register |
| ચેક રજીસ્ટર | Cheque register |
| બિલ રજીસ્ટર | Bill register |
| વાઉચર | Payment voucher = the bills paid by one cheque |
| પરિશિષ્ટ ૯ | Annexure 9 – bank reconciliation |
| પરિશિષ્ટ ૧૦ | Annexure 10 – annual grant utilisation statement + certificate |
| પત્રક – D | Statement D – cheque-wise expense split by grant head |
| આવક / જાવક | Receipts (money in) / Payments (money out) |
| જમા / ઉધાર | Credit (in) / Debit (out) |
| જમા બાકી / ઉધાર બાકી | Credit balance / Debit balance (running balance columns in the ledger) |
| ઉઘડતી સિલક | Opening balance |
| બંધ સિલક | Closing balance |
| શરૂની સિલક | Opening balance (used in Annexure 10) |
| રોકડ / બેન્ક / કુલ રકમ | Cash / Bank / Total amount |
| ખર્ચખાતે | "To expenses" – total paid out in a cash-book block |
| શ્રી કુલ | Grand total (check row) |
| પરત કરેલ ગ્રાન્ટ | Grant returned |
| બચત | Savings / unspent |
| કપાત | Deduction |
| ચોખ્ખી રકમ | Net amount |
| વા.મુ. / વા.મુજબ | "as per voucher" |
| પહોંચ નંબર | Receipt (acknowledgement) number |
| વર્ગીકરણ રજી.નો પાન નં | Page number in the classification register (ledger) – left blank in the sample |
| CRC / BRC | Cluster / Block Resource Centre coordinator (the reviewers) |
| કોઈ નાણાંકીય ખર્ચ કરેલ નથી | "No financial transaction made" – printed in empty cash-book blocks |

Grant heads in the sample year (the list must be editable – it changes by year and school):

| Code | Gujarati | Meaning |
|---|---|---|
| INTEREST | વ્યાજ/વટાવ | Bank interest |
| SWACHHATA | શાળા સ્વચ્છતા ગ્રાન્ટ | School cleanliness grant |
| VALI_SAMMELAN | વાલીસંમેલન ગ્રાન્ટ | Parents' meeting grant (hospitality = સરભરા ખર્ચ) |
| BALMELO | બાળમેળો ગ્રાન્ટ | Children's fair grant |
| INTERNET | ઈન્ટરનેટ ગ્રાન્ટ | Internet grant |
| PRAGNA | પ્રજ્ઞા ગ્રાન્ટ | Pragna (activity-based learning) grant |
| FIRST_AID | ફસ્ટ એઈડ બોક્સ ગ્રાન્ટ | First-aid box grant |
| PRAVESHOTSAV | પ્રવેશોત્સવ ગ્રાન્ટ | School-entry festival grant |
| CIVIL | સિવિલ ગ્રાન્ટ | Civil works (repairs/painting) grant |

## 4. Data to capture (the only inputs)

Everything printed is derived from these. Never store a derived number.

### 4.1 Master data
- **School**: name, SMC label for headers, DISE code, cluster, taluka, district, programme header lines,
  head teacher name, head teacher mobile.
- **Bank account**: bank, branch, account number (confirm whether a school can have more than one – §11).
- **Financial year**: label, start date, end date, status (open / closed).
- **Grant heads**: code, Gujarati name, print order, active flag.

### 4.2 Opening balances (once per year)
Per grant head: amount in bank, amount in cash (cash is 0 in the sample). On closing a year, the closing
balance per head becomes next year's opening balance automatically (editable).

### 4.3 Receipt (money into the bank)
date (cash-book date), grant head, amount, received from (e.g. `SSA`, `BOB અંતિસર વ્યાજ`),
mode (ઓનલાઈન / બેન્ક દ્વારા / cheque / DD), DD/cheque number + date (optional), allotment order number + date
(optional), bank name, date deposited, date credited, remarks.

### 4.4 Bill (an expense document)
voucher number, bill number (**text**, e.g. `1/2` – never parse as a date), bill date, description,
vendor/person, gross amount, deduction, net amount (= gross − deduction), grant head, quantity (optional),
remarks. Bill dates may fall before the financial year (voucher 1 in the sample pays bills from 2024-25).

### 4.5 Cheque (money out of the bank)
cheque number, cheque date, **cash-book date** (date it is entered in the rojmel; may differ from cheque date),
encashed date (ચેક વટાવ્યાં તારીખ), voucher number, payee, purpose text, type
(`reimbursement` | `direct` | `grant_return`), linked bills, and the **allocation to grant heads**.

- For `reimbursement` and `direct`: allocation = sum of linked bills' net amounts grouped by grant head
  (compute it; do not let the user type it).
- For `grant_return`: the user types the amount per grant head (no bills).
- Cheque amount = sum of allocation.

### 4.6 Year-end bank reconciliation inputs
cheques issued but not yet encashed, credits in bank not yet in cash book, deposits not yet credited,
bank charges not yet in cash book, passbook balance on 31 March. (Uncashed cheques can be computed from
encashed date.)

## 5. Core calculations

Let `h` = grant head, `FY` = the financial year.

- `Received(h)` = Σ receipts of h in FY
- `Spent(h)` = Σ allocation of h over cheques of type reimbursement/direct in FY
- `Returned(h)` = Σ allocation of h over cheques of type grant_return in FY
- `Closing(h)` = `Opening(h) + Received(h) − Spent(h) − Returned(h)`
- Bank balance after date d = opening bank + Σ receipts ≤ d − Σ cheques (by cash-book date) ≤ d
- Cash balance after date d = opening cash + Σ reimbursement cheques ≤ d − Σ their bills paid in cash ≤ d
  (= opening cash in practice, because reimbursements go in and out on the same day)
- Grand total identity: Σ Closing(h) = bank balance + cash balance on 31 March.

Sample year totals: Opening 12,998 + Received 29,417 − Spent 39,763 − Returned 2,498 = Closing 154.

## 6. Reports

General print rules seen in the reference PDFs:
- Every page header: `SMCE <school name>`.
- Amounts with two decimals (`12998.00`). No thousands separators in the originals.
- **Rojmel uses Latin digits; every other report prints Gujarati digits** (૦૧૨૩૪૫૬૭૮૯), including dates
  and amounts. Make this a per-report setting.
- Dates print as DD/MM/YYYY.
- Paper: Rojmel, Khatavahi, registers = A4 landscape. Annexure 9 and 10 = A4 portrait.

### 6.1 Rojmel – cash book (`reference/01_rojmel_cash_book.pdf`, 16 pages)

Page header band: `આવક ( Cash Book )` | `( કેશ બુક ) જાવક` | `પાના નંબર <n>`.

Columns (left = receipts, right = payments):

| Left (આવક) | Right (જાવક) |
|---|---|
| તારીખ | તારીખ |
| આવકની વિગત – description | જાવક ની વિગત – description |
| પહોંચ નંબર અને તારીખ | વાઉચર નંબર અને તારીખ (voucher no + date; for bill lines: bill no + bill date) |
| ચેક નં તારીખ ડી.ડી.નં તારીખ | ચેક નં તારીખ |
| વર્ગીકરણ રજી.નો પાન નં (blank) | વર્ગીકરણ રજી.નો પાન નં (blank) |
| રોકડ / બેન્ક / કુલ રકમ | રોકડ / બેન્ક / કુલ રકમ |

The book is a sequence of **blocks**. Normally two blocks per page; a block with many lines takes a whole page.
A block covers one date, or a date range printed as `DD/MM/YYYY TO DD/MM/YYYY` when nothing happened in that
range. Rules for when the client inserts empty-range blocks are not consistent – ask (§11). Suggested default:
one block per cash-book date with transactions, plus one "nil" block for each gap within a calendar month.

Each block:
1. First row, left: date(s) · `શ્રી ઉઘડતી સિલક` · opening cash · opening bank · total.
   First row, right: same date(s) · first payment line, or `કોઈ નાણાંકીય ખર્ચ કરેલ નથી` with 0.00 in all three.
2. Receipt lines (left, bank column):
   - grant: `<grant name> જમા` (e.g. `પ્રવેશોત્સવ ગ્રાન્ટ જમા`)
   - interest: `શ્રી વ્યાજના નાણાં જમા`
3. Payment lines (right):
   - **Reimbursement cheque**
     - bank line: `સભ્ય સચિવ દ્વારા <grant names joined with "," / "અને"> ના નાણાં ઉપાડ્યા` ·
       voucher no + cheque date · cheque no + date · bank amount
     - sub-heading line: `મુ.શિ.એ કરેલ પદર ખર્ચના નાણાં પરત લીધા`
     - one cash line per bill: `<vendor>ને બિલ મુજબ` (for wage bills: `સફાઈકામ પેટે હસમુખભાઈને વા.મુજબ`),
       bill no + bill date, cash amount
     - and on the LEFT (receipt) side one cash line: `મુખ્ય શિક્ષકે નાણાં ઉપાડી હાથ પર લીધા` with cash =
       cheque amount (the bank → cash transfer)
   - **Direct cheque**: `<grant name>માંથી ચેકથી નાણાં ચુકવ્યા` + line `<payee>ને <purpose>ના ચુકવ્યા વા.મુજબ`,
     bank amount.
   - **Grant return**: `સી.આર.સી કો.ઓર્ડિનેટરને બચત ગ્રાન્ટ પરત`, bank amount, followed by a breakdown list
     (grant head → amount, e.g. વ્યાજ 2399, સિવિલ ગ્રાન્ટ 98, ઈન્ટરનેટ ગ્રાન્ટ 1, total 2498).
4. Footer rows (right side, and matching totals on the left):
   - `શ્રી ખર્ચખાતે` = Σ payments in the block, for cash, bank, and total (total = cash + bank, so the
     bank→cash transfer is counted on both sides – this is intended and still balances).
   - `શ્રી બંધ સિલક` = (Σ receipts incl. opening) − ખર્ચખાતે, per column. The LEFT side of this row prints the
     receipt totals (cash, bank, total).
   - `શ્રી કુલ` = ખર્ચખાતે + બંધ સિલક; must equal the left receipt totals.
5. Next block's opening = this block's closing (cash and bank separately).
6. After the last block: sentence
   `તારીખ ૩૧/૦૩/૨૦૨૬ ના રોજ <school> SMCE ની બંધ સિલક રૂપિયા ૧૫૪.૦૦ રહે છે.` (Gujarati digits).

**Page numbers matter**: the ledger prints the rojmel page on which each entry appears. Paginate the rojmel
deterministically (row capacity per page, don't split a block unless it exceeds a page) and expose
`pageOf(entry)` for the ledger.

### 6.2 Khatavahi – ledger (`reference/02_khatavahi_ledger.pdf`)

One ledger per grant head, printed 2 across × 2 down (4 per A4 landscape page).
Header: `સામાન્ય ( જનરલ ) ખાતાવહી` · `ખાતાનું નામ –: <grant head>` · `વર્ષ –: ૨૦૨૫ – ૨૦૨૬`.

Columns: તારીખ · રોજમેળ પાનું · વિગત · જમા · ઉધાર · જમા બાકી · ઉધાર બાકી

Rows:
1. Opening: FY start date · page 1 · `શ્રી ઉઘડતી સિલક` · જમા = opening.
2. Each receipt of the head: `શ્રી ગ્રાન્ટ જમા` (interest: `શ્રી વ્યાજના નાણાં જમા`) · જમા = amount.
3. Each cheque allocation to the head (one row per cheque, only this head's share):
   e.g. `સ્વચ્છતા સામાન અને સફાઈકામ પેટે ચુકવ્યા વા.મુજબ`, `પ્રવેશોત્સવ કીટના ચુકવ્યા વા.મુ`,
   `સી.આર.સી કો.ઓર્ડિનેટરને બચત ગ્રાન્ટ પરત` · ઉધાર = share.
   Date = cheque's cash-book date; page = rojmel page of that cheque.
4. Running balance per row: `bal = prev bal + જમા − ઉધાર`; if `bal ≥ 0` print in જમા બાકી, else print `−bal`
   in ઉધાર બાકી.
5. Last row: FY end date · last rojmel page · `બંધ સિલક` · Σજમા · Σઉધાર · Σજમા − Σઉધાર (in the balance column).

Rows are in date order (opening first).

### 6.3 Grant register (`reference/03_grant_register.pdf`)

Title: `SMCE <school> ગ્રાન્ટ રજીસ્ટર ÷ ૨૦૨૫-૨૦૨૬`. One row per receipt, date order.

| Column (Gujarati) | Source |
|---|---|
| કોના તરફથી મળી | received from (`SSA`, `BOB અંતિસર વ્યાજ`) |
| ડીડી/ચેક નંબર તારીખ | DD/cheque no + date (sample shows only the date) |
| રકમ | amount |
| કયા કામે મળ્યો | purpose = grant head name (`વ્યાજ જમા` for interest) |
| ગ્રાન્ટ ફાળવણી આદેશ નંબર તારીખ | allotment order; sample prints mode + date (`ઓનલાઈન 24/06/2025`, `બેન્ક દ્વારા …`) |
| ચેક/ડ્રાફ્ટ નંબર તારીખ બેંકનું નામ | sample prints bank (`BOB અંતિસર`) |
| બેંકનું નામ | bank |
| જમા કર્યા તારીખ / જમા થયા તારીખ | deposited date / credited date |
| કોને ફાળવેલ | SMC label (`SMCE બેટાવાડાના મુવાડા`) |
| ખર્ચેલ રકમ | amount of this receipt consumed by outflows – see rule below |
| બચત રહેલ ગ્રાન્ટ | amount − ખર્ચેલ રકમ |
| રીમાર્કસ | remarks |

Rule for ખર્ચેલ રકમ (proposed, reproduces the sample – confirm §11): per head, apply outflows (spent and
returned, in date order) FIFO against the opening balance first, then receipts in date order. Only spending
(not returns) that lands on a receipt counts as ખર્ચેલ રકમ. Result in the sample: every grant receipt fully
spent (બચત 0); each interest receipt spent 0 (બચત = amount), because the interest return consumed only the
opening interest balance.

### 6.4 Cheque register (`reference/04_cheque_register.pdf`)

Title: `SMCE <school> ચેક રજીસ્ટર ÷ ૨૦૨૫-૨૦૨૬`. One row per cheque, cheque-number order.

અ.નં (serial) · ચેક નો ક્રમાંક (cheque no) · ચેકની તારીખ · વા.નં (voucher no) · બિલ નંબર (range of the linked
bills, `1/1 થી 1/21`; single bill `3/1`; blank if none) · રકમ · જેના તરફેણમાં ચેક લખ્યો તેનું નામ તથા કઈ બાબતે ચેક
લખ્યો તે (payee) · ચેકની રકમ (= રકમ) · બિલની વિગત (purpose) · મુ.શિ.ની સહી બી.આર.સી, સીઆર.સી ની સહી (blank, signed
by hand) · ચેક વટાવ્યાં તારીખ (encashed date) · શેરો (remarks, blank).

### 6.5 Bill register (`reference/05_bill_register.pdf`)

Title: `બિલ રજીસ્ટર · એસ.એમ.સી.ઈ <school> · વર્ષ ૨૦૨૫/૨૦૨૬`. Sorted by voucher no, then bill no (numeric on the
part after `/`).

અ.નં · વાઉચર નંબર (printed only on the first row of each voucher) · બીલ નંબર · બીલની તારીખ · બીલ વિગત ·
બીલ કોના તરફથી મળેલ છે · બીલની રકમ · કપાત · ચુકવવાની થતી ચોખ્ખી રકમ (= રકમ − કપાત) · મંજુર કરનારની સહી (blank)
· રીમાર્કસ · જથ્થો.

Grant-return cheques also appear as a row (voucher no, no bill no, description `બચત ગ્રાન્ટ પરત`, party
`સી.આર.સી કો.ઓર્ડિનેટર`, amount). Direct-payment cheques appear with their bill but no bill number.
Sample: 42 rows (41 bills + 1 return).

### 6.6 Voucher print (Excel sheets `Sheet1`, `Sheet2`, `Sheet4`; not among the PDFs)

One page per voucher: heading `સર્વ શિક્ષા અભિયાન મિશન ખેડા` · શાળાનું નામ · વાઉચર નંબર · આચાર્યશ્રીનું નામ ·
તારીખ · કુલ રકમ · table ક્રમ / બિલ નંબર / તારીખ / બીલ વિગત / બીલ કોના તરફથી મળેલ છે / બિલની રકમ / રિમાર્ક્સ ·
total. Total must equal the cheque amount.

### 6.7 પત્રક – D (Excel `Sheet3`; not among the PDFs)

Title: `SMCE એજ્યુકેશન બેંક ઓફ બરોડા બેંકના ખર્ચની વિગત દર્શાવતું પત્રક ( એપ્રિલ ૨૦૨૫ થી માર્ચ ૨૦૨૬ ) પત્રક – D`.
Header block: school, cluster, taluka, bank name, bank account no, DISE code, head teacher name, head teacher
mobile. Table: one row per (cheque × grant head allocation):
અ.નં · ચેકની તારીખ · ચેક નંબર · કોના ખાતામાં નાણાં ટ્રાન્સફર કર્યા તેનું નામ (પદર ખર્ચ કર્યો હોય તો અહીં નામ લખવું)
· બીલ દુકાનદાર, પાર્ટીનું નામ · ગ્રાન્ટનો હેડ · બીલની રકમ.

### 6.8 પરિશિષ્ટ ૯ – bank reconciliation (`reference/06_annexure_9_bank_reconciliation.pdf`)

Header (all annexures): `સમગ્ર શિક્ષા ખેડા – SMCE` / `સર્વ શિક્ષા અભિયાન – ખેડા` / `પરિશિષ્ટ –: ૯` /
`વર્ષ –: ૨૦૨૫ / ૨૦૨૬` / શાળાનું નામ + ડાયસ કોડ / ક્લસ્ટર + તાલુકો / BOB ખાતા નંબર.
Title: `બેંક સાથે મેળવણું – રીકન્સીલિએશન`.

```
૧ (+) રોજમેળ પ્રમાણે તા– ૩૧/૩/૨૦૨૬ ની સિલક ઉમેરવી                     A = cash-book bank balance
      ૧ ચેક ઈસ્યુ થયા હોય પરંતુ વટાવેલ ન હોય                              B
      ૨ બેંક માં જમા નોંધ થઈ હોય પરંતુ રોજમેળમાં દર્શાવ્યું ન હોય              C
      કુલ                                                                  A + B + C
(–)   બાદ કરવું
      ૧ બેંકમાં મોકલવામાં આવેલી રોકડ કે ચેક બેંક ખાતામાં જમા ન થઈ હોય         D
      ૨ બેંક ખાતામાં ઉધારવામાં આવેલ ચાર્જિસ પરંતુ તે રોજમેળમાં ઉલ્લેખ થયેલ ન હોય  E
      કુલ                                                                  D + E
પાસબુક / બેંક સ્ટેટમેન્ટ પ્રમાણે તા –: ૩૧/૦૩/૨૦૨૬ સિલક                  A + B + C − D − E
```
Show a warning if the computed passbook balance ≠ the passbook balance the user entered.
(The client's Excel just copies A into the last line – do not do that.)

### 6.9 પરિશિષ્ટ ૧૦ – annual grant statement (`reference/07_annexure_10_grant_summary.pdf`)

Header as 6.8 with `પરિશિષ્ટ –: ૧૦`. Table, one row per grant head in print order, plus a total row (`કુલ`):

ક્રમ · વિગત · શરૂની સિલક (Opening) · વર્ષ દરમ્યાન મળેલ ગ્રાન્ટ (Received) · કુલ (Opening + Received) ·
ખર્ચ (Spent) · પરત કરેલ ગ્રાન્ટ (Returned) · કુલ ખર્ચ (Spent + Returned) · ૩૧/૦૩/૨૬ ની બંધ સિલક (Closing)

Certificate paragraph below the table (fill from totals, Gujarati digits):

> આથી પ્રમાણપત્ર આપવામાં આવે છે કે સમગ્ર શિક્ષા અંતર્ગત વર્ષ ૨૦૨૫ / ૨૦૨૬ દરમ્યાન એસ.એમ.સી.ઈ કક્ષાએ શરૂની સિલક
> રૂા. {Opening} વર્ષ દરમ્યાન મળેલ ગ્રાન્ટ રૂા. {Received} કુલ ગ્રાન્ટ રૂા. {Opening+Received} તથા ગ્રાન્ટ પૈકી
> કુલ ખર્ચ રૂા. {Spent+Returned} થયેલ છે. અગાઉના વર્ષ સહિત ૩૧મી માર્ચના રોજ બચત રૂા. {Closing}
> એસ.એમ.સી.ઈ કક્ષાએ જમા રહેલ છે. સદર આવક તથા ખર્ચ હિસાબી રેકર્ડ પરથી ખરાઈ કરેલ છે. જે આપ સાહેબશ્રીને વિદિત થાય.

## 7. Validation rules

Block (error):
- Cheque allocation total ≠ cheque amount.
- Reimbursement/direct cheque whose allocation ≠ its bills grouped by head (should be impossible if computed).
- A bill linked to more than one cheque.
- Bank balance below 0 after any cash-book date.
- Duplicate cheque number; duplicate bill number within a voucher.
- Deduction > gross amount.

Warn:
- A grant head's balance below 0 at any date (spending more than received).
- Cheque numbers not consecutive; voucher numbers not consecutive.
- Bill date outside the financial year.
- Cash-book date earlier than cheque date, or encashed date earlier than cheque date.
- Bank reconciliation computed passbook balance ≠ entered passbook balance.
- Closing a year while bills exist with no cheque.

## 8. Test data and expected results

`reference/sample_data_2025-26.json` holds the corrected sample year: school, grant heads, opening balances,
12 receipts, 41 bills, 8 cheques (with bill links and allocations), reconciliation inputs, and
`expected_results`. Build automated tests that load it and assert:

- Annexure 10 rows and totals: Opening 12,998 · Received 29,417 · Total 42,415 · Spent 39,763 ·
  Returned 2,498 · Total out 42,261 · Closing 154. Per head: see `expected_results.annexure_10_rows`.
- Bank balance after each cash-book date (`expected_results.closing_balance_after_each_cashbook_date`):
  04/05/25 13,043 · 09/06/25 2,543 · 24/06/25 7,543 · 02/07/25 2,543 · 16/07/25 3,643 · 24/07/25 4,643 ·
  29/07/25 3,543 · 05/08/25 3,595 · 13/08/25 4,795 · 02/11/25 4,824 · 20/12/25 3,124 · 30/01/26 21,087 ·
  06/02/26 21,115 · 26/02/26 18,617 · 03/03/26 654 · 18/03/26 3,654 · 23/03/26 154. Cash is 0 after every date.
- Ledger closing rows, e.g. SWACHHATA Σજમા 15,000 Σઉધાર 15,000 balance 0; INTEREST Σજમા 2,553 Σઉધાર 2,399
  balance 154; CIVIL Σજમા 18,061 Σઉધાર 18,061 balance 0.
- Cheque amounts: 103 = 10,500 · 104 = 5,000 · 105 = 1,100 · 106 = 1,700 · 107 = 2,498 · 108 = 6,000 ·
  109 = 11,963 · 110 = 3,500.
- Bank reconciliation: 154 + 0 + 0 − 0 − 0 = 154.

## 9. Known errors in the client's reference files (do not reproduce)

The Excel is almost entirely hand-typed; only the cash book's running balances are formulas. Found:

1. Rojmel page 15: the cash receipt line for cheque 110 was copied as 1,700 (from page 9) instead of 3,500,
   so `શ્રી બંધ સિલક` total prints −1,646. The cash closing is a typed 0, which hides it.
2. Annexure 10: SWACHHATA ખર્ચ typed as 12,000 – correct is 15,000; so the ખર્ચ column total 36,763 should be
   39,763 (the કુલ ખર્ચ total 42,261 is correct).
3. Grant register: first interest shows 55 (cash book and ledger: 45); parents'-meeting grant dated 03/06/2024
   (cash book: 24/07/2025); second interest dated 03/08/2025 (cash book: 05/08/2025).
4. Rojmel page 1 second block dated `02/04/2024 TO 30/04/2024` (should be 2025); page 10 second block dated
   `03/11/2025 TO 30/11/2025` although it holds the 30/01/2026 civil grant.
5. Rojmel page 13 prints cheque no 108 for both payments; the second is 109. Voucher 6 date printed 26/03/2026
   (cheque 26/02/2026).
6. Bill register row 39 (bill 8/4) shows voucher no 2; it belongs to voucher 8.
7. Excel auto-converted bill numbers like `1/2` into dates, and many dates are stored as text or with
   day/month swapped.
8. Excel KHATAVAHI sheet: some running-balance formulas restart (`=E7-F7`) or omit the debit (`=G17+E18`).
9. Excel Annexure 9 copies the cash-book balance into the passbook line instead of calculating.
10. The workbook contains leftover vouchers of other schools (કોસમ, અંબેપુરા) in Sheet2/Sheet4.

## 10. Technical notes

- **Gujarati text encoding.** The client's Excel is typed in the legacy **LMG-Arun** font (a Terafont-Varun
  style ASCII mapping): a cell containing `TFZLB` only *looks* like તારીખ with that font installed. A few cells
  use the `Guj_Regular_Bold_SULEKH` / `Guj_Diamond_SULEKH` fonts (a different mapping; mostly dates and a
  title). The PDFs' text layer has the same legacy bytes – **read the PDFs as page images, not via text
  extraction.** The app must store and print real Unicode Gujarati. `tools/lmg_arun_to_unicode.py` is a
  best-effort converter for importing legacy data; review its output.
- **Fonts for printing:** embed a Unicode Gujarati font with correct conjunct shaping (e.g. Noto Sans Gujarati,
  Hind Vadodara). Test that ક્ષ, જ્ઞ, શ્રી, ર્ (reph, as in ખર્ચ), ્ર (as in પ્રવેશોત્સવ) render correctly in the
  PDF engine you choose.
- **Digits:** provide a Latin ↔ Gujarati digit formatter; see 6 for which report uses which.
- **Money:** store as integer paise or a decimal type. Never floating point.
- **Dates:** store ISO dates; display DD/MM/YYYY; Indian financial year April–March.
- **Bill numbers:** plain text.
- Reports should be pure functions of stored data (easy to test against section 8).

## 11. Open questions for the client (ask before building the affected part)

1. One school, or many schools (cluster/taluka admin logins)? The leftover sheets suggest many.
2. Who enters data – the head teacher, or an operator on behalf of many schools?
3. Is the grant-head list fixed by the state each year, or can schools add heads?
4. Rojmel blocks: exact rule for "nil" date-range blocks? Must page numbers match a physical book?
5. Output: PDF only, or also Excel? Exact paper sizes and margins?
6. Confirm Latin digits for rojmel and Gujarati digits for all other reports.
7. Can a school have more than one bank account (the civil grant came via BOB ચિખલોડ)?
8. Any real cash transactions other than reimbursements (cash receipts, cash in hand at year end)?
9. Should previous years' Excel files be imported?
10. Confirm the FIFO rule for ખર્ચેલ રકમ in the grant register (6.3).
11. Are TDS or other deductions (કપાત) ever used, and how are they recorded?
12. Signature, stamp and date areas required on any report?
