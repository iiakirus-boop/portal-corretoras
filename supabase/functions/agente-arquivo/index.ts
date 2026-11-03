// Recebe dos agentes do PC (documentos.py) o PDF de uma fatura ou boleto, guarda no bucket "documentos"
// e liga à fatura (fatura_doc_id / boleto_doc_id): a empresa passa a baixar no login dela (/arquivo/<id>).
//
// POST /functions/v1/agente-arquivo?fatura=<uuid>&tipo=fatura|boleto|ambos&nome=<nome do arquivo>
//   cabeçalho x-agente-token: o mesmo token dos agentes (.token_agentes); corpo: o PDF.
// Publicada com verify_jwt = false: quem confere é o token dos agentes, como nas outras funções dos agentes.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const LIMITE = 20 * 1024 * 1024; // mesmo limite do bucket

const resposta = (status: number, corpo: Record<string, unknown>) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return resposta(405, { erro: 'use POST' });
  const u = new URL(req.url);
  const token = req.headers.get('x-agente-token') ?? '';
  const fatura = u.searchParams.get('fatura') ?? '';
  const tipo = u.searchParams.get('tipo') ?? '';
  const nome = (u.searchParams.get('nome') ?? 'documento.pdf').slice(0, 200);
  if (!token || !/^[0-9a-f-]{36}$/i.test(fatura) || !['fatura', 'boleto', 'ambos'].includes(tipo)) {
    return resposta(400, { erro: 'faltou token, fatura ou tipo' });
  }

  // 1. confere o token e a fatura antes de gravar qualquer coisa
  const alvo = await db.rpc('agente_documento_alvo', { p_token: token, p_fatura: fatura });
  if (alvo.error) return resposta(403, { erro: alvo.error.message });
  const f = alvo.data as { corretora_id: string; competencia: string };

  // 2. o PDF
  const pdf = new Uint8Array(await req.arrayBuffer());
  if (!pdf.length) return resposta(400, { erro: 'arquivo vazio' });
  if (pdf.length > LIMITE) return resposta(413, { erro: 'arquivo maior que 20 MB' });
  if (new TextDecoder().decode(pdf.slice(0, 5)) !== '%PDF-') return resposta(415, { erro: 'não é um PDF' });

  // 3. guarda no bucket: um caminho fixo por fatura e tipo (rodar de novo só substitui)
  const caminho = `faturas/${f.corretora_id}/${f.competencia}/${fatura}/${tipo === 'boleto' ? 'boleto' : 'fatura'}.pdf`;
  const up = await db.storage.from('documentos').upload(caminho, pdf, { contentType: 'application/pdf', upsert: true });
  if (up.error) return resposta(500, { erro: `bucket: ${up.error.message}` });

  // 4. registra e liga à fatura
  const reg = await db.rpc('agente_documento', { p_token: token, p_fatura: fatura, p_tipo: tipo, p_caminho: caminho, p_nome: nome });
  if (reg.error) return resposta(500, { erro: reg.error.message });
  return resposta(200, { ok: true, documento: reg.data, caminho });
});
