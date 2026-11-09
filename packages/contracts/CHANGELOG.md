# Changelog

All notable changes to `@nixet/contracts` are recorded here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/).

## [0.1.2] — 2026-11-10

### Changed

- Released alongside `@nixet/sdk` 0.1.2, with the `repository` and `bugs`
  links pointing at [github.com/nixetai/sdk](https://github.com/nixetai/sdk).
  No schema changes.

## [0.1.1] — 2026-11-10

### Added

- `CreateGuardrailParams`, the request type a caller writes. Fields with
  defaults (`patterns`, `topics`) are optional in it, where
  `CreateGuardrailRequest` describes the parsed result and requires them.

## [0.1.0] — 2026-11-09

First public release: request, response and event schemas for the Nixet API.
