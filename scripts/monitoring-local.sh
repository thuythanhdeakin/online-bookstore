#!/usr/bin/env bash
# Start/stop the monitoring stack WITHOUT Docker (Homebrew binaries managed by pm2).
#   brew install prometheus alertmanager        # once  (optional: brew install grafana)
#   scripts/monitoring-local.sh up | down | status
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="${MONITORING_DATA:-$HOME/bookstore-monitoring}"
CMD="${1:-status}"
command -v pm2 >/dev/null || { echo "pm2 not found - npm install -g pm2" >&2; exit 2; }

up() {
  mkdir -p "$DATA"/{prometheus,alertmanager,grafana}
  command -v prometheus >/dev/null || { echo "prometheus not found - brew install prometheus" >&2; exit 2; }
  command -v alertmanager >/dev/null || { echo "alertmanager not found - brew install alertmanager" >&2; exit 2; }

  pm2 delete mon-alert-receiver mon-alertmanager mon-prometheus mon-grafana >/dev/null 2>&1 || true
  pm2 start "$ROOT/monitoring/alert_receiver.py" --name mon-alert-receiver --interpreter python3 \
    --output "$DATA/alerts.log" --time >/dev/null
  pm2 start "$(command -v alertmanager)" --name mon-alertmanager --interpreter none -- \
    --config.file="$ROOT/monitoring/local/alertmanager.yml" --storage.path="$DATA/alertmanager" \
    --cluster.listen-address= >/dev/null
  pm2 start "$(command -v prometheus)" --name mon-prometheus --interpreter none -- \
    --config.file="$ROOT/monitoring/local/prometheus.yml" --storage.tsdb.path="$DATA/prometheus" \
    --web.enable-lifecycle >/dev/null

  if command -v grafana >/dev/null; then
    # Provision the Prometheus datasource + Bookstore dashboard automatically
    mkdir -p "$DATA/grafana/provisioning/datasources" "$DATA/grafana/provisioning/dashboards"
    cat > "$DATA/grafana/provisioning/datasources/prometheus.yml" <<YML
apiVersion: 1
datasources:
  - {name: Prometheus, uid: prometheus, type: prometheus, access: proxy, url: http://localhost:9090, isDefault: true}
YML
    cat > "$DATA/grafana/provisioning/dashboards/bookstore.yml" <<YML
apiVersion: 1
providers:
  - {name: bookstore, folder: Bookstore, type: file, options: {path: $ROOT/monitoring/grafana/dashboards}}
YML
    GF_HOME="$(brew --prefix grafana 2>/dev/null)/share/grafana"
    GF_PATHS_DATA="$DATA/grafana" GF_PATHS_PROVISIONING="$DATA/grafana/provisioning" \
    GF_SERVER_HTTP_PORT=3000 \
      pm2 start "$(command -v grafana)" --name mon-grafana --interpreter none -- server --homepath "$GF_HOME" >/dev/null
    echo "Grafana:      http://localhost:3000/d/bookstore-overview  (admin/admin on first login)"
  else
    echo "(Grafana not installed - optional: brew install grafana)"
  fi
  pm2 save >/dev/null 2>&1 || true
  echo "Prometheus:   http://localhost:9090/alerts"
  echo "Alertmanager: http://localhost:9093"
  echo "Alerts log:   tail -f $DATA/alerts.log"
}

case "$CMD" in
  up) up ;;
  down) pm2 delete mon-alert-receiver mon-alertmanager mon-prometheus mon-grafana 2>/dev/null || true ;;
  status) pm2 ls ;;
  *) echo "usage: $0 up|down|status" >&2; exit 2 ;;
esac
