# spatial-rx (deprecated)

spatial-rx is now **[Milume](https://github.com/ckmah/milume)**: a thinking surface for
spatial omics. This release only depends on `milume` and re-exports it as `spatial_rx`
with a `DeprecationWarning`.

```bash
pip uninstall spatial-rx
pip install milume
```

```python
import milume   # was: import spatial_rx
```
