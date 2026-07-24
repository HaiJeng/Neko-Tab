# command-palette Specification

## ADDED Requirements

### Requirement: Inline persistent input

Command Palette SHALL render its input field as a persistent inline element on the new tab page, without an overlay portal or click-to-expand trigger.

#### Scenario: Idle appearance matches original trigger

- **WHEN** the palette input is not focused and the message stream is empty
- **THEN** the palette SHALL display a compact bar with a search icon, dim placeholder text, and keyboard hint chips (`⌘+K` / `/`) — visually equivalent to the previous `.cp-trigger` element

#### Scenario: Focused appearance shows search engine switcher and esc hint

- **WHEN** the input receives focus
- **THEN** the palette SHALL show the search engine switcher (unless the query starts with `/`) and the `esc` hint
- **AND** the border SHALL highlight to indicate the active state

### Requirement: Keyboard activation

The palette SHALL support `Cmd+K` / `Ctrl+K` and `/` global shortcuts to focus the input.

#### Scenario: Cmd+K focuses the input

- **WHEN** the user presses `Cmd+K` (or `Ctrl+K` on non-macOS) anywhere on the page
- **THEN** the palette input SHALL receive focus

#### Scenario: Slash key focuses input and prefills

- **WHEN** the user presses `/` while not typing in another input or textarea
- **THEN** the palette input SHALL receive focus with `/` prefilled and selection cleared

### Requirement: Local search paths preserved

The palette SHALL preserve all existing local search paths without behavioral change: slash commands (`/`), calculator (`=`), URL detection, alias exact match, bookmark fuzzy match, history search, and recent items.

#### Scenario: Slash command routing unchanged

- **WHEN** the query starts with `/`
- **THEN** the palette SHALL show slash command results as before, with no AI item appended

#### Scenario: Calculator prefix routing unchanged

- **WHEN** the query starts with `=`
- **THEN** the palette SHALL show the calculator result as before, with no AI item appended

#### Scenario: Alias exact match takes priority

- **WHEN** the query exactly matches a saved alias key
- **THEN** the alias SHALL appear as the first result

#### Scenario: Full URL takes priority

- **WHEN** the query is a valid URL
- **THEN** the "go to URL" item SHALL appear as the first result

### Requirement: Ask AI as fallback option

When the query is non-empty and does not start with `/` or `=`, the palette SHALL append an "Ask AI" item as the last result option.

#### Scenario: AI item shown alongside local results

- **WHEN** the query is `slack` and a local bookmark matches
- **THEN** the bookmark SHALL appear first
- **AND** an item labeled "Ask AI: slack" (or localized equivalent) SHALL appear as the last option

#### Scenario: AI item as sole option when no local match

- **WHEN** the query is a natural-language question with no local match
- **THEN** the "Ask AI" item SHALL be the only result and default selection

#### Scenario: AI item disabled when no provider configured

- **WHEN** no AI provider is configured
- **THEN** the palette SHALL either hide the "Ask AI" item or show an explanatory disabled state directing the user to Settings

### Requirement: Deprecated `!` prefix semantics

The `!` character SHALL have no special meaning as a query prefix. Queries starting with `!` SHALL be treated as ordinary text and routed to the "Ask AI" fallback like any other non-command query.

#### Scenario: Bang query treated as ordinary text

- **WHEN** the user types `!hello world`
- **THEN** the palette SHALL NOT strip the `!` and SHALL NOT bypass local search
- **AND** the "Ask AI: !hello world" fallback SHALL be available as the last result

### Requirement: Inline chat message stream

When AI messages exist, the palette SHALL render a chat message stream inline above the input row, without opening an overlay.

#### Scenario: Empty chat state

- **WHEN** the messages array is empty
- **THEN** the palette SHALL render only the input row and (if focused with non-empty query) the results list

#### Scenario: Chat stream expands above input

- **WHEN** the messages array is non-empty
- **THEN** a scrollable chat container SHALL appear directly above the input row, with the newest message adjacent to the input
- **AND** the container SHALL show a header with turn count and a clear button

#### Scenario: Chat auto-scrolls to newest message

- **WHEN** a new message or streaming delta is appended
- **THEN** the chat container SHALL scroll to keep the newest content visible

### Requirement: Escape key semantics

The Escape key SHALL implement three-level exit semantics from the input.

#### Scenario: Escape clears non-empty query

- **WHEN** the input contains a non-empty query and the user presses Escape
- **THEN** the query SHALL be cleared and messages SHALL remain

#### Scenario: Escape clears chat when query empty

- **WHEN** the query is empty, messages exist, and the user presses Escape
- **THEN** the messages array SHALL be cleared and focus SHALL remain in the input

#### Scenario: Escape blurs input as final step

- **WHEN** the query is empty and no messages exist and the user presses Escape
- **THEN** the input SHALL lose focus

### Requirement: Chat clear button

The chat header SHALL provide a manual clear (×) button that removes the message stream without dismissing input focus.

#### Scenario: Clear button removes messages only

- **WHEN** the user clicks the × button in the chat header
- **THEN** the messages array SHALL be emptied
- **AND** input focus SHALL be retained
- **AND** the query SHALL NOT be modified
