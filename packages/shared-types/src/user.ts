export interface UserProfile {
  id: string;
  /** Teams / Entra ID object id */
  aadObjectId: string;
  displayName: string;
  avatarUrl?: string;
  rating: number;
  /** 段位 ID，如 "bronze-1" / "diamond-3" */
  rankId: string;
}
