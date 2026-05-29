'use client';
import type { ReactNode } from 'react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { useRoomStore } from '../stores/room';
import { useEffect } from 'react';

export function AppShell({ children }: { children: ReactNode }) {
  const toast = useRoomStore((s) => s.toast);
  const clear = useRoomStore((s) => s.clearToast);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(clear, 2500);
    return () => clearTimeout(t);
  }, [toast, clear]);

  return (
    <FluentProvider theme={webLightTheme}>
      {children}
      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            background:
              toast.kind === 'error'
                ? '#d13438'
                : toast.kind === 'success'
                  ? '#107c10'
                  : '#2b88d8',
            color: 'white',
            padding: '8px 16px',
            borderRadius: 4,
            zIndex: 9999,
            fontSize: 14,
            boxShadow: '0 2px 8px rgba(0,0,0,.2)',
          }}
        >
          {toast.text}
        </div>
      )}
    </FluentProvider>
  );
}
