import * as microsoftTeams from '@microsoft/teams-js';

/**
 * Teams Meeting Extension 观战入口配置 builder。
 *
 * 纯函数，不触 Teams SDK，便于测试 + 服务端预生成。
 *
 * @param roomId 已存在的对局 roomId（之后会进入 `/spectate/[id]`）
 * @param hostUrl Teams Tab 公网 host，例如 `https://teams-guandan.example.com`
 * @param suggestedDisplayName 在 meeting 侧边栏标签上显示的名字
 */
export interface SpectatorConfig {
  contentUrl: string;
  websiteUrl: string;
  suggestedDisplayName: string;
  entityId: string;
}

export function buildSpectatorConfig(
  roomId: string,
  hostUrl: string,
  suggestedDisplayName = '观战',
): SpectatorConfig {
  if (!/^[A-Za-z0-9_-]+$/.test(roomId)) {
    throw new Error(`invalid roomId: ${roomId}`);
  }
  const normalizedHost = hostUrl.replace(/\/+$/, '');
  return {
    contentUrl: `${normalizedHost}/spectate/${roomId}`,
    websiteUrl: `${normalizedHost}/spectate/${roomId}`,
    suggestedDisplayName,
    entityId: `guandan-spectate-${roomId}`,
  };
}

/**
 * Teams Meeting configurableTab 在 manifest.json 中的必备形态。
 * snapshot 锁定，防 Teams Admin 上传被拒。
 */
export interface MeetingConfigurableTab {
  configurationUrl: string;
  canUpdateConfiguration: boolean;
  scopes: ReadonlyArray<'team' | 'groupchat'>;
  context: ReadonlyArray<
    'meetingChatTab' | 'meetingDetailsTab' | 'meetingSidePanel' | 'meetingStage'
  >;
}

export function buildMeetingConfigurableTab(hostUrl: string): MeetingConfigurableTab {
  const normalizedHost = hostUrl.replace(/\/+$/, '');
  return {
    configurationUrl: `${normalizedHost}/meeting/configure`,
    canUpdateConfiguration: true,
    scopes: ['groupchat'],
    context: ['meetingSidePanel', 'meetingStage', 'meetingChatTab'],
  };
}

/** 在 Teams Meeting 配置页内提交 spectator tab 配置。失败回退 false。 */
export async function setSpectatorConfig(cfg: SpectatorConfig): Promise<boolean> {
  try {
    await microsoftTeams.pages.config.setConfig({
      contentUrl: cfg.contentUrl,
      websiteUrl: cfg.websiteUrl,
      suggestedDisplayName: cfg.suggestedDisplayName,
      entityId: cfg.entityId,
    });
    return true;
  } catch {
    return false;
  }
}

/** 获取当前 Meeting 的元数据。非 meeting 环境或失败返回 null。 */
export async function getMeetingContext(): Promise<microsoftTeams.app.Context | null> {
  try {
    return await microsoftTeams.app.getContext();
  } catch {
    return null;
  }
}
