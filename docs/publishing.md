# Publishing

One-time setup (trusted publishing — no API tokens in GitHub secrets):

1. **GitHub environments** — repo Settings → Environments → create `testpypi` and `pypi`.
   Optionally add required reviewers on `pypi` so production uploads need approval.

2. **TestPyPI** — [test.pypi.org](https://test.pypi.org) → Account settings → Publishing →
   add trusted publisher:
   - Project: `milume`
   - Owner: `ckmah`, repo: `milume`
   - Workflow: `publish-test.yml`, environment: `testpypi`

3. **PyPI** — [pypi.org](https://pypi.org) → same, with workflow `publish.yml`, environment: `pypi`.
   The project must exist on PyPI before the first trusted publish (upload once manually or
   register the name first).

## Release flow

0. **Before asking Clarence to test the release branch:** in a fresh venv with the
   release-branch build, run the in-repo demo notebook headless and confirm every cell
   runs with no errors and the widget renders. From a checkout of the release branch:

```bash
scripts/release-demo-check.sh demos/landmarks.py
```

   It builds the frontend and wheel (as `publish.yml` does), installs the wheel plus the
   notebook's PEP 723 dependencies (minus `milume`) into a fresh venv, runs
   `marimo export html demos/landmarks.py`, and prints `PASS` only when marimo exits 0, no
   cell has an error output or traceback, and a `LandmarksWidget` model with its ESM is
   in the export. Report the cell count, error count and widget line with the head SHA.
   Don't test with `pip install "milume @ git+https://…"`: `milume/static/bundled/` is
   gitignored, so that install has no widget bundle and `import milume` fails. Don't use
   `uv run` / `marimo edit --sandbox` on the demo either; its header resolves `milume`
   from PyPI, not the release branch.

1. Dry run on TestPyPI first: Actions → **Publish (TestPyPI)** → Run workflow, then:

```bash
pip install -i https://test.pypi.org/simple/ --extra-index-url https://pypi.org/simple/ milume
```

2. Trigger publish on PyPI:

```bash
# bump milume/__init__.py __version__
git commit -am "Release 0.1.1"
git tag v0.1.1
git push && git push origin v0.1.1   # triggers publish.yml → PyPI
```

## Preview builds of a branch

Every push to a `feat/**` branch runs `preview-wheel.yml`, which builds the branch into
the rolling prerelease `preview-<branch>` (slashes become dashes). The wheel is always
`milume-0.0.0.dev0-py3-none-any.whl`, so its URL never changes, and
`milume/static/bundled/BUILD` holds the commit it was built from. To let testers open the
branch's demo in one click, commit this to the branch's `demos/landmarks.py` header in
place of the PyPI pin:

```python
#     "milume @ https://github.com/ckmah/milume/releases/download/preview-feat-lazy-genes/milume-0.0.0.dev0-py3-none-any.whl",
# ]
# [tool.uv]
# reinstall-package = ["milume"]
# ///
```

`reinstall-package` makes uv fetch the wheel again on each run instead of reusing the
first build it cached. Share `https://molab.marimo.io/github/ckmah/milume/blob/<branch>/demos/landmarks.py`
(Run on Server). The `demo-pins` check (`scripts/check-demo-pins.sh`) is required on
`main` and also runs in `publish.yml`, so drop those lines before the branch merges.
Deleting the branch deletes its prerelease and tag.

