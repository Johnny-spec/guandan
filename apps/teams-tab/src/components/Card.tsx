'use client';
import type { CSSProperties } from 'react';

interface Props {
  cardId: string;
  selected?: boolean;
  onClick?: () => void;
  faceDown?: boolean;
}

const SUIT_SYMBOL: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RED_SUITS = new Set(['H', 'D']);

function parse(cardId: string): { label: string; red: boolean } {
  const parts = cardId.split('-');
  const a = parts[0] ?? '';
  const b = parts[1] ?? '';
  if (a === 'J') {
    return { label: b === 'red' ? '🃏R' : '🃏B', red: b === 'red' };
  }
  return { label: `${SUIT_SYMBOL[a] ?? a}${b}`, red: RED_SUITS.has(a) };
}

export function Card({ cardId, selected, onClick, faceDown }: Props) {
  const { label, red } = faceDown
    ? { label: '🂠', red: false }
    : parse(cardId);
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 64,
    margin: '0 -8px 0 0',
    border: '1px solid #999',
    borderRadius: 6,
    background: faceDown ? '#1e3a8a' : 'white',
    color: faceDown ? 'white' : red ? '#d13438' : '#111',
    fontFamily: 'Segoe UI, system-ui, sans-serif',
    fontWeight: 600,
    fontSize: 16,
    cursor: onClick ? 'pointer' : 'default',
    transform: selected ? 'translateY(-12px)' : 'none',
    transition: 'transform 120ms ease',
    boxShadow: '0 1px 3px rgba(0,0,0,.15)',
    userSelect: 'none',
  };
  return (
    <div style={style} onClick={onClick} title={cardId}>
      {label}
    </div>
  );
}
