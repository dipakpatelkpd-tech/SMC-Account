import type { Issue } from "../../engine/validation.js";
import { useLanguage, useStrings } from "../i18n/index.js";
import type { JSX } from "react";

/**
 * Validation output. The Gujarati message is what the user reads; the English
 * detail sits underneath for whoever has to debug the books.
 */
export function IssueList({ issues }: { issues: Issue[] }): JSX.Element {
  const t = useStrings();
  const { language } = useLanguage();
  if (issues.length === 0) {
    return <p className="muted">{t.noIssues}</p>;
  }

  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");

  return (
    <>
      {[...errors, ...warnings].map((issue, index) => (
        <div className={`issue ${issue.severity}`} key={`${issue.code}-${index}`}>
          <div>
            <div>{language === "en" ? issue.messageEn : issue.messageGu}</div>
            {/* The technical detail is redundant once the message is English. */}
            {language !== "en" && <div className="detail">{issue.detail}</div>}
          </div>
        </div>
      ))}
    </>
  );
}
