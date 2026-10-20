import type { Metadata } from 'next';
import './globals.css';
import { MODO_DEMO } from '@/lib/servidor';

export const metadata: Metadata = {
  title: 'Portal da corretora',
  description: 'Faturas, vidas, pedidos e comissões das empresas atendidas pela corretora.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body style={{ ['--f-body' as string]: "'Manrope'" }}>
        {MODO_DEMO && <div className="faixa-demo">Modo demonstração: dados fictícios, nada aqui é real</div>}
        {children}
      </body>
    </html>
  );
}
