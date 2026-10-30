# Public alpha release checklist

The owner authorized publication of the portfolio and standalone MightyMatica
alpha on 2026-10-30. The current UI is accepted for sharing; later polish remains
possible. This checklist preserves the verification and rollback contract.

## Before publishing

- Review the complete dirty and untracked working tree. Include intended source,
  assets, tests, and tooling; exclude local agent handoffs and private diagnostics.
  Do not discard unrelated work to prepare the release.
- Run `npm run check` for TypeScript and deterministic unit coverage.
- Run `npm run build`. Its postbuild checks validate emitted lazy-loading
  boundaries and transfer budgets, then regenerate
  `docs/preproduction/performance-budget.md`. Review that generated result.
- Preview the newly built `dist`, not an older preview artifact. An existing
  preview service may already own port 4173; see [preview service](preview-service.md).
- Confirm canonical and social metadata target the intended public domain.
  Open Graph and Twitter image metadata use the stable absolute URL
  `https://ignatremizov.com/assets/social/portfolio.jpg`, served unchanged from
  `public/assets/social/portfolio.jpg`. Confirm that URL returns the JPEG on
  the deployed host and verify a real share preview before announcing the site.
  The social derivative preserves the original hero composition at 1200 × 511,
  is 123,375 bytes, and leaves `images/field-arch-hero.jpg` unchanged.

## Manual acceptance

These are outstanding manual checks, not verified behavior from this pass.
No browser automation or interactive visual verification was performed.

- Open the landing page with JavaScript disabled and with the shell module
  blocked. The complete portfolio, contact links, and skip link must remain useful.
- With JavaScript enabled, enter the world by keyboard. Check visible focus,
  loading feedback, and the ability to open and close the portfolio, atlas,
  terminal, help, and settings without losing keyboard access.
- Simulate a failed world-module request and unavailable WebGL separately.
  The loading screen must give way to the landing page, with readable recovery
  copy and an available portfolio. Retry the gate. A recovery dialog must keep
  its focus; otherwise focus should return to the gate when no newer action owns it.
- Interrupt a lazy module load after entering the world. Check the refresh /
  portfolio notice, dismissal, and recovery without automatically reloading or
  clearing progress.
- At narrow phone widths and browser zoom, check landing copy, portfolio,
  terminal, dialogs, controls, and touch-safe areas for clipping or overlap.
  Check reduced motion and high contrast. Do not infer visual accessibility
  from a successful build alone.
- Exercise low, medium, and high quality, all four main worlds, and the separately
  loaded Mightymatica room. Check travel in both directions and the restored
  exhibits. Confirm Three.js does not load before entering the world and that
  Mightymatica remains separate until its route is prepared or entered.
- Check touch movement alongside a second-finger interaction, keyboard movement,
  terminal cancellation, and input recovery after closing overlays.
- Earn progression, reload, and verify recovery. Check storage-unavailable mode.
  Only test destructive progress reset with a disposable browser profile.
- Watch for reproducible frame drops on desktop and a representative phone.
  If needed, use the opt-in [performance capture](performance-capture.md); do not
  treat build transfer budgets as proof of smooth gameplay.

## Publishing and rollback

Release preparation corrected the old `legacy` / `gh-pages:/` source to GitHub
Actions and assigned the custom domain `ignatremizov.com`. DNS and GitHub's
certificate issuance must finish before HTTPS enforcement and final verification.
The prior publicly pushed source checkpoint was `130dc95`; local gameplay
checkpoints were preserved and are included in the approved release.

The standalone MightyMatica source now lives separately in
`/home/ignat/code/mightymatica`. To serve it below this portfolio's custom-domain
root, the workflow checks out its reviewed pinned revision and composes its built
output into `dist/mightymatica/` before uploading one combined artifact.
MightyMatica also has its own Pages deployment at
`https://ignatremizov.github.io/mightymatica/`. No account user site or
cross-project domain inheritance is assumed.

1. Review the final diff and all check results with the owner. Record unresolved
   alpha limitations before approving publication.
2. Publication approval is recorded above. The Pages workflow deploys pushes to
   `gh-pages` and also supports manual dispatch with an explicit MightyMatica
   revision override. Its checked-in default is an immutable release commit.
3. Watch the Pages build and deployment jobs. Confirm the published root, linked
   assets, canonical URL, portfolio fallback, and lazy world entry on the actual
   public host. Verify the social image there.
4. Record the deployed commit and retain the last known-good commit for rollback.
   A rollback is a new reviewed deployment, not a hard reset of a dirty worktree.
   Existing tabs can reference older hashed chunks; recovery offers an explicit
   refresh and must not erase saved progression.

## Shell-polish verification scope

The small startup recovery change replaces raw renderer/import exceptions in
landing copy with actionable retry and portfolio guidance, keeps the exception
in the developer console, and conditionally restores keyboard focus after failure.
It does not change gameplay, rendering, progression, or loading boundaries.
The social-image follow-up adds a resized, metadata-stripped JPEG derivative
of the existing hero and absolute Open Graph / Twitter image metadata, including
image descriptions. No new artwork was created.

The shell worker performed source/diff inspection and whitespace validation.
The combined validation on 2026-10-30 subsequently passed:

- `npm run check`: TypeScript verification and all 252 tests.
- `npm run build`: production bundling, lazy-loading boundaries, compressed
  transfer gates, and performance-budget regeneration. The existing large
  game-chunk warning remains.
- Stable social-image accounting, including a regression protecting the
  conservative transfer estimate from omission and double counting.
- Combined local preview with the standalone collection at `/mightymatica/`.
  Six responses per preview host matched the built bytes; book, film, and native
  drawing-module HEAD checks also passed on localhost and private Tailscale.

The existing preview processes were not restarted. No browser automation,
interactive checks, commit, push, deployment, or remote configuration changes
were performed. The manual acceptance and publishing gates above remain open.
