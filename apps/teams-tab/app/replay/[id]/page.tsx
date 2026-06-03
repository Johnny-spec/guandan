'use client';
import { useParams } from 'next/navigation';
import { ReplayPlayer } from '../../../src/components/ReplayPlayer';

export default function ReplayPage() {
  const params = useParams<{ id: string }>();
  return <ReplayPlayer matchId={decodeURIComponent(params.id)} />;
}
