// A Central de Agentes de hoje, servida sem mudanças para a corretora.
// Só troca de onde vêm os dados (central-shim.js → /api/central/<c>), o nome da corretora
// e esconde comissão e projeção de quem não é administrador.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { acessoCentral } from '@/lib/central/acesso';
import { destino } from '@/lib/servidor';

export const dynamic = 'force-dynamic';

let modelo: string | null = null;
const esc = (t: string) => t.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

const ICONE = (d: string) =>
  `<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

export async function GET(req: Request, { params }: { params: Promise<{ c: string }> }) {
  const { c } = await params;
  const a = await acessoCentral(c);
  if (!a) return NextResponse.redirect(new URL('/entrar', req.url));
  if (!a.ok) return NextResponse.redirect(new URL(destino(a.s), req.url));

  modelo ??= await readFile(path.join(process.cwd(), 'lib/central/central.html'), 'utf8');
  const nome = esc(a.cor.nome as string);
  const podeEditar = a.master || a.admin || a.s.membros.some((m) => m.corretora_id === c && !m.empresa_id);
  const cfg = { corretora: c, podeEditar, usuario: { id: a.s.userId } };

  const css = `<style>
.cx-link{text-decoration:none}
${a.admin ? '' : `.nav [data-page="comissoes"],.nav [data-page="projecao"],.kpi[data-page="projecao"],section.card:has(#hwk),.page[data-pg="comissoes"],.page[data-pg="projecao"]{display:none!important}`}
</style>`;
  const links = [
    ['/corretora/' + c + '/pedidos', 'Pedidos', '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'],
    ['/corretora/' + c + '/empresas', 'Empresas e acessos', '<path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/>'],
    ...(a.admin ? [['/corretora/' + c + '/usuarios', 'Equipe', '<circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>']] : []),
    ...(a.master ? [['/master', 'Master', '<path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z"/>']] : []),
    ['/sair', 'Sair', '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>'],
  ]
    .map(([href, txt, ic]) => `<a class="pend-btn cx-link" href="${href}" aria-label="${txt}">${ICONE(ic)}<span class="pl">${txt}</span></a>`)
    .join('');

  let html = modelo
    .replace('<title>Central de Agentes</title>', `<title>Central de Agentes · ${nome}</title>`)
    .replaceAll('Shaddai Seguros', nome)
    .replaceAll('Comissão da Shaddai', 'Comissão da corretora')
    .replace('<span class="badge" id="pendn" hidden></span></button>', (m) => m + links);
  // config e shim antes do script principal, que já chama window.claude.use
  const shim = `${css}<script>window.__CENTRAL=${JSON.stringify(cfg).replace(/</g, '\\u003c')}</script><script src="/central-shim.js"></script>`;
  const i = html.indexOf('<script>');
  html = html.slice(0, i) + shim + html.slice(i);
  return new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
