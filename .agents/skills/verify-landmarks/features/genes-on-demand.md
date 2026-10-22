# genes-on-demand

Gene colouring with a names-only catalog: each gene loads over `_gene_get` when it is
first coloured, into a byte-budgeted LRU; 4–8 genes colour by one aggregate (issue #241).

**Specs:** `frontend/e2e/landmarks/landmarks-genes-lazy.spec.ts` (harness, simulated
`_gene_get` in `dev/mock-model.ts`; `?eagerGenes=1` keeps the `genes=` pack),
`frontend/e2e/marimo/api.spec.ts` (real kernel reply, binary buffers),
`frontend/src/widgets/landmarks/gene-store.test.mjs` (fetch batching, LRU, aggregate),
`tests/test_genes.py` (names-only construct, slice correctness, size gate, `genes=` path).

## Proof

- Boot: `gene_names` entries are `{name}` only, `gene_csc_data` is empty, `__geneRequests()` is `[]`.
- One gene picked: one request, `getGeneStats().denseColumns === 1`, point colours change.
- Five genes: `genes-aggregate` shows Mean / Median / Max; each changes point colours on one magenta ramp.
- No whole-matrix densify: after 18 genes cycled three at a time, `denseColumns === 3`.
- Fetch failure (`__geneCommHook.fail`): `genes-load-status` names the gene.
