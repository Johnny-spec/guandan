'use client';

import { useEffect, useState } from 'react';
import { initTeams, getMeetingContext } from '@teams-guandan/teams-sdk-wrapper';

/**
 * Teams Meeting sidePanel / stage 观战页（占位 landing）。
 *
 * 真实的观战 UI 仍走 `/spectate/[id]`。此页只负责：
 * 1) 探测 meeting 上下文；
 * 2) 提示用户在 meeting 内打开 spectate 入口。
 *
 * meeting context 真正注入的 roomId 走 configure → setConfig 链路。
 */
export default function MeetingSpectateLanding() {
  const [meetingTitle, setMeetingTitle] = useState<string | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [inTeams, setInTeams] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const { inTeams: ok } = await initTeams();
      setInTeams(ok);
      if (!ok) return;
      const ctx = await getMeetingContext();
      if (!ctx) return;
      setMeetingTitle(ctx.meeting?.id ?? null);
      setChatId(ctx.chat?.id ?? null);
    })();
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 18, marginBottom: 12 }}>掼蛋会议观战</h1>

      {inTeams === false && (
        <p style={{ color: '#a4262c' }}>
          未在 Teams 环境中加载 —— 请在 Teams 会议内打开此 Tab。
        </p>
      )}

      {inTeams && (
        <ul style={{ fontSize: 13, lineHeight: 1.8 }}>
          <li>Meeting ID: <code>{meetingTitle ?? '(未提供)'}</code></li>
          <li>Chat ID: <code>{chatId ?? '(未提供)'}</code></li>
        </ul>
      )}

      <p style={{ marginTop: 16, color: '#666', fontSize: 13 }}>
        请通过会议中「+ 添加 Tab」选择「掼蛋观战」并填入房间号，配置完成后会自动跳转到对应房间的观战视图。
      </p>
    </main>
  );
}
