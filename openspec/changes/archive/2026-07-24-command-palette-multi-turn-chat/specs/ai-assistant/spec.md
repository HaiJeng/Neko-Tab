# ai-assistant Specification

## ADDED Requirements

### Requirement: Multi-turn streaming chat

The AI assistant SHALL support multi-turn conversations with token-by-token streaming responses.

#### Scenario: First turn streams text response

- **WHEN** the user sends the first message to a configured AI provider
- **THEN** the assistant response SHALL render progressively as tokens arrive
- **AND** a blinking cursor SHALL indicate the streaming state
- **AND** the cursor SHALL disappear when the stream completes

#### Scenario: Follow-up turn preserves context

- **WHEN** the user sends a follow-up message after an assistant response
- **THEN** the request SHALL include the prior messages so the assistant can reference earlier turns

#### Scenario: Context injected only on first turn

- **WHEN** a multi-turn conversation continues
- **THEN** the user's aliases / bookmarks / open tabs / recent history / memories SHALL be included in the system prompt of each request
- **AND** the user-visible messages array SHALL NOT contain re-injected context blocks between turns

### Requirement: In-memory only session

Conversations SHALL exist only in component memory and SHALL NOT be persisted.

#### Scenario: Refresh clears conversation

- **WHEN** the new tab page refreshes or a new tab is opened
- **THEN** the messages array SHALL be empty regardless of prior conversation state

#### Scenario: No storage writes for messages

- **WHEN** messages accumulate during a session
- **THEN** the assistant SHALL NOT write messages to localStorage or chrome.storage

### Requirement: Tool calling without confirmation

The AI assistant SHALL execute tool calls immediately upon receipt from the stream, without a user confirmation prompt.

#### Scenario: Available tools

- **WHEN** the assistant is invoked
- **THEN** the following tools SHALL be exposed with zod-validated argument schemas:
  - `open_url` (single URL)
  - `open_tabs` (multiple URLs)
  - `open_alias` (alias key lookup)
  - `history_search` (browser history query)
  - `remember` (keyword → URL memory)
  - `save_to_journal` (dated text entry)

#### Scenario: Tool executes on receipt

- **WHEN** the stream emits a `tool-call` event with valid arguments
- **THEN** the corresponding side effect SHALL execute immediately (opening a tab, writing memory, etc.)
- **AND** no confirmation dialog SHALL be shown

#### Scenario: Unsafe URL rejected

- **WHEN** a tool call receives a URL that fails the `isSafeUrl` check
- **THEN** the tool SHALL NOT execute
- **AND** the chip SHALL render in error state with the reason

### Requirement: Tool call chips

Each tool call SHALL be rendered as a chip inside the assistant message, showing name, label, and status.

#### Scenario: Pending state during execution

- **WHEN** a tool call is dispatched but not yet resolved
- **THEN** the chip SHALL show a pending indicator (blinking dot)

#### Scenario: Done state after success

- **WHEN** a tool call succeeds
- **THEN** the chip SHALL show a static done state with the effective label (e.g. domain name, memory keyword, date)

#### Scenario: Error state on failure

- **WHEN** a tool call fails (unsafe URL, missing alias, API error, etc.)
- **THEN** the chip SHALL show an error state with visual distinction (red border and text)

### Requirement: Structured output via ai-sdk

The assistant SHALL use `streamText` from the ai-sdk with tool schemas defined via zod, rather than hand-parsing JSON from `generateText` output.

#### Scenario: Tool arguments validated by SDK

- **WHEN** the model emits a tool call with malformed arguments
- **THEN** the ai-sdk SHALL surface a validation error before dispatch
- **AND** the assistant SHALL NOT hand-write JSON parsing logic to interpret the response

#### Scenario: Text response is plain content, not an action

- **WHEN** the model produces a text answer (no tool call)
- **THEN** the text SHALL render as the assistant message content directly
- **AND** the assistant SHALL NOT require the model to wrap the answer in an `answer` action

### Requirement: Streaming error preservation

When streaming fails or the provider errors mid-response, the assistant SHALL append the error to the current message end without discarding prior content.

#### Scenario: Provider returns error mid-stream

- **WHEN** the stream throws after partial content has been rendered
- **THEN** the partial assistant content SHALL be preserved
- **AND** an error line SHALL appear at the end of that message with red styling

#### Scenario: Empty response detected

- **WHEN** the stream completes with no text and no tool calls
- **THEN** an error line SHALL indicate the empty response
- **AND** the user SHALL be able to send another message or clear the conversation
