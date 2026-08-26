# A9 Unified Desktop Workbench PRD v1.0

Status: `APPROVED_FOR_IMPLEMENTATION`  
Owner: A9 Trusted Agent Runtime  
Target: `0.3.0-alpha.1` / `WIN7-12`  
Date: 2026-08-26

## 1. Outcome

Replace the mixed A8/A9 desktop surface with one coherent A9 workbench that makes the current workspace, permission mode, task state, approvals, evidence, and recovery actions unambiguous on Windows 7 SP1 x64.

The redesign optimizes for operational clarity and error prevention first, visual quality second. It does not add a Review backend, change the A9 IPC or persistence contract, or expand Renderer privileges.

## 2. Problem

The current Renderer exposes two competing task entry points and several historical A8 controls alongside the A9 runtime:

- the center Composer submits an A8 task while the Inspector contains a second A9 task box;
- A8 sessions, Goal, Review, Provider, diagnostics, and A9 controls appear to be one product even when their state models are independent;
- approval actions appear inside a long Inspector stack and can become difficult to find or correlate with the active turn;
- the Inspector title says `READ ONLY` even when the workspace is in Full Access;
- Review remains selectable even though ADR-0096 defers its complete workflow to Alpha 2;
- Provider settings are duplicated and advanced network controls are permanently expanded;
- dense 10–12 px metadata and long scrolling panels reduce usability at 1366×768 and 125% DPI.

These ambiguities create direct acceptance and safety risk: the user can act in the wrong surface, misunderstand the active permission mode, or approve an operation without a stable task context.

## 3. Users and jobs

### Primary users

- Developers who understand files, Shell, Git, Diff, checkpoints, and local execution.
- Internal users who can describe a coding task but do not already understand Agent workflow details.

### Core jobs

1. Select one trusted local workspace and understand its current permission mode.
2. Describe one task through a single Composer and follow its real execution state.
3. Inspect files, changes, activity, and environment facts without losing task context.
4. Approve or deny a precisely bound high-impact action from a stable location.
5. Stop an active task and understand whether work completed, failed, was cancelled, or was interrupted.
6. Configure and probe a Provider without exposing secrets or routine users to advanced network fields.
7. Recover from actionable errors using an explicit next step.

## 4. Product principles

1. **One visible truth:** one workspace, one active A9 turn, one Composer, one approval action area.
2. **Progressive disclosure:** default views explain status plainly; raw output and expert details remain available on demand.
3. **State before decoration:** mode, task state, target, side effects, and recovery action are visually dominant.
4. **Fail closed:** unknown or historical modes never become Full Access silently.
5. **No pretend capability:** deferred, unavailable, or historical features are not presented as working controls.
6. **Stable action placement:** Send, Stop, Approve, and Deny do not move between unrelated surfaces.
7. **Win7 is the product environment:** no modern-browser-only dependency, network font, framework, or Windows 10 API.

## 5. Scope

### In scope

- Reorganize the existing native HTML/CSS/JavaScript Renderer.
- Make the center Composer the only visible A9 task submission path.
- Replace the left A8 session/Goal surface with workspace and current-task navigation.
- Turn the right rail into a contextual Inspector with `Files`, `Changes`, `Activity`, and `Environment` tabs.
- Put approvals in a fixed central action region above the Composer; show bound details in the Inspector.
- Move A9 Provider configuration into one Settings drawer.
- Limit Alpha 1 mode selection to Full Access and Read Only.
- Show Review only as a disabled `Alpha 2` capability signpost.
- Require explicit supported-mode selection when a historical persisted mode is `review` or otherwise unsupported.
- Add semantic design tokens, responsive behavior, keyboard handling, focus states, and reduced-motion support.
- Add DOM and interaction contract tests and developer visual evidence.
- Build an immutable WIN7-12 candidate and rerun affected Win7 gates.

### Out of scope

- Implementing Review staging, apply, or approval semantics.
- Adding multiple independent A9 chats or a new session state model.
- Adding recent-workspace history, task search, archive, or cloud synchronization.
- Changing Core, Policy, Tool, SQLite, checkpoint, Git, Shell, or Provider contracts solely for presentation.
- Adding a frontend framework, icon library, online font, telemetry service, or runtime dependency.
- Redesigning historical A8 harnesses that are not visible in the Alpha 1 product surface.
- Installing or modifying OS components, services, registry, firewall, network, or system PATH.

## 6. Information architecture

### Left navigation

- Product identity.
- Current workspace card and explicit workspace switch action.
- `Task` as the only primary product destination.
- Current task status summary.
- `Review · Alpha 2` as disabled, non-interactive roadmap information.
- Settings and Diagnostics utilities.

Historical A8 session lists, Goal controls, Terminal, Browser, and the old Review entry are not visible as active Alpha 1 features.

### Center task flow

- Header: workspace breadcrumb, page title, permission control, Provider health, task state, Inspector toggle.
- Persistent global error banner only for initialization or workbench-wide failures.
- Empty state with concise onboarding and safe example prompts.
- Chronological task stream using compact cards:
  - user request;
  - tool call and result;
  - Agent summary;
  - failure, cancellation, or interruption;
  - checkpoint and recovery fact.
- Fixed approval region immediately above the Composer.
- One Composer with Send/Stop state transition.

### Contextual Inspector

- `Files`: workspace tree, viewed files, files used by the current task.
- `Changes`: Diff, checkpoint list, undo/recovery facts, Git status.
- `Activity`: tool timeline, exit codes, expandable raw output.
- `Environment`: workspace path, mode, Shell, Provider, write lock, runtime facts.

Normal events do not automatically open the Inspector. Critical states may show a prompt to open the relevant tab but do not steal focus.

### Settings drawer

- Provider Base URL, model ID, API key, remember-with-DPAPI control, key state, and probe status.
- Advanced fields under collapsed `Enterprise network` disclosure.
- Insecure TLS in a visually distinct danger section and a second explicit confirmation before applying.
- No key is displayed after save and no secret is copied into diagnostics.

## 7. State and interaction requirements

### Workspace and mode

- A newly selected workspace must explicitly choose Full Access or Read Only.
- Full Access description must state that it uses the current Windows user's permissions and is not a sandbox.
- Read Only must state that write and Shell tools are unavailable.
- Read Only to Full Access requires an explicit confirmation.
- Full Access to Read Only can be applied directly after confirmation of the selected mode.
- Persisted `review`, missing, corrupt, or unsupported mode must block task submission and open a fail-closed choice; it must never restore Full Access implicitly.
- Review appears as `Planned for Alpha 2`, without a radio button or activation handler.

### Composer

- Enter submits; Shift+Enter inserts a newline.
- Empty or whitespace-only content does not submit.
- During submission, Send becomes Stop in the same action position.
- A stopped task reports `cancelled`; an interrupted task reports `interrupted`; neither is shown as success.
- At most one A9 turn can be active for the workspace.
- The old right-side A9 task textarea and the visible A8 submission path are removed.

### Approval

- The central approval region is the only place containing actionable Approve/Deny buttons.
- Approval shows tool, human-readable summary, exact target, Git remote/branch/force/delete facts where applicable, and approval identifier.
- Approve and Deny positions remain stable across approval types.
- Approval actions become disabled immediately after the first click and expose an in-progress state.
- Recovery after reload restores a still-valid pending approval or replaces a stale card with a non-actionable explanation and recovery action.
- No single-key shortcut approves an operation.

### Task cards and output

- Default card content includes operation, state, target summary, duration when available, and exit code when applicable.
- Raw stdout/stderr is collapsed by default, independently scrollable, copyable, and annotated when truncated.
- A failed card contains a recovery action such as retry, open Settings, inspect target, or start a new turn.
- Field errors stay next to their field; task errors stay in the task stream; initialization errors stay in the global banner.

## 8. Visual and responsive requirements

### Direction

Use an industrial control-console visual language with IDE efficiency:

- charcoal/graphite surfaces with cool cyan focus and active-state accents;
- amber for caution, red for destructive/error, green for verified success;
- restrained borders and depth; no decorative gradients, glass effects, or excessive rounding;
- body text approximately 14 px, metadata 12 px, and primary targets 40–44 px high;
- system UI and monospace font stacks only.

### Breakpoints

- At approximately 1200 px and wider, navigation, center, and Inspector can coexist.
- Below 1200 px, the Inspector is a drawer.
- Below 800 px, navigation is also a drawer.
- At 1366×768 with Windows scaling at 100% and 125%, the primary task, approval, Stop, and Composer controls remain reachable without horizontal page scrolling.

### Accessibility

- Target WCAG AA contrast for normal text and controls.
- Every icon-only control has an accessible name and visible tooltip where useful.
- Focus is clearly visible and follows the visual order.
- State never relies on color alone.
- Escape closes the topmost drawer/dialog without cancelling a task or denying an approval.
- Motion is limited to 150–200 ms state transitions and is disabled by `prefers-reduced-motion`.

## 9. Technical constraints

- Keep strict CSP and current preload/Schema IPC boundaries.
- Renderer must not receive direct filesystem, process, credential, or arbitrary network access.
- Reuse existing A9 snapshot, turn, approval, checkpoint, Git, mode, Provider, and Stop APIs.
- Do not add a package dependency or make runtime network requests for UI assets.
- Preserve evidence-producing identifiers where practical; update contract tests when the visible product contract intentionally changes.
- Hidden compatibility markup is allowed only when required by an A8 test harness and must not be focusable, announced, or mistaken for active Alpha 1 UI.

## 10. Acceptance criteria

### Structure

- Exactly one visible task textarea and one visible submit/stop action region exist.
- Exactly one actionable approval area exists, in the center flow.
- Inspector exposes the four specified tabs and no permanent long-stack layout.
- Provider configuration is available only from Settings in the visible UI.
- Review cannot be selected or entered in Alpha 1.

### Behavior

- Full Access and Read Only persistence, startup selection, and switching remain fail-closed.
- A real A9 task submitted through the central Composer produces task cards and A9 timeline/checkpoint facts.
- Approval, denial, reload recovery, stale-approval recovery, Stop, Diff, undo, and Git flows remain functional.
- Provider save/probe/DPAPI state remains secret-safe.

### Compatibility and evidence

- Targeted Renderer/A9 unit and DOM contract tests pass.
- Existing A9 Core/IPC/product tests relevant to changed paths pass.
- Developer screenshots cover empty, running, approval, failure, and responsive states.
- WIN7-12 Gate 3 passes on Win7 SP1 x64.
- Win7 screenshots cover 1366×768 at 100% and 125% DPI.
- Affected permissions, task, approval, Stop, Diff, Git, error recovery, and no-residual-process gates are rerun on the immutable WIN7-12 candidate.

## 11. Delivery stages and checkpoints

1. PRD and state wireframes.
2. Workbench shell, navigation, responsive grid, and semantic tokens.
3. Central A9 Composer, task stream, approval region, and Stop behavior.
4. Inspector tabs, Provider Settings, mode migration, and recoverable error surfaces.
5. Accessibility, density, responsive polish, and developer visual QA.
6. Targeted regression suite and source audit.
7. Immutable WIN7-12 build and Win7 acceptance rerun.

Each stage receives a local checkpoint commit containing only files changed for this work. No checkpoint is pushed.

## 12. Requirement clarity record

- Functional requirements: 35/35
- Technical constraints: 25/25
- UI/UX expectations: 20/20
- Business context: 10/10
- Scope boundaries: 10/10
- Total: **100/100**

The decisions above were confirmed through four focused clarification rounds. No open product decision blocks implementation.
