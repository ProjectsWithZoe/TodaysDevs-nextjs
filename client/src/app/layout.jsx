import '../index.css'
import { Providers } from '@/components/Providers.jsx'

export const metadata = {
  title:       'TodaysDevs',
  description: 'Build real projects with real developers',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
