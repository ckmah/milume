---- MODULE MoranContrast ----
\* Data stages of the milume Squidpy Moran's I recipe (ileum MERFISH, Xu 2026).
\* The fork is which cells the graph and the score see: all cells, or enterocytes only.
\* Outcome values (Erbb3 high/low, Apob high) hold here by construction;
\* the real Moran's I numbers come from the notebook run, not from this model.
VARIABLES stage, cells, erbb3, apob
vars == <<stage, cells, erbb3, apob>>

Init == stage = "tissue" /\ cells = "none" /\ erbb3 = "unknown" /\ apob = "unknown"

\* sq.gr.spatial_neighbors_knn(adata, n_neighs=6, percentile=99)
GraphAllCells == stage = "tissue" /\ stage' = "graph" /\ cells' = "all" /\ UNCHANGED <<erbb3, apob>>
\* ent = adata[adata.obs.cell_type.str.startswith("Enterocyte")].copy(); same graph call on ent
GraphEnterocytes == stage = "tissue" /\ stage' = "graph" /\ cells' = "enterocytes" /\ UNCHANGED <<erbb3, apob>>

\* sq.gr.spatial_autocorr(adata, mode="moran", n_perms=100) -> uns["moranI"]
\* Erbb3 is high wherever epithelium is, so its score depends on which cells are scored.
\* Apob rises toward the villus tip inside enterocytes, so it stays high either way.
ScoreMoran == stage = "graph" /\ stage' = "scored"
              /\ erbb3' = (IF cells = "all" THEN "high" ELSE "near zero")
              /\ apob' = "high"
              /\ UNCHANGED cells

Done == stage = "scored" /\ UNCHANGED vars

Next == GraphAllCells \/ GraphEnterocytes \/ ScoreMoran \/ Done

Spec == Init /\ [][Next]_vars

\* ---- Rules a reader can check ----
TypeOK == stage \in {"tissue", "graph", "scored"} /\ cells \in {"none", "all", "enterocytes"}
          /\ erbb3 \in {"unknown", "high", "near zero"} /\ apob \in {"unknown", "high"}
\* The graph is built on exactly the cells that get scored.
GraphPicksTheCells == (stage = "tissue") <=> (cells = "none")
\* Scores exist only after a graph exists.
ScoresNeedGraph == (erbb3 # "unknown") <=> (stage = "scored")
\* Erbb3 looks spatial only when every cell type is in the graph.
Erbb3HighOnlyAcrossCellTypes == erbb3 = "high" => cells = "all"
\* Apob stays spatial in both runs.
ApobHighInBothRuns == stage = "scored" => apob = "high"
====
