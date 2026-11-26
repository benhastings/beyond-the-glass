import { lazy } from 'react'
import type { RouteObject } from 'react-router'
import ConsoleRoom from './pages/ConsoleRoom'
import Guide from './pages/Guide'
import GuideTerm from './pages/GuideTerm'
import Lead from './pages/Lead'
import Lesson from './pages/Lesson'
import JourneyMap from './pages/Map'
import Region from './pages/Region'
import Settings from './pages/Settings'
import Stormwatch from './pages/Stormwatch'
import TestOut from './pages/TestOut'
import Threshold from './pages/Threshold'
import ThresholdResults from './pages/ThresholdResults'
import { ErrorScreen, RootErrorScreen } from './shell/ErrorScreen'
import { NotFound } from './shell/NotFound'
import { Shell } from './shell/Shell'

// Developer page (E1-03): its own chunk, so learners never download it.
const KitchenSink = lazy(() => import('./pages/KitchenSink'))
// Field cards (E2-07): their own chunk too.
const FieldCards = lazy(() => import('./pages/FieldCards'))

/**
 * Every page, one line each. A page is one file in ./pages that renders a <Page title>.
 * Routes live after the `#` (ADR-002).
 */
export const PAGES: RouteObject[] = [
  { index: true, Component: ConsoleRoom },
  { path: 'threshold', Component: Threshold },
  { path: 'threshold/results', Component: ThresholdResults },
  { path: 'map', Component: JourneyMap },
  { path: 'region/:regionId', Component: Region },
  { path: 'lesson/:lessonId/:step?', Component: Lesson },
  { path: 'test-out/:regionId/:moduleId', Component: TestOut },
  { path: 'guide', Component: Guide },
  { path: 'guide/:term', Component: GuideTerm },
  { path: 'settings', Component: Settings },
  { path: 'lead', Component: Lead },
  { path: 'stormwatch', Component: Stormwatch },
  { path: 'field-cards/:card?', Component: FieldCards },
  { path: 'kitchen-sink', Component: KitchenSink },
  { path: '*', Component: NotFound },
]

export const routes: RouteObject[] = [
  {
    path: '/',
    Component: Shell,
    // The shell itself failing: a bare recovery screen.
    errorElement: <RootErrorScreen />,
    // A page failing: the recovery screen inside the shell, so navigation still works.
    children: [{ errorElement: <ErrorScreen />, children: PAGES }],
  },
]
