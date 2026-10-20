'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Relê a página de tempos em tempos (só quando a aba está visível), para acompanhar os agentes sem recarregar
export function AutoAtualiza({ segundos = 30 }: { segundos?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') router.refresh(); }, segundos * 1000);
    return () => clearInterval(t);
  }, [router, segundos]);
  return null;
}
