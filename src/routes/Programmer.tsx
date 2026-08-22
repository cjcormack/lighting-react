import { Navigate, useParams } from 'react-router'

/**
 * `/programmer` and `/programmer/fx` → the Program view, which now hosts the whole programmer.
 *
 * Back-compat only. The programmer used to be its own page with a Values / FX switcher; both are
 * tabs in `ProgrammerPane` now (alongside the layer stack), because they are readings of one live
 * object rather than destinations. Same shape as `CuesLegacyRedirect`, for the same reason: a
 * bookmark, a Cmd+K history entry or a link from another session should land somewhere.
 */
export function ProgrammerLegacyRedirect() {
  const { projectId } = useParams()
  const target = projectId ? `/projects/${projectId}/program` : '/program'
  return <Navigate to={target} replace />
}
