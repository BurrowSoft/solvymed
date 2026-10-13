# Help articles

The Help Center articles (pt-BR, en, and th where drafted), one file per category. The format and the conditions are described at the top of `scripts/help-build.mjs`.

- After editing an article or `conditions.json`, run `npm run help:build`. This regenerates `src/content/helpArticles.json`, and a test fails if the JSON is out of date.
- Text that describes something not true yet stays behind a condition (`{pending:id}` / `requires:id`) until the PR that makes it true flips it.
- **SolvyAI** (website and app) answers from this JSON and from the App Map (`src/lib/solvyai/app-map.ts`), both bundled into the website's `/api/assistant`, which the app calls too. A Help or App Map change reaches SolvyAI on both platforms with the next production deploy of master. There is no separate index or cache to refresh.
- A user-facing change updates the Help and the App Map in the same PR (or links the follow-up).
