"""Minimal Alertmanager webhook receiver - prints alerts so the team (and the
demo video) can see notifications arrive. `docker logs -f alert-receiver`."""
import json
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):  # noqa: N802 (http.server naming)
        length = int(self.headers.get("Content-Length", 0))
        payload = json.loads(self.rfile.read(length) or b"{}")
        now = datetime.now(timezone.utc).strftime("%H:%M:%S")
        for alert in payload.get("alerts", []):
            status = alert.get("status", "?").upper()
            labels = alert.get("labels", {})
            summary = alert.get("annotations", {}).get("summary", "")
            icon = "RESOLVED" if status == "RESOLVED" else "FIRING  "
            print(f"[{now}] {icon} {labels.get('severity', ''):8} "
                  f"{labels.get('alertname')} ({labels.get('env')}) - {summary}", flush=True)
        self.send_response(200)
        self.end_headers()

    def log_message(self, *args):  # silence default access log
        return


if __name__ == "__main__":
    print("alert-receiver listening on :5001", flush=True)
    HTTPServer(("0.0.0.0", 5001), Handler).serve_forever()  # nosec B104 - container only
