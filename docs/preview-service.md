# Persistent local preview

`website-preview-4173.service` serves the existing production build at
`http://127.0.0.1:4173/`, and also at `http://<tailscale-ip>:4173/` for phone testing.
They belong to the systemd user manager, not an MCP command, terminal, or browser
process. Connect Tailscale on the phone and use the computer's numeric IPv4 address
from `tailscale ip -4`; no hostname, Tailscale Serve, or Funnel is needed.

The persistent unit is installed at
`~/.config/systemd/user/website-preview-4173.service`, enabled under `default.target`.
The repository template is `scripts/systemd/website-preview-4173.service`; its launcher
is `scripts/preview-service.sh`.

The main unit starts `website-preview-tailscale-4173.service` as a companion. Its
launcher, `scripts/preview-tailscale.sh`, uses the already-installed `socat` to forward
only the computer's Tailscale IPv4 address on port 4173 to the existing loopback
preview. It does not start a second Vite server. The companion follows explicit
stops and restarts of the main unit; the main server remains independent of proxy
failure or unavailable Tailscale connectivity.

## Startup and recovery

- With the current `Linger=no` setting, it starts at the first user sign-in after
  a reboot. It is not an unattended, pre-login boot service. Enabling lingering is
  an account-wide change affecting other enabled user services, not just this one;
  it is intentionally left unchanged.
- The launcher resolves the installed NVM `default` alias each time it starts.
  It does not depend on an interactive shell or a hard-coded Node patch version.
  Without NVM it uses Node from the unit's explicit system PATH. The project
  requires Node >=22.12.0.
- The direct Node server becomes the unit's MainPID. Unexpected clean exits and
  failures restart after five seconds. Automatic retries do not permanently stop
  because of a start-rate limit. An explicit `systemctl --user stop` still stops it.
- Logs go to the journal, with no dependency on a directory in `/tmp`. Journal
  retention follows the machine's journald configuration.
- The listener stays on IPv4 loopback and uses `--strictPort`. A port conflict
  produces a logged failure and retry, never a silent switch to another port.
- The companion resolves `tailscale ip -4` on each startup, validates that it is
  exactly one address in `100.64.0.0/10`, and binds only that address. It retries
  every five seconds when the address/interface is not ready or its port is busy.
  It never falls back to `0.0.0.0`, a LAN address, or a different port. Localhost
  remains available while Tailscale is unavailable. Changing the device's address
  while the listener is already running requires restarting the companion.
- No Tailscale daemon settings, access rules, DNS, firewall rules, Serve, or Funnel
  configuration are changed. Access still depends on the existing Tailscale
  connection and permissions. This is ordinary HTTP over the Tailscale connection.
- Dependencies and `dist/index.html` must already exist. Startup never installs
  packages or builds the application. Missing prerequisites produce a clear error
  and retry after the normal delay.

## Install or update the unit

From `~/code/website`:

```sh
bash scripts/preview-service.sh --check
bash scripts/preview-tailscale.sh --check
systemd-analyze --user verify "$PWD/scripts/systemd/website-preview-4173.service" \
  "$PWD/scripts/systemd/website-preview-tailscale-4173.service"
install -m 0644 scripts/systemd/website-preview-tailscale-4173.service \
  ~/.config/systemd/user/website-preview-tailscale-4173.service
install -m 0644 scripts/systemd/website-preview-4173.service \
  ~/.config/systemd/user/website-preview-4173.service
systemctl --user daemon-reload
systemctl --user enable --now website-preview-4173.service
systemctl --user start website-preview-tailscale-4173.service
```

When updating an already-running persistent unit, restart it after `daemon-reload`
to apply startup-command changes. When migrating an existing **transient** unit of
the same name, stop that specific unit before `daemon-reload` so its higher-priority
runtime definition is released. Neither operation requires restarting MCP or the
computer.

Adding the companion to an already-running main preview needs only `daemon-reload`
and `start website-preview-tailscale-4173.service`; it does not require restarting
the main server. The companion is static and is started through the main unit's
`Wants=` dependency at future sign-ins.

## Ordinary use

```sh
systemctl --user status website-preview-4173.service
systemctl --user status website-preview-tailscale-4173.service
journalctl --user -u website-preview-4173.service -n 50 --no-pager
journalctl --user -u website-preview-tailscale-4173.service -n 50 --no-pager
tailscale ip -4
npm run build
```

Successful builds replace the files being served; refresh the browser for new
content-hashed modules. No service restart is needed for a normal build. Browser
progress is separate from this stateless server; refreshing still resets transient
world state.

The phone uses a separate browser/origin, so desktop progression is not copied to
it. To check both network paths without browser automation:

```sh
curl --noproxy '*' -I http://127.0.0.1:4173/
curl --noproxy '*' -I "http://$(tailscale ip -4):4173/"
```

To stop only remote access for this session, leave the main preview running and use
`systemctl --user stop website-preview-tailscale-4173.service`. For a persistent
local-only configuration, stop the companion, remove the main unit's `Wants=` line,
and run `systemctl --user daemon-reload`. Keep the repository template in sync with
that durable change.

To stop serving and disable automatic startup without removing configuration:

```sh
systemctl --user disable --now website-preview-4173.service
```

## Validation performed

The September 22, 2026 migration verified unit syntax, prerequisite resolution with
an empty environment except HOME/USER/PATH, persistent enablement, HTTP readiness,
and automatic recovery after terminating only the identified preview process.
No logout or reboot was performed. Reboot behavior is established from the enabled
persistent unit and user-manager lifecycle, not an end-to-end reboot test.


The direct-IP companion was added later on September 22 without restarting the
main preview. Both exact listeners were observed, and all ten current production
HTML/chunk/CSS/media files matched `dist` through both addresses. Shell/unit checks,
clean-environment preflight, and fourteen fail-closed launcher cases passed. These
HTTP checks were run on the computer, not from the phone; existing access controls
were not changed or tested end-to-end from another device.
