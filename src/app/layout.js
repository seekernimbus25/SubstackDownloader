import { Space_Grotesk } from 'next/font/google';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

export const metadata = {
  title: 'SubstackDownloader — Substack to Markdown',
  description: 'Download any Substack article as a clean Markdown file. Free or paywalled.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3215119567555645"
          crossOrigin="anonymous"
        />
      </head>
      <body className={spaceGrotesk.className}>{children}</body>
    </html>
  );
}
