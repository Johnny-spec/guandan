import {
  buildDeck,
  cardId,
  dealHands,
  decodeCardId,
  recognize,
  shuffle,
  validatePlay,
  type Card,
} from '@teams-guandan/game-engine';
import type {
  GameLevel,
  GameStateSnapshot,
  PlayerSnapshot,
  PrivateHandView,
  PublicGameState,
  Seat,
} from '@teams-guandan/shared-types';

const SEAT_ORDER: readonly Seat[] = ['N', 'E', 'S', 'W'] as const;

function nextSeat(seat: Seat): Seat {
  const i = SEAT_ORDER.indexOf(seat);
  return SEAT_ORDER[(i + 1) % 4]!;
}

function teamOf(seat: Seat): 'NS' | 'EW' {
  return seat === 'N' || seat === 'S' ? 'NS' : 'EW';
}

export interface PlayResult {
  ok: true;
  finished: boolean;
  trickClosed: boolean;
  nextLead?: Seat;
  winnerTeam?: 'NS' | 'EW';
}

export interface PlayError {
  ok: false;
  code: string;
  message: string;
}

/**
 * 单局对局会话：拥有 4 家手牌、当前回合、桌面顶张、连续 pass 数等可变状态。
 * 不直接处理网络 I/O；外层 Gateway 把事件翻译进来。
 */
export class GameSession {
  readonly roomId: string;
  readonly level: GameLevel;
  private readonly hands: Map<Seat, Card[]> = new Map();
  private readonly seatOf: Map<string, Seat>;
  private turn: Seat;
  private top: { seat: Seat; cards: Card[] } | null = null;
  private consecutivePasses = 0;
  private finishedOrder: Seat[] = [];
  private phase: PublicGameState['phase'] = 'playing';

  constructor(
    roomId: string,
    level: GameLevel,
    seatToUser: Map<Seat, string>,
    rng: () => number = Math.random,
  ) {
    this.roomId = roomId;
    this.level = level;
    const deck = shuffle(buildDeck(), rng);
    const [h0, h1, h2, h3] = dealHands(deck);
    this.hands.set('N', h0);
    this.hands.set('E', h1);
    this.hands.set('S', h2);
    this.hands.set('W', h3);
    this.seatOf = new Map();
    for (const [s, u] of seatToUser) this.seatOf.set(u, s);
    // Phase 1：固定北家先出，后续 Phase 1.5 改为"持红心 3 的玩家"或"上局头游"
    this.turn = 'N';
  }

  seatForUser(userId: string): Seat | null {
    return this.seatOf.get(userId) ?? null;
  }

  /** 出牌；返回成功/失败 + 收墩 / 整局结束信号。 */
  play(seat: Seat, cardIds: string[]): PlayResult | PlayError {
    if (this.phase !== 'playing')
      return { ok: false, code: 'GAME_NOT_STARTED', message: 'game not active' };
    if (this.turn !== seat)
      return { ok: false, code: 'NOT_YOUR_TURN', message: `turn = ${this.turn}` };

    const cards: Card[] = [];
    for (const id of cardIds) {
      const c = decodeCardId(id);
      if (!c) return { ok: false, code: 'UNKNOWN_CARD', message: id };
      cards.push(c);
    }

    const hand = this.hands.get(seat)!;
    const v = validatePlay(cards, {
      hand,
      currentTrickTop: this.top,
      level: this.level,
    });
    if (!v.ok) return { ok: false, code: 'INVALID_PLAY', message: v.reason ?? 'invalid' };

    // 从手牌移除（按 cardId 多重集）
    const idsToRemove = new Map<string, number>();
    for (const c of cards) idsToRemove.set(cardId(c), (idsToRemove.get(cardId(c)) ?? 0) + 1);
    const newHand: Card[] = [];
    for (const c of hand) {
      const id = cardId(c);
      const left = idsToRemove.get(id) ?? 0;
      if (left > 0) {
        idsToRemove.set(id, left - 1);
      } else {
        newHand.push(c);
      }
    }
    this.hands.set(seat, newHand);

    this.top = { seat, cards };
    this.consecutivePasses = 0;

    let finished = false;
    let winnerTeam: 'NS' | 'EW' | undefined;
    if (newHand.length === 0 && !this.finishedOrder.includes(seat)) {
      this.finishedOrder.push(seat);
      if (this.finishedOrder.length === 1) {
        // Phase 1 简化：首位出完即结束整局，按其阵营定胜负
        finished = true;
        winnerTeam = teamOf(seat);
        this.phase = 'finished';
      }
    }

    // 推进回合：跳过已出完牌的座位
    if (!finished) {
      this.turn = this.advance(seat);
    }
    return { ok: true, finished, trickClosed: false, winnerTeam };
  }

  /** Pass；若 3 家连 pass，收墩，墩主续手。 */
  pass(seat: Seat): PlayResult | PlayError {
    if (this.phase !== 'playing')
      return { ok: false, code: 'GAME_NOT_STARTED', message: 'game not active' };
    if (this.turn !== seat)
      return { ok: false, code: 'NOT_YOUR_TURN', message: `turn = ${this.turn}` };
    if (this.top === null)
      return { ok: false, code: 'CANNOT_PASS', message: 'no top to pass on' };

    this.consecutivePasses += 1;
    let trickClosed = false;
    let nextLead: Seat | undefined;

    // 在 4 家中，非顶张主有 3 家；3 连 pass 即收墩
    if (this.consecutivePasses >= 3) {
      nextLead = this.top.seat;
      // 若墩主已出完牌，沿座位顺序找下一个还有牌的玩家续手
      if (this.hands.get(nextLead)!.length === 0) {
        nextLead = this.findNextActiveAfter(nextLead);
      }
      this.top = null;
      this.consecutivePasses = 0;
      trickClosed = true;
      this.turn = nextLead!;
    } else {
      this.turn = this.advance(seat);
    }
    return { ok: true, finished: false, trickClosed, ...(nextLead ? { nextLead } : {}) };
  }

  /** 给某 socket 装配快照（含其私有手牌）。 */
  snapshotFor(userId: string, players: PlayerSnapshot[]): GameStateSnapshot {
    const seat = this.seatForUser(userId);
    const priv: PrivateHandView = {
      seat,
      cardIds: seat ? this.hands.get(seat)!.map(cardId) : [],
    };
    const pub: PublicGameState = {
      roomId: this.roomId,
      level: this.level,
      phase: this.phase,
      turnSeat: this.phase === 'finished' ? null : this.turn,
      currentTrickTop: this.top
        ? { seat: this.top.seat, cardIds: this.top.cards.map(cardId) }
        : null,
      consecutivePasses: this.consecutivePasses,
      players,
      finishedOrder: [...this.finishedOrder],
    };
    return { public: pub, private: priv };
  }

  handCount(seat: Seat): number {
    return this.hands.get(seat)?.length ?? 0;
  }

  private advance(from: Seat): Seat {
    let s = nextSeat(from);
    for (let i = 0; i < 4; i++) {
      if (this.hands.get(s)!.length > 0 || s === this.top?.seat) return s;
      s = nextSeat(s);
    }
    return s;
  }

  private findNextActiveAfter(from: Seat): Seat {
    let s = nextSeat(from);
    for (let i = 0; i < 4; i++) {
      if (this.hands.get(s)!.length > 0) return s;
      s = nextSeat(s);
    }
    return from;
  }

  /** 用于 patterns 调试 / AI 接口的只读视图（不暴露其他人手牌）。 */
  publicTop() {
    return this.top
      ? { seat: this.top.seat, cards: this.top.cards.map((c) => ({ ...c })) }
      : null;
  }

  /** 工具：把私有 cardIds 用 recognize 解析（供 AI/服务端日志使用）。 */
  static parseCardIds(ids: string[]): Card[] | null {
    const cards: Card[] = [];
    for (const id of ids) {
      const c = decodeCardId(id);
      if (!c) return null;
      cards.push(c);
    }
    return cards;
  }

  /** 工具：识别牌型（封装 game-engine），供 Gateway 校验/日志。 */
  static recognize(cards: Card[], level: GameLevel) {
    return recognize(cards, level);
  }

  /** 公开的当前回合座位（finished 后为 null）。供 BotService 使用。 */
  publicTurn(): Seat | null {
    return this.phase === 'finished' ? null : this.turn;
  }

  /**
   * 给 Bot 决策用的精简快照：
   *   - 含当前回合 bot 的私有手牌
   *   - 公开的桌面顶张、剩余张数
   * 严格不暴露其他玩家手牌。
   */
  snapshotForBot(): {
    turnSeat: Seat;
    handIds: string[];
    top: { cards: Card[] } | null;
    topSeat: Seat | null;
    remainingCounts: Record<Seat, number>;
  } | null {
    if (this.phase !== 'playing') return null;
    const turnSeat = this.turn;
    const hand = this.hands.get(turnSeat) ?? [];
    const remainingCounts = {
      N: this.handCount('N'),
      E: this.handCount('E'),
      S: this.handCount('S'),
      W: this.handCount('W'),
    };
    return {
      turnSeat,
      handIds: hand.map(cardId),
      top: this.top ? { cards: this.top.cards.map((c) => ({ ...c })) } : null,
      topSeat: this.top ? this.top.seat : null,
      remainingCounts,
    };
  }
}
