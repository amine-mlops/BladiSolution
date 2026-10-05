import { MapPinOff } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Page } from '../components/Layout'
import { EmptyState, btn } from '../components/ui'
import { useDocumentTitle } from '../hooks/misc'

export default function NotFound() {
  useDocumentTitle('Page not found')
  return (
    <Page>
      <EmptyState
        icon={MapPinOff}
        title="This page doesn't exist"
        body="The link may be broken, or the content was removed."
        action={
          <div className="flex gap-2">
            <Link to="/" className={btn('primary', 'md')}>
              Go home
            </Link>
            <Link to="/problems" className={btn('secondary', 'md')}>
              Explore problems
            </Link>
          </div>
        }
      />
    </Page>
  )
}
