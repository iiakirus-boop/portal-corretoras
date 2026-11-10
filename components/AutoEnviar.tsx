'use client';
// Formulário que se reenvia sozinho quando algo muda (checkbox ou select), para a tela recalcular na hora.
export function AutoEnviar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <form className={className} onChange={(ev) => (ev.currentTarget as HTMLFormElement).requestSubmit()}>
      {children}
    </form>
  );
}
