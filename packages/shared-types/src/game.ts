/** 4 个固定座位（北/东/南/西），队友为对面玩家：N&S vs E&W。 */
export type Seat = 'N' | 'E' | 'S' | 'W';

/** 当前升打的级牌（2~A）。掼蛋以 2 起打，至 A 通关。 */
export type GameLevel =
  | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10'
  | 'J' | 'Q' | 'K' | 'A';

/** 一局对局的阶段。 */
export type GamePhase =
  | 'idle'        // 未开始
  | 'dealing'     // 发牌
  | 'tribute'     // 进贡 / 抗贡
  | 'playing'     // 正常出牌
  | 'settling'    // 结算
  | 'finished';   // 结束

export interface PlayerSnapshot {
  userId: string;
  seat: Seat;
  handCount: number;
  isOffline: boolean;
  isAuto: boolean; // 是否托管
  isBot?: boolean;
  botDifficulty?: 'easy' | 'normal' | 'hard';
}

/** 单次对局的公开状态（座位、阶段、当前回合、桌面顶张），所有玩家都能看到。 */
export interface PublicGameState {
  roomId: string;
  level: GameLevel;
  phase: GamePhase;
  /** 当前出牌座位，null 表示尚未开局或已结束。 */
  turnSeat: Seat | null;
  /** 当前墩的"顶张"（上一手非 pass 的牌），新墩为 null。 */
  currentTrickTop: { seat: Seat; cardIds: string[] } | null;
  /** 自上次非 pass 出牌后连续 pass 的次数（用于"3 pass 收墩"判定）。 */
  consecutivePasses: number;
  players: PlayerSnapshot[];
  /** 已"出完牌"的座位顺序（首个为头游）。 */
  finishedOrder: Seat[];
}

/** 私有视图：仅自己的手牌。 */
export interface PrivateHandView {
  /** 收件人的座位（null 表示尚未入座或观战）。 */
  seat: Seat | null;
  /** 持有的牌 ID 列表。 */
  cardIds: string[];
}

/** 服务端给单个 socket 推送的完整游戏快照。 */
export interface GameStateSnapshot {
  public: PublicGameState;
  private: PrivateHandView;
}
