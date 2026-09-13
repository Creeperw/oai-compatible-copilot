<div align="center">

<img src="assets/logo.png" alt="PolyLLM Logo" width="120" height="120">

# PolyLLM

**A VSCode extension to use OpenAI/Ollama/Anthropic/Gemini API Providers in GitHub Copilot Chat** 🔥

English | [简体中文](README.zh-CN.md)

</div>

> **PolyLLM** is a fork of [OAI Compatible Provider for Copilot](https://github.com/JohnnyZ93/oai-compatible-copilot) by Johnny Zhao (MIT).
> It keeps the original configuration format (`oaicopilot.*` settings and provider IDs), so existing setups continue to work.

[![CI](https://github.com/Creeperw/oai-compatible-copilot/actions/workflows/release.yml/badge.svg)](https://github.com/Creeperw/oai-compatible-copilot/actions)
[![License](https://img.shields.io/github/license/Creeperw/oai-compatible-copilot?color=orange&label=License)](https://github.com/Creeperw/oai-compatible-copilot/blob/main/LICENSE)

## ✨ Features
- **Multi-API support**: OpenAI/Ollama/Anthropic/Gemini APIs (ModelScope, SiliconFlow, DeepSeek...)
- **Vision models**: Full support for image understanding capabilities
- **Advanced configuration**: Flexible chat request options with thinking/reasoning control
- **Multi-provider management**: Configure models from multiple providers simultaneously with automatic API key management
- **Provider-aware model identity**: The same upstream Model ID can coexist across different providers
- **Visual configuration UI**: Intuitive interface for managing providers and models
- **Auto-retry**: Handles API errors (429, 500, 502, 503, 504) with exponential backoff
- **Token usage**: Real-time token counting and provider API key management from status bar
- **Provider balance**: Query and display the remaining credit of each provider, with built-in presets for DeepSeek, SiliconFlow, OpenRouter, StepFun, Novita AI, New API relays, and the Kimi, Zhipu GLM, MiniMax, and OpenCode Go coding plans
- **Git integration**: Generate commit messages directly from source control
- **Import/export**: Easily share and backup configurations
- **Tools optimization**: Optimize agent `read_file` tool handling, avoid to read small chunks for large file.

## Requirements
- VS Code 1.120.0 or higher.
- OpenAI-compatible provider API key.

## ⚡ Quick Start
1. Install the PolyLLM extension [here](https://marketplace.visualstudio.com/items?itemName=creeperw.polyllm).
2. Run **PolyLLM: Open Configuration UI** from the Command Palette.
3. Add a provider with its Base URL, API Key, and API mode.
4. Add one or more models with globally unique Display Names.
5. Open GitHub Copilot Chat and select the configured model.

### Settings Example

```json
"oaicopilot.models": [
    {
        "id": "__provider__modelscope",
        "owned_by": "modelscope",
        "providerConfig": true,
        "baseUrl": "https://api-inference.modelscope.cn/v1",
        "apiMode": "openai"
    },
    {
        "id": "Qwen/Qwen3-Coder-480B-A35B-Instruct",
        "owned_by": "modelscope",
        "displayName": "Qwen3 Coder via ModelScope",
        "context_length": 256000,
        "max_tokens": 8192,
        "temperature": 0,
        "top_p": 1
    }
]
```

`providerConfig: true` records are internal provider connection metadata. Prefer the Configuration UI to create and update them. Models are user-level application settings. API keys are encrypted separately in VS Code SecretStorage and must be entered again on each machine.

## ✨ Configuration UI

The extension provides a visual configuration interface that makes it easy to manage global settings, providers, and models without editing JSON files manually.

### Opening the Configuration UI

There are two ways to open the configuration interface:

1. **From the Command Palette**:
   - Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS)
   - Search for "PolyLLM: Open Configuration UI"
   - Select the command to open the configuration panel

2. **From the Status Bar**:
   - Click on the "PolyLLM" status bar item in the bottom-right corner of VS Code

### Language

The interface is available in English and Simplified Chinese. It follows the VS Code display language by default; the picker in the panel header switches it immediately, and `oaicopilot.language` (`auto`, `en`, `zh-CN`) does the same from the settings page. Switching the language keeps whatever you have typed into the tables. The command palette entries and the settings page follow the same choice.

<details>
<summary>Click Here for Details</summary>

### Workflow Example

1. **Add a Provider**:
   - Click "Add Provider" in the Provider Management section
   - Enter Provider ID: "modelscope"
   - Enter Base URL: "https://api-inference.modelscope.cn/v1"
   - Enter API Key: Your ModelScope API key
   - Select API Mode: "openai"
   - Click "Save"

2. **Add a Model**:
   - Click "Add Model" in the Model Management section
   - Select Provider: "modelscope"
   - Enter Model ID: "Qwen/Qwen3-Coder-480B-A35B-Instruct"
    - Enter a globally unique Display Name
   - Configure basic parameters (context length, max tokens, etc.)
   - Click "Save Model"

3. **Use the Model in VS Code**:
   - Open GitHub Copilot Chat (`Ctrl+Shift+I` or `Cmd+Shift+I`)
   - Click the model picker in the chat input
   - Select "Manage Models..."
   - Choose "PolyLLM" provider
   - Select your configured models
   - Start chatting with the model!

### Tips & Best Practices

- **Provider-only connection settings**: Base URL and API Key are configured per provider; there is no global connection fallback.
- **Provider IDs**: Use descriptive names that match the service (e.g., "modelscope", "iflow", "anthropic")
- **Model IDs**: Use the exact identifier from the provider. It must be unique within that provider, but another provider may use the same ID.
- **Display Names**: Required and globally unique after Unicode normalization, trimming, and case folding.
- **Config IDs**: Optional descriptive labels; they do not allow duplicate Model IDs within one provider.
- **Connection Overrides**: Models inherit Base URL, API mode, and headers from their provider. Set a model field only when an explicit per-model override is required.
- **Save Frequently**: Changes are saved to VS Code settings immediately
- **Refresh**: Use the "Refresh" buttons to reload current configuration from VS Code settings

### Model family & System Prompts

VS Code Copilot has optimized system prompts for specific models. [Detailed introduction](https://github.com/microsoft/vscode-copilot-chat/blob/main/docs/prompts.md)

Below are the model family settings supported by Copilot:

| Model Family | General `family` | Specific Model `family` | Notes |
|---|---|---|---|
| Anthropic | 'claude', 'Anthropic'  | 'claude-sonnet-4-5', 'claude-haiku-4-5' |  |
| Gemini | 'gemini' | 'gemini-3-flash' | "github.copilot.chat.alternateGeminiModelFPrompt.enabled": true |
| xAI | 'grok-code' |  |  |
| OpenAI | 'gpt', 'o4-mini', 'o3-mini', 'OpenAI' | 'gpt-4.1', 'gpt-5-codex', 'gpt-5', 'gpt-5-mini', `!!family.startsWith('gpt-') && family.includes('-codex')`, `!!family.match(/^gpt-5\.\d+/i)` | "github.copilot.chat.alternateGptPrompt.enabled": true |

</details>

## ✨ Multi-API Mode

The extension supports five different API protocols to work with various model providers. You can specify which API mode to use for each model via the `apiMode` parameter.

### Supported API Modes

1. **`openai`** (default) - OpenAI Chat Completions API
   - Endpoint: `/chat/completions`
   - Header: `Authorization: Bearer <apiKey>`
   - Use for: Most OpenAI-compatible providers (ModelScope, SiliconFlow, etc.)

2. **`openai-responses`** - OpenAI Responses API
   - Endpoint: `/responses`
   - Header: `Authorization: Bearer <apiKey>`
   - Use for: OpenAI official Responses API (and compatible gateways like rsp4copilot)

3. **`ollama`** - Ollama native API
   - Endpoint: `/api/chat`
   - Header: `Authorization: Bearer <apiKey>` (or no header for local Ollama)
   - Use for: Local Ollama instances

4. **`anthropic`** - Anthropic Claude API
   - Endpoint: `/v1/messages`
   - Header: `x-api-key: <apiKey>`
   - Use for: Anthropic Claude models

5. **`gemini`** - Gemini native API
   - Endpoint: `/v1beta/models/{model}:streamGenerateContent?alt=sse`
   - Header: `x-goog-api-key: <apiKey>`
   - Use for: Google Gemini models (and compatible gateways like rsp4copilot)

<details>
<summary>Click Here for Details</summary>

### Configuration Examples
Mixed configuration with multiple API modes:

```json
"oaicopilot.models": [
    {
        "id": "__provider__openai",
        "owned_by": "openai",
        "providerConfig": true,
        "baseUrl": "https://api.openai.com/v1",
        "apiMode": "openai"
    },
    {
        "id": "__provider__sub2api",
        "owned_by": "sub2api",
        "providerConfig": true,
        "baseUrl": "http://localhost:8080/v1",
        "apiMode": "openai-responses"
    },
    {
        "id": "GLM-4.6",
        "owned_by": "modelscope",
		"displayName": "GLM-4.6 via ModelScope"
    },
    {
        "id": "llama3.2",
        "owned_by": "ollama",
		"displayName": "Llama 3.2 via Ollama",
        "baseUrl": "http://localhost:11434",
        "apiMode": "ollama"
    },
    {
        "id": "claude-3-5-sonnet-20241022",
        "owned_by": "anthropic",
		"displayName": "Claude 3.5 Sonnet via Anthropic",
        "baseUrl": "https://api.anthropic.com",
        "apiMode": "anthropic"
    }
]
```

### Important Notes
- The `apiMode` parameter defaults to `"openai"` if not specified.
- When using `ollama` mode, you can omit the API key (`ollama` by default) or set it to any string.
- Each API mode uses different message conversion logic internally to match provider-specific formats (tools, images, thinking).

</details>

## ✨ Multi-Provider Guide

> `owned_by` (alias: `provider` / `provide`) in model config is used for grouping provider-specific API keys. The storage key is `oaicopilot.apiKey.<providerIdLowercase>`.

1. Open VS Code Settings and configure `oaicopilot.models`.
2. Open command center ( Ctrl+Shift+P ), and search "PolyLLM: Set Multi-Provider API Key" to configure provider-specific API keys.
3. Open GitHub Copilot Chat interface.
4. Click the model picker and select "Manage Models...".
5. Choose "PolyLLM" provider.
6. Select the models you want to add to the model picker.

<details>
<summary>Click Here for Details</summary>

### Settings Example

```json
"oaicopilot.models": [
    {
        "id": "Qwen/Qwen3-Coder-480B-A35B-Instruct",
        "owned_by": "modelscope",
        "displayName": "Qwen3 Coder via ModelScope",
        "baseUrl": "https://api-inference.modelscope.cn/v1",
        "context_length": 256000,
        "max_tokens": 8192,
        "temperature": 0,
        "top_p": 1
    },
    {
        "id": "qwen3-coder",
        "owned_by": "iflow",
        "displayName": "Qwen3 Coder via iFlow",
        "baseUrl": "https://apis.iflow.cn/v1",
        "context_length": 256000,
        "max_tokens": 8192,
        "temperature": 0,
        "top_p": 1
    }
]
```

</details>

## ✨ Model identity and Display Names

Model identity is the combination of Provider ID and Model ID. The same Model ID can therefore be configured for different providers, while duplicate Model IDs within one provider are rejected. Display Names are required and globally unique.

<details>
<summary>Click Here for Details</summary>

The optional `configId` field is retained as metadata only. It is not part of model identity and cannot be used to create duplicate entries within one provider.

### Settings Example

```json
"oaicopilot.models": [
    {
        "id": "gpt-5",
        "owned_by": "openai",
        "displayName": "GPT-5 via OpenAI"
    },
    {
        "id": "gpt-5",
        "owned_by": "sub2api",
        "displayName": "GPT-5 via Sub2API"
    }
]
```

Both entries use the upstream ID `gpt-5`, but each is routed to its own provider. Their Display Names remain distinct in the VS Code model picker.

</details>

## ✨ Custom Headers

You can specify custom HTTP headers that will be sent with every request to a specific model's provider. This is useful for:

- API versioning headers
- Custom authentication headers (in addition to the standard Authorization header)
- Provider-specific headers required by certain APIs
- Request tracking or debugging headers

<details>
<summary>Click Here for Details</summary>

### Custom Headers Example

```json
"oaicopilot.models": [
    {
        "id": "custom-model",
        "owned_by": "provider",
		"displayName": "Custom Model via Provider",
        "baseUrl": "https://api.example.com/v1",
        "headers": {
            "X-API-Version": "2024-01",
            "X-Request-Source": "vscode-copilot",
            "Custom-Auth-Token": "additional-token-if-needed"
        }
    }
]
```

**Important Notes:**
- Custom headers are merged with default headers (Authorization, Content-Type, User-Agent)
- If a custom header conflicts with a default header, the custom header takes precedence
- Headers are applied on a per-model basis, allowing different headers for different providers
- Header values must be strings

</details>

## ✨ Session ID header

Some providers route requests and cache prompts per conversation, and reject requests that do not carry a session identifier. OpenCode Zen/Go is one of them: it answers `400 MissingSessionID` unless the request includes an `x-opencode-session` header.

VS Code does not expose a conversation identifier to language model providers, so the extension derives a stable ID from the first user turn of the conversation. The ID stays the same for every request of one conversation and differs between conversations.

<details>
<summary>Click Here for Details</summary>

### Session ID Header Example

```json
"oaicopilot.models": [
    {
        "id": "__provider__opencode",
        "owned_by": "opencode",
        "providerConfig": true,
        "baseUrl": "https://opencode.ai/zen/go/v1",
        "session_id_header": "x-opencode-session"
    },
    {
        "id": "deepseek-v4-pro",
        "owned_by": "opencode",
        "displayName": "DeepSeek V4 Pro via OpenCode"
    }
]
```

**Important Notes:**
- Set `session_id_header` to the header name your provider expects. Leave it unset to disable the feature.
- It is provider-level configuration, so every model of that provider inherits it. An individual model entry can still override it.
- You can also set it in the Configuration UI, in the **Session ID Header** column of the Providers table.
- The value is a UUID-shaped SHA-256 hash of the first user turn, so no conversation content leaves the machine in the header.
- VS Code does not expose a conversation ID, so two conversations that start with an identical first user message share a session ID.

</details>

## ✨ Provider balance

PolyLLM can query how much credit is left on a provider and show it in the status bar, so you notice a nearly empty account before a request fails.

Balance querying is opt-in and configured per provider. Nothing is requested until you enable it for a provider, and the default refresh mode is manual.

<details>
<summary>Click Here for Details</summary>

### Enabling it

1. Run **PolyLLM: Open Configuration UI**.
2. In the Providers table, click the ⚙ button in the **Balance** column.
3. Tick **Enable balance query** and pick a preset, or describe a custom endpoint. Picking a preset ticks the box for you.
4. Click **Test** to run the query once and see the result, then **Save**.

Once enabled, the balance appears in the status bar while that provider is in use, and **PolyLLM: Show Provider Balances** lists every configured provider.

The **Balance** column distinguishes three states: `Not set` (nothing configured), `Disabled` (a query is saved but switched off), and the value itself once it has been queried. A saved query stays in the panel and survives reopening the configuration UI.

### Built-in presets

| Preset | Endpoint | Notes |
| --- | --- | --- |
| DeepSeek | `GET {{baseUrl}}/user/balance` | Reports the balance per currency |
| SiliconFlow (China) | `GET {{baseUrl}}/user/info` | Total balance in CNY |
| SiliconFlow (International) | `GET {{baseUrl}}/user/info` | Same endpoint on the international site, reporting USD |
| OpenRouter | `GET {{baseUrl}}/credits` | Computes remaining from credits minus usage |
| StepFun | `GET {{origin}}/v1/accounts` | Balance in CNY |
| Novita AI | `GET {{origin}}/v3/user/balance` | The endpoint reports 0.0001 USD units, which the preset converts |
| New API | `GET {{origin}}/api/user/self` | For relays built on New API; quota is converted with `/ 500000` |
| Kimi For Coding | `GET {{baseUrl}}/v1/usages` | Reads the overall plan window as a percentage |
| Zhipu GLM | `GET {{origin}}/api/monitor/usage/quota/limit` | Reads the 5-hour window as a percentage. The key goes in `Authorization` with no `Bearer` prefix |
| MiniMax | `GET {{origin}}/v1/api/openplatform/coding_plan/remains` | Reads the 5-hour window as a percentage |
| OpenCode Go | `GET https://opencode.ai/zen/go/v1/usage` | Reads the rolling 5-hour window as a percentage |

Anything else can be configured by hand: the endpoint, the HTTP method, the authentication style, extra headers, and the response fields.

#### Coding plans report percentages, not money

A subscription plan has no balance to report — Kimi, Zhipu GLM, MiniMax, and OpenCode Go answer with how much of a rolling window is left. Those presets express the window as a percentage out of a total of 100, so a plan and a balance can sit in the same column and share the same low-balance colouring. Each preset reads the shortest window, because that is the one that stops you working; point the Remaining expression at another window if you would rather watch the weekly or monthly one.

OpenCode Zen (pay as you go) publishes no balance or usage API at all, so it cannot be queried. OpenCode Go is a separate route with its own subscription.

### Describing the response

The response fields are JSON paths, with optional arithmetic. No code is executed, so a configuration can never run anything on your machine.

| Field | Meaning | Example |
| --- | --- | --- |
| Remaining | Required. The value shown as the balance. | `balance_infos[0].total_balance` |
| Unit | Currency or unit label | `balance_infos[0].currency` or `"CNY"` |
| Total | Starting or granted amount, used to grade low-balance warnings | `(data.quota + data.used_quota) / 500000` |
| Used | Amount already spent | `data.used_quota / 500000` |
| Plan name | Subscription or plan label | `data.group` |
| Extra | Any short note shown in the tooltip | `data.expires_at` |

Supported syntax: `a.b`, `a[0].b`, `["odd key"]`, `+ - * /`, parentheses, and quoted literals such as `"USD"`. A bare word is treated as a literal, so `CNY` works without quotes.

Usage windows come back in an array whose order the provider does not promise, so they can be picked by field instead of by position: `limits[type == 'TOKENS_LIMIT'][unit == 3].percentage` takes the first element matching every selector.

### Settings example

```json
"oaicopilot.models": [
    {
        "id": "__provider__deepseek",
        "owned_by": "deepseek",
        "providerConfig": true,
        "baseUrl": "https://api.deepseek.com/v1",
        "balance": {
            "enabled": true,
            "preset": "deepseek",
            "intervalMinutes": 15
        }
    }
]
```

### Behaviour and limits

- **Manual by default.** `intervalMinutes` is `0` unless you set it, and the background refresh only runs for providers with a positive interval.
- **Failures do not blank the display.** A timeout, network error, or 5xx keeps the last known value for ten minutes and marks it as stale. Authentication and 404 errors are shown immediately, because retrying them will not help.
- **One request at a time per provider.** Concurrent refreshes are merged, and the response body is capped at 1 MB.
- **The API key is read from secure storage** and never leaves the extension host, so the configuration page cannot see it.
- **The status bar follows the provider you are chatting with**, so it shows the balance that is actually being spent.
- Only `http` and `https` endpoints are accepted.

</details>

## ✨ Custom Request body parameters

The `extra` field allows you to add arbitrary parameters to the API request body. This is useful for provider-specific features that aren't covered by the standard parameters.

### How it works
- Parameters in `extra` are merged directly into the request body
- Works with all API modes (`openai`, `openai-responses`, `ollama`, `anthropic`, `gemini`)
- Values can be any valid JSON type (string, number, boolean, object, array)

<details>
<summary>Click Here for Details</summary>

### Common use cases
- **OpenAI-specific parameters**: `seed`, `logprobs`, `top_logprobs`, `suffix`, `presence_penalty` (if not using standard parameter)
- **Provider-specific features**: Custom sampling methods, debugging flags
- **Experimental parameters**: Beta features from API providers

### Configuration Example

```json
"oaicopilot.models": [
    {
        "id": "custom-model",
        "owned_by": "openai",
		"displayName": "Custom Model via OpenAI",
        "extra": {
            "seed": 42,
            "logprobs": true,
            "top_logprobs": 5,
            "suffix": "###",
            "presence_penalty": 0.1
        }
    },
    {
        "id": "local-model",
        "owned_by": "ollama",
		"displayName": "Local Model via Ollama",
        "baseUrl": "http://localhost:11434",
        "apiMode": "ollama",
        "extra": {
            "keep_alive": "5m",
            "raw": true
        }
    },
    {
        "id": "claude-model",
        "owned_by": "anthropic",
		"displayName": "Claude Model via Anthropic",
        "baseUrl": "https://api.anthropic.com",
        "apiMode": "anthropic",
        "extra": {
            "service_tier": "standard_only"
        }
    }
]
```

### Show thinking in Copilot
These are provider-specific parameters that can make Copilot show a **Thinking** block (if the provider/model supports it).

#### OpenAI Responses
Use `apiMode: "openai-responses"` and set the reasoning summary mode:

```json
{
  "id": "gpt-4o-mini",
  "owned_by": "openai",
	"displayName": "GPT-4o Mini via OpenAI",
  "baseUrl": "https://api.openai.com/v1",
  "apiMode": "openai-responses",
  "reasoning_effort": "high",
  "extra": {
    "reasoning": {
      "summary": "detailed"
    }
  }
}
```

#### Gemini
Use `apiMode: "gemini"` and enable thought summaries:

```json
{
  "id": "gemini-3-flash-preview",
  "owned_by": "gemini",
	"displayName": "Gemini 3 Flash Preview",
  "baseUrl": "https://generativelanguage.googleapis.com",
  "apiMode": "gemini",
  "extra": {
    "generationConfig": {
      "thinkingConfig": {
        "includeThoughts": true
      }
    }
  }
}
```

### Important Notes
- Parameters in `extra` are added after standard parameters
- `extra.model` is ignored: requests always use the exact configured upstream Model ID
- Other conflicting `extra` parameters generally take precedence unless the API adapter reserves them
- Use this for provider-specific features only
- Standard parameters (temperature, top_p, etc.) should use their dedicated fields when possible
- API provider must support the parameters you specify

</details>

## Model Parameters
All parameters support individual configuration for different models, providing highly flexible model tuning capabilities.

- `id` (required): Model identifier
- `owned_by` (required): Model provider
- `displayName` (required): Globally unique name shown in the Copilot interface. Comparison uses NFKC normalization, trimming, and case folding.
- `configId`: Optional descriptive label. It is not part of model identity and does not allow duplicate Model IDs within one provider.
- `family`: Model family (e.g., 'gpt-4', 'claude-3', 'gemini'). Enables model-specific optimizations and behaviors. Defaults to 'oai-compatible' if not specified.
- `baseUrl`: Optional model-specific Base URL override. If omitted, the provider's Base URL configured in Provider Management is used. There is no global Base URL fallback.
- `context_length`: The context length supported by the model. Default value is 128000
- `max_tokens`: Maximum number of tokens to generate (range: [1, context_length]). Default value is 4096
- `max_completion_tokens`: Maximum number of tokens to generate (OpenAI new standard parameter)
- `vision`: Whether the model supports vision capabilities. Defaults to false
- `temperature`: Sampling temperature (range: [0, 2]). Controls the randomness of the model's output:
  - **Lower values (0.0-0.3)**: More focused, consistent, and deterministic. Ideal for precise code generation, debugging, and tasks requiring accuracy.
  - **Moderate values (0.4-0.7)**: Balanced creativity and structure. Good for architecture design and brainstorming.
  - **Higher values (0.7-2.0)**: More creative and varied responses. Suitable for open-ended questions and explanations.
  - **Best Practice**: Set to `0` to align with GitHub Copilot's default deterministic behavior for consistent code suggestions. Thinking-enabled models suggest `1.0` to ensure optimal performance of the thinking mechanism.
- `top_p`: Top-p sampling value (range: (0, 1]). Optional parameter
- `top_k`: Top-k sampling value (range: [1, ∞)). Optional parameter
- `min_p`: Minimum probability threshold (range: [0, 1]). Optional parameter
- `frequency_penalty`: Frequency penalty (range: [-2, 2]). Optional parameter
- `presence_penalty`: Presence penalty (range: [-2, 2]). Optional parameter
- `repetition_penalty`: Repetition penalty (range: (0, 2]). Optional parameter
- `enable_thinking`: Enable model thinking and reasoning content display (for non-OpenRouter providers)
- `thinking_budget`: Maximum token count for thinking chain output. Optional parameter
- `reasoning`: OpenRouter reasoning configuration, includes the following options:
  - `enabled`: Enable reasoning functionality (if not specified, will be inferred from effort or max_tokens)
  - `effort`: Reasoning effort level (high, medium, low, minimal, auto)
  - `exclude`: Exclude reasoning tokens from the final response
  - `max_tokens`: Specific token limit for reasoning (Anthropic style, as an alternative to effort)
- `thinking`: Thinking configuration for Zai provider
  - `type`: Set to 'enabled' to enable thinking, 'disabled' to disable thinking
- `reasoning_effort`: Reasoning effort level (OpenAI reasoning configuration)
- `headers`: Custom HTTP headers to be sent with every request to this model's provider (e.g., `{"X-API-Version": "v1", "X-Custom-Header": "value"}`). These headers will be merged with the default headers (Authorization, Content-Type, User-Agent)
- `session_id_header`: Name of an HTTP header used to send a stable per-conversation session ID (e.g., `"x-opencode-session"`). Provider-level configuration; required by providers that route requests by session, such as OpenCode Zen/Go. Leave unset to disable
- `extra`: Extra request body parameters.
- `include_reasoning_in_request`: Whether to include reasoning_content in assistant messages sent to the API. Supports deepseek-v3.2 and similar models.
- `apiMode`: API mode: 'openai' (Default) for API (/chat/completions), 'openai-responses' for API (/responses), 'ollama' for API (/api/chat), 'anthropic' for API (/v1/messages), 'gemini' for API (/v1beta/models/{model}:streamGenerateContent?alt=sse).
- `delay`: Model-specific delay in milliseconds between consecutive requests. If not specified, falls back to global `oaicopilot.delay` configuration.
- `useForCommitGeneration`: Whether to be used for Git commit message generation. Not supports gemini apiMode.

## Thanks to

Thanks to all the people who contribute.

- [Contributors](https://github.com/Creeperw/oai-compatible-copilot/graphs/contributors)
- [Hugging Face Chat Extension](https://github.com/huggingface/huggingface-vscode-chat)
- [VS Code Chat Provider API](https://code.visualstudio.com/api/extension-guides/ai/language-model-chat-provider)

## Support & License
- Open issues: https://github.com/Creeperw/oai-compatible-copilot/issues
- License: MIT License Copyright (c) 2025 Johnny Zhao
- This fork is maintained by Creeperw. The original copyright notice above is preserved as required by the MIT License.
