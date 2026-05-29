import * as microsoftTeams from '@microsoft/teams-js';

/**
 * 在 Teams Tab 中初始化 SDK。失败时（如本地浏览器外打开）回退到 stub。
 */
export async function initTeams(): Promise<{ inTeams: boolean }> {
  try {
    await microsoftTeams.app.initialize();
    return { inTeams: true };
  } catch {
    return { inTeams: false };
  }
}

/** 获取 Teams SSO Token；非 Teams 环境返回 null。 */
export async function getSsoToken(): Promise<string | null> {
  try {
    return await microsoftTeams.authentication.getAuthToken();
  } catch {
    return null;
  }
}
