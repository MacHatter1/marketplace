# BB Official plugin marketplace

The registry for the BB Official plugin marketplace. Merges to `main`
publish `https://getbb.app/marketplace/v1/marketplace.json`, which every BB
installation refreshes.

## Layout

- `entries/<plugin-id>.json` — one marketplace entry per plugin. The
  filename must equal the entry `id`. One file per plugin keeps submission
  pull requests conflict-free.
- `icons/` — optional icon files referenced relatively from entries.
- `marketplace.base.json` — marketplace identity (name, display name).
- `schema/marketplace.schema.json` — the entry contract. Canonical URL:
  <https://getbb.app/schemas/marketplace.schema.json>.
- `scripts/build.mjs` — validates everything and composes
  `dist/marketplace.json` deterministically.

## Submit a plugin

1. Fork this repository.
2. Add `entries/<your-plugin-id>.json`. The `id` must match the plugin id
   that your plugin package manifest derives. Point `source` at your public
   git repository (with an optional `subdir` for multi-plugin repositories)
   or your npm package.
3. Open a pull request. CI validates the entry; a maintainer reviews the
   plugin itself — source, behavior, and requested engine ranges.

Approval covers the listing. With a semver `range` source you release
updates by tagging your own repository; changing the entry itself (source
location, name, branding, wider ranges) needs a new reviewed pull request.
The account that opens the listing pull request is recorded as the owner in
`author.github` and gates later entry changes.

BB installs nothing automatically: a catalog refresh only surfaces
`bb plugin outdated`, and applying an update is a manual, staged,
rollback-protected action.

## Local validation

```sh
npm ci
npm run build   # validate + compose dist/marketplace.json
npm run check   # also verify sources exist (git ls-remote / npm view)
```
