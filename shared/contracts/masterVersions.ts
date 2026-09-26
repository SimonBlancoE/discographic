export type MasterVersion = {
  releaseId: number;
  title: string;
  label: string | null;
  catno: string | null;
  country: string | null;
  format: string | null;
  released: string | null;
  thumb: string | null;
  have: number | null;
  want: number | null;
  /** Local collection row id when the user owns this pressing. */
  localReleaseId: number | null;
  /** True when the pressing is an active entry in the user's Wantlist (Radar). */
  inRadar: boolean;
};

export type MasterVersionsResponse = {
  masterId: number | null;
  total: number;
  versions: MasterVersion[];
};
