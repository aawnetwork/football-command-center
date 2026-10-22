import { notFound } from 'next/navigation';
import CentrePreview from './centre-preview';

export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.AAW_STATS_V2_LOCAL_PREVIEW !== '1' || process.env.VERCEL) notFound();
  const params = await searchParams;
  const development = params.development === '1';
  return <CentrePreview development={development} fixture={development && params.fixture === '1'} />;
}
