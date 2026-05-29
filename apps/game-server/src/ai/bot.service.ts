import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Seat } from '@teams-guandan/shared-types';
import { RoomService, type Room } from '../game/room.service.js';
import { decideMove, decodeHand, type Difficulty } from './strategy.js';
import type { PlayResult, PlayError } from '../game/game.session.js';

/** Bot 决策结果，由 BotService.driveOne 返回给 Gateway 用于广播。 */
export type BotTurnOutcome =
  | { kind: 'play'; seat: Seat; cardIds: string[]; result: PlayResult }
  | { kind: 'pass'; seat: Seat; result: PlayResult }
  | { kind: 'no-bot' }
  | { kind: 'error'; seat: Seat; error: PlayError };

const BOT_DELAY_MS = 450; // 视觉延迟（玩家能看清出牌动画）

@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);
  /** 每个房间的当前 bot 调度计时器，方便取消（房间销毁 / 重连）。 */
  private readonly pending = new Map<string, NodeJS.Timeout>();

  constructor(@Inject(RoomService) private readonly rooms: RoomService) {}

  /** 判断 seat 当前是否被 bot 占据。 */
  isBotSeat(room: Room, seat: Seat): boolean {
    const m = this.rooms.memberAtSeat(room, seat);
    return !!m?.isBot;
  }

  /** 同步执行一次 bot 决策（不带延迟，供测试调用）。 */
  driveOnce(room: Room): BotTurnOutcome {
    if (!room.session) return { kind: 'no-bot' };
    const snap = room.session.snapshotForBot();
    if (!snap) return { kind: 'no-bot' };
    const { turnSeat } = snap;
    const member = this.rooms.memberAtSeat(room, turnSeat);
    if (!member?.isBot) return { kind: 'no-bot' };

    const difficulty: Difficulty = member.botDifficulty ?? 'normal';
    const hand = decodeHand(snap.handIds);
    const decision = decideMove(
      {
        hand,
        top: snap.top,
        level: room.level,
        remainingCounts: snap.remainingCounts,
        seat: turnSeat,
      },
      difficulty,
    );

    if (decision.kind === 'pass') {
      const r = room.session.pass(turnSeat);
      if (!r.ok) return { kind: 'error', seat: turnSeat, error: r };
      return { kind: 'pass', seat: turnSeat, result: r };
    }
    const r = room.session.play(turnSeat, decision.cardIds);
    if (!r.ok) {
      this.logger.error(
        `bot ${member.userId} produced invalid play [${decision.cardIds.join(',')}]: ${r.message}`,
      );
      return { kind: 'error', seat: turnSeat, error: r };
    }
    return { kind: 'play', seat: turnSeat, cardIds: decision.cardIds, result: r };
  }

  /**
   * 异步调度：若当前回合是 bot，BOT_DELAY_MS 后回调 onAct 处理一次出牌，
   * onAct 应负责广播事件并再次调用 schedule（gateway 内做）。
   *
   * 不直接连续递归，避免堆栈爆掉；onAct 内 schedule 下一轮即可。
   */
  schedule(room: Room, onAct: (outcome: BotTurnOutcome) => void): void {
    this.cancel(room.id);
    if (!room.session) return;
    if (room.session.publicTurn() === null) return;
    if (!this.isBotSeat(room, room.session.publicTurn()!)) return;

    const t = setTimeout(() => {
      this.pending.delete(room.id);
      // 再次校验（防止房间在延迟内被销毁）
      const live = this.rooms.getRoom(room.id);
      if (!live || !live.session) return;
      if (live.session.publicTurn() === null) return;
      try {
        const outcome = this.driveOnce(live);
        onAct(outcome);
      } catch (e) {
        this.logger.error(`bot tick failed for room ${room.id}: ${(e as Error).message}`);
      }
    }, BOT_DELAY_MS);
    this.pending.set(room.id, t);
  }

  cancel(roomId: string): void {
    const t = this.pending.get(roomId);
    if (t) {
      clearTimeout(t);
      this.pending.delete(roomId);
    }
  }
}
