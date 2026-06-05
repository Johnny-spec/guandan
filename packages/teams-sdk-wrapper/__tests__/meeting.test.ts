import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  buildSpectatorConfig,
  buildMeetingConfigurableTab,
} from '../src/meeting';

const here = dirname(fileURLToPath(import.meta.url));

describe('buildSpectatorConfig', () => {
  it('生成稳定形态', () => {
    expect(buildSpectatorConfig('room123', 'https://app.example.com')).toMatchSnapshot();
  });

  it('host 末尾斜杠会被规范化', () => {
    const cfg = buildSpectatorConfig('room123', 'https://app.example.com///');
    expect(cfg.contentUrl).toBe('https://app.example.com/spectate/room123');
  });

  it('可自定义 suggestedDisplayName', () => {
    const cfg = buildSpectatorConfig('abc', 'https://x.com', '比赛观战');
    expect(cfg.suggestedDisplayName).toBe('比赛观战');
    expect(cfg.entityId).toBe('guandan-spectate-abc');
  });

  it('拒绝非法 roomId（防路径注入）', () => {
    expect(() => buildSpectatorConfig('../etc/passwd', 'https://x.com')).toThrow(/invalid roomId/);
    expect(() => buildSpectatorConfig('room id', 'https://x.com')).toThrow(/invalid roomId/);
    expect(() => buildSpectatorConfig('', 'https://x.com')).toThrow(/invalid roomId/);
  });
});

describe('buildMeetingConfigurableTab', () => {
  it('snapshot 锁定 meeting context 形态', () => {
    expect(buildMeetingConfigurableTab('https://app.example.com')).toMatchSnapshot();
  });

  it('context 必含三个 meeting surface', () => {
    const tab = buildMeetingConfigurableTab('https://x.com');
    expect(tab.context).toContain('meetingSidePanel');
    expect(tab.context).toContain('meetingStage');
    expect(tab.context).toContain('meetingChatTab');
    expect(tab.scopes).toEqual(['groupchat']);
    expect(tab.canUpdateConfiguration).toBe(true);
  });
});

describe('manifest.json 契约（与 buildMeetingConfigurableTab 对齐）', () => {
  const manifestPath = resolve(
    here,
    '../../../apps/teams-tab/appPackage/manifest.json',
  );
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

  it('manifest 至少有一个 meeting configurableTab', () => {
    const tabs = manifest.configurableTabs ?? [];
    const meetingTab = tabs.find((t: { context?: string[] }) =>
      t.context?.includes('meetingSidePanel'),
    );
    expect(meetingTab).toBeDefined();
    expect(meetingTab.scopes).toContain('groupchat');
    expect(meetingTab.context).toEqual(
      expect.arrayContaining(['meetingSidePanel', 'meetingStage', 'meetingChatTab']),
    );
    expect(meetingTab.configurationUrl).toMatch(/\/meeting\/configure$/);
    expect(meetingTab.canUpdateConfiguration).toBe(true);
  });

  it('manifest 包含 staticTabs（兼容个人 tab）', () => {
    expect(manifest.staticTabs.length).toBeGreaterThan(0);
  });
});
