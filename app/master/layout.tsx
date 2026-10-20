import { redirect } from 'next/navigation';
import { Topo } from '@/components/Topo';
import { destino, ehMaster, exigirSessao } from '@/lib/servidor';

export default async function MasterLayout({ children }: { children: React.ReactNode }) {
  const s = await exigirSessao();
  if (!ehMaster(s)) redirect(destino(s));
  return (
    <>
      <Topo master nome="Plataforma" sub="Painel master" inicio="/master" usuario={s.nome} papel="Master"
        links={[
          { href: '/master', rotulo: 'Visão geral', exato: true },
          { href: '/master/corretoras', rotulo: 'Corretoras' },
          { href: '/master/agentes', rotulo: 'Agentes' },
          { href: '/master/cobranca', rotulo: 'Cobrança' },
        ]} />
      <main className="wrap">{children}</main>
    </>
  );
}
