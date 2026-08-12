# Portfolio Game Concept Pack

Generated with the built-in image generation tool on 2026-08-08. These images are
preproduction references, not production-ready meshes or textures.

## Selected assets

| File | Intended use | Review |
| --- | --- | --- |
| `00-art-direction-anchor.png` | Shared world, camera, lighting, and shape language | Approved |
| `01-world-map.png` | Zone topology and portal-loading concept | Approved; rebuild paths to scale in greybox |
| `02-field-station-keyframe.png` | Hub composition and landmark reference | Approved; differentiate portal colors in implementation |
| `03-luminous-falls-keyframe.png` | Fantasy zone, waterfall, NPC, and traversal reference | Approved |
| `04-signal-grid-keyframe.png` | Systems zone, terminal plaza, and Pong reference | Approved |
| `05-space-archive-keyframe.png` | CRT observatory, market-terminal, and smiley-screen reference | Approved |
| `06-player-equipped-turnaround.png` | Equipped character appearance | Approved as visual reference only |
| `07-player-rigging-turnaround.png` | Clean base character for Meshy/rigging trials | Approved; use this instead of the equipped sheet for auto-rigging |
| `08-npc-lineup.png` | Archivist, Keeper, Tinkerer, and Signal Operator concepts | Approved as silhouette references |
| `09-rune-altar-turnaround.png` | Fantasy prop modeling/Meshy trial | Approved; use the three-quarter view as the primary source |
| `10-signal-terminal-turnaround.png` | Hard-surface prop modeling/Meshy trial | Approved; views are sufficiently consistent |
| `11-material-palette.png` | Blender material families and color direction | Approved; implementation should simplify surface detail |
| `12-modular-kit.png` | Reusable environment-kit inventory | Approved |
| `13-ui-hud-sheet.png` | Entry, HUD, map, terminal, dialogue, and mobile direction | Approved after copy and touch-control correction |

## Review notes

- The environment keyframes form a coherent visual family and maintain a readable
  three-quarter top-down camera.
- The Luminous Falls waterfall is a visual target, not a simulation target. Build it
  from layered ribbons, foam cards, and instanced mist.
- The first player turnaround held a lantern and brought an arm too close to the
  torso. The clean rigging sheet removes handheld and dangling accessories.
- AI-generated turnarounds are design references rather than engineering drawings.
  Minor view-to-view asymmetries must be resolved in Blender.
- The final UI sheet corrects the role, canonical zone names, NPC copy, and mobile
  interaction control. Render all real UI in HTML/CSS rather than baking this image
  into the site.
- Keep this directory outside the deployed asset tree. Production models, textures,
  and UI should be exported separately after optimization.

See `PROMPTS.md` for the prompt set and generation lineage.
