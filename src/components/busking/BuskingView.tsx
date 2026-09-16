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
  useBuskShowingPageQuery,
  setShowingBuskPage,
  useAddBuskPadMutation,
} from '@/store/busk'
import { handPickUp, heldName, useHandPlace } from '@/store/hand'
import {
  isBuskPageDecided,
  keepFollowingBuskPage,
  setLocalBuskPage,
  unlinkBuskPage,
  useBuskPageDecided,
  useBuskPageFollow,
  useLocalBuskPage,
} from '@/lib/buskPageFollow'
import { toast } from 'sonner'
import { lastPadOfBank, libraryStarterLayout, recordsOnPage, removePad, toLayoutRequest } from '@/lib/buskLayout'
import { buskAddBody } from '@/lib/buskAdd'
import { skippedRowsMessage } from '@/lib/selectionMask'
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
 * programmer's ⌥click / touch-hold strip's now, and the AI's.
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
    families,
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
  const [addPad] = useAddBuskPadMutation()
  const placeFromHand = useHandPlace()
  const cachePage = useCacheBuskPage(projectId)

  // Which page is showing has two answers — the desk's and this window's — and a per-tab flag says
  // which of them this window is on (`lib/buskPageFollow.ts`). Following:
  //
  //   the desk's showing page  >  `?page=`  >  the first page
  //
  // Local (the chip clicked to *This window*):
  //
  //   this window's own page   >  `?page=`  >  the first page
  //
  // The **desk is still one fact and still moves for the hardware**: a MIDI *next page* press
  // writes `BuskPageState` and every *following* window moves with it, which is the argument that
  // made the showing page server-owned in the first place (midi-surface plan D6) and is untouched
  // here. What that argument never established is that every window must be pinned to it — and on
  // two screens it is wrong, because the flow this exists for is a colour page on one screen and a
  // position page on the other, pressed onto one shared selection. So: two facts, two flags, two
  // chips, and **this one may never read the selection's** (`lib/deskFollow.ts`). A window that has
  // unlinked its page has not unlinked its selection and still presses onto the desk's.
  //
  // A tab click writes the **desk** while following, and this window's own copy once unlinked.
  // Both are resolved against the fetched list, so a stale bookmark or a page deleted in another
  // tab lands somewhere real.
  //
  // **There is no separate offline override any more.** There used to be one — a local page set
  // only when `setShowingBuskPage` failed because the socket was down, cleared by any change to the
  // desk's value — and it was the same shape as a local page: a per-tab page that beats the desk's.
  // Two mechanisms meaning "this tab's page" is one too many, so a click that never left the
  // browser now **unlinks the window** onto the page clicked. That is the honest reading of what
  // just happened (`sendGesture` has already toasted that it did not reach the rig), and unlike the
  // old override it *says so*: the page chip flips to *This window*.
  const requestedPageId = Number(searchParams.get('page'))
  const { data: deskPageId } = useBuskShowingPageQuery()
  const followingPage = useBuskPageFollow()
  const localPageId = useLocalBuskPage()
  const activePage = useMemo(() => {
    if (pages == null || pages.length === 0) return null
    const preferred = followingPage ? deskPageId : localPageId
    return (
      pages.find((page) => page.id === preferred) ??
      pages.find((page) => page.id === requestedPageId) ??
      pages[0]
    )
  }, [pages, followingPage, deskPageId, localPageId, requestedPageId])

  const onPageSelect = useCallback(
    (pageId: number) => {
      if (!followingPage) {
        setLocalBuskPage(pageId)
        return
      }
      if (!setShowingBuskPage(pageId)) unlinkBuskPage(pageId)
    },
    [followingPage],
  )

  // **`?page=` is *this window's* page when the window arrives carrying one**, and arriving with
  // one unlinks it: a launcher URL (`?window=Screen%202&page=3`, the Screens sheet's spelling plus
  // this) is an explicit statement about this window, and a link that says page 3 opening on
  // whatever the desk happens to hold would be no statement at all. The consequence is worth
  // knowing, because it is surprising: the view mirrors the showing page into `?page=`, so the
  // busk view's own address always carries one — and a **copied URL opened in a fresh window
  // therefore arrives local rather than following**. One click on the chip joins it to the desk.
  //
  // It is consumed **once per tab**, guarded on `isBuskPageDecided`, because the effect below
  // mirrors the showing page back into `?page=` on every change: a guard that died with the mount
  // would let a *reload* of a following window read its own mirror as a deliberate statement and
  // unlink on every refresh. The flag's third state — undecided — is what tells a fresh window from
  // a reloaded one, so both arms write it: a window that arrives with no usable `?page=` records
  // that it follows. There is deliberately no second, in-memory "already ran" flag beside it; the
  // persisted one can never disagree with itself, and a ref could.
  //
  // `launchPageId` is latched at mount, because by the time `pages` resolves the mirror may already
  // have written a `page` this window never asked for. It is latched as the **raw parameter**,
  // null when absent: `Number(null)` is 0, and a page whose id really were 0 would make every plain
  // `/busk` load read as an arrival and unlink an ordinary tab with nobody having asked.
  const [launchPageId] = useState(() => {
    const raw = searchParams.get('page')
    return raw == null ? null : Number(raw)
  })
  useEffect(() => {
    if (pages == null || pages.length === 0 || isBuskPageDecided()) return
    const arrival = launchPageId == null ? undefined : pages.find((page) => page.id === launchPageId)
    if (arrival != null) unlinkBuskPage(arrival.id)
    else keepFollowingBuskPage()
    // `searchParams` is deliberately absent: `launchPageId` is the arrival value, latched.
  }, [pages, launchPageId])

  // Not until the arrival decision above has been *rendered*. Both effects run in one commit, in
  // this order, and `unlinkBuskPage` only schedules the re-render that moves `activePage` — so
  // without this gate the mirror writes the page the window is unlinking *from* into the URL, and
  // corrects it a tick later. `useBuskPageDecided` is the rendered tri-state precisely because it
  // lags by one render; see its doc for why neither the live read nor `useBuskPageFollow` can
  // stand in for it here.
  const pageDecided = useBuskPageDecided()
  useEffect(() => {
    if (!pageDecided || activePage == null || activePage.id === requestedPageId) return
    // `replace`, never `push`: flipping between pages is not a history entry.
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('page', String(activePage.id))
        return next
      },
      { replace: true },
    )
  }, [pageDecided, activePage, requestedPageId, setSearchParams])

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
        // The pair a press acts on — the desk's while following, this tab's own when unlinked
        // (multi-screen plan D4) — and never pre-refused from the mask held here: the mask is
        // tested on the on arm only, so a lit pad still comes off under a mask that excludes it,
        // and only the desk knows which arm this is. A refusal (`TEMPLATE_OUTSIDE_MASK`,
        // `LOOK_OUTSIDE_MASK`) arrives as a 400 whose message names both families, and
        // `errorToastMiddleware` toasts it as it toasts every rejected mutation.
        void pressPad({
          projectId,
          padId: pad.id,
          targets: selectedLayerTargets,
          families: families ?? undefined,
        })
          .unwrap()
          .then((result) => {
            // The skip is reported on the pressing window (D6) — this one. The marquee's window
            // learns the way it learns every layer: `programmer.layerState` carries the mask, and
            // `LookStack` draws the badge. *Rows*, not the family: the cook masks a layer's rows
            // and not its effects, so a Look's effect in a skipped family still runs.
            const message = skippedRowsMessage(result.skippedFamilies ?? [], families)
            if (message != null) toast.warning(message)
          })
          .catch(ignoreReportedError)
      },
      onInspect: (pad) => {
        if (pad.kind === 'TEMPLATE') navigate(`/projects/${projectId}/templates`)
        else if (pad.kind === 'LOOK') navigate(`/projects/${projectId}/looks`)
        else if (pad.cue != null) {
          navigate(`/projects/${projectId}/show/stacks/${pad.cue.cueStackId}?cue=${pad.cue.id}`)
        }
      },
      // *Pick up* names the **record**, not the pad: what the hand holds is the template, Look or
      // cue, and placing it elsewhere makes a second pad rather than moving this one. (The MIDI
      // door is `PickUpPad(padUuid)` and resolves to the same record server-side.)
      onPickUp: (pad) => {
        const id = pad.template?.id ?? pad.look?.id ?? pad.cue?.id
        if (id != null) handPickUp(pad.kind, id)
      },
      // A place is this window's own append followed by `hand.drop` (D12). The append answers the
      // **whole page**, so the busk view's commit queue needs nothing from it — and the Undo has to
      // go back through the layout PUT, since there is no remove-pad route: the append's own
      // response is the page to take the new pad off.
      onHandPlace: (bankId, bankName, held) => {
        const pageId = activePage?.id
        if (pageId == null) return
        void placeFromHand(held, {
          where: bankName,
          run: () =>
            addPad({
              projectId,
              pageId,
              bankId,
              ...buskAddBody({ kind: held.kind, id: held.id, name: heldName(held) }),
            }).unwrap(),
          undo: (page) => {
            const at = lastPadOfBank(page, bankId)
            if (at == null) return
            void saveLayout({
              projectId,
              pageId: page.id,
              ...toLayoutRequest(removePad(page, at)),
            }).unwrap().catch(ignoreReportedError)
          },
        })
      },
    }),
    [
      presenceOf,
      activeCueIds,
      pressPad,
      projectId,
      selectedLayerTargets,
      families,
      navigate,
      activePage,
      addPad,
      saveLayout,
      placeFromHand,
    ],
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
              families={families}
              onToggle={toggleTarget}
              onClear={clearSelection}
              onOpenPicker={() => setTargetSheetOpen(true)}
            />
          </div>

          <BuskPageStrip
            pages={pages ?? []}
            activePageId={activePage?.id ?? null}
            editing={editing}
            // The desk while this window follows it, this window's own copy once unlinked — and
            // the effect above mirrors whichever won into `?page=`. A click that never reached the
            // desk unlinks the window rather than overriding it silently; see `onPageSelect`.
            onSelect={onPageSelect}
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
