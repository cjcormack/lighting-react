# lighting-react — moved

**This repository is archived. The frontend now lives in
[`cjcormack/lighting7`](https://github.com/cjcormack/lighting7), under
[`frontend/`](https://github.com/cjcormack/lighting7/tree/main/frontend).**

The two repos were merged so a change that crosses the wire — a backend route and its client, a
Kotlin rule and its TypeScript mirror — can land as one commit. Open issues, branches and new work
belong there.

## History

The whole history came across with nothing rewritten. `lighting7`'s `main` contains every commit
from this repo under its **original hash**, so a hash cited in either repo's docs or commit
messages still resolves there:

- This repo's last commit, `150670a`, is an ancestor of `lighting7`'s `main`.
- `1c6b6d6b` moves every file into `frontend/`, and `7d6d5483` merges that into `lighting7`.
- Use `git log --follow frontend/<path>` in `lighting7` to see a file's history from before the
  move. `git blame` follows the rename on its own.

This repo stays up, read-only, so old links and hashes keep working.

## Bringing a branch across

At the move every branch here had already been merged. One made since (or one that turns up
later) can still be merged into `lighting7`, landing under
`frontend/`:

```bash
# in a lighting7 clone
git remote add react https://github.com/cjcormack/lighting-react.git
git fetch react <branch>
git merge -X subtree=frontend react/<branch>   # without -X, new files land in the backend's src/
```
