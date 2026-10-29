# Hypa

Monorepo for Hypa Intelligence, managed with Turborepo and pnpm.

## Layout

- `apps/hypa-api`: NestJS API serving the mobile app, including the Chat agent (`/v2/agent`, `/conversations`)
- `apps/hypa-intelligence-mobile`: Hypa Intelligence mobile app and keyboard (Expo)
- `packages/@hypa-config`: shared config, including the `json/models.json` model catalog
- `packages/@hypa-translate-core`: shared translate request builders
- `packages/@hypa-intelligence-core`: client for the `/v2/agent` stream, used by the Chat tab
- `packages/@hypa-tiny-keys`: pinned on-device keyboard model, downloaded on install

## Commands

```sh
pnpm install
pnpm check-types
pnpm --filter @hypa/intelligence ios
pnpm --filter @hypa/intelligence android
pnpm --filter hypa-api dev
```
