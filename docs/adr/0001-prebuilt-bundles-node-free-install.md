# Pre-built widget bundles for node-free install

React widgets need a Node toolchain to compile, but notebook users should not.
Bundles are built in CI and shipped inside the wheel via Hatch artifacts. Authors
run `npm run build` locally for development; CI rebuilds frontend on every run to
verify bundles match source. Consumers only `pip install milume`.

**Considered:** build bundles at `pip install` time (requires Node on every install);
fetch bundles from a CDN at runtime (network dependency, versioning pain); inline
React via EsmWidget CDN imports (no shadcn/Tailwind without a build step); commit
bundles to git (clutters PRs with generated output).

**Consequences:** widget authors must run `npm run build` before local testing.
Bundles are not committed to git — CI builds fresh on every run. The wheel ships
pre-built bundles so consumers never need Node.
