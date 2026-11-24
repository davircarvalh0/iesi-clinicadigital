import type { ReactNode } from 'react';

export type TomSelo = 'info' | 'sucesso' | 'marca' | 'perigo' | 'neutro' | 'alerta';

export function Selo({ tom, children }: { tom: TomSelo; children: ReactNode }) {
  return <span className={`selo selo--${tom}`}>{children}</span>;
}
