import type { JSX } from "react";
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
import { ROW_KEYS, billRowKeys } from "../../shared/report-layout.js";

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
          <th data-col="serial">અ.નં</th>
          <th data-col="chequeNo">ચેક નો ક્રમાંક</th>
          <th data-col="chequeDate">ચેકની તારીખ</th>
          <th data-col="voucherNo">વા.નં</th>
          <th data-col="billRange">બિલ નંબર</th>
          <th data-col="amount">રકમ</th>
          <th data-col="payee">જેના તરફેણમાં ચેક લખ્યો તેનું નામ તથા કઈ બાબતે ચેક લખ્યો તે</th>
          <th data-col="chequeAmount">ચેકની રકમ</th>
          <th data-col="purpose">બિલની વિગત</th>
          <th data-col="signature">મુ.શિ.ની સહી બી.આર.સી, સીઆર.સી ની સહી</th>
          <th data-col="cashedDate">ચેક વટાવ્યાં તારીખ</th>
          <th data-col="remarks">શેરો</th>
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
          <th data-col="serial">અ.નં</th>
          <th data-col="voucherNo">વાઉચર નંબર</th>
          <th data-col="billNo">બીલ નંબર</th>
          <th data-col="billDate">બીલની તારીખ</th>
          <th data-col="description">બીલ વિગત</th>
          <th data-col="vendor">બીલ કોના તરફથી મળેલ છે</th>
          <th data-col="amount">બીલની રકમ</th>
          <th data-col="deduction">કપાત</th>
          <th data-col="net">ચુકવવાની થતી ચોખ્ખી રકમ</th>
          <th data-col="signature">મંજુર કરનારની સહી</th>
          <th data-col="remarks">રીમાર્કસ</th>
          <th data-col="quantity">જથ્થો</th>
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
          <th data-col="from">કોના તરફથી મળી</th>
          <th data-col="ddDate">ડીડી/ચેક નંબર તારીખ</th>
          <th data-col="amount">રકમ</th>
          <th data-col="purpose">કયા કામે મળ્યો</th>
          <th data-col="order">ગ્રાન્ટ ફાળવણી આદેશ નંબર તારીખ</th>
          <th data-col="instrument">ચેક/ડ્રાફ્ટ નંબર તારીખ બેંકનું નામ</th>
          <th data-col="bank">બેંકનું નામ</th>
          <th data-col="deposited">જમા કર્યા તારીખ</th>
          <th data-col="credited">જમા થયા તારીખ</th>
          <th data-col="allottedTo">કોને ફાળવેલ</th>
          <th data-col="spent">ખર્ચેલ રકમ</th>
          <th data-col="saving">બચત રહેલ ગ્રાન્ટ</th>
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
              <div className="programme" data-part="programme">સર્વ શિક્ષા અભિયાન મિશન {school.districtGu}</div>
              <table className="form voucher-meta" data-part="meta">
                <tbody>
                  <tr>
                    <td className="label">શાળાનું નામ</td>
                    <td>{school.nameGu}</td>
                    <td className="label">વાઉચર નંબર</td>
                    <td className="centre">{gu(String(voucher.voucherNo))}</td>
                  </tr>
                  <tr>
                    <td className="label">આચાર્યશ્રીનું નામ</td>
                    <td>{school.memberSecretaryGu}</td>
                    <td className="label">તારીખ</td>
                    <td className="centre">{voucher.chequeDate ? date(voucher.chequeDate) : ""}</td>
                  </tr>
                  <tr>
                    <td className="label">કુલ રકમ</td>
                    <td className="figure">{money(voucher.totalPaise)}</td>
                    <td className="label">ચેક નંબર</td>
                    <td className="centre">
                      {voucher.chequeNo === null ? "" : gu(String(voucher.chequeNo))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          tableClassName="form"
          thead={
            <tr data-row="head">
              <th data-col="serial">ક્રમ</th>
              <th data-col="billNo">બિલ નંબર</th>
              <th data-col="billDate">તારીખ</th>
              <th data-col="description">બીલ વિગત</th>
              <th data-col="vendor">બીલ કોના તરફથી મળેલ છે</th>
              <th data-col="amount">બિલની રકમ</th>
              <th data-col="remarks">રિમાર્ક્સ</th>
            </tr>
          }
          rows={voucher.lines.map((line, index) => ({
            key: lineKeys(voucher)[index]!,
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
            <tr data-row={ROW_KEYS.voucherTotal(voucher.voucherNo)}>
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
            <div className="signatures" data-part="signatures">
              <div>સભ્ય સચિવ</div>
              <div>અધ્યક્ષશ્રી</div>
            </div>
          }
        />
      ))}
    </>
  );
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
          <th data-col="serial">અ.નં</th>
          <th data-col="chequeDate">ચેકની તારીખ</th>
          <th data-col="chequeNo">ચેક નંબર</th>
          <th data-col="payee">
            કોના ખાતામાં નાણાં ટ્રાન્સફર કર્યા તેનું નામ (પદર ખર્ચ કર્યો હોય તો અહીં નામ લખવું)
          </th>
          <th data-col="parties">બીલ દુકાનદાર, પાર્ટીનું નામ</th>
          <th data-col="head">ગ્રાન્ટનો હેડ</th>
          <th data-col="amount">બીલની રકમ</th>
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
