# Changelog

## 0.1.7

- Update dev toolchain to `convex` 1.46 and `convex-test` 0.0.59; regenerate
  codegen with the 1.46 CLI (generated `server.ts` now exports a typed `env`
  including `CONVEX_CLOUD_URL` and `CONVEX_SITE_URL`). No runtime changes;
  `convex` peer range unchanged.

## 0.1.6

- Bump `@convex-dev/workpool` to ^0.4.8: job completions no longer write the
  pool's `runStatus` singleton when the loop is scheduled and unsaturated,
  eliminating OCC retry storms on the callback pool under delivery-event bursts.
  Requires `convex` >= 1.36.1 (peer range bumped).

## 0.1.5

## 0.1.3

## 0.1.2

## 0.0.0

- Initial release.
