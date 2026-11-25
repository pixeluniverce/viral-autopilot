import './globals.css';

export const metadata = {
  title: 'Viral Autopilot',
  description: 'Auto-create and auto-post Shorts and Reels',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
