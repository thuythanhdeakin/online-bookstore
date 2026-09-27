"""Merge npm audit, ESLint security (SAST) and Trivy JSON reports into one Markdown summary
(reports/security-summary.md) so every finding is listed with its severity
and fix status - this is what goes into the assessment report.

Usage: python scripts/security_summary.py reports/
"""
import json
import sys
from collections import Counter
from pathlib import Path

SEV_ORDER = ["CRITICAL", "HIGH", "MODERATE", "MEDIUM", "LOW", "INFO", "UNKNOWN"]


def load(path: Path):
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8") or "null")
    except json.JSONDecodeError:
        return None


def eslint_security_rows(data):
    """SAST findings = ESLint messages coming from eslint-plugin-security rules."""
    for f in data or []:
        for m in f.get("messages", []):
            rule = m.get("ruleId") or ""
            if rule.startswith("security/"):
                sev = "HIGH" if m.get("severity") == 2 else "MEDIUM"
                yield ("ESLint security (SAST)", sev, rule,
                       f"{Path(f['filePath']).name}:{m.get('line')}", m.get("message", "")[:120], "review code")


def npm_audit_rows(data):
    """SCA findings from `npm audit --json` (v7+ format)."""
    for name, vuln in ((data or {}).get("vulnerabilities") or {}).items():
        fix = vuln.get("fixAvailable")
        remediation = "npm audit fix" if fix is True else (
            f"upgrade {fix.get('name')} to {fix.get('version')}" if isinstance(fix, dict) else "no fix yet")
        for via in vuln.get("via", []):
            if isinstance(via, dict):  # direct advisory (strings = transitive pointer)
                advisory = via.get("url", "").rsplit("/", 1)[-1] or str(via.get("source", ""))
                yield ("npm audit (SCA)", via.get("severity", vuln.get("severity", "unknown")).upper(),
                       advisory, f"{name} {vuln.get('range', '')}", via.get("title", "")[:120], remediation)


def trivy_rows(data, tool):
    for res in (data or {}).get("Results", []):
        for v in res.get("Vulnerabilities", []) or []:
            fix = v.get("FixedVersion") or "no fix yet"
            yield (tool, v.get("Severity", "UNKNOWN"), v["VulnerabilityID"],
                   f"{v['PkgName']} {v.get('InstalledVersion', '')}",
                   (v.get("Title") or "")[:120], f"upgrade to {fix}" if fix != "no fix yet" else fix)
        for m in res.get("Misconfigurations", []) or []:
            yield (tool + " misconfig", m.get("Severity", "UNKNOWN"), m.get("ID", ""),
                   res.get("Target", ""), m.get("Title", ""), m.get("Resolution", "")[:80])
        for s in res.get("Secrets", []) or []:
            yield (tool + " secret", s.get("Severity", "UNKNOWN"), s.get("RuleID", ""),
                   res.get("Target", ""), s.get("Title", ""), "remove + rotate secret")


def main(report_dir: str) -> None:
    d = Path(report_dir)
    rows = [
        *eslint_security_rows(load(d / "eslint-security.json")),
        *npm_audit_rows(load(d / "npm-audit.json")),
        *trivy_rows(load(d / "trivy-image.json"), "Trivy image"),
        *trivy_rows(load(d / "trivy-fs.json"), "Trivy fs"),
    ]
    # De-duplicate (the same advisory can be reported more than once)
    rows = list({(r[0], r[2], r[3]): r for r in rows}.values())
    rows.sort(key=lambda r: SEV_ORDER.index(r[1]) if r[1] in SEV_ORDER else 9)
    counts = Counter(r[1] for r in rows)

    lines = ["# Security scan summary", "",
             "| Severity | Count |", "|---|---|"]
    lines += [f"| {s} | {counts.get(s, 0)} |" for s in SEV_ORDER]
    lines += ["", "| Tool | Severity | ID | Component | Issue | Remediation |",
              "|---|---|---|---|---|---|"]
    for r in rows:
        lines.append("| " + " | ".join(str(c).replace("|", "/") for c in r) + " |")
    if not rows:
        lines.append("| - | - | - | - | No findings | - |")
    out = d / "security-summary.md"
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines[:11]))
    print(f"... full table ({len(rows)} findings) written to {out}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "reports")
