import { describe, expect, it } from 'vitest'
import { IMMERSIVE_OPTION, WINDOW_VIEWS, projectIdOfPath, windowViewLabel, windowViewOf, windowViewPath } from './windowViews'

/**
 * The six views one window can put on another: the four live views in `ViewSwitcher` order, then
 * the two libraries. Matching is segment-aware, so the legacy `/program` and the old `/fx` never
 * answer for a view.
 */
describe('WINDOW_VIEWS', () => {
  it('is the four live views in ViewSwitcher order, then Looks and Templates', () => {
    expect(WINDOW_VIEWS.map((v) => v.id)).toEqual(['programmer', 'show', 'prompt-book', 'busk', 'looks', 'templates'])
  })

  it('mints a project route per view', () => {
    expect(windowViewPath(WINDOW_VIEWS[3]!, 7)).toBe('/projects/7/busk')
  })

  it('gives every live view the one Chrome option, App · Immersive over off | on, and the libraries none (busk-chrome D9)', () => {
    for (const view of WINDOW_VIEWS.slice(0, 4)) {
      const chrome = view.options?.find((o) => o.key === 'immersive')
      expect(chrome, view.id).toBe(IMMERSIVE_OPTION)
    }
    expect(IMMERSIVE_OPTION).toMatchObject({ label: 'Chrome', kind: 'enum', values: ['off', 'on'], valueLabels: { off: 'App', on: 'Immersive' } })
    // Busk keeps its three and takes the fourth last, so the segment sits at the row's end everywhere.
    expect(WINDOW_VIEWS[3]!.options!.map((o) => o.key)).toEqual(['focus', 'sheet', 'page', 'immersive'])
    expect(WINDOW_VIEWS[4]!.options).toBeUndefined()
    expect(WINDOW_VIEWS[5]!.options).toBeUndefined()
  })
})

describe('windowViewOf', () => {
  it('reads a view off its route, and off a route below it', () => {
    expect(windowViewOf('/projects/1/busk')?.id).toBe('busk')
    expect(windowViewOf('/projects/1/show/stacks/4')?.id).toBe('show')
    expect(windowViewOf('/projects/1/show/stacks/4/table')?.id).toBe('show')
  })

  it('never lets a prefix answer — /program is not the programmer, /fx-library is not busk', () => {
    expect(windowViewOf('/projects/1/program')).toBeNull()
    expect(windowViewOf('/projects/1/fx-library')).toBeNull()
    expect(windowViewOf('/projects/1/fixtures')).toBeNull()
    expect(windowViewOf('/install')).toBeNull()
  })

  it('labels a view by name and any other route by its path', () => {
    expect(windowViewLabel('/projects/1/prompt-book')).toBe('Prompt Book')
    expect(windowViewLabel('/projects/1/fixtures')).toBe('/projects/1/fixtures')
  })
})

describe('projectIdOfPath', () => {
  it('reads the project from a project route and nothing from an install one', () => {
    expect(projectIdOfPath('/projects/12/busk')).toBe(12)
    expect(projectIdOfPath('/projects/12')).toBe(12)
    expect(projectIdOfPath('/install/users')).toBeNull()
    expect(projectIdOfPath('/projects/abc/busk')).toBeNull()
  })
})
