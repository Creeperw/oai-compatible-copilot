# Change Log

> This project is a fork of [OAI Compatible Provider for Copilot](https://github.com/JohnnyZ93/oai-compatible-copilot), published as **PolyLLM** (`creeperw.polyllm`). Entries below 0.4.3 come from the upstream project.

## 0.5.0

- Feat: The model form is a **dialog** instead of a block wedged under the table.
  The table stays the only thing on the page, and the form opens over it with its
  actions pinned to the bottom.
- Feat: **Model ID takes several values.** Ticking a model in the picker turns it
  into a removable chip in the field, and anything typed counts as one more id, so
  adding a single model is still "open the form, type an id, save".
- Feat: **One save button for the whole form.** It was previously possible to
  press **Save Model** with models ticked in the picker and have them silently
  dropped, because that button only read the text box. The picker no longer has a
  submit button of its own; the button at the bottom of the form is the only way
  to create models and says what it will do — **Save Model**, **Add 3 Models**, or
  **Save Changes** when editing.
- Feat: The picker has its own **search box**, so the text box in the Model ID
  field is never ambiguous between a filter and a value. **Select all** applies to
  the filtered list, which is how a slice of a large catalogue is added at once.
- Feat: Display Name is switched off with an explanation while several models are
  being added, instead of being quietly ignored. Each model then gets its own
  `Model ID / Provider ID` default.
- Fix: Provider headings in the model table were squeezed into the width of the
  first column and their model count wrapped onto three lines. The heading cell had
  been turned into a flex container, and a table cell that stops being a table cell
  is replaced by an anonymous one that does not inherit `colspan`.

## 0.4.6

- Fix: **Add Selected** disappeared from the bottom of the model picker once the provider returned a long model list. The dropdown capped its own height at 300px and hid the overflow, but the header plus a full-length list already came to more than that, so the footer was cut off the bottom. The dropdown is now a flex column: the header and the footer keep their height and the list scrolls in between.
- Fix: **Clear** in the model picker lost its button outline. A restyle meant to quieten the hover effect went too far and left it as bare text, which made it look as though the button had been removed.
- Fix: Errors raised while working in the model list are shown next to the list. They used to be written to the model form's own error slot, which is hidden while the form is closed.
- Feat: Display Name is editable directly in the model list. Type the new name in the cell and press Enter to save, Escape to cancel. This is what makes bulk add practical: the generated `Model ID / Provider ID` names are a starting point rather than something to be replaced one form at a time.

- Feat: Adding a model now opens a grouped form — **Basic Information**, **Capabilities & Limits**, **Thinking & Reasoning** and **Sampling** — instead of one undifferentiated wall of 22 fields, and the grid keeps every input in a row on the same baseline.
- Feat: **Advanced Settings** is regrouped into **Sampling Overrides**, the OpenRouter reasoning block and **Custom Request**, so the rarely used knobs are no longer mixed in with the common ones.
- Feat: New models start from practical defaults: context length `256000`, max output `32768`, thinking enabled, and reasoning effort `High`. The same defaults apply when the extension has to fall back to its own values at runtime.
- Feat: **Bulk model setup**. The Model ID dropdown is multi-select, so the form's settings are entered once and then applied to any number of models with **Add Selected**. Models that are already configured for the provider are dimmed and cannot be ticked. Each **Add Selected** is a separate batch, so a second batch can be given a different configuration.
- Feat: Display Name is optional and defaults to `Model ID / Provider ID`, which is what makes bulk add practical: every selected model gets a unique, readable name without typing any. A name typed for a single model is kept as-is; a batch ignores it and gives each model its own default. This also changes the fallback used when a model has no name at all, which previously read `Provider ID / Model ID`.
- Feat: **Test Connection** checks a provider before it is saved. It uses the values currently in the form rather than what is stored, reports how many models the endpoint returned, and warns when the Model ID that was typed is not among them.
- Feat: The model table is grouped by provider under a collapsible heading, and the heading and column titles stay visible while a long list scrolls.
- Feat: Alternating row shading and compact row actions replace the flat block of text and the two full-width buttons per row.

## 0.4.5

- Feat: Add provider balance queries. Configure an endpoint per provider in the Configuration UI (**Balance** column) and PolyLLM shows the remaining credit in the status bar and through the **PolyLLM: Show Provider Balances** command.
- Built-in presets for DeepSeek, SiliconFlow (China and international), OpenRouter, StepFun, Novita AI, and New API relays. Any other provider can be described by hand: URL, method, authentication, extra headers, and response fields.
- Built-in presets for the Kimi For Coding, Zhipu GLM, MiniMax, and OpenCode Go coding plans. These endpoints report how much of a rolling window is left rather than an amount, so the presets express the window as a percentage out of 100 and share the same column and low-balance colouring as the balances.
- Response fields are JSON paths with optional arithmetic (`data.quota / 500000`). Usage windows can be picked by field rather than by array position (`limits[unit == 3].percentage`), because the provider does not promise their order. No code from a configuration is ever executed.
- Fix: The SiliconFlow preset read `data.balance`, which is only the granted credit, so a topped-up account showed a balance that was too low. It now reads `data.totalBalance`.
- Query failures are classified: transient problems (timeout, network, 5xx) keep the last known value for ten minutes and mark it as stale, while authentication and 404 errors surface immediately.
- Refreshing is manual by default; set `intervalMinutes` per provider to enable a background refresh.
- Feat: The Configuration UI gains a balance column, a balance configuration dialog with a **Test** button, and a general visual pass.
- Fix: The balance column showed `Not set` for a provider whose query was configured but switched off, which made a successful save look like it had failed. It now shows `Disabled`, and picking a preset turns the query on instead of silently storing an inactive configuration.
- Fix: Reopening the Configuration UI showed `Not queried` for balances that had already been queried, even though the status bar kept showing them. The panel now receives the cached results when it opens.
- Fix: Saving a provider configuration left the previous balance on screen until the next query. The cached result is now dropped on save, matching the extension host.
- Fix: The **Add Provider** row was one cell short after the balance column was added, which shifted its buttons into the wrong columns.
- Feat: The extension is available in English and Simplified Chinese. The Configuration UI, its notifications, the command palette entries and the settings page all follow the VS Code display language, and the panel header carries a language picker that overrides it. Set `oaicopilot.language` to `auto` (the default), `en` or `zh-CN` to choose outside the panel.

## 0.4.4

- Update the extension icon.

## 0.4.3

- Fork: Republished as PolyLLM (`creeperw.polyllm`). Configuration (`oaicopilot.*`) and all provider/model IDs are unchanged, so existing setups keep working — but uninstall the original extension first, since two extensions cannot share the chat provider vendor and VS Code silently keeps whichever loads first.
- Fix: Read the extension version from the extension context instead of a hardcoded extension ID, which would have reported `unknown` once the ID changed.
- Add provider-aware model identity so different providers can expose the same upstream Model ID while Display Names remain globally unique.
- Move Base URL, API mode, headers, and API keys to provider-level configuration with explicit model overrides and safe legacy migration.
- Remove the global Base URL/API key controls and restrict model endpoints to trusted user-level application settings.
- Harden configuration import/export and the Webview so provider API keys are not exposed to page scripts.
- Fix OpenAI Responses compatibility, prevent `extra.model` from replacing the configured raw model ID, and preserve Gemini resource paths.
- Feat: Add a provider-level `session_id_header` option. When set, every request carries a stable per-conversation session ID in that header, derived from the first user turn of the conversation. This unblocks providers that route requests by session, such as OpenCode Zen/Go, which expects `x-opencode-session` and otherwise answers `400 MissingSessionID`.
- Fix: Adopt provider records written by earlier releases during legacy migration. Those releases stored provider connection records as a reserved `__provider__<provider>` ID without the `providerConfig` marker, which 0.4.3 rejected as an invalid reserved ID. Upgrading therefore invalidated the whole configuration and left every model missing from the model picker. Migration now converts those records in place, keeping their Base URL, API mode, headers, and session ID header.

## 0.4.2 (2026-05-19)

- Feat(anthropic): Enable prompt caching. The system prompt and the last tool definition are now marked with `cache_control: { type: "ephemeral" }`, and in-message `cache_control` markers emitted by Copilot (`LanguageModelDataPart` with mimeType `"cache_control"`) are forwarded to Anthropic instead of being silently dropped. Add a per-model `cache_control` boolean (default `true`) to disable it for providers that reject the field.
- Feat: Add Copilot reasoning effort picker support for OpenAI/OpenAI-Responses providers.

Thanks for your contributing:
  - @timeshiftsauce [PR #249](https://github.com/JohnnyZ93/oai-compatible-copilot/pull/249).
  - @ccppww0001 [PR #237](https://github.com/JohnnyZ93/oai-compatible-copilot/pull/237).

## 0.4.1 (2026-05-14)

- Feat(usage): Implement token usage reporting for Context Window widget

## 0.4.0 (2026-05-14)

- Feat: Enhance tools parameter handling — merge tools arrays instead of overwriting across all API modes (Anthropic, Gemini, Ollama, OpenAI, OpenAI Responses).
- Fix: Add "enumDescriptions" to unsupported Gemini schema keys to prevent schema validation errors.
- Fix: Restore compatibility with VS Code 1.120.0.
- Docs: Enhance README layout and add Chinese translation.

Thanks for your contributing:
  - @adensW [PR #220](https://github.com/JohnnyZ93/oai-compatible-copilot/pull/220).
  - @chukangkang [PR #241](https://github.com/JohnnyZ93/oai-compatible-copilot/pull/241).

## 0.3.6 (2026-04-24)

- Feat: Add `xhigh` and `max` reasoning effort options for DeepSeek-V4.
- Feat: Add structured logging system with `oaicopilot.logLevel` configuration. Logs are written to `~/.copilot/oaicopilot/logs/`. Default is 'off' (no logging).
- Fix: Remove dependency on GitHub Copilot Chat extension.

## 0.3.5 (2026-04-16)

- Feat(openai-responses): Add `prompt_cache_key` to enable OpenAI prompt caching.
- Feat(openai): Support `reasoning` field as thinking content in streaming responses.
- Feat: Remove `<think>` tags from generated commit messages.
- Fix(anthropic): Handle SSE `data:` lines without space after colon.
- Fix: Retry with exponential backoff instead of fixed interval.
- Fix: Fall back to generic API key when provider-specific key is missing in commit message generation.

Thanks for your contributing:
  - @ODtian [PR #167](https://github.com/JohnnyZ93/oai-compatible-copilot/pull/167).
  - @270556660 [PR #176](https://github.com/JohnnyZ93/oai-compatible-copilot/pull/176).
  - @ruokuanwu [PR #179](https://github.com/JohnnyZ93/oai-compatible-copilot/pull/179).
  - @TooYoungTooSimp [PR #185](https://github.com/JohnnyZ93/oai-compatible-copilot/pull/185).

## 0.3.4 (2026-03-10)

- Feat: Re-enable the token usage status bar because VS Code's native statistics are inaccurate for BYOK providers.

## 0.3.3 (2026-03-06)

- Feat: Add openai-responses API support for commit message generation.
- Feat: Add Ollama API support for commit message generation.
- Feat: Remove token usage status bar and simplify configuration UI access.
- Feat: Reduce system prompts for commit message generation to improve efficiency.

## 0.3.2 (2026-03-04)

- Feat: Group models under "OAICopilot" provider with detail labels.
- Feat: Add configurable commit message system prompt via `oaicopilot.commitSystemPrompt` setting.
- Feat: Supports retry when fetch failed.
- Fix: Handle empty tool call arguments for parameterless tools.
- Fix: Remove flex layout in config view table to avoid misalignment issues.
- Fix: Remove headers from provider update logic in configuration UI.

Thanks for your contributing:
  - @pzhlkj6612 [PR #154](https://github.com/JohnnyZ93/oai-compatible-copilot/pull/154).
  - @mangjuned [PR #151](https://github.com/JohnnyZ93/oai-compatible-copilot/pull/151).
  - @pzhlkj6612 [PR #147](https://github.com/JohnnyZ93/oai-compatible-copilot/pull/147).
  - @AAAkater [PR #141](https://github.com/JohnnyZ93/oai-compatible-copilot/pull/141).

## 0.3.1 (2026-01-29)

- Feat: Support custom headers in model listing requests.
- Feat: Add custom headers field to provider configuration UI.

Thanks to:
  - @matchs for contributing the [PR #136](https://github.com/JohnnyZ93/oai-compatible-copilot/pull/136).

## 0.3.0 (2026-01-28)

- Feat: Add configurable `read_file` tool line limit with new `oaicopilot.readFileLines` setting.
- Feat: Add config import/export on configuration UI.
- Doc: Enhance temperature parameter documentation with detailed usage guidelines.

## 0.2.6 (2026-01-23)

- Feat(ollama): Add Ollama model fetching support via `/api/tags` endpoint.
- Feat(gemini): Add apiMode-aware model discovery with Gemini support via `fetchGeminiModels()`.

Thanks to:
  - @matchs for contributing the [PR #127](https://github.com/JohnnyZ93/oai-compatible-copilot/pull/127).

## 0.2.5 (2026-01-19)

- Fix: Prevent simultaneous `max_tokens` and `max_completion_tokens` configuration to avoid API conflicts.
- Feat(openai-responses): Add stateful `previous_response_id` support for conversation continuity.
- Feat: Add `oaicopilot.commitLanguage` configuration for commit messages. Users can now select from 14 supported languages via the settings interface.

Thanks to:
  - @matchs for contributing the [PR #118](https://github.com/JohnnyZ93/oai-compatible-copilot/pull/118).
  - @Andy963 for contributing the [PR #119](https://github.com/JohnnyZ93/oai-compatible-copilot/pull/119).

## 0.2.4 (2026-01-15)

- Feat(openai-responses): enhance streaming response handling.

## 0.2.3 (2026-01-14)

- Fix(anthropic): avoid double /v1 suffix when baseUrl already includes version.
- Refactor: update `OpenAI responses` interface and supports Volcengine provider.
- Feat: add model `family` and system prompts documentation to README. (Include: Anthropic, Gemini, xAI, OpenAI)
- Refactor: simplify temperature handling in API implementations. Now You can delete `temperature` in request.

Thanks to @matchs for contributing the [PR #111](https://github.com/JohnnyZ93/oai-compatible-copilot/pull/111).

## 0.2.2 (2026-01-12)

- Feat: Add git commit message generation button on Souce Control Panel
- Feat(thinking): show reasoning summaries in Copilot (OpenAI Responses + Gemini)
- Fix: add default thinking content for empty reasoning
- Fix: add conditional reasoning token counting on statusBarItem

Thanks to @Andy963 for contributing the [PR #104](https://github.com/JohnnyZ93/oai-compatible-copilot/pull/104).

## 0.2.1 (2026-01-04)

Thanks to @Andy963 for contributing the [PR #89](https://github.com/JohnnyZ93/oai-compatible-copilot/pull/89):

- Feat: Add OpenAI Responses API mode (`apiMode: "openai-responses"`, endpoint `/responses`).
- Feat: Add Gemini native API mode (`apiMode: "gemini"`, endpoint `.../v1beta/models/{model}:streamGenerateContent?alt=sse`).
- Fix: Preserve Gemini `thoughtSignature` for tool-calling follow-up requests (required by newer Gemini thinking models).
- Fix: Accept `provider` / `provide` as aliases of `owned_by` in `oaicopilot.models`.
- Fix: Anthropic mode sends `anthropic-version: 2023-06-01` and includes request URL in errors for easier relay debugging.

## 0.2.0 (2025-12-25)

- Fix: [Text content blocks must be non-empty on Anthropic api](https://github.com/JohnnyZ93/oai-compatible-copilot/issues/79)
- Fix: [Edit modelId and providerId on configuration UI.](https://github.com/JohnnyZ93/oai-compatible-copilot/issues/85)

## 0.1.9 (2025-12-24)

- Feat: [Make top_p optional in request body.](https://github.com/JohnnyZ93/oai-compatible-copilot/issues/81)
- Feat: [Add Model-specific delay configuration.](https://github.com/JohnnyZ93/oai-compatible-copilot/issues/74)
- Feat: [Add Model Configuration UI](https://github.com/JohnnyZ93/oai-compatible-copilot/pull/68)
- Enhanced `oaicopilot.models` configuration including:
  - `delay`: Model-specific delay in milliseconds between consecutive requests. If not specified, falls back to global `oaicopilot.delay` configuration.
- New Command `OAICopilot: Open Configuration UI`.

## 0.1.8 (2025-12-17)

- Feat: [Add Ollama /api/chat](https://github.com/JohnnyZ93/oai-compatible-copilot/pull/65)
- Feat: [Add Anthropic /v1/messages](https://github.com/JohnnyZ93/oai-compatible-copilot/issues/60)
- Enhanced `oaicopilot.models` configuration including:
  - `apiMode`: API mode: 'openai' (Default) for API (/v1/chat/completions), 'ollama' for API (/api/chat), 'anthropic' for API (/v1/messages).

## 0.1.7 (2025-12-10)

- Feat: [Expand oaicopilot.retry to handle other type of errors](https://github.com/JohnnyZ93/oai-compatible-copilot/issues/62)
- Fix: [Add buffer for think content](https://github.com/JohnnyZ93/oai-compatible-copilot/pull/61)
- Add `oaicopilot.retry` configuration including:
  > Retry configuration for handling api errors like [429, 500, 502, 503, 504].
  - `status_codes`: Additional HTTP status codes that will be merged. Default is [429, 500, 502, 503, 504].

## 0.1.6 (2025-12-08)

- Feat: [Сontext window state in statusBar](https://github.com/JohnnyZ93/oai-compatible-copilot/issues/59)

## 0.1.5 (2025-12-05)

- Fix: [Deepseek v3.2 reasoning tool call failed](https://github.com/JohnnyZ93/oai-compatible-copilot/issues/54)
- Enhanced `oaicopilot.models` configuration including:
  - `include_reasoning_in_request`: Whether to include reasoning_content in assistant messages sent to the API. Support deepseek-v3.2 or others.

## 0.1.4 (2025-11-03)

- Feat: [Add headers support](https://github.com/JohnnyZ93/oai-compatible-copilot/pull/31)
- Feat: [Add displayName option for models in Copilot interface](https://github.com/JohnnyZ93/oai-compatible-copilot/pull/32)
- Enhanced `oaicopilot.models` configuration including:
  - `displayName`: Display name for the model that will be shown in the Copilot interface.
  - `headers`: Custom HTTP headers to be sent with every request to this model's provider (e.g., `{"X-API-Version": "v1", "X-Custom-Header": "value"}`).

## 0.1.3 (2025-10-31)

- Fix: [Forces a prompt to set the default API key every time VS Code starts](https://github.com/JohnnyZ93/oai-compatible-copilot/pull/30)

## 0.1.2 (2025-10-29)

- Feat: [add support for extra configuration parameters](https://github.com/JohnnyZ93/oai-compatible-copilot/pull/28)
- Enhanced `oaicopilot.models` configuration including:
  - `extra`: Extra request parameters that will be used in /chat/completions.

## 0.1.1 (2025-10-28)

- Fix: Cannot change apiKey when the `oaicopilot.models` have no baseUrl.

## 0.1.0 (2025-10-28)

- Feat: [Add request delay to prevent 429 Errors](https://github.com/JohnnyZ93/oai-compatible-copilot/issues/24)
- Fix: [Not Asking for Key when add new provider](https://github.com/JohnnyZ93/oai-compatible-copilot/issues/26)
- Add `oaicopilot.delay` configuration: Fixed delay in milliseconds between consecutive requests. Default is 0 (no delay).

## 0.0.9 (2025-10-27)

- Feat: [Add Retry Mechanism for Model 429 Errors](https://github.com/JohnnyZ93/oai-compatible-copilot/issues/24)
- Fix: [Thinking block not end and show in new chat](https://github.com/JohnnyZ93/oai-compatible-copilot/issues/25)
- Add `oaicopilot.retry` configuration including:
  > Retry configuration for handling api errors like [429, 500, 502, 503, 504].
  - `enabled`: Enable retry mechanism for api errors. Default is true.
  - `max_attempts`: Maximum number of retry attempts. Default is 3.
  - `interval_ms`: Interval between retry attempts in milliseconds. Default is 1000 (1 seconds).

## 0.0.8 (2025-10-21)

- Fix: [LLM output missing `<`](https://github.com/JohnnyZ93/oai-compatible-copilot/issues/19)
- Remove inline tool call response processing, significantly accelerating model response speed.

## 0.0.7 (2025-10-15)

- Feat: [`<think>` block is not detected properly for Perplexity Sonar models](https://github.com/JohnnyZ93/oai-compatible-copilot/issues/21)
- Update VS Code proposed api version.

## 0.0.6 (2025-10-10)

- Feat: [OpenAI use `max_completion_tokens` instead of `max_tokens` for GPT-5](https://github.com/JohnnyZ93/oai-compatible-copilot/issues/19)
- Enhanced `oaicopilot.models` configuration including:
  - `max_completion_tokens`: Maximum number of tokens to generate (OpenAI new standard parameter)
  - `reasoning_effort`: Reasoning effort level (OpenAI reasoning configuration)


## 0.0.5 (2025-10-09)

- Feat: [GLM 4.6 - no thinking tags](https://github.com/JohnnyZ93/oai-compatible-copilot/issues/15)
- Feat: [Multi-config for the same model](https://github.com/JohnnyZ93/oai-compatible-copilot/issues/18)
- Enhanced `oaicopilot.models` configuration including:
  - `configId`: Configuration ID for this model. Allows defining the same model with different settings (e.g. 'glm-4.6::thinking', 'glm-4.6::no-thinking')
  - `thinking`: Thinking configuration for Zai provider
    - `type`: Set to 'enabled' to enable thinking, 'disabled' to disable thinking

## 0.0.4 (2025-09-23)

- Fix: [Base url should be model specific](https://github.com/JohnnyZ93/oai-compatible-copilot/issues/4)
- Fix: [Set the effort variable of the reasoning model](https://github.com/JohnnyZ93/oai-compatible-copilot/issues/5)
- Fix: [Allow setting a custom model 'family'](https://github.com/JohnnyZ93/oai-compatible-copilot/issues/8)

## 0.0.3 (2025-09-18)

- Now you can see the model reasoning content in chat interface.
  > ![thinkingPartDemo](./assets/thinkingPartDemo.png)
- Fix: [Thinking Budget #2](https://github.com/JohnnyZ93/oai-compatible-copilot/issues/2)
- Fix: [iflow api key no response was returned #1](https://github.com/JohnnyZ93/oai-compatible-copilot/issues/1)

## 0.0.2 (2025-09-18)

- Deleted settings including:
  - `oaicopilot.enableThinking`
  - `oaicopilot.maxTokens`
  - `oaicopilot.temperature`
  - `oaicopilot.topP`
- Enhanced `oaicopilot.models` configuration with support for per-model settings including:
  - `max_tokens`: Maximum number of tokens to generate
  - `enable_thinking`: Switches between thinking and non-thinking modes
  - `temperature`: Sampling temperature (range: [0, 2])
  - `top_p`: Top-p sampling value (range: (0, 1])
  - `top_k`: Top-k sampling value
  - `min_p`: Minimum probability threshold
  - `frequency_penalty`: Frequency penalty (range: [-2, 2])
  - `presence_penalty`: Presence penalty (range: [-2, 2])
  - `repetition_penalty`: Repetition penalty (range: (0, 2])
- Improved token estimation algorithm with better support for Chinese characters
- Enhanced multi-modal message handling for image and text content

## 0.0.1 (2025-09-16)

- Initial release
