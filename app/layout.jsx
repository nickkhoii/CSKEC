import './globals.css';
import { ToastProvider } from '@/components/ui/toast';
import { SETTING_KEYS, getSetting } from '@/lib/settings';

export const metadata = {
  title: {
    default: 'Centro Sugbo Eagles Club Members Portal',
    template: '%s | Centro Sugbo Eagles Club',
  },
  description:
    'Secure members portal for Centro Sugbo Eagles Club: club updates, attendance verification, dues and community service payments, meeting minutes and official records.',
  robots: { index: false, follow: false }, // internal system - never index
  applicationName: 'CSEC Members Portal',
  icons: {
    icon: { url: '/club-logo.jpg', type: 'image/jpeg' },
    apple: '/club-logo.jpg',
    shortcut: '/club-logo.jpg',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f2743',
};

/**
 * Root layout.
 *
 * Only static, build-time-safe work happens here. Portal pages opt out of
 * prerendering with `export const dynamic = 'force-dynamic'`, so `next build`
 * never needs a live database connection.
 */
export default async function RootLayout({ children }) {
  const clubName = await getSetting(SETTING_KEYS.CLUB_NAME, 'Centro Sugbo Eagles Club');

  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
