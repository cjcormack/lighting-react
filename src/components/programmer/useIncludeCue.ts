import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { formatError } from '@/lib/formatError'
import { useIncludeCueMutation } from '@/store/programmerOps'
import type { IncludeResponse, PropertyMaskGroup } from '@/store/programmerOps'
import { publishIncludeSelection } from '@/store/includeSelection'

export interface UseIncludeCueOptions {
  /**
   * Raise a toast when the Include fails. Callers that render the returned `error` inline
   * (the cue-picker sheet) pass false; callers with nowhere to put it (the Program view's
   * per-cue button) leave it on, or a failed Include is completely silent.
   */
  toastErrors?: boolean
}

/**
 * Include a cue into the programmer and hand its fixtures to the sheet's selection.
 *
 * Shared by the toolbar's cue picker and the Program view's per-cue Include, so the
 * auto-select and the warning surfacing can't drift between the two entry points.
 */
export function useIncludeCue(projectId: number, options: UseIncludeCueOptions = {}) {
  const { toastErrors = true } = options
  const [includeCue, { isLoading, error, reset }] = useIncludeCueMutation()
  const [result, setResult] = useState<IncludeResponse | null>(null)

  const include = useCallback(
    async (cueId: number, mask?: PropertyMaskGroup[]) => {
      try {
        const response = await includeCue({
          projectId,
          cueId,
          mask: mask && mask.length > 0 ? mask : undefined,
        }).unwrap()
        setResult(response)
        // "Select Heads on Include": the operator's next gesture is almost always to edit
        // exactly these fixtures.
        publishIncludeSelection(response.fixtureKeys, response.groupKeys)
        // Warnings here are advisory (an open cue-edit session, an empty cue) rather than
        // failures, so they toast instead of blocking the sheet.
        for (const warning of response.warnings) toast.warning(warning)
        return response
      } catch (err) {
        // The mutation's `error` state carries this for callers that render it inline;
        // swallowing the rejection here keeps it out of the console as unhandled.
        if (toastErrors) toast.error(formatError(err))
        return null
      }
    },
    [includeCue, projectId, toastErrors],
  )

  const resetInclude = useCallback(() => {
    setResult(null)
    reset()
  }, [reset])

  return { include, isLoading, error, result, resetInclude }
}
