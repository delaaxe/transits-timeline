# transits-timeline

The app is `index.html` plus the ES modules in `src/`, loaded natively — there is
no build step for development. `scripts/` and `test/` only check it.

## Finish a feature on a preview URL

**A feature is not delivered until I can tap it.** Screenshots are not the same
thing: I want the branch open on my phone.

Every branch pushed here deploys itself — `.github/workflows/deploy.yml` runs the
tests, builds `dist/`, and hands it to Cloudflare Pages under the branch's own
name. `master` publishes production (transits.me); every other branch is a
preview. So pushing is publishing, and the last step of the work is telling me
where it landed.

After pushing, wait for the run and read the URL out of the "Deploy to Cloudflare
Pages" step, then give it to me with the summary:

```
✨ Deployment alias URL: https://claude-planet-chooser-ux-qw7.transits-timeline.pages.dev
```

Read it rather than deriving it. Cloudflare lowercases the branch, turns
everything but letters and digits into dashes, and then truncates to 28
characters, which is the part that is easy to get wrong. The run is at
`gh run list --workflow deploy.yml --branch <branch>` where the `gh` CLI exists,
and through the GitHub Actions MCP tools (`actions_list` → `list_workflow_jobs` →
`get_job_logs`) where it does not.

If the run failed, fix it and push again rather than handing over a branch that
did not deploy.

## Checks

`npm run check` is tests, typecheck and build, and CI now gates on all three.
The typecheck runs after the api-key.js step, because the one thing `tsc` cannot
resolve without that file is that file.

`npm run dev` serves the repo at :8931. `src/services/places.js` imports
`api-key.js`, which is gitignored and therefore missing on a fresh clone: without
it the module graph fails to load and the page comes up blank, so copy
`api-key.example.js` over it before driving the app in a browser. Place search is
the only thing that needs a real key.
