# Changelog

All notable changes to `@nixet/contracts` are recorded here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/).

## [0.1.1] — 2026-11-10

### Added

- `CreateGuardrailParams`, the request type a caller writes. Fields with
  defaults (`patterns`, `topics`) are optional in it, where
  `CreateGuardrailRequest` describes the parsed result and requires them.

## [0.1.0] — 2026-11-09

First public release: request, response and event schemas for the Nixet API.
