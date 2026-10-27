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
.cx-link .pl{display:none!important}
.nav a.cx-tab{box-sizing:border-box;display:flex;align-items:center;padding:0 .85rem;color:var(--navy-muted);font-weight:700;font-size:.88rem;white-space:nowrap;text-decoration:none;border-bottom:3px solid transparent;border-top:3px solid transparent}
.nav a.cx-tab:hover{color:var(--navy-fg)}
@media (min-width:821px){.nav{flex:1 0 auto}}
@media (max-width:1180px){.brand-txt{display:none}.top .wrap{gap:.5rem}.cx-link{padding-inline:.55rem}}
/* acabamento e celular (skills break-ui, mobile-native e emil-design-eng); no computador o visual fica o mesmo */
html{-webkit-tap-highlight-color:transparent;-webkit-text-size-adjust:100%}
button,a,.ei,.kpi{touch-action:manipulation}
.btn,.pend-btn,.seg button,.chips button,.vbtn,button.kpi,.ei{transition:transform 160ms cubic-bezier(.23,1,.32,1)}
.btn:active,.pend-btn:active,.seg button:active,.chips button:active,.vbtn:active,button.kpi:active{transform:scale(.97)}
.ei:active{transform:scale(.99)}
.modal:not([hidden])>*{animation:cx-entra 200ms cubic-bezier(.23,1,.32,1)}
.toast{animation:cx-sobe 220ms cubic-bezier(.23,1,.32,1)}
@keyframes cx-entra{from{opacity:0;transform:scale(.97) translateY(6px)}}
@keyframes cx-sobe{from{opacity:0;transform:translate(-50%,8px)}}
.kpis:empty{min-height:112px;border-radius:var(--r-lg);background:linear-gradient(90deg,var(--line-soft) 25%,var(--sunken) 50%,var(--line-soft) 75%) 0 0/200% 100%;animation:cx-carrega 1.2s linear infinite}
@keyframes cx-carrega{to{background-position:-200% 0}}
.kpi-v{white-space:nowrap}
@media (min-width:1500px){.cx-link .pl{display:inline!important}}
@media (max-width:640px){
  .top .wrap{flex-wrap:wrap;row-gap:0;padding-top:.5rem;min-height:0}
  .brand{flex:1 1 auto}
  #pendbtn{margin-left:auto}
  .nav{order:3;flex:1 0 100%;min-height:44px;margin-inline:-.55rem;-webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 32px),transparent);mask-image:linear-gradient(90deg,#000 calc(100% - 32px),transparent)}
  .nav>:last-child{margin-right:24px}
  .kpi-v{font-size:clamp(.95rem,4.6vw,1.1rem)}
  .chart{padding-left:12px}
  .elist ul{max-height:none;overflow:visible}
  .ei b .nm{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
  .ei small{white-space:normal}
}
@media (prefers-reduced-motion:reduce){.modal:not([hidden])>*,.toast,.kpis:empty{animation:none}}
${a.admin ? '' : `.nav [data-page="comissoes"],.nav [data-page="projecao"],.kpi[data-page="projecao"],section.card:has(#hwk),.page[data-pg="comissoes"],.page[data-pg="projecao"]{display:none!important}`}
</style>`;
  const links = [
    ...(a.admin ? [['/corretora/' + c + '/usuarios', 'Equipe', '<circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>']] : []),
    ...(a.master ? [['/master', 'Master', '<path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z"/>']] : []),
    ['/conta/senha', 'Trocar senha', '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'],
    ['/sair', 'Sair', '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>'],
  ]
    .map(([href, txt, ic]) => `<a class="pend-btn cx-link" href="${href}" aria-label="${txt}" title="${txt}">${ICONE(ic)}<span class="pl">${txt}</span></a>`)
    .join('');

  // Empresas e Pedidos entram como abas do mesmo menu da Central
  const abas = [['/corretora/' + c + '/empresas', 'Empresas'], ['/corretora/' + c + '/pedidos', 'Pedidos']]
    .map(([href, txt]) => `<a class="cx-tab" href="${href}">${txt}</a>`).join('');

  let html = modelo
    .replace('<title>Central de Agentes</title>', `<title>Central de Agentes · ${nome}</title>`)
    .replaceAll('Shaddai Seguros', nome)
    .replaceAll('Comissão da Shaddai', 'Comissão da corretora')
    .replace('<button type="button" data-page="projecao">Projeção</button>', (m) => m + abas)
    .replace('<span class="badge" id="pendn" hidden></span></button>', (m) => m + links);
  // config e shim antes do script principal, que já chama window.claude.use
  const shim = `${css}<script>window.__CENTRAL=${JSON.stringify(cfg).replace(/</g, '\\u003c')}</script><script src="/central-shim.js"></script>`;
  const i = html.indexOf('<script>');
  html = html.slice(0, i) + shim + html.slice(i);
  return new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
