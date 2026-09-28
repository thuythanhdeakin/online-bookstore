"""Monitoring & alerting verification used by the Jenkins 'Monitoring' stage.

1. Reloads Prometheus config and waits until the production target is UP.
2. Verifies alert rules are loaded.
3. Sends warm-up traffic and prints live golden-signal KPIs.
4. Fails (exit 2) if a critical production alert is already firing.
5. --simulate-incident: generates 5xx errors via /chaos/error and proves the
   BookstoreHighErrorRate alert fires in Prometheus AND reaches Alertmanager.

Only uses the standard library so it runs on the Jenkins agent without a venv.
"""
from __future__ import annotations  # macOS /usr/bin/python3 is 3.9: allow "dict | None" hints

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


def http(url: str, method: str = "GET", timeout: float = 5.0):
    req = urllib.request.Request(url, method=method)  # nosec B310 - internal URLs
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # nosec B310
            body = resp.read().decode()
            return resp.status, body
    except urllib.error.HTTPError as err:
        return err.code, err.read().decode()


def prom_query(prom: str, expr: str):
    _, body = http(f"{prom}/api/v1/query?query={urllib.parse.quote(expr)}")
    result = json.loads(body)["data"]["result"]
    return float(result[0]["value"][1]) if result else None


def firing_alerts(prom: str, env: str = "production"):
    _, body = http(f"{prom}/api/v1/alerts")
    alerts = json.loads(body)["data"]["alerts"]
    return [a for a in alerts if a["state"] == "firing" and a["labels"].get("env") == env]


def wait_for(predicate, timeout: int, interval: int = 5, label: str = ""):
    start = time.time()
    while time.time() - start < timeout:
        if predicate():
            return round(time.time() - start)
        print(f"  waiting for {label} ... {int(time.time() - start)}s", flush=True)
        time.sleep(interval)
    return None


def simulate_incident(args) -> dict | None:
    """Inject 5xx errors until BookstoreHighErrorRate fires, then confirm Alertmanager got it."""
    print("==> INCIDENT SIMULATION: sending bursts of 5xx errors to production")
    start = time.time()
    detected = None
    while time.time() - start < 180:
        for _ in range(40):
            http(f"{args.app}/chaos/error")
        names = [a["labels"]["alertname"] for a in firing_alerts(args.prom)]
        if "BookstoreHighErrorRate" in names:
            detected = round(time.time() - start)
            break
        print(f"  errors injected for {int(time.time() - start)}s, firing={names}", flush=True)
        time.sleep(3)
    if detected is None:
        print("!!! alert did not fire within 180s")
        return None
    print(f"  Prometheus: BookstoreHighErrorRate FIRING after {detected}s")
    in_am = wait_for(
        lambda: any(a["labels"]["alertname"] == "BookstoreHighErrorRate"
                    for a in json.loads(http(f"{args.alertmanager}/api/v2/alerts")[1])),
        60, label="Alertmanager notification")
    print("  Alertmanager received the alert -> team notified (see the alert-receiver log)"
          if in_am is not None else "!!! Alertmanager did not receive the alert")
    print("  Stopping error injection - alert will auto-RESOLVE in ~1-2 minutes")
    return {"detected_after_s": detected, "notified": in_am is not None}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--prom", default="http://prometheus:9090")
    ap.add_argument("--alertmanager", default="http://alertmanager:9093")
    ap.add_argument("--app", default="http://bookstore-production:8000")
    ap.add_argument("--simulate-incident", action="store_true")
    ap.add_argument("--report", default="reports/monitoring.json")
    args = ap.parse_args()
    report: dict = {}

    print("==> Reloading Prometheus configuration")
    http(f"{args.prom}/-/reload", method="POST")

    print("==> Waiting for Prometheus to scrape production")
    took = wait_for(lambda: prom_query(args.prom, 'up{job="bookstore-prod"}') == 1, 120, label="target UP")
    if took is None:
        print("!!! production target never became UP in Prometheus")
        return 1
    print(f"  production target UP (after {took}s)")

    _, body = http(f"{args.prom}/api/v1/rules")
    rules = [r["name"] for g in json.loads(body)["data"]["groups"] for r in g["rules"]]
    print(f"==> {len(rules)} alert rules loaded: {', '.join(rules)}")
    report["alert_rules"] = rules
    if len(rules) < 6:
        print("!!! expected at least 6 alert rules")
        return 1

    print("==> Warm-up traffic (60 requests)")
    for i in range(60):
        http(f"{args.app}/api/books" if i % 3 else f"{args.app}/index.html")
    time.sleep(12)  # one scrape interval + margin

    kpis = {
        "version": http(f"{args.app}/health")[1],
        "request_rate_rps": prom_query(args.prom, 'sum(rate(http_requests_total{job="bookstore-prod"}[1m]))'),
        "error_ratio_5xx": prom_query(
            args.prom,
            '(sum(rate(http_requests_total{job="bookstore-prod",status=~"5.."}[1m])) or vector(0))'
            ' / clamp_min(sum(rate(http_requests_total{job="bookstore-prod"}[1m])), 0.001)'),
        "latency_p95_s": prom_query(
            args.prom,
            'histogram_quantile(0.95, sum by (le) '
            '(rate(http_request_duration_seconds_bucket{job="bookstore-prod"}[2m])))'),
        "memory_rss_mb": (prom_query(args.prom, 'process_resident_memory_bytes{job="bookstore-prod"}') or 0)
        / 1024 / 1024,
    }
    report["kpis"] = kpis
    print("==> Live production KPIs")
    for k, v in kpis.items():
        print(f"  {k:18} {v}")

    critical = [a for a in firing_alerts(args.prom) if a["labels"].get("severity") == "critical"]
    report["critical_alerts_before"] = [a["labels"]["alertname"] for a in critical]
    if critical:
        print(f"!!! Critical alerts firing: {report['critical_alerts_before']}")
        Path(args.report).write_text(json.dumps(report, indent=2))
        return 2

    if args.simulate_incident:
        result = simulate_incident(args)
        if result is None:
            return 1
        report["incident_simulation"] = result

    Path(args.report).parent.mkdir(parents=True, exist_ok=True)
    Path(args.report).write_text(json.dumps(report, indent=2))
    print(f"==> Monitoring report written to {args.report}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
