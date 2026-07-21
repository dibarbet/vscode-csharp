# ESM and Code Splitting Plan

## Status

Planning only. This document does not change the extension runtime, build output, or packaging behavior.

The work should be implemented in a separate pull request after the deferred OmniSharp and download imports are established. Those dynamic imports provide the initial chunk boundaries.

## Goals

- Emit the Node extension as ESM and enable esbuild code splitting.
- Keep OmniSharp and download-only code out of the initial Roslyn chunk graph.
- Avoid reading, parsing, initializing, or retaining optional chunks until their dynamic imports execute.
- Preserve extension behavior across supported operating systems, architectures, trusted and untrusted workspaces, and local and remote Node extension hosts.
- Preserve JavaScript signing, VSIX signing, localization, source maps, debugging, and offline packaging.
- Demonstrate a measurable improvement to common Roslyn activation without an unacceptable OmniSharp or download-path regression.

## Non-goals

- Add a browser extension entry point. The web worker extension host does not support this ESM loading path and this extension currently has no `browser` entry.
- Convert task scripts, tests, or the repository package itself to ESM.
- Change language-server selection or extension activation semantics.
- Introduce new deferred imports without evidence that they improve a meaningful activation path.
- Replace esbuild or redesign extension architecture unrelated to module loading.

## Current State and Constraints

- `package.json` points `main` at `./dist/extension` and requires VS Code `^1.106.0`.
- `esbuild.js` creates one CommonJS file at `dist/extension.js` with `bundle: true`, `format: 'cjs'`, and `platform: 'node'`.
- Esbuild only supports code splitting with ESM output and an output directory.
- Current dynamic imports defer module initialization but their code remains in the single bundle.
- VS Code's Node extension host recognizes `.mjs` extension entry points and loads them with native `import()`.
- VS Code's Node extension host provides an ESM resolver hook for the synthetic `vscode` module.
- The production build signs JavaScript under `dist`, and the current MSBuild signing item only includes top-level `*.js` files.
- `.vscodeignore` includes `dist` implicitly and excludes source maps.
- Runtime source currently contains `__dirname` assumptions and a TypeScript `import = require` declaration that must be reviewed for ESM output.
- Split chunks may be emitted under a different directory from the entry point, so runtime resource paths must not depend on a chunk's physical location.
- Esbuild documents splitting as work in progress and has a known cross-chunk import ordering issue. Functional validation must cover initialization-order-sensitive paths.

## Target Design

Use a direct ESM extension entry point instead of a CommonJS bootstrap:

```text
dist/
  extension.mjs
  chunks/
    activateOmniSharp-<hash>.mjs
    downloadAndInstallPackages-<hash>.mjs
    chunk-<hash>.mjs
```

The expected esbuild shape is:

```js
{
    entryPoints: { extension: 'src/main.ts' },
    bundle: true,
    format: 'esm',
    splitting: true,
    platform: 'node',
    outdir: 'dist',
    outExtension: { '.js': '.mjs' },
    entryNames: '[name]',
    chunkNames: 'chunks/[name]-[hash]',
}
```

`package.json` should point `main` directly at `./dist/extension.mjs`. Do not set package-level `"type": "module"`, because that would also change how Node interprets CommonJS build scripts such as `esbuild.js`.

Retain the existing dynamic import locations for OmniSharp and the download stack. Esbuild should turn each into a native ESM chunk import. Shared dependencies may be extracted into additional shared chunks.

## Phase 1: Establish a Baseline

1. Build and package the current CommonJS implementation in production mode.
2. Record the production bundle size, production VSIX size, VSIX file count, and files under `dist`.
3. Capture VS Code's extension activation measurements, including code loading, activate call, and activate resolved time.
4. Measure the following scenarios independently:
   - Trusted Roslyn activation with all components already installed.
   - Trusted Roslyn activation requiring a component download.
   - Trusted OmniSharp activation.
   - Untrusted workspace activation.
   - Debugger activation after Roslyn startup.
5. Capture extension-host memory after Roslyn reaches project initialization complete and after OmniSharp initialization.
6. Use the same machine, VS Code build, workspace, installed components, and extension-host state for before and after measurements.
7. Run enough cold extension-host samples to report median and p95 rather than relying on one activation.
8. Save the commands, environment details, raw measurements, and summary with the implementation pull request.

## Phase 2: Make the Build Produce ESM Chunks

1. Change `esbuild.js` from `outfile` and CommonJS output to `outdir`, ESM output, and `splitting: true`.
2. Emit a stable `dist/extension.mjs` entry name and content-hashed chunk names under `dist/chunks`.
3. Clean generated bundle outputs before every esbuild build. This prevents obsolete hashed chunks from being included in a later VSIX.
4. Preserve development source maps and production minification behavior.
5. Ensure source maps refer to the original TypeScript sources and remain excluded from published VSIX files unless policy changes.
6. Generate an esbuild metafile during validation, or provide a dedicated analysis command, to identify chunk contents and static paths that pull optional code into the entry chunk.
7. Keep `vscode`, `applicationinsights-native-metrics`, and `@opentelemetry/tracing` external unless compatibility testing identifies a reason to change them.
8. Verify that OmniSharp and download implementation modules are absent from the entry chunk. Shared code legitimately used by Roslyn may remain in the entry or shared eager graph.
9. Fail the build or artifact tests if the expected entry file is absent or if an emitted chunk import resolves outside `dist`.

## Phase 3: Resolve ESM and Resource-Path Compatibility

1. Audit all runtime `require`, `require.resolve`, `module`, `exports`, `__filename`, `__dirname`, and TypeScript `import = require` usage in `src` and bundled dependencies.
2. Replace source-level `__dirname` path calculations with explicit stable roots:
   - Prefer `context.extension.extensionPath` for extension assets and downloaded components.
   - Use a deliberately defined entry-module directory only when the resource is guaranteed to live relative to `dist`.
   - Do not derive extension resources from an optional chunk's `import.meta.url`, because chunks live under `dist/chunks`.
3. Review at least these existing path consumers:
   - Roslyn language-server location in `src/lsptoolshost/activate.ts`.
   - Built-in component paths in `src/lsptoolshost/extensions/builtInComponents.ts`.
   - Process working directories in `src/shared/platform.ts`.
4. Convert the `path` import assignment in the Blazor debug configuration provider to normal ESM-compatible TypeScript syntax.
5. Inspect esbuild's metafile and generated output for CommonJS dependencies that retain runtime `require()` calls.
6. If dependencies need `require`, add the narrowest compatible `createRequire(import.meta.url)` shim. Avoid a global compatibility banner unless generated-output inspection shows it is required across chunks.
7. If a banner is required, verify it is valid and collision-free in the entry and every generated chunk.
8. Exercise dependencies that commonly expose CommonJS assumptions, including archiving, downloads, proxy agents, telemetry, process enumeration, Razor, and the language client.
9. Verify that `import 'vscode'` resolves to the extension-specific VS Code API from the entry and from lazy chunks.
10. Verify that native or external modules resolve from local, remote, and packaged extension locations.
11. Check initialization-order-sensitive modules for reliance on static import order across chunk boundaries.

## Phase 4: Update Manifest, Packaging, and Signing

1. Change `package.json` `main` to `./dist/extension.mjs` without adding package-level `"type": "module"`.
2. Update artifact tests to require `dist/extension.mjs` and all chunks referenced by its transitive imports.
3. Add an artifact test that fails when stale, unreferenced generated chunks remain under `dist`.
4. Confirm `.vscodeignore` includes `dist/extension.mjs` and `dist/chunks/**/*.mjs` while continuing to exclude source maps.
5. Inspect a development VSIX and every release platform VSIX to confirm all referenced chunks are present with their original relative paths.
6. Reorder production packaging so esbuild generates the final ESM files before JavaScript signing. No build step may mutate signed files afterward.
7. Update `signJs.proj` to sign the ESM entry and chunks recursively. Preserve signing of any generated `.js` files that remain part of the package.
8. Confirm test signing and official signing recognize `.mjs`, including nested chunk paths. If the signing service does not support `.mjs`, stop and resolve that constraint before runtime migration.
9. Verify signatures on the entry and every executable chunk, then verify the signed VSIX manifest.
10. Ensure release packaging does not reuse `dist` from a previous target or configuration.
11. Confirm platform-neutral and platform-specific VSIX generation for:
    - Windows x64 and arm64.
    - Linux glibc x64 and arm64.
    - Linux musl x64 and arm64.
    - macOS x64 and arm64.

## Phase 5: Functional Validation

Run the existing checks after each implementation slice, then run the full matrix before merge:

1. `npm run compileDev`
2. `npm run packageDev`
3. `npm run test:unit`
4. `npm run test:artifacts`
5. `npm run test:integration:csharp`
6. `npm run test:integration:devkit`
7. `npm run test:integration:razor:cohost`
8. `npm run test:integration:untrusted`
9. `npm run omnisharptest:unit`
10. `npm run omnisharptest:integration`
11. `npm run package`
12. `npm run vsix:release:package`
13. `npm run verifyVsix` in the signing workflow.

Add focused coverage where the existing suites do not prove chunk behavior:

- Roslyn activation succeeds without loading the OmniSharp chunk.
- An already-installed environment does not load the download chunk.
- A missing component loads the download chunk and completes installation.
- OmniSharp activation loads its chunk and initializes language service, Razor, test, and debug integrations.
- Limited activation does not load either language-server implementation chunk unnecessarily.
- Lazy chunks can import `vscode` and receive the correct extension-scoped API object.
- Extension resources resolve correctly when callers execute from a nested chunk.
- Activation and deactivation exports are visible from the ESM entry point.

Validate manually or in CI on:

- Windows, Linux, and macOS Node extension hosts.
- WSL, SSH, and dev-container remote extension hosts.
- Extension development mode and an installed VSIX.
- Roslyn, Roslyn with C# Dev Kit, and OmniSharp configurations.
- Trusted and untrusted workspaces.
- Online, offline with all components installed, and component-download scenarios.
- Debugger activation for supported debug types.

## Phase 6: Performance and Chunk Validation

1. Repeat the baseline procedure using the ESM build.
2. Compare median and p95 for code loading, activate call, activate resolved, and end-to-end activation.
3. Compare extension-host memory after equivalent Roslyn and OmniSharp initialization points.
4. Compare production VSIX size, installed size, file count, and entry chunk size.
5. Confirm with runtime tracing or temporary validation-only instrumentation that:
   - Roslyn startup does not evaluate or read the OmniSharp chunk.
   - Normal installed startup does not evaluate or read download chunks.
   - Each lazy chunk initializes only once when requested concurrently.
6. Remove temporary instrumentation before merge.
7. Investigate any eager shared chunk. Use the esbuild metafile to identify the static import path that made it eager.
8. Record the lazy-load cost added to OmniSharp and download scenarios.

The implementation should proceed only if:

- Common Roslyn activation shows a repeatable material improvement in code-loading or end-to-end time.
- Roslyn steady-state memory does not regress and preferably improves.
- OmniSharp and download-path regressions are understood and acceptable.
- Added file count and VSIX size remain operationally acceptable.
- No supported platform, remote scenario, signing step, or release workflow regresses.

If results are neutral or noisy, retain the current CommonJS deferred-initialization approach instead of accepting ESM migration complexity without demonstrated user benefit.

## Rollout

1. Implement this work in a pull request separate from the deferred-import change so performance and compatibility effects are independently reviewable.
2. Document that the implementation depends on the dynamic import boundaries from the deferred-import pull request.
3. Include the esbuild metafile summary, VSIX contents, signing evidence, functional test matrix, and before/after measurements in the pull request.
4. Publish through the normal prerelease channel first.
5. Monitor activation failures, module-resolution errors, download failures, OmniSharp startup, and activation-time telemetry during prerelease exposure.
6. Promote to stable only after prerelease data shows no meaningful regression.

## Rollback

Rollback does not require data migration. Revert the manifest entry to `./dist/extension`, restore CommonJS `outfile` bundling, and restore the prior signing include and package order. Keep the source-level dynamic imports, since they still provide deferred initialization in the CommonJS bundle.

The implementation pull request should keep build, manifest, signing, and compatibility changes in reviewable commits so the ESM output can be reverted without undoing unrelated activation improvements.

## Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| CommonJS dependency fails under ESM | Audit generated runtime `require()` calls, use targeted `createRequire`, and exercise each affected feature. |
| Resource paths become relative to `dist/chunks` | Replace chunk-location assumptions with `context.extension.extensionPath` or another explicit stable root. |
| Stale hashed chunks enter a VSIX | Clean generated output before builds and add an unreferenced-chunk artifact test. |
| A chunk is omitted from a VSIX | Traverse generated imports in artifact tests and inspect packaged VSIX contents. |
| Nested `.mjs` files are unsigned | Generate before signing, sign recursively, and verify every executable output. |
| Static initialization order changes | Run full integration suites and inspect modules with top-level registration or side effects. |
| Lazy chunk cannot resolve `vscode` | Test imports from the entry and lazy chunks on the minimum supported VS Code version. |
| Remote host differs from local host | Validate WSL, SSH, and container extension hosts using installed VSIX files. |
| More files increase install or security-scanning cost | Report file count, installed size, packaging time, and scan/signing impact. |
| OmniSharp cold startup regresses | Measure the added chunk I/O and establish an explicit acceptable regression threshold. |
| Esbuild splitting behavior changes | Pin or deliberately validate esbuild updates and retain artifact/chunk-graph tests. |

## Definition of Done

- The extension entry is ESM and dynamic imports produce physical chunks.
- The production entry excludes OmniSharp and download-only implementation code except for legitimately shared dependencies.
- Resource paths are independent of generated chunk locations.
- Development, production, localization, debugging, packaging, and signing workflows pass.
- All referenced chunks are present and signed in every supported VSIX.
- Unit, artifact, Roslyn, Dev Kit, Razor, untrusted-workspace, and OmniSharp tests pass.
- Local and remote validation passes on Windows, Linux, and macOS where applicable.
- Before/after measurements demonstrate that the migration meets the agreed performance gate.
- Prerelease monitoring shows no material activation or module-resolution regression.
- Rollback remains a build and manifest revert with no user-data migration.