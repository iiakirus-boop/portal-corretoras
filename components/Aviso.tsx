// Mostra o resultado da última ação (as ações voltam para a página com ?ok=... ou ?erro=...)
export function Aviso({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const ok = typeof sp.ok === 'string' ? sp.ok : null;
  const erro = typeof sp.erro === 'string' ? sp.erro : null;
  if (erro) return <p className="msg erro" role="alert">{erro}</p>;
  // o "deu certo" aparece como aviso no rodapé e some sozinho; o erro fica na página até a pessoa ver
  if (ok) return <p className="msg ok aviso-flutua" role="status">{ok}</p>;
  return null;
}
