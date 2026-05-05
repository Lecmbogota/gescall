## ADDED Requirements

### Requirement: Supervisor authorized for agent actions

The system SHALL ensure that only authenticated users with supervisor (or higher) privilege MAY invoke spy, whisper, force-ready, or remote-logout actions on an agent.

#### Scenario: Supervisor invokes an action

- **WHEN** a user with supervisor privilege calls a supervisor agent action API for a target agent
- **THEN** the system SHALL process the action according to the corresponding requirement

#### Scenario: Non-supervisor is rejected

- **WHEN** a user without supervisor privilege calls a supervisor agent action API
- **THEN** the system SHALL reject the request with an authorization error and SHALL NOT change agent or call state

### Requirement: Spy on active agent call

The system SHALL allow an authorized supervisor to attach to the telephony path of an agent’s active conversation in listen-only mode (spy), when the platform can resolve the agent’s active channel and policy allows it.

#### Scenario: Spy succeeds while agent is on a call

- **WHEN** the target agent is in an on-call state recognized by the system and the PBX can bridge a supervisor listen leg
- **THEN** the system SHALL establish spy according to the configured PBX integration and SHALL return success to the client

#### Scenario: Spy rejected without active call

- **WHEN** the target agent has no active call resolvable by the system
- **THEN** the system SHALL reject the spy request with a clear error and SHALL NOT create orphan PBX resources

### Requirement: Whisper to agent without customer audio

The system SHALL allow an authorized supervisor to speak to the agent during an active call such that the customer audio path does not receive the supervisor’s voice (supervisor whisper), subject to PBX capabilities.

#### Scenario: Whisper succeeds on active call

- **WHEN** the target agent is on an active call and whisper mode is supported by the integration
- **THEN** the system SHALL establish the whisper audio path to the agent only and SHALL return success to the client

#### Scenario: Whisper rejected when unsupported or no call

- **WHEN** whisper cannot be established because the call is missing or the integration cannot satisfy one-way supervisor audio
- **THEN** the system SHALL reject the request with a clear error

### Requirement: Force agent from pause to available

The system SHALL allow an authorized supervisor to transition a target agent from a paused / not-ready workspace state to the available / ready state used by GesCall for queue eligibility, when business rules permit that transition.

#### Scenario: Force-ready from paused state

- **WHEN** the agent is in a pausable state eligible for supervisor override and the supervisor requests force-ready
- **THEN** the system SHALL set the agent workspace state to ready/available in the authoritative store and SHALL emit a real-time update visible to dashboards

#### Scenario: Force-ready rejected for ineligible state

- **WHEN** the agent is in a state that MUST NOT be overridden (for example on an active call, if so configured)
- **THEN** the system SHALL reject the request without changing state

### Requirement: Remote agent logout

The system SHALL allow an authorized supervisor to remotely log out an agent from the GesCall agent session, mark the agent offline for supervision views, and disconnect associated supervisor-visible presence according to the implemented logout semantics.

#### Scenario: Logout idle agent

- **WHEN** the supervisor confirms remote logout and the agent has no policy conflict
- **THEN** the system SHALL terminate the agent session as implemented (sockets/offline flags) and SHALL show the agent as offline to supervisors

#### Scenario: Logout with active call handled by policy

- **WHEN** the agent has an active call and the supervisor requests remote logout
- **THEN** the system SHALL either reject with a clear message or apply the configured policy (for example hang up and log out) and SHALL document the chosen behavior in implementation

### Requirement: Supervision actions in the real-time agent table UI

The system SHALL expose the four supervision capabilities (spy, whisper, force-ready, remote logout) from the real-time agent status table (or equivalent supervision view), with confirmations where appropriate and disabled actions when preconditions are not met.

#### Scenario: Actions visible on supervision table

- **WHEN** a supervisor opens the real-time agent status view
- **THEN** the system SHALL present controls for the four actions per row (or grouped menu) consistent with backend preconditions

#### Scenario: Destructive action confirmation

- **WHEN** the supervisor initiates remote logout (and any other action classified as destructive)
- **THEN** the system SHALL require explicit confirmation before invoking the API
