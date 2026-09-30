import { formatAmount } from "../format.js";
import type { JSX } from "react";

/** An amount in a table cell: tabular figures, right aligned, two decimals. */
export function Money({ paise, className }: { paise: number; className?: string }): JSX.Element {
  return <span className={className ? `num ${className}` : "num"}>{formatAmount(paise)}</span>;
}
