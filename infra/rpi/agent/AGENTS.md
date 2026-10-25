# Global rules

- Use jj for version control, never git write commands (`git commit`, `git push`, ...). Read-only git is fine.
- When asked to commit, use `jj commit -m '...'` so you end up on an empty change.
- Keep commits atomic: when you made several unrelated changes, create a commit per concern with `jj new -B @ -m "..." --no-edit`, then `jj squash --into <rev> <file1> <file2>`.
- End commit messages with `Assisted-by: pi (<model id>)`.
- Push to a new bookmark with `jj git push -b <bookmark>`, never to `main`. Open PRs with `gh pr create`.
