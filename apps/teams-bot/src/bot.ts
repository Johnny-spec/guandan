import { ActivityHandler, MessageFactory } from 'botbuilder';

export class GuandanBot extends ActivityHandler {
  constructor() {
    super();
    this.onMessage(async (ctx, next) => {
      const text = (ctx.activity.text ?? '').trim();
      // TODO(teams-bot): /create /join <id> /match /stats 等命令派发
      await ctx.sendActivity(MessageFactory.text(`收到指令：${text || '(空)'} — 骨架尚未实现。`));
      await next();
    });
  }
}
