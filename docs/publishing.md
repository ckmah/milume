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
