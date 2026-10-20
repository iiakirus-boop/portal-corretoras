// No modo demonstração não existem arquivos de verdade: mostra só o que seria baixado.
export async function GET(req: Request) {
  const c = new URL(req.url).searchParams.get('c') ?? '';
  const nome = c.split('/').pop()?.replace(/[<>&"]/g, '') ?? '';
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Arquivo de exemplo</title><body style="font-family:system-ui;padding:3rem;max-width:40rem">` +
      `<h1 style="font-size:1.2rem">Arquivo de demonstração</h1><p>No portal de verdade, aqui abriria o PDF <b>${nome}</b>, guardado com acesso restrito à empresa e à corretora.</p></body>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}
