import { STATUS_PEDIDO } from '@/lib/formato';
import type { StatusPedido } from '@/lib/tipos';

export function Pill({ tom, children }: { tom: 'warn' | 'info' | 'ok' | 'idle' | 'bad'; children: React.ReactNode }) {
  return <span className={`pill p-${tom}`}>{children}</span>;
}

export function StatusPill({ status }: { status: StatusPedido }) {
  const s = STATUS_PEDIDO[status];
  return <Pill tom={s.tom}>{s.rotulo}</Pill>;
}
