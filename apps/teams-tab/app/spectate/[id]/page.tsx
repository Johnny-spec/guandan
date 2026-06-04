'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useRoomStore } from '../../../src/stores/room';
import { useAuthStore } from '../../../src/stores/auth';
import { useSocket, emitAck } from '../../../src/hooks/use-socket';
import { SpectatorTable } from '../../../src/components/SpectatorTable';

export default function SpectatePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const userId = useAuthStore((s) => s.userId);
  const room = useRoomStore((s) => s.room);
  const showToast = useRoomStore((s) => s.showToast);

  useSocket();

  useEffect(() => {
    if (!userId) {
      router.replace('/');
      return;
    }
    if (room?.id === params.id) return;
    let cancelled = false;
    (async () => {
      for (let i = 0; i < 60; i++) {
        try {
          const r = await emitAck('spectate:join', { roomId: params.id });
          if (cancelled) return;
          if (!r.ok) {
            showToast('error', `${r.code}: ${r.message}`);
            router.replace('/');
          }
          return;
        } catch {
          await new Promise((res) => setTimeout(res, 50));
        }
      }
      if (!cancelled) {
        showToast('error', '连接超时');
        router.replace('/');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, params.id, room?.id, router, showToast]);

  if (!userId) return null;
  if (!room || room.id !== params.id) {
    return <div style={{ padding: 24 }}>正在加入观战 {params.id}…</div>;
  }
  return <SpectatorTable room={room} />;
}
