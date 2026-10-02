import './globals.css';

export const metadata = { title: 'Agendamento de Consultas', description: 'Agende sua consulta online' };

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
