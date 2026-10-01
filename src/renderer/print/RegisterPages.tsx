import type { JSX } from "react";
import { Text } from "./layout-context.js";
import type {
  BillRegisterRow,
  ChequeRegisterRow,
  PatrakDRow,
  Voucher,
} from "../../engine/registers.js";
import type { GrantRegisterRowDto, SchoolDto, FinancialYearDto } from "../../shared/api.js";
import { formatAmount } from "../../lib/money.js";
import { formatDate } from "../../lib/dates.js";
import { toGujaratiDigits } from "../../lib/gujarati.js";
import { PagedSheets } from "./PagedSheets.js";
import { ROW_KEYS, billRowKeys, ROW_GROUPS } from "../../shared/report-layout.js";

/**
 * The four register forms and પત્રક-D (SPEC 6.3 to 6.7).
 *
 * All of these print GUJARATI DIGITS - only the rojmel uses Latin (SPEC §6).
 * `gu()` below is applied to every figure and date for that reason; identifiers
 * such as the DISE code and the bank account number stay Latin, as they do on
 * the originals.
 *
 * Every form runs over as many sheets as its rows need at 14pt, each sheet
 * repeating the title and the column headings (PagedSheets measures the rows;
 * a fixed count per sheet stopped being true once descriptions wrap).
 *
 * Column widths are not here: they are in REPORT_COLUMNS (shared/report-layout),
 * where a school's own layout can change them. Every cell names its column
 * (data-col) and every row its key (data-row), which is how a highlight or a
 * font the school chose finds the cell it belongs to.
 */

/** Gujarati digits for anything numeric the form prints. */
const gu = (text: string): string => toGujaratiDigits(text);
const money = (paise: number): string => gu(formatAmount(paise));
const date = (iso: string): string => gu(formatDate(iso));

function RegisterTitle({
  school,
  year,
  titleGu,
}: {
  school: SchoolDto;
  year: FinancialYearDto;
  titleGu: string;
}): JSX.Element {
  return (
    <div className="register-title" data-part="title">
      <span className="smc">{school.smcLabelGu}</span>
      <span className="what">
        {titleGu} ÷ {gu(`${year.startDate.slice(0, 4)}-${year.endDate.slice(0, 4)}`)}
      </span>
    </div>
  );
}

// --------------------------------------------------------- cheque register

export function ChequeRegisterPages({
  school,
  year,
  rows,
}: {
  school: SchoolDto;
  year: FinancialYearDto;
  rows: ChequeRegisterRow[];
}): JSX.Element {
  return (
    <PagedSheets
      landscape
      head={() => <RegisterTitle school={school} year={year} titleGu="ચેક રજીસ્ટર" />}
      tableClassName="form register"
      thead={
        <tr data-row="head">
          <th data-col="serial"><Text id="col:serial">અ.નં</Text></th>
          <th data-col="chequeNo"><Text id="col:chequeNo">ચેક નો ક્રમાંક</Text></th>
          <th data-col="chequeDate"><Text id="col:chequeDate">ચેકની તારીખ</Text></th>
          <th data-col="voucherNo"><Text id="col:voucherNo">વા.નં</Text></th>
          <th data-col="billRange"><Text id="col:billRange">બિલ નંબર</Text></th>
          <th data-col="amount"><Text id="col:amount">રકમ</Text></th>
          <th data-col="payee"><Text id="col:payee">જેના તરફેણમાં ચેક લખ્યો તેનું નામ તથા કઈ બાબતે ચેક લખ્યો તે</Text></th>
          <th data-col="chequeAmount"><Text id="col:chequeAmount">ચેકની રકમ</Text></th>
          <th data-col="purpose"><Text id="col:purpose">બિલની વિગત</Text></th>
          <th data-col="signature"><Text id="col:signature">મુ.શિ.ની સહી બી.આર.સી, સીઆર.સી ની સહી</Text></th>
          <th data-col="cashedDate"><Text id="col:cashedDate">ચેક વટાવ્યાં તારીખ</Text></th>
          <th data-col="remarks"><Text id="col:remarks">શેરો</Text></th>
        </tr>
      }
      rows={rows.map((row) => ({
        key: ROW_KEYS.cheque(row.chequeNo),
        cells: (
          <>
            <td data-col="serial" className="centre">{gu(String(row.serial))}</td>
            <td data-col="chequeNo" className="centre">{gu(String(row.chequeNo))}</td>
            <td data-col="chequeDate" className="centre">{date(row.chequeDate)}</td>
            <td data-col="voucherNo" className="centre">{row.voucherNo === null ? "" : gu(String(row.voucherNo))}</td>
            <td data-col="billRange" className="centre">{gu(row.billRangeText)}</td>
            <td data-col="amount" className="figure">{money(row.amountPaise)}</td>
            <td data-col="payee">{row.payeeGu}</td>
            <td data-col="chequeAmount" className="figure">{money(row.amountPaise)}</td>
            <td data-col="purpose">{row.purposeGu}</td>
            {/* Signed by hand (SPEC 11.12). */}
            <td data-col="signature" />
            <td data-col="cashedDate" className="centre">{row.cashedDate ? date(row.cashedDate) : ""}</td>
            <td data-col="remarks">{row.remarksGu ?? ""}</td>
          </>
        ),
      }))}
    />
  );
}

// ----------------------------------------------------------- bill register

export function BillRegisterPages({
  school,
  year,
  rows,
}: {
  school: SchoolDto;
  year: FinancialYearDto;
  rows: BillRegisterRow[];
}): JSX.Element {
  const keys = billRowKeys(rows);
  return (
    <PagedSheets
      landscape
      head={() => (
        <div className="register-title" data-part="title">
          <span className="what">બિલ રજીસ્ટર</span>
          <span className="smc">એસ.એમ.સી.ઈ {school.nameGu}</span>
          <span className="what">
            વર્ષ÷ {gu(`${year.startDate.slice(0, 4)}/${year.endDate.slice(0, 4)}`)}
          </span>
        </div>
      )}
      tableClassName="form register"
      thead={
        <tr data-row="head">
          <th data-col="serial"><Text id="col:serial">અ.નં</Text></th>
          <th data-col="voucherNo"><Text id="col:voucherNo">વાઉચર નંબર</Text></th>
          <th data-col="billNo"><Text id="col:billNo">બીલ નંબર</Text></th>
          <th data-col="billDate"><Text id="col:billDate">બીલની તારીખ</Text></th>
          <th data-col="description"><Text id="col:description">બીલ વિગત</Text></th>
          <th data-col="vendor"><Text id="col:vendor">બીલ કોના તરફથી મળેલ છે</Text></th>
          <th data-col="amount"><Text id="col:amount">બીલની રકમ</Text></th>
          <th data-col="deduction"><Text id="col:deduction">કપાત</Text></th>
          <th data-col="net"><Text id="col:net">ચુકવવાની થતી ચોખ્ખી રકમ</Text></th>
          <th data-col="signature"><Text id="col:signature">મંજુર કરનારની સહી</Text></th>
          <th data-col="remarks"><Text id="col:remarks">રીમાર્કસ</Text></th>
          <th data-col="quantity"><Text id="col:quantity">જથ્થો</Text></th>
        </tr>
      }
      rows={rows.map((row, index) => ({
        key: keys[index]!,
        cells: (
          <>
            <td data-col="serial" className="centre">{gu(String(row.serial))}</td>
            <td data-col="voucherNo" className="centre">{row.showVoucherNo ? gu(String(row.voucherNo)) : ""}</td>
            <td data-col="billNo" className="centre">{row.billNo ? gu(row.billNo) : ""}</td>
            <td data-col="billDate" className="centre">{date(row.billDate)}</td>
            <td data-col="description">{row.descriptionGu}</td>
            <td data-col="vendor">{row.vendorGu}</td>
            <td data-col="amount" className="figure">{money(row.amountPaise)}</td>
            <td data-col="deduction" className="figure">{row.deductionPaise === 0 ? "" : money(row.deductionPaise)}</td>
            <td data-col="net" className="figure">{money(row.netPaise)}</td>
            <td data-col="signature" />
            <td data-col="remarks">{row.remarksGu ?? ""}</td>
            <td data-col="quantity" className="centre">{row.quantityGu ?? ""}</td>
          </>
        ),
      }))}
    />
  );
}

// ---------------------------------------------------------- grant register

export function GrantRegisterPages({
  school,
  year,
  rows,
}: {
  school: SchoolDto;
  year: FinancialYearDto;
  rows: GrantRegisterRowDto[];
}): JSX.Element {
  return (
    <PagedSheets
      landscape
      head={() => <RegisterTitle school={school} year={year} titleGu="ગ્રાન્ટર રજીસ્ટર" />}
      tableClassName="form register"
      thead={
        <tr data-row="head">
          <th data-col="from"><Text id="col:from">કોના તરફથી મળી</Text></th>
          <th data-col="ddDate"><Text id="col:ddDate">ડીડી/ચેક નંબર તારીખ</Text></th>
          <th data-col="amount"><Text id="col:amount">રકમ</Text></th>
          <th data-col="purpose"><Text id="col:purpose">કયા કામે મળ્યો</Text></th>
          <th data-col="order"><Text id="col:order">ગ્રાન્ટ ફાળવણી આદેશ નંબર તારીખ</Text></th>
          <th data-col="instrument"><Text id="col:instrument">ચેક/ડ્રાફ્ટ નંબર તારીખ બેંકનું નામ</Text></th>
          <th data-col="bank"><Text id="col:bank">બેંકનું નામ</Text></th>
          <th data-col="deposited"><Text id="col:deposited">જમા કર્યા તારીખ</Text></th>
          <th data-col="credited"><Text id="col:credited">જમા થયા તારીખ</Text></th>
          <th data-col="allottedTo"><Text id="col:allottedTo">કોને ફાળવેલ</Text></th>
          <th data-col="spent"><Text id="col:spent">ખર્ચેલ રકમ</Text></th>
          <th data-col="saving"><Text id="col:saving">બચત રહેલ ગ્રાન્ટ</Text></th>
          <th data-col="remarks"><Text id="col:remarks">રીમાર્કસ</Text></th>
        </tr>
      }
      rows={rows.map((row) => ({
        key: ROW_KEYS.receipt(row.receipt.id),
        cells: (
          <>
            <td data-col="from">{row.receipt.receivedFromGu}</td>
            <td data-col="ddDate" className="centre">{date(row.receipt.date)}</td>
            <td data-col="amount" className="figure">{money(row.receipt.amountPaise)}</td>
            <td data-col="purpose">{row.receipt.headNameGu}</td>
            <td data-col="order" className="centre">
              {row.receipt.modeGu} {date(row.receipt.date)}
            </td>
            <td data-col="instrument" className="centre">{row.receipt.bankLabelGu}</td>
            <td data-col="bank" className="centre">{row.receipt.bankLabelGu}</td>
            <td data-col="deposited" className="centre">
              {row.receipt.depositedDate ? date(row.receipt.depositedDate) : date(row.receipt.date)}
            </td>
            <td data-col="credited" className="centre">
              {row.receipt.creditedDate ? date(row.receipt.creditedDate) : date(row.receipt.date)}
            </td>
            <td data-col="allottedTo">{school.smcLabelGu}</td>
            <td data-col="spent" className="figure">{money(row.spentPaise)}</td>
            <td data-col="saving" className="figure">{money(row.savingPaise)}</td>
            <td data-col="remarks">{row.receipt.remarksGu ?? ""}</td>
          </>
        ),
      }))}
    />
  );
}

// ---------------------------------------------------------- voucher print

/** A voucher's lines are keyed as the bill register keys the same bills. */
function lineKeys(voucher: Voucher): string[] {
  return billRowKeys(voucher.lines.map((line) => ({ voucherNo: voucher.voucherNo, billNo: line.billNo })));
}

export function VoucherPages({
  school,
  vouchers: list,
}: {
  school: SchoolDto;
  vouchers: Voucher[];
}): JSX.Element {
  return (
    <>
      {list.map((voucher) => (
        // A voucher with many bills - voucher 1 pays twenty-one - carries on
        // onto further sheets, each repeating the voucher's details.
        <PagedSheets
          key={voucher.voucherNo}
          landscape={false}
          head={() => (
            <div className="voucher-head">
              <div className="programme" data-part="programme">
                <Text id="voucher.programme" vars={{ "જિલ્લો": school.districtGu }}>
                  {"સર્વ શિક્ષા અભિયાન મિશન {જિલ્લો}"}
                </Text>
              </div>
              <div className="voucher-title" data-part="voucherTitle">
                <Text id="voucher.title">વાઉચર</Text>
              </div>
              <table className="form voucher-meta" data-part="meta">
                <tbody>
                  <tr>
                    <td className="label"><Text id="voucher.school">શાળાનું નામ –:</Text></td>
                    <td>{school.nameGu}</td>
                    <td className="label"><Text id="voucher.number">વાઉચર નંબર –:</Text></td>
                    <td className="centre">{gu(String(voucher.voucherNo))}</td>
                  </tr>
                  <tr>
                    <td className="label"><Text id="voucher.principal">આચાર્યશ્રીનું નામ –:</Text></td>
                    <td>{school.memberSecretaryGu}</td>
                    <td className="label"><Text id="voucher.date">તારીખ –:</Text></td>
                    <td className="centre">{voucher.chequeDate ? date(voucher.chequeDate) : ""}</td>
                  </tr>
                  <tr>
                    {/* The cheque register's બિલની વિગત for this cheque. */}
                    <td colSpan={2} className="budget-head">
                      <Text id="voucher.budgetHead">ઉધાર બજેટ હેડ –:</Text> {voucher.purposeGu ?? ""}
                    </td>
                    <td className="label"><Text id="voucher.total">કુલ રકમ</Text></td>
                    <td className="figure">{money(voucher.totalPaise)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          tableClassName="form"
          thead={
            <tr data-row="head">
              <th data-col="serial"><Text id="col:serial">ક્રમ</Text></th>
              <th data-col="billNo"><Text id="col:billNo">બિલ નંબર</Text></th>
              <th data-col="billDate"><Text id="col:billDate">તારીખ</Text></th>
              <th data-col="description"><Text id="col:description">બીલ વિગત</Text></th>
              <th data-col="vendor"><Text id="col:vendor">બીલ કોના તરફથી મળેલ છે</Text></th>
              <th data-col="amount"><Text id="col:amount">બિલની રકમ</Text></th>
              <th data-col="remarks"><Text id="col:remarks">રિમાર્ક્સ</Text></th>
            </tr>
          }
          rows={voucher.lines.map((line, index) => ({
            key: lineKeys(voucher)[index]!,
            group: ROW_GROUPS.voucherLine(index),
            cells: (
              <>
                <td data-col="serial" className="centre">{gu(String(line.serial))}</td>
                <td data-col="billNo" className="centre">{line.billNo ? gu(line.billNo) : ""}</td>
                <td data-col="billDate" className="centre">{date(line.billDate)}</td>
                <td data-col="description">{line.descriptionGu}</td>
                <td data-col="vendor">{line.vendorGu}</td>
                <td data-col="amount" className="figure">{money(line.amountPaise)}</td>
                <td data-col="remarks">{line.remarksGu ?? ""}</td>
              </>
            ),
          }))}
          lastRows={
            <tr data-row={ROW_KEYS.voucherTotal(voucher.voucherNo)} data-row-group={ROW_GROUPS.voucherTotal}>
              <td data-col="serial" colSpan={5} className="centre">
                <strong>કુલ</strong>
              </td>
              <td data-col="amount" className="figure">
                <strong>{money(voucher.totalPaise)}</strong>
              </td>
              <td data-col="remarks" />
            </tr>
          }
          foot={
            <>
              <VoucherNote voucher={voucher} />
              <div className="signatures" data-part="signatures">
                <div><Text id="voucher.signSecretary">સભ્ય સચિવ</Text></div>
                <div><Text id="voucher.signChair">અધ્યક્ષશ્રી</Text></div>
              </div>
            </>
          }
        />
      ))}
    </>
  );
}

/**
 * The sentence under a voucher's bills, as the client's vouchers carry it: a
 * reimbursement says the head teacher paid the bills and took the money back
 * by cheque; a direct payment says the cheque paid them. The school can
 * reword it; {ચેક નંબર} and {રકમ} are filled in.
 */
function VoucherNote({ voucher }: { voucher: Voucher }): JSX.Element | null {
  if (voucher.chequeNo === null) return null;
  const vars = { "ચેક નંબર": gu(String(voucher.chequeNo)), "રકમ": rupeesGu(voucher.totalPaise) };
  return (
    <div className="voucher-note" data-part="closingNote">
      {voucher.chequeType === "REIMBURSEMENT" ? (
        <Text id="voucher.noteReimbursement" vars={vars}>
          {"ઉપરોક્ત બિલ મુજબનો ખર્ચ મુખ્ય શિક્ષક દ્વારા પદરનો કરવામાં આવેલ હતો તે મુ.શિ દ્વારા ચેકનંબર –: {ચેક નંબર} થી રૂ. {રકમ} પરત લીધા."}
        </Text>
      ) : (
        <Text id="voucher.noteDirect" vars={vars}>
          {"ઉપરોક્ત બિલ મુજબનો ખર્ચ ચેકનંબર –: {ચેક નંબર} થી રૂ. {રકમ} ચૂકવેલ છે."}
        </Text>
      )}
    </div>
  );
}

/** "૧૦૫૦૦", or "૧૦૫૦૦.૫૦" when there are paise - as the sentence writes a sum. */
function rupeesGu(paise: number): string {
  const text = formatAmount(paise);
  return gu(text.endsWith(".00") ? text.slice(0, -3) : text);
}

// ---------------------------------------------------------------- પત્રક-D

export function PatrakDPages({
  school,
  year,
  rows,
}: {
  school: SchoolDto;
  year: FinancialYearDto;
  rows: PatrakDRow[];
}): JSX.Element {
  const total = rows.reduce((sum, row) => sum + row.amountPaise, 0);

  return (
    <PagedSheets
      landscape
      head={() => (
        <>
          <div className="register-title" data-part="title">
            <span className="what">
              SMCE એજ્યુકેશન {school.bankNameGu} બેંકના ખર્ચની વિગત દર્શાવતું પત્રક ( એપ્રિલ{" "}
              {gu(year.startDate.slice(0, 4))} થી માર્ચ {gu(year.endDate.slice(0, 4))} ) પત્રક – D
            </span>
          </div>

          <table className="form patrak-meta" data-part="meta">
            <tbody>
              <tr>
                <td className="label">શાળા</td>
                <td>{school.nameGu}</td>
                <td className="label">ક્લસ્ટર</td>
                <td>{school.clusterGu}</td>
                <td className="label">તાલુકો</td>
                <td>{school.talukaGu}</td>
              </tr>
              <tr>
                <td className="label">બેંક</td>
                <td>
                  {school.bankNameGu} {school.bankBranchGu}
                </td>
                <td className="label">ખાતા નંબર</td>
                <td>{school.bankAccountNo}</td>
                <td className="label">ડાયસ કોડ</td>
                <td>{school.diseCode}</td>
              </tr>
              <tr>
                <td className="label">મુખ્ય શિક્ષક</td>
                <td colSpan={3}>{school.memberSecretaryGu}</td>
                <td className="label">મોબાઈલ</td>
                <td>{school.memberSecretaryMobile ?? ""}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}
      tableClassName="form register"
      thead={
        <tr data-row="head">
          <th data-col="serial"><Text id="col:serial">અ.નં</Text></th>
          <th data-col="chequeDate"><Text id="col:chequeDate">ચેકની તારીખ</Text></th>
          <th data-col="chequeNo"><Text id="col:chequeNo">ચેક નંબર</Text></th>
          <th data-col="payee"><Text id="col:payee">કોના ખાતામાં નાણાં ટ્રાન્સફર કર્યા તેનું નામ (પદર ખર્ચ કર્યો હોય તો અહીં નામ લખવું)</Text></th>
          <th data-col="parties"><Text id="col:parties">બીલ દુકાનદાર, પાર્ટીનું નામ</Text></th>
          <th data-col="head"><Text id="col:head">ગ્રાન્ટનો હેડ</Text></th>
          <th data-col="amount"><Text id="col:amount">બીલની રકમ</Text></th>
        </tr>
      }
      rows={rows.map((row) => ({
        key: ROW_KEYS.patrakD(row.chequeNo, row.headNameGu),
        cells: (
          <>
            <td data-col="serial" className="centre">{gu(String(row.serial))}</td>
            <td data-col="chequeDate" className="centre">{date(row.chequeDate)}</td>
            <td data-col="chequeNo" className="centre">{gu(String(row.chequeNo))}</td>
            <td data-col="payee">{row.payeeGu}</td>
            <td data-col="parties">{row.partiesGu}</td>
            <td data-col="head">{row.headNameGu}</td>
            <td data-col="amount" className="figure">{money(row.amountPaise)}</td>
          </>
        ),
      }))}
      lastRows={
        <tr data-row="total">
          <td data-col="serial" colSpan={6} className="centre">
            <strong>કુલ</strong>
          </td>
          <td data-col="amount" className="figure">
            <strong>{money(total)}</strong>
          </td>
        </tr>
      }
    />
  );
}
