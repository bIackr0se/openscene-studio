import type { Metadata } from 'next';
import './studio.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://openscene-webmcp.jijou-leo40.chatgpt.site'),
  title: 'OpenScene Studio · Add the missing lift question',
  description:
    'A trainer asks ChatGPT, through WebMCP, to add a missing lift question to a German train-station lesson. OpenScene pauses for the learner’s German line, then plays the trainer-approved filmed answer.',
  icons: { icon: '/favicon.svg' },
  openGraph: {
    url: '/',
    title: 'OpenScene Studio · Add the missing lift question',
    description:
      'A trainer asks ChatGPT, through WebMCP, to add the missing lift question. OpenScene pauses for the learner’s German line, then plays the trainer-approved filmed answer.',
    type: 'website',
    images: [
      {
        url: '/openscene-social-card.png',
        width: 1200,
        height: 630,
        alt: 'A German train-station lesson with a new lift question for a learner who cannot use stairs',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OpenScene Studio · Add the missing lift question',
    description:
      'ChatGPT adds the missing German lift question to the open station lesson and links it to a trainer-approved filmed answer.',
    images: ['/openscene-social-card.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
