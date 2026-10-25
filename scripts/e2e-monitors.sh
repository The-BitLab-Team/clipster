#!/usr/bin/env bash
# E2E de vários monitores e escala (SPEC §19.4): sobe um servidor X com o driver "dummy"
# (16 saídas virtuais), liga duas e roda tests/e2e/monitors.spec.ts. Só Linux; precisa do
# pacote xserver-xorg-video-dummy, do xrandr (x11-xserver-utils) e de permissão para
# iniciar o Xorg (normalmente root ou Xorg.wrap configurado).
set -euo pipefail

cd "$(dirname "$0")/.."
DISPLAY_NUMBER="${CLIPSTER_DISPLAY:-:97}"
LOG="$(mktemp -t clipster-xorg-XXXXXX.log)"

Xorg "$DISPLAY_NUMBER" -noreset -nolisten tcp -config "$PWD/scripts/xorg-dummy.conf" \
  -logfile "$LOG" >/dev/null 2>&1 &
XORG_PID=$!
trap 'kill "$XORG_PID" 2>/dev/null || true' EXIT

for _ in $(seq 1 50); do
  DISPLAY="$DISPLAY_NUMBER" xrandr >/dev/null 2>&1 && break
  sleep 0.1
done

export DISPLAY="$DISPLAY_NUMBER"
xrandr --fb 3840x1200
xrandr --output DUMMY0 --mode 1920x1080 --pos 0x0 --primary
xrandr --addmode DUMMY1 1920x1200
xrandr --output DUMMY1 --mode 1920x1200 --pos 1920x0
# O driver "dummy" só atualiza a lista de monitores quando alguém a consulta.
xrandr --listmonitors

CLIPSTER_E2E_XRANDR=1 npx playwright test tests/e2e/monitors.spec.ts "$@"
