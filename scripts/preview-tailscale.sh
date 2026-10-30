#!/usr/bin/env bash
# Ordinary TCP forwarding to the existing preview, bound ONLY to this device's
# Tailscale IPv4 address. No Serve, Funnel, DNS, or firewall configuration.
set -euo pipefail

if [[ $# -gt 1 || ( $# -eq 1 && "$1" != "--check" ) ]]; then
  printf 'Usage: %s [--check]\n' "$0" >&2
  exit 2
fi

for tool in tailscale socat timeout; do
  if ! command -v "$tool" >/dev/null; then
    printf 'Tailscale preview: missing required utility %s.\n' "$tool" >&2
    exit 1
  fi
done

if ! address="$(timeout 5s tailscale ip -4)"; then
  printf 'Tailscale preview: IPv4 address unavailable; the service will retry.\n' >&2
  exit 1
fi
# Fail closed: an empty/malformed address must never become a wildcard listener.
if [[ ! "$address" =~ ^100\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$ ]]; then
  printf 'Tailscale preview: expected one 100.64.0.0/10 IPv4 address.\n' >&2
  exit 1
fi
if (( 10#${BASH_REMATCH[1]} < 64 || 10#${BASH_REMATCH[1]} > 127 ||
      10#${BASH_REMATCH[2]} > 255 || 10#${BASH_REMATCH[3]} > 255 )); then
  printf 'Tailscale preview: refusing an address outside 100.64.0.0/10.\n' >&2
  exit 1
fi
if [[ "$address" != "100.$((10#${BASH_REMATCH[1]})).$((10#${BASH_REMATCH[2]})).$((10#${BASH_REMATCH[3]}))" ]]; then
  printf 'Tailscale preview: refusing ambiguous IPv4 notation.\n' >&2
  exit 1
fi

printf 'Tailscale preview: http://%s:4173/ -> http://127.0.0.1:4173/\n' "$address"
if [[ "${1:-}" == "--check" ]]; then exit 0; fi

# Keep the proxy itself as MainPID; systemd owns and cleans up forked connections.
exec socat "TCP4-LISTEN:4173,bind=${address},reuseaddr,fork,max-children=64" \
  "TCP4:127.0.0.1:4173,connect-timeout=5"
