# Hypa

Monorepo for Hypa Intelligence, managed with Turborepo and pnpm.

## Layout

- `packages/@hypa-config`: shared config, including the `json/models.json` model catalog
- `packages/@hypa-translate-core`: shared translate request builders
- `packages/@hypa-tiny-keys`: pinned on-device keyboard model, downloaded on install
- `packages/typescript-config`: shared tsconfig presets

## Commands

```sh
pnpm install
pnpm test
pnpm check-types
```
