'use client';

import { useEffect, useState } from 'react';
import * as microsoftTeams from '@microsoft/teams-js';
import {
  initTeams,
  buildSpectatorConfig,
  setSpectatorConfig,
} from '@teams-guandan/teams-sdk-wrapper';

/**
 * Teams Meeting Extension 配置页（占位）。
 *
 * 用户在 meeting 内点击「添加 Tab」→ Teams 加载此页 → 用户输入要观战的 roomId →
 * 调用 pages.config.setValidityState(true) → 保存即注册 `/spectate/[roomId]`。
 */
export default function MeetingConfigurePage() {
  const [roomId, setRoomId] = useState('');
  const [hostUrl, setHostUrl] = useState('');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setHostUrl(window.location.origin);
    (async () => {
      const { inTeams } = await initTeams();
      if (!inTeams) {
        setError('未在 Teams 环境（仅本地调试）。');
        return;
      }
      try {
        microsoftTeams.pages.config.registerOnSaveHandler(async (saveEvent) => {
          if (!/^[A-Za-z0-9_-]+$/.test(roomId)) {
            saveEvent.notifyFailure('invalid roomId');
            return;
          }
          const cfg = buildSpectatorConfig(roomId, window.location.origin);
          const ok = await setSpectatorConfig(cfg);
          if (ok) saveEvent.notifySuccess();
          else saveEvent.notifyFailure('setConfig failed');
        });
      } catch (e) {
        setError(String(e));
      }
    })();
  }, [roomId]);

  useEffect(() => {
    const valid = /^[A-Za-z0-9_-]+$/.test(roomId);
    setReady(valid);
    if (typeof window !== 'undefined') {
      try {
        microsoftTeams.pages.config.setValidityState(valid);
      } catch {
        /* not in Teams */
      }
    }
  }, [roomId]);

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 18, marginBottom: 12 }}>添加掼蛋观战 Tab</h1>
      <p style={{ color: '#666', marginBottom: 16 }}>
        在当前会议中嵌入指定房间的观战视图。
      </p>

      <label style={{ display: 'block', marginBottom: 8 }}>
        房间 ID
        <input
          value={roomId}
          onChange={(e) => setRoomId(e.target.value.trim())}
          placeholder="例如 room123"
          style={{
            width: '100%',
            marginTop: 4,
            padding: '6px 8px',
            border: '1px solid #ccc',
            borderRadius: 4,
          }}
        />
      </label>

      <div style={{ fontSize: 12, color: ready ? '#137a13' : '#a4262c' }}>
        {ready ? '✓ 房间号合法，可保存' : '仅允许字母 / 数字 / - _'}
      </div>

      {hostUrl && roomId && ready && (
        <pre
          style={{
            marginTop: 16,
            background: '#f5f5f5',
            padding: 8,
            borderRadius: 4,
            fontSize: 11,
            overflow: 'auto',
          }}
        >
{`Tab URL: ${hostUrl}/spectate/${roomId}`}
        </pre>
      )}

      {error && (
        <div style={{ marginTop: 12, color: '#a4262c', fontSize: 12 }}>{error}</div>
      )}
    </main>
  );
}
