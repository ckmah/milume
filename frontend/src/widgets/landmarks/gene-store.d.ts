export declare const GENE_CACHE_BUDGET_BYTES: number;
export declare const GENE_FETCH_BATCH: number;
export type GeneAggregate = "mean" | "median" | "max";
export declare const GENE_AGGREGATES: GeneAggregate[];

export type GeneSlice = {
  name: string;
  vmin: number;
  vmax: number;
  rows: Int32Array;
  values: Float32Array;
};

export type GeneStoreStats = {
  fetches: number;
  fetchedGenes: number;
  densified: number;
  evictions: number;
  lruBytes: number;
  lruGenes: number;
  pinnedGenes: number;
  denseColumns: number;
  denseBytes: number;
  pending: number;
  budgetBytes: number;
};

export type GeneStore = {
  readonly version: number;
  readonly aggregate: GeneAggregate;
  setAggregate(mode: GeneAggregate): void;
  subscribe(fn: () => void): () => void;
  setEager(
    meta: Array<{ name: string; vmin?: number; vmax?: number }>,
    indptr: Int32Array | null,
    indices: Int32Array | null,
    data: Float32Array | null,
  ): void;
  clear(): void;
  dropColumns(): void;
  has(name: string): boolean;
  meta(name: string): { name: string; vmin: number; vmax: number } | null;
  error(name: string): string | null;
  pending(): string[];
  ensure(names: string[]): Promise<void>;
  column(name: string): Float32Array | null;
  stats(): GeneStoreStats;
};

export declare function createGeneStore(opts: {
  nObs: () => number;
  activeNames: () => string[];
  fetchSlices: (names: string[]) => Promise<GeneSlice[]>;
  budgetBytes?: number;
}): GeneStore;
