import Link from 'next/link';
import { cliente } from '@/lib/servidor';
import { cnpj, num } from '@/lib/formato';
import { somarPor, ultimas } from '@/lib/contas';
import { criarCorretora } from '@/lib/acoes';
import { Aviso } from '@/components/Aviso';
import { Pill } from '@/components/Pill';
import type { Corretora, Empresa, Fatura, Membro, Pedido } from '@/lib/tipos';
import { ABERTOS } from '@/lib/formato';

type P = { searchParams: Promise<Record<string, string | undefined>> };

export default async function Corretoras({ searchParams }: P) {
  const sp = await searchParams;
  const db = await cliente();
  const [{ data: corretoras }, { data: empresas }, { data: faturas }, { data: membros }, { data: pedidos }] = await Promise.all([
    db.from('corretoras').select('*').order('nome'),
    db.from('empresas').select('*').eq('ativa', true),
    db.from('faturas').select('*'),
    db.from('membros').select('*').eq('ativo', true),
    db.from('pedidos').select('*').in('status', ABERTOS),
  ]);
  const cs = (corretoras ?? []) as Corretora[];
  const nEmp = somarPor((empresas ?? []) as Empresa[], (e) => e.corretora_id, () => 1);
  const vidas = somarPor(ultimas((faturas ?? []) as Fatura[]), (f) => f.corretora_id, (f) => f.vidas_informadas ?? 0);
  const nUsu = somarPor(((membros ?? []) as Membro[]).filter((m) => m.corretora_id), (m) => m.corretora_id!, () => 1);
  const nPed = somarPor((pedidos ?? []) as Pedido[], (p) => p.corretora_id, () => 1);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Corretoras</h1>
          <p>Cada corretora vê só as empresas dela. Clique para ver cadastros, códigos nas seguradoras e quem tem acesso.</p>
        </div>
      </div>
      <Aviso sp={sp} />
      <div className="tbl">
        <table>
          <thead><tr><th>Corretora</th><th>CNPJ</th><th className="num">Empresas</th><th className="num">Vidas ativas</th><th className="num">Usuários</th><th className="num">Pedidos abertos</th><th>Situação</th></tr></thead>
          <tbody>
            {cs.map((c) => (
              <tr key={c.id}>
                <td><Link href={`/master/corretoras/${c.id}`}>{c.nome}</Link><small>{c.razao_social}</small></td>
                <td>{cnpj(c.cnpj)}</td>
                <td className="num">{num(nEmp.get(c.id) ?? 0)}</td>
                <td className="num">{num(vidas.get(c.id) ?? 0)}</td>
                <td className="num">{num(nUsu.get(c.id) ?? 0)}</td>
                <td className="num">{num(nPed.get(c.id) ?? 0)}</td>
                <td>{c.ativa ? <Pill tom="ok">Ativa</Pill> : <Pill tom="idle">Desligada</Pill>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="card" id="nova" style={{ maxWidth: 760 }}>
        <div className="card-h"><h2>Cadastrar corretora</h2><span className="hint">o administrador recebe acesso no primeiro login</span></div>
        <form action={criarCorretora} className="form">
          <div className="linha">
            <label className="campo">Nome<input name="nome" required placeholder="Ex.: Vértice Seguros" /></label>
            <label className="campo">CNPJ<input name="cnpj" required inputMode="numeric" placeholder="00.000.000/0000-00" /></label>
          </div>
          <div className="linha">
            <label className="campo">Razão social<input name="razao_social" /></label>
            <label className="campo">Endereço curto <small>(vira parte do link)</small><input name="slug" placeholder="vertice" /></label>
          </div>
          <div className="linha">
            <label className="campo">Cor da marca<input name="cor" type="color" defaultValue="#0F2A44" /></label>
            <label className="campo">E-mail do administrador<input name="admin" type="email" placeholder="dono@corretora.com.br" /></label>
          </div>
          <div><button className="btn">Cadastrar corretora</button></div>
        </form>
      </section>
    </div>
  );
}
