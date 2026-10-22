'use client';

import { useRouter } from 'next/navigation';
import { NflCentreLayout } from '../../features/nfl/NflCentreLayout';
import StatsPreview from './stats-preview';

export default function CentrePreview({ development, fixture }: { development: boolean; fixture: boolean }) {
  const router = useRouter();
  return <NflCentreLayout activeTab="stats" onTabChange={tab => {
    if (tab !== 'stats') router.push(`/nfl?section=${tab}`);
  }}><StatsPreview development={development} initialFixture={fixture} /></NflCentreLayout>;
}
