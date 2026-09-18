import './globals.css';

export const metadata = {
  title: 'Sunstrade',
  description: 'Sunstrade account portal'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
