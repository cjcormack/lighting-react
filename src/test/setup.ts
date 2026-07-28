import { afterEach } from 'vitest'

/**
 * Global test setup — loaded for EVERY test file, in whatever environment that file
 * declared, so everything here has to be inert under the default `node` environment.
 *
 * What it buys a component test (`// @vitest-environment jsdom`):
 *  • `afterEach(cleanup)` — testing-library only registers this itself when vitest runs
 *    with `globals: true`, which this repo doesn't. Forgetting it doesn't fail the test
 *    that forgot; it leaves the render mounted so a LATER test's `screen` query matches
 *    the earlier DOM. Silent wrong-passes are worse than a missing teardown, so it is
 *    registered centrally rather than per file.
 *  • jest-dom matchers (`toBeVisible`, `toHaveTextContent`, …) on vitest's `expect`.
 */
if (typeof document !== 'undefined') {
  await import('@testing-library/jest-dom/vitest')
  const { cleanup } = await import('@testing-library/react')
  afterEach(cleanup)
}
