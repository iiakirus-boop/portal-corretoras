import { redirect } from 'next/navigation';

// O início da corretora é a Central de Agentes
export default async function InicioCorretora({ params }: { params: Promise<{ c: string }> }) {
  const { c } = await params;
  redirect(`/central/${c}`);
}
