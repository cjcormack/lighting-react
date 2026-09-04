import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useDispatch, useSelector } from 'react-redux'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useLookListQuery } from '@/store/looks'
import { useTemplateListQuery } from '@/store/templates'
import { useActiveCueIds } from '@/store/cues'
import { ignoreReportedError } from '@/store/errorToastMiddleware'
import { enterBuskEdit, exitBuskEdit, selectBuskEdit } from '@/store/buskEditSlice'
import {
  useBuskPagesQuery,
  useCreateBuskPageMutation,
  useDeleteBuskPageMutation,
  useRenameBuskPageMutation,
  useReorderBuskPagesMutation,
  useSaveBuskLayoutMutation,
  usePressBuskPadMutation,
  useCacheBuskPage,
} from '@/store/busk'
import { libraryStarterLayout, recordsOnPage } from '@/lib/buskLayout'
import type { BuskPad } from '@/api/buskApi'
import { lookLayerPresence, templateLayerPresence } from './lookPresence'
import { TargetList } from './TargetList'
import { TargetBand } from './TargetBand'
import { BuskSpeedRail } from './BuskSpeedRail'
import { BuskEditProvider } from './BuskEditProvider'
import { BuskPageBody } from './BuskPage'
import { BuskPageStrip } from './BuskPageStrip'
import { BuskFirstOpen } from './BuskFirstOpen'
import { LibraryPalette } from './LibraryPalette'
import { useBuskingState } from './useBuskingState'
import type { PadBehaviour } from './padBehaviour'
import { type BuskingTarget, type EffectPresence } from './buskingTypes'

/**
 * The busk view's body: the target band, the page the operator built, and the speed rail — or, in
 * edit mode, the library palette in the rail's place.
 *
 * The show chrome above it (`ShowHeader`, `ShowBar`) belongs to `routes/Busk.tsx`, like every other
 * live view.
 *
 * **Every press goes through one route.** A pad is pressed by `POST /busk/pads/{id}/press`,
 * whatever it holds, because the pad is what knows its bank and the bank is what decides which
 * siblings a press releases (D4). The three kind-specific mutations this view used to call are the
 * programmer's ⌥click strip's now, and the AI's.
 *
 * **There is no empty-selection dim.** The pools used to grey themselves out with nothing selected,
 * which is now wrong in three ways: a per-fixture template names its own heads, a Look with no
 * deferred effect names its own fixtures, and a cue has no targets at all — so all three are
 * legitimately pressable with an empty selection. The two that genuinely need one are refused *by
 * name* server-side (`TEMPLATE_NEEDS_SELECTION`, `LOOK_NEEDS_SELECTION`), and a sentence saying so
 * is a better answer than a grey page. A bank mixes kinds anyway, so the old per-section dim has
 * nothing left to be per.
 *
 * **No transport.** The stack cards and the pinned-cue grid went with the layout; GO and BACK live
 * on the ShowBar, and a cue pad's green comes from `useActiveCueIds` — its stack has that cue on
 * stage, playhead or not, which is what makes a cue pad a toggle rather than a playhead move.
 */
export function BuskingView({ projectId }: { projectId: number }) {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [targetSheetOpen, setTargetSheetOpen] = useState(false)
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const [searchParams, setSearchParams] = useSearchParams()

  const {
    selectedTargets,
    selectedLayerTargets,
    selectTarget,
    toggleTarget,
    clearSelection,
    programmerApplied,
  } = useBuskingState()

  const { data: pages, isLoading } = useBuskPagesQuery(projectId)
  const { data: templates } = useTemplateListQuery({ projectId })
  const { data: looks } = useLookListQuery({ projectId })
  const activeCueIds = useActiveCueIds(projectId)
  const { editing } = useSelector(selectBuskEdit)

  const [createPage, { isLoading: creating }] = useCreateBuskPageMutation()
  const [renamePage] = useRenameBuskPageMutation()
  const [deletePage] = useDeleteBuskPageMutation()
  const [reorderPages] = useReorderBuskPagesMutation()
  const [saveLayout, { isLoading: generating }] = useSaveBuskLayoutMutation()
  const [pressPad] = usePressBuskPadMutation()
  const cachePage = useCacheBuskPage(projectId)

  // `?page=` is resolved against what actually came back, so a stale bookmark or a page deleted in
  // another tab lands on the first page rather than on nothing.
  const requestedPageId = Number(searchParams.get('page'))
  const activePage = useMemo(() => {
    if (pages == null || pages.length === 0) return null
    return pages.find((page) => page.id === requestedPageId) ?? pages[0]
  }, [pages, requestedPageId])

  useEffect(() => {
    if (activePage == null || activePage.id === requestedPageId) return
    // `replace`, never `push`: flipping between pages is not a history entry.
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('page', String(activePage.id))
        return next
      },
      { replace: true },
    )
  }, [activePage, requestedPageId, setSearchParams])

  // Leaving the view leaves edit mode. Without this the FX cue-slot overlay, which reads the mode
  // from the store, would keep drawing its crosses on whatever page the operator went to.
  useEffect(() => () => void dispatch(exitBuskEdit()), [dispatch])

  useEffect(() => {
    if (editing && activePage != null) dispatch(enterBuskEdit(activePage.id))
  }, [editing, activePage, dispatch])

  const presenceOf = useCallback(
    (pad: BuskPad): EffectPresence => {
      const applied = programmerApplied ?? []
      if (pad.kind === 'TEMPLATE' && pad.template != null) {
        return templateLayerPresence(applied, selectedLayerTargets, pad.template.id)
      }
      if (pad.kind === 'LOOK' && pad.look != null) {
        return lookLayerPresence(applied, selectedLayerTargets, pad.look.id)
      }
      return 'none'
    },
    [programmerApplied, selectedLayerTargets],
  )

  const behaviour = useMemo<PadBehaviour>(
    () => ({
      presenceOf,
      isLive: (pad) => pad.kind === 'CUE' && pad.cue != null && activeCueIds.has(pad.cue.id),
      onPress: (pad) => {
        // A pad the layout write has not answered for yet has no id to press. It cannot be reached
        // in practice — presses are off while editing — but the guard keeps the type honest.
        if (pad.id == null) return
        void pressPad({ projectId, padId: pad.id, targets: selectedLayerTargets })
          .unwrap()
          .catch(ignoreReportedError)
      },
      onInspect: (pad) => {
        if (pad.kind === 'TEMPLATE') navigate(`/projects/${projectId}/templates`)
        else if (pad.kind === 'LOOK') navigate(`/projects/${projectId}/looks`)
        else if (pad.cue != null) {
          navigate(`/projects/${projectId}/show/stacks/${pad.cue.cueStackId}?cue=${pad.cue.id}`)
        }
      },
    }),
    [presenceOf, activeCueIds, pressPad, projectId, selectedLayerTargets, navigate],
  )

  const onPageKeys = useMemo(
    () => (activePage != null ? recordsOnPage(activePage) : new Set<string>()),
    [activePage],
  )

  const startFromLibrary = useCallback(async () => {
    const page = await createPage({ projectId, name: 'Page 1' }).unwrap().catch(ignoreReportedError)
    if (page == null) return
    const written = await saveLayout({
      projectId,
      pageId: page.id,
      ...libraryStarterLayout(templates ?? [], looks ?? []),
    })
      .unwrap()
      .catch(ignoreReportedError)
    // The one layout write outside the commit queue, so it has to seed the cache itself — the
    // create's own invalidation refetched this page while it was still empty, and nothing else
    // would show what was just generated until an unrelated frame arrived.
    if (written != null) cachePage(written)
  }, [createPage, saveLayout, cachePage, projectId, templates, looks])

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Dimmed while editing, because pads do not press then and the selection they would
              press onto is therefore not doing anything. */}
          <div
            className={
              editing ? 'opacity-55 transition-opacity [&_button]:pointer-events-none' : undefined
            }
            aria-disabled={editing || undefined}
          >
            <TargetBand
              selectedTargets={selectedTargets}
              onToggle={toggleTarget}
              onClear={clearSelection}
              onOpenPicker={() => setTargetSheetOpen(true)}
            />
          </div>

          <BuskPageStrip
            pages={pages ?? []}
            activePageId={activePage?.id ?? null}
            editing={editing}
            onSelect={(pageId) =>
              setSearchParams(
                (prev) => {
                  const next = new URLSearchParams(prev)
                  next.set('page', String(pageId))
                  return next
                },
                { replace: true },
              )
            }
            onCreate={(name) => createPage({ projectId, name }).unwrap()}
            onRename={(name) =>
              activePage == null
                ? Promise.resolve()
                : renamePage({ projectId, pageId: activePage.id, name }).unwrap()
            }
            onReorder={(pageIds) => void reorderPages({ projectId, pageIds })}
            onDelete={() => {
              if (activePage == null) return
              void deletePage({ projectId, pageId: activePage.id })
            }}
            onToggleEditing={() => {
              if (editing) dispatch(exitBuskEdit())
              else if (activePage != null) dispatch(enterBuskEdit(activePage.id))
            }}
          />

          <BuskEditProvider editing={editing} projectId={projectId} page={activePage}>
            {pages != null && pages.length === 0 && !isLoading ? (
              <BuskFirstOpen
                busy={creating || generating}
                onStartFromLibrary={() => void startFromLibrary()}
                onStartEmpty={() => void createPage({ projectId, name: 'Page 1' })}
              />
            ) : activePage != null ? (
              <BuskPageBody page={activePage} behaviour={behaviour} />
            ) : (
              <div className="min-h-0 flex-1" />
            )}
          </BuskEditProvider>
        </div>

        {editing ? (
          <LibraryPalette projectId={projectId} onPageKeys={onPageKeys} />
        ) : (
          <BuskSpeedRail />
        )}
      </div>

      {!isDesktop && (
        <Sheet open={targetSheetOpen} onOpenChange={setTargetSheetOpen}>
          <SheetContent side="left" className="flex w-full flex-col p-0 sm:max-w-sm">
            <SheetHeader className="px-4">
              <SheetTitle>Pick a target</SheetTitle>
            </SheetHeader>
            <TargetList
              selectedTargets={selectedTargets}
              onSelect={(target: BuskingTarget) => {
                selectTarget(target)
                setTargetSheetOpen(false)
              }}
              onToggle={toggleTarget}
            />
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}
