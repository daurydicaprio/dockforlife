# Project Architecture and Implementation Plan

## 1. Project Goal

The objective of this project is to build a web-based OBS controller application that enables users to control OBS Studio remotely and securely from iPad, mobile devices, and desktop browsers. The application must function both locally (on the same network as OBS) and remotely (over the internet) without compromising the security of the OBS instance.

A critical architectural constraint is that OBS Studio itself is **never exposed directly to the public internet**. All remote traffic flows through a secure gateway layer that acts as a intermediary, preventing direct attacks on the OBS WebSocket port.

The solution must provide a production-quality user experience with responsive mobile controls, real-time state synchronization, and robust error handling. The remote capability must be opt-in and not degrade the existing local-only workflow.

---

## 2. Current State (Phase 1 – Completed)

### 2.1 Architecture Overview

The application currently operates in local-only mode with a direct WebSocket connection between the browser and OBS Studio. The architecture consists of:

- **Frontend**: React + TypeScript application using Next.js
- **State Management**: Local React state with localStorage persistence for user configuration
- **OBS Communication**: obs-websocket-js library connecting directly to OBS on port 4455
- **Discovery Mechanism**: Dynamic discovery of scenes, inputs, and filters via OBS WebSocket API calls

### 2.2 Verified Functionality

The following capabilities are proven and must remain functional throughout all future phases:

- Dynamic scene enumeration via `GetSceneList`
- Dynamic input/source enumeration via `GetInputList` and `GetSceneItemList`
- Dynamic filter discovery via `GetSourceFilterList`
- Button actions: Mute, Scene switch, Visibility toggle, Filter toggle, Record, Stream
- State synchronization with 1.5-second polling intervals
- Mute state tracking per input
- Recording and streaming status indicators
- Button configuration persistence via localStorage

### 2.3 Phase 1 Achievements

Phase 1 focused entirely on observability, validation, and correctness without modifying the underlying OBS discovery or command execution logic. The following were added:

- Console logging for connection events (`[OBS] Connected`)
- Console logging for data loading events (`[OBS] Scenes loaded`, `[OBS] Inputs loaded`, `[OBS] Filters loaded`)
- Console logging for execution attempts (`[EXECUTE] Action=... Target=... Filter=...`)
- Defensive validation preventing execution with empty targets
- Enhanced error logging for debugging failed actions

All existing behavior is preserved. No breaking changes were introduced.

---

## 3. Target Architecture (High-Level)

### 3.1 System Architecture Diagram

```
+---------------------+          +--------------------------+          +-------------------------+          +----------------------+
|                     |          |                          |          |                         |          |                      |
|  Browser            |   HTTPS  |   Cloudflare Worker      |   WSS    |   Local OBS Proxy       |   WSS    |   OBS Studio         |
|  (iPad/Mobile/      | --------> |   (API / Gateway)        | --------> |   (Binary / Daemon)     | ---------> |   (Port 4455)        |
|   Desktop)          |          |                          |          |                         |          |                      |
|                     |          |   - Authentication       |          |   - Connection pooling  |          |   - Scenes           |
|   - React UI        |          |   - Request routing      |          |   - Heartbeat monitor   |          |   - Inputs           |
|   - Button deck     |          |   - Rate limiting        |          |   - Command buffer      |          |   - Filters          |
|   - Config modal    |          |   - CORS enforcement     |          |   - Auto-reconnect      |          |   - Recording        |
|                     |          |   - WebSocket upgrade    |          |                         |          |   - Streaming        |
+---------------------+          +--------------------------+          +-------------------------+          +----------------------+
```

### 3.2 Component Responsibilities

**Browser (Client Layer)**
- Renders the button deck interface
- Manages user interactions and configuration
- Connects to Cloudflare Worker when in remote mode
- Connects directly to Local OBS Proxy when in local mode
- Persists user configuration to localStorage
- Validates button configurations before submission

**Cloudflare Worker (Gateway Layer)**
- Terminates HTTPS connections from browsers
- Authenticates and authorizes requests
- Routes commands to the appropriate Local OBS Proxy
- Enforces rate limiting and request validation
- Manages WebSocket connections between clients and proxies
- Acts as a relay—not a state store

**Local OBS Proxy (Transport Layer)**
- Runs as a binary or daemon on the same machine as OBS
- Maintains a persistent WebSocket connection to OBS
- Authenticates with the Cloudflare Worker using credentials
- Buffers and retries commands if connectivity is lost
- Monitors OBS state and reports changes to connected clients
- Never exposes OBS WebSocket port externally

**OBS Studio (Application Layer)**
- Provides scenes, inputs, filters via obs-websocket plugin
- Receives commands from the Local OBS Proxy
- Runs on the user's local machine

### 3.3 Communication Patterns

**Local Mode (Same Network)**
```
Browser <---> Cloudflare Worker (optional relay) <---> Local OBS Proxy <---> OBS
Browser <---> Local OBS Proxy <---> OBS (direct bypass)
```

**Remote Mode (Internet)**
```
Browser <---> Cloudflare Worker <---> Local OBS Proxy <---> OBS
```

The Local OBS Proxy supports both patterns, with Cloudflare Worker enabling remote access while local bypass maintains low-latency local control.

---

## 4. Phase Breakdown (Authoritative)

### Phase 1: Observability & Validation (COMPLETED)

**Goal**: Establish baseline observability, add defensive validation, and verify correct OBS discovery and command execution without modifying core logic.

**What is allowed**:
- Adding console logging for debugging
- Adding defensive checks that prevent invalid operations
- Enhancing error messages
- Validating input parameters before OBS calls

**What is NOT allowed**:
- Modifying how scenes, inputs, or filters are discovered
- Changing OBS requestType names or signatures
- Refactoring the execute function's control flow
- Adding new dependencies
- Creating mock data or static lists

**Success criteria**:
- `[OBS] Connected` logs on successful WebSocket connection
- `[OBS] Scenes loaded: N`, `[OBS] Inputs loaded: M`, `[OBS] Filters loaded: K` logs on data fetch
- `[EXECUTE] Action=X Target=Y Filter=Z` logs on button clicks
- Empty target/filter validation logs warnings without crashing
- Build passes without errors
- All existing functionality works exactly as before

---

### Phase 2: Data Normalization & Stable Contract

**Goal**: Extract a stable, versioned command contract that can be shared between the frontend, the Local OBS Proxy, and the Cloudflare Worker. Define clear data structures for requests and responses.

**What is allowed**:
- Creating new TypeScript interfaces and types for commands and responses
- Extracting request/response schemas to a shared file or module
- Adding versioning to the contract (e.g., `CommandV1`, `ResponseV1`)
- Normalizing OBS data into consistent formats
- Adding unit tests for the contract definitions
- Creating type guards and validation functions

**What is NOT allowed**:
- Modifying how the frontend currently calls OBS
- Changing button types or action names
- Refactoring the existing obs-controller.tsx beyond adding contract definitions
- Adding transport-layer logic (WebSocket, HTTP, etc.)
- Implementing the Local OBS Proxy or Cloudflare Worker
- Changing localStorage schema

**Success criteria**:
- TypeScript interfaces for all commands (Scene, Mute, Visibility, Filter, Record, Stream)
- TypeScript interfaces for all responses
- Version constant defined (e.g., `CONTRACT_VERSION = "1.0.0"`)
- Build passes without errors
- All types can be imported by future phases
- No existing functionality changed

---

### Phase 3: Local OBS Proxy (Binary / Daemon)

**Goal**: Build a standalone binary or daemon that runs on the same machine as OBS, exposes a WebSocket API matching the contract from Phase 2, and optionally connects to Cloudflare Worker for remote access.

**What is allowed**:
- Creating a new project directory for the proxy (e.g., `proxy/`)
- Using any language appropriate for the platform (Go, Rust, Node.js, etc.)
- Implementing the contract from Phase 2
- Adding configuration file or flags for:
  - OBS WebSocket URL and password
  - Cloudflare Worker URL
  - Authentication credentials
  - Listen address and port
- Implementing heartbeat and reconnection logic
- Adding systemd service file or launchd plist for auto-start

**What is NOT allowed**:
- Modifying any frontend code in `components/`
- Changing the React component structure
- Modifying the existing OBS discovery logic in obs-controller.tsx
- Adding Cloudflare-specific deployment logic
- Creating production certificates or secrets

**Success criteria**:
- Proxy binary can be installed on the OBS machine
- Proxy connects to OBS and responds to contract commands
- Proxy can optionally connect to Cloudflare Worker when configured
- Local mode: Browser can connect directly to proxy
- Remote mode: Browser can connect via Cloudflare Worker to proxy
- OBS behavior matches frontend expectations exactly

---

### Phase 4: Cloudflare Worker Integration

**Goal**: Deploy a Cloudflare Worker that acts as a gateway between browsers and Local OBS Proxies. The Worker handles authentication, routing, and relaying without storing state.

**What is allowed**:
- Creating a new project directory for the worker (e.g., `worker/`)
- Using Cloudflare Workers runtime
- Implementing authentication (API keys, tokens, or JWT)
- Implementing request routing to configured proxies
- WebSocket upgrade handling and proxying
- Rate limiting and basic abuse protection
- Configuration via wrangler.toml or environment variables

**What is NOT allowed**:
- Modifying frontend code
- Storing state in Workers (KV, Durable Objects, etc.)
- Implementing business logic beyond routing and auth
- Modifying the contract from Phase 2
- Deploying to production before Phase 6 approval

**Success criteria**:
- Worker accepts WebSocket connections from browsers
- Worker authenticates and routes to correct Local OBS Proxy
- Commands flow correctly through Worker to Proxy to OBS
- Responses flow back through Proxy to Worker to Browser
- Worker can be tested with staging credentials

---

### Phase 5: Remote UX & Mobile Optimization

**Goal**: Enhance the frontend for reliable remote operation, add mobile-specific optimizations, and implement reconnection handling for unstable network conditions.

**What is allowed**:
- Adding reconnection logic with exponential backoff
- Adding connection state indicators (connecting, connected, reconnecting, offline)
- Optimizing UI for touch targets on iPad and mobile
- Adding offline mode with queued actions
- Adding connection quality indicators
- Persisting connection preferences to localStorage
- Adding responsive layouts for various screen sizes

**What is NOT allowed**:
- Changing button types or action names
- Modifying the command contract
- Refactoring OBS discovery logic
- Adding features not related to remote connectivity and UX
- Modifying the Local OBS Proxy or Cloudflare Worker

**Success criteria**:
- UI works on iPad and mobile browsers
- Reconnection happens automatically on disconnect
- User can see connection state
- Queued actions execute when connectivity returns
- Touch targets meet mobile accessibility guidelines

---

### Phase 6: Production Hardening & Main Branch Merge

**Goal**: Prepare the entire system for production deployment, complete security review, and merge from dev branch to main branch.

**What is allowed**:
- Security audit of all components
- Adding rate limiting and abuse prevention
- Generating production certificates
- Configuring production domains
- Adding logging and monitoring
- Writing documentation (deployment guide, architecture, API reference)
- Creating migration guide from local-only to remote
- Final code review and approval

**What is NOT allowed**:
- Skipping any previous phase
- Deploying incomplete features
- Modifying core contract without version bump
- Leaving debug logging in production code

**Success criteria**:
- Security review completed with no critical findings
- Production deployment successful
- All phases documented
- README updated with deployment instructions
- dev branch merged to main
- Tag created for initial release (e.g., v1.0.0)

---

## 5. Design Constraints (Non-Negotiable)

**Constraint 1: No Breaking Changes to Working Functionality**
At no point during any phase may existing local-only functionality be broken. A user must always be able to run the application locally as they do today. Any change that alters existing behavior is forbidden unless it is a strict bug fix with prior approval.

**Constraint 2: Local Mode Must Always Work**
The application must function when the browser and OBS are on the same network, without requiring Cloudflare Worker or remote infrastructure. This is the fallback mode and must always be available.

**Constraint 3: Remote Mode Must Reuse the Same Command Contract**
When operating in remote mode, the browser must send the exact same commands as in local mode. The contract defined in Phase 2 must be respected by all layers. No translation, transformation, or mapping of commands is allowed at the transport layer.

**Constraint 4: No Direct OBS Exposure to Public Internet**
OBS Studio's WebSocket port (default 4455) must never be accessible from the public internet. The Local OBS Proxy may expose its own port, but it must authenticate with the Cloudflare Worker before accepting commands. The proxy must implement network-level protections to prevent unauthorized local access.

**Constraint 5: Clear Separation Between UI, Command Logic, and Transport**
The React UI must not know whether it is communicating with a local proxy or a remote worker. The command execution logic must be transport-agnostic. The transport layer must not interpret or modify command semantics. This separation enables testing and future modifications.

**Constraint 6: Explicit Approval Required for Infrastructure Changes**
Cloudflare Worker setup, domain configuration, TLS certificates, and deployment pipelines require explicit user approval and intervention. AI assistance must not proceed with these steps without clear user authorization.

---

## 6. Development Rules for AI Assistance

**Rule 1: Respect Phase Order**
AI assistance must follow the phases in sequence. Phase 1 must be complete before beginning Phase 2, and so on. Jumping ahead to "future" phases is forbidden. If a task appears to require work from a future phase, the AI must note this and await phase progression.

**Rule 2: Do Not Skip Phases**
Each phase has explicit success criteria. The AI must verify completion of all criteria before proceeding to the next phase. Partial completion is not sufficient.

**Rule 3: Explain When User Intervention Is Required**
The following tasks require user intervention and must not be performed by AI without explicit approval:
- Cloudflare account creation or configuration
- Worker deployment via wrangler
- Domain registration or DNS configuration
- TLS certificate generation or installation
- Firewall or network configuration
- Secrets, API keys, or credentials creation

The AI must clearly state when a step requires user action and pause for approval.

**Rule 4: Prefer Clarity and Safety Over Abstraction**
When implementing features, the AI must prioritize:
- Clear, understandable code over clever abstractions
- Explicit error handling over silent failures
- Logging and observability over hidden behavior
- Minimal diffs over comprehensive refactoring

If a proposed change increases complexity or risk, the AI must explain the trade-offs and seek approval.

**Rule 5: Verify Build and Tests**
Before concluding any phase, the AI must verify:
- `npm run build` passes without errors
- `npm run lint` passes (if configured)
- No regression in existing functionality
- Console logs match expected patterns

---

## 7. Version Control Strategy

**Branch Structure**:
- `main`: Stable production branch. Only updated after Phase 6 completion.
- `dev`: Development branch. All work occurs on this branch.

**Commit Strategy**:
- Each phase should have a clear start commit and end commit.
- Commits should be atomic and descriptive.
- Commit messages should reference phase and criteria (e.g., "Phase 1: Add observability logging").

**Merge Strategy**:
- No direct commits to main.
- No pull requests to main before Phase 6.
- dev branch receives merges from feature branches if needed, but direct commits are acceptable.

**Cloudflare Deployment Restriction**:
- No Cloudflare Worker deployment before Phase 4 is complete and approved.
- Worker code may exist in the repository but must not be deployed to Cloudflare infrastructure until Phase 4 completion.
- Local OBS Proxy may be built and tested locally throughout Phase 3.

**Release Tagging**:
- Initial release tagged as `v1.0.0` upon Phase 6 completion.
- Subsequent releases follow semantic versioning.

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| Local Mode | Browser connects directly to Local OBS Proxy on same network |
| Remote Mode | Browser connects via Cloudflare Worker to Local OBS Proxy over internet |
| Contract | Versioned schema defining commands, responses, and data types |
| Transport | Layer responsible for moving commands between components |
| OBS Proxy | Local daemon that maintains connection to OBS and exposes contract API |
| Cloudflare Worker | Serverless platform acting as gateway and relay for remote connections |

---

## Appendix B: Reference Commands

```bash
# Build verification
npm run build

# Development server
npm run dev

# Linting (if configured)
npm run lint
```

---

*This document serves as the authoritative technical specification for the project. All implementation decisions must align with this plan. Questions or clarifications should be raised before proceeding with any work.*
