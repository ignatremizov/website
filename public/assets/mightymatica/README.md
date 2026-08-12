# Mightymatica runtime assets

This directory contains exact recovered raster material for the browser-native
Mightymatica vertical slice. The body image is decoded losslessly from the XFL media
record; the other files are copied without visual modification from the preservation
workspace.

| Recovered asset | Preservation source | SHA-256 | Runtime role |
| --- | --- | --- | --- |
| `pythagoras-body-original.png` | `mightymatica-source-recovery/original-sources/github/ignatremizov-Figure/extracted-fla/head-FallingFigure-Old/bin/M 15 1416604004.dat` (`Pifagor/Pifagor-body.png`) | `5cafc2fb9502d0ebb5afaeff045158f094438c70dce587b357fd411acb3381e7` | Exact 348×452 body decoded from the FLA's chunked ARGB media. Loaded beneath high-resolution Canvas overlays using the original XFL transforms. |
| `pythagoras-atlas.png` | `mightymatica-source-recovery/original-sources/github/ignatremizov-Figure/snapshots/f5e6221-initial-source/assets/Pifagor/Pifagor.png` | `15d99f5ae7783992848f3a07dcb192ca10d73defadda1a0d40a13fef616bbf52` | Complete animation-atlas preservation reference; not loaded by the runtime. |
| `mind-reader-original.jpg` | `mightymatica-source-recovery/objects/Movies/Mindread/resources/images/1.jpg` | `e41a22237554dc400502a56095f3bbca9be317520792bba432818136b3bc2671` | Loaded as the original photograph in the Mind Reader station. |

The complete SWF, XFL, ActionScript, FLA, audio, and extraction provenance
remain in the separate Mightymatica archive and source-recovery workspaces.
These optimized runtime selections are not substitutes for that archive.
