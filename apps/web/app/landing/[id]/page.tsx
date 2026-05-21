import { notFound } from 'next/navigation';
import { LANDINGS } from '@/components/landings/registry';

export default function LandingRoute({ params }: { params: { id: string } }) {
  const entry = LANDINGS.find((l) => l.id === params.id);
  if (!entry) notFound();
  const Component = entry.component;
  return <Component />;
}
