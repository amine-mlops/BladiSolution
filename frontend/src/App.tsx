import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { PageLoader } from './components/ui'
import { LoginPage, RegisterPage } from './pages/Auth'
import Home from './pages/Home'
import MyActivity from './pages/MyActivity'
import NewProblem from './pages/NewProblem'
import NewSolution from './pages/NewSolution'
import NotFound from './pages/NotFound'
import Notifications from './pages/Notifications'
import ProblemDetail from './pages/ProblemDetail'
import Problems from './pages/Problems'
import Profile from './pages/Profile'
import Search from './pages/Search'
import Settings from './pages/Settings'
import SolutionDetail from './pages/SolutionDetail'
import Solutions from './pages/Solutions'

// Deferred for the Campus MVP (kept in the codebase, not routed): pages/Discover (merged
// into Home), pages/MapPage, pages/Dashboard, components/ai (AI insight panels).
const Moderation = lazy(() => import('./pages/Moderation'))

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="problems" element={<Problems />} />
          <Route path="problems/new" element={<NewProblem />} />
          <Route path="problems/:id" element={<ProblemDetail />} />
          <Route path="problems/:id/solutions/new" element={<NewSolution />} />
          <Route path="solutions" element={<Solutions />} />
          <Route path="solutions/:id" element={<SolutionDetail />} />
          <Route path="activity" element={<MyActivity />} />
          <Route path="discover" element={<Navigate to="/" replace />} />
          <Route path="map" element={<Navigate to="/problems" replace />} />
          <Route path="dashboard" element={<Navigate to="/solutions?sort=top" replace />} />
          <Route path="search" element={<Search />} />
          <Route path="u/:username" element={<Profile />} />
          <Route path="settings" element={<Settings />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="moderation" element={<Moderation />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
