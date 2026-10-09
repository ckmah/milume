# Design — Landing (Persuade)

<!-- Development contract for website/landing. Not served to browsers. -->

## Direction contract

**THESIS:** The first viewport is a dim fluorescence console: the LandmarksWidget tissue scatter *is* the light. Refuse SaaS metric heroes, cream editorial templates, and purple neon tool marketing.

**OWN-WORLD:** Deep instrument graphite field (`#0a0e12` → `#121820`), soft phosphor mint accent (`#5ec4a8`), warm tungsten secondary for quiet UI chrome (`#c4a574`). Display face **Unbounded**; body **Source Sans 3**; code **Source Code Pro**. No cards in the hero; no floating badges on media.

**STORY:** Visitor understands milume is notebook widgets synced to Python analysis, believes the screenshot is real product chrome, and acts via Install / Docs / Demo.

**FIRST VIEWPORT:** Full-bleed dark LandmarksWidget still as the visual plane. Brand wordmark **milume** at hero scale (top-left of copy stack). One headline line about synced notebook widgets for spatial omics. One supporting sentence (AnnData / landmarks / selections). CTA group: copyable `pip install milume`, Docs, Open demo. No stats, no cards, no eyebrow.

**FORM:** Fluorescence instrument console (plan seed; code-led unattended build). Seed key: `unattended-option-a-instrument-2026-09`.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with a local assemble preview, screenshots under the Project store `media/site/`, and this DESIGN file describing the shipped world.

## Palette

| Token | Hex | Role |
| --- | --- | --- |
| `--ink` | `#0a0e12` | Page field |
| `--panel` | `#121820` | Panel / footer |
| `--line` | `#243040` | Hairline separators |
| `--fog` | `#9db0c0` | Secondary text |
| `--paper` | `#e8eef4` | Primary text |
| `--phosphor` | `#5ec4a8` | Accent / primary CTA |
| `--phosphor-ink` | `#06241c` | Text on accent |
| `--tungsten` | `#c4a574` | Secondary accent (links, focus) |

## Typography

- Display: Unbounded 600–700, clamp ~2.75–4.5rem, tracking ≥ -0.03em
- Body: Source Sans 3, ~1.125rem / 1.55
- Code: Source Code Pro for install command

## Motion

One authored moment: hero copy and CTAs rise slightly with a short blur fade on load; hero media has a slow opacity settle. Honor `prefers-reduced-motion` by disabling both.
