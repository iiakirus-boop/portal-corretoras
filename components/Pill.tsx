import { STATUS_PEDIDO } from '@/lib/formato';
import type { StatusPedido } from '@/lib/tipos';

// vivo: um ponto pulsando devagar, para mostrar que o agente está trabalhando agora
export function Pill({ tom, vivo, children }: { tom: 'warn' | 'info' | 'ok' | 'idle' | 'bad'; vivo?: boolean; children: React.ReactNode }) {
  return <span className={`pill p-${tom}`}>{vivo && <i className="vivo" aria-hidden />}{children}</span>;
}

export function StatusPill({ status }: { status: StatusPedido }) {
  const s = STATUS_PEDIDO[status];
  return <Pill tom={s.tom}>{s.rotulo}</Pill>;
}
