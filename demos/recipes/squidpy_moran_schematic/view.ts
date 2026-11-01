// Reader's view of the Squidpy Moran's I recipe.
export const title =
  "Erbb3 is spatial only because epithelium sits in one place; Apob stays spatial inside enterocytes";

export const state = (v) => {
  switch (v.stage) {
    case "tissue":
      return "Cells in tissue, log-normalized X";
    case "graph":
      return v.cells === "all"
        ? "Every cell linked to its 6 nearest cells"
        : "Each enterocyte linked to its 6 nearest enterocytes";
    case "scored":
      return v.cells === "all"
        ? "All cells: Erbb3 high, Apob high"
        : "Enterocytes only: Erbb3 near zero, Apob still high (rises toward the villus tip)";
  }
};

export const step = (action, from, to) => {
  switch (action) {
    case "GraphAllCells":
      return "sq.gr.spatial_neighbors_knn(adata, n_neighs=6, percentile=99)";
    case "GraphEnterocytes":
      return 'ent = adata[adata.obs.cell_type.str.startswith("Enterocyte")].copy(), then same call on ent';
    case "ScoreMoran":
      return from.cells === "all"
        ? 'sq.gr.spatial_autocorr(adata, mode="moran", n_perms=100)'
        : "same call on ent, genes in ≥5% of enterocytes";
    case "Done":
      return "done";
  }
  return null;
};

export const group = (v) =>
  ({ tissue: "Data", graph: "Neighbors", scored: v.cells === "all" ? "All cells" : "Enterocytes" })[v.stage];

export const colors = { Data: "tan", Neighbors: "blue", "All cells": "purple", Enterocytes: "teal" };
