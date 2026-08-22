/**
 * Refuse to save a Look whose contents this client has not seen.
 *
 * `LookEditor` seeds its form from the `look` prop **once per id**, so before the detail fetch
 * lands an existing Look renders as an empty *create* draft. Saving that would PUT `rows: []`, and
 * the backend reads an empty `rows` as "clear them" — out from under every cue resolving through
 * the Look. The write is the destructive part, so the guard belongs on the way out rather than
 * only in the editor: `isLoading` stops the operator reaching Save, this stops a caller that
 * forgot to pass it.
 *
 * Throwing rather than returning is deliberate. It propagates into `LookEditor.handleSave`'s
 * catch, which keeps the sheet open and puts the message in its own inline alert — the only
 * reporter there is, since `saveLook` is in `SILENT_ENDPOINTS`.
 *
 * Both arms matter, and the failure arm is why this is a function rather than one line inlined
 * twice: "try again in a moment" describes something that will never happen when the fetch has
 * already errored, and an operator retrying on that advice learns nothing.
 */
export function assertLookLoaded(
  look: unknown | null | undefined,
  options: { failed?: boolean } = {},
): void {
  if (look != null) return
  if (options.failed) {
    throw new Error(
      "This look's contents couldn't be loaded, so saving would overwrite them. Close the editor " +
        'and try again.',
    )
  }
  throw new Error("This look hasn't finished loading yet — try again in a moment.")
}
