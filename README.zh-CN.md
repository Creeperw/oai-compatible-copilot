<div align="center">

<img src="assets/logo.png" alt="PolyLLM Logo" width="120" height="120">

# PolyLLM

**在 VS Code 的 GitHub Copilot Chat 中使用任意 OpenAI/Ollama/Anthropic/Gemini API兼容供应商** 🔥

[English](README.md) | 简体中文

</div>

> **PolyLLM** 是 [OAI Compatible Provider for Copilot](https://github.com/JohnnyZ93/oai-compatible-copilot)（作者 Johnny Zhao，MIT 许可）的 fork。
> 它保留原有的配置格式（`oaicopilot.*` 设置与供应商 ID），因此已有配置可继续使用。

[![CI](https://github.com/Creeperw/polyllm/actions/workflows/release.yml/badge.svg)](https://github.com/Creeperw/polyllm/actions)
[![License](https://img.shields.io/github/license/Creeperw/polyllm?color=orange&label=License)](https://github.com/Creeperw/polyllm/blob/main/LICENSE)

## ✨ 特性
- **多 API 支持**：OpenAI/Ollama/Anthropic/Gemini API（ModelScope、SiliconFlow、DeepSeek 等）
- **视觉模型**：完整支持图像理解能力
- **高级配置**：灵活的对话请求选项，支持思维链/推理控制
- **多供应商管理**：同时配置多个供应商模型，自动管理各供应商 API 密钥
- **供应商感知的模型身份**：不同供应商可以同时配置相同的上游模型 ID
- **可视化配置界面**：直观的界面管理供应商和模型
- **自动重试**：处理 API 错误（429、500、502、503、504），支持指数退避
- **Token 用量**：状态栏实时显示 token 计数和供应商 API 密钥管理
- **供应商余额**：查询并显示各供应商的剩余额度，内置 DeepSeek、SiliconFlow、OpenRouter、StepFun、Novita AI、New API 中转站，以及 Kimi、智谱 GLM、MiniMax、OpenCode Go 编程套餐预设
- **Git 集成**：直接从源代码管理生成提交信息
- **导入/导出**：轻松分享和备份配置
- **批量添加模型**：在同一个对话框里从供应商的在线模型列表勾选多个模型一次性添加，并可在保存前用「测试连接」校验地址、密钥和模型 ID
- **工具优化**：优化 agent `read_file` 工具处理，避免对大文件读取小片段。

### 模型表单

添加模型时打开的是一个对话框，而不是一长串字段：

- **基本信息** —— 供应商、模型 ID、显示名称、配置 ID、API 模式、Base URL。
- **能力与限制** —— 上下文长度、最大输出、最大完成 token 数、支持图片、模型系列。
- **思考与推理** —— 思考类型、启用思考、推理强度、思考预算、回传思考内容。
- **采样参数** —— 温度、Top P、请求间隔。
- **高级设置** —— Top K、Min P、三种惩罚系数、OpenRouter 推理配置，以及原始的请求头 / 额外参数 JSON。

**模型 ID** 可以填任意多个。在下拉框里勾选会变成可移除的标签，输入一个 ID 后回车同样会变成标签，
所以添加单个模型依然只是「输入 ID、点保存」。搜索框可以在长列表里快速定位，「全选」只作用于搜索后
仍然可见的模型。该供应商下已配置过的模型会置灰且无法勾选。输入框里的每个 ID 都使用同一套表单参数，
由同一个保存按钮一次性写入：待添加多个时按钮显示「添加 N 个模型」，编辑时显示「保存修改」。
待添加多个模型时「显示名称」会被禁用，因为每个模型会各自生成默认名称。
「测试连接」会告诉你接口返回了多少个模型，并在你填的模型 ID 不在列表中时给出提示。

模型列表按供应商分组，每组标题可折叠；表格滚动时表头保持可见。其中两列可以直接在表格里改：点一下
「显示名称」或「思考强度」单元格，改完回车保存，Esc 取消。

要给多个模型一次性改同一项，就在第一列勾选它们，再点「批量设置」。只有你勾选的字段会被写入，
勾了但留空的字段表示清除，其余设置保持原样 —— 比如你可以给一组模型统一设一个默认思考强度，
而不影响它们各自的温度或请求间隔。批量添加时输入的显示名称不会生效，每个模型各自使用默认名称。

## 环境要求
- VS Code 1.120.0 或更高版本。
- OpenAI 兼容供应商的 API 密钥。

## ⚡ 快速开始
1. [在此处](https://marketplace.visualstudio.com/items?itemName=creeperw.polyllm)安装 PolyLLM 扩展。
2. 从命令面板运行 **PolyLLM: Open Configuration UI**。
3. 添加供应商，并填写其 Base URL、API Key 和 API 模式。
4. 添加模型，为每个模型填写全局唯一的 Display Name。
5. 打开 GitHub Copilot Chat 并选择配置好的模型。

### 配置示例

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

`providerConfig: true` 条目是内部供应商连接元数据。建议通过配置界面创建和更新。模型属于用户级 application 设置；API Key 会加密保存在 VS Code SecretStorage 中，但不会跨设备同步，每台设备都需要重新录入。

## ✨ 配置界面

本扩展提供可视化配置界面，方便管理全局设置、供应商和模型，无需手动编辑 JSON 文件。

### 打开配置界面

有两种方式打开配置界面：

1. **通过命令面板**：
   - 按 `Ctrl+Shift+P`（macOS 上按 `Cmd+Shift+P`）
   - 搜索 "PolyLLM: Open Configuration UI"
   - 选择该命令打开配置面板

2. **通过状态栏**：
   - 点击 VS Code 右下角的 "PolyLLM" 状态栏项

### 界面语言

配置界面提供英文和简体中文两种语言。默认跟随 VS Code 的显示语言；面板标题栏的语言下拉框可以立即切换，也可以在设置页通过 `oaicopilot.language`（`auto`、`en`、`zh-CN`）设置。切换语言不会丢失你在表格里已经输入但尚未保存的内容。命令面板条目和设置页会跟随同一选择。

<details>
<summary>点击展开详情</summary>

### 工作流示例

1. **添加供应商**：
   - 在供应商管理中点击 "Add Provider"
   - 输入供应商 ID："modelscope"
   - 输入 Base URL："https://api-inference.modelscope.cn/v1"
   - 输入 API Key：你的 ModelScope API 密钥
   - 选择 API 模式："openai"
   - 点击 "Save"

2. **添加模型**：
   - 在模型管理中点击 "Add Model"
   - 选择供应商："modelscope"
   - 输入模型 ID："Qwen/Qwen3-Coder-480B-A35B-Instruct"
    - 输入一个全局唯一的 Display Name
   - 配置基本参数（上下文长度、最大 token 数等）
   - 点击 "Save Model"

3. **在 VS Code 中使用模型**：
   - 打开 GitHub Copilot Chat（`Ctrl+Shift+I` 或 `Cmd+Shift+I`）
   - 点击对话输入框的模型选择器
   - 选择 "Manage Models..."
   - 选择 "PolyLLM" 供应商
   - 选择已配置的模型
   - 开始与模型对话！

### 提示与最佳实践

- **仅供应商级连接配置**：Base URL 和 API Key 均按供应商配置，不再使用全局连接回退。
- **供应商 ID**：使用与服务匹配的描述性名称（如 "modelscope"、"iflow"、"anthropic"）
- **模型 ID**：使用供应商文档中的确切标识符；同一供应商内必须唯一，不同供应商之间可以相同。
- **Display Name**：必填；在 Unicode 规范化、去除首尾空格并忽略大小写后全局唯一。
- **配置 ID**：可选的描述性标签，不能用于在同一供应商内创建重复模型 ID。
- **连接覆盖**：模型默认继承供应商的 Base URL、API 模式和请求头；仅在确实需要时设置模型级覆盖。
- **及时保存**：更改会立即保存到 VS Code 设置中
- **刷新**：使用 "Refresh" 按钮从 VS Code 设置重新加载当前配置

### 模型家族与系统提示词

VS Code Copilot 针对特定模型优化了系统提示词。[详细介绍](https://github.com/microsoft/vscode-copilot-chat/blob/main/docs/prompts.md)

以下是 Copilot 支持的模型家族设置：

| 模型家族 | 通用 `family` | 具体模型 `family` | 备注 |
|---|---|---|---|
| Anthropic | 'claude', 'Anthropic'  | 'claude-sonnet-4-5', 'claude-haiku-4-5' |  |
| Gemini | 'gemini' | 'gemini-3-flash' | "github.copilot.chat.alternateGeminiModelFPrompt.enabled": true |
| xAI | 'grok-code' |  |  |
| OpenAI | 'gpt', 'o4-mini', 'o3-mini', 'OpenAI' | 'gpt-4.1', 'gpt-5-codex', 'gpt-5', 'gpt-5-mini', `!!family.startsWith('gpt-') && family.includes('-codex')`, `!!family.match(/^gpt-5\.\d+/i)` | "github.copilot.chat.alternateGptPrompt.enabled": true |

</details>

## ✨ 多 API 模式

本扩展支持五种不同的 API 协议，可与各种模型供应商对接。你可以通过 `apiMode` 参数为每个模型指定使用的 API 模式。

### 支持的 API 模式

1. **`openai`**（默认）- OpenAI Chat Completions API
   - 端点：`/chat/completions`
   - 请求头：`Authorization: Bearer <apiKey>`
   - 适用：大多数 OpenAI 兼容供应商（ModelScope、SiliconFlow 等）

2. **`openai-responses`** - OpenAI Responses API
   - 端点：`/responses`
   - 请求头：`Authorization: Bearer <apiKey>`
   - 适用：OpenAI 官方 Responses API（及兼容网关如 rsp4copilot）

3. **`ollama`** - Ollama 原生 API
   - 端点：`/api/chat`
   - 请求头：`Authorization: Bearer <apiKey>`（本地 Ollama 可省略）
   - 适用：本地 Ollama 实例

4. **`anthropic`** - Anthropic Claude API
   - 端点：`/v1/messages`
   - 请求头：`x-api-key: <apiKey>`
   - 适用：Anthropic Claude 模型

5. **`gemini`** - Gemini 原生 API
   - 端点：`/v1beta/models/{model}:streamGenerateContent?alt=sse`
   - 请求头：`x-goog-api-key: <apiKey>`
   - 适用：Google Gemini 模型（及兼容网关如 rsp4copilot）

<details>
<summary>点击展开详情</summary>

### 配置示例
多 API 模式混合配置：

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

### 重要说明
- 未指定 `apiMode` 时默认为 `"openai"`。
- 使用 `ollama` 模式时，可以不填 API 密钥（默认用 `ollama`）或填任意字符串。
- 每种 API 模式内部使用不同的消息转换逻辑，以匹配各自供应商的格式（工具、图像、思维链）。

</details>

## ✨ 多供应商指南

> 模型配置中的 `owned_by`（别名：`provider` / `provide`）用于分组供应商特定的 API 密钥。存储键为 `oaicopilot.apiKey.<providerId小写>`。

1. 打开 VS Code 设置，配置 `oaicopilot.models`。
2. 打开命令中心（Ctrl+Shift+P），搜索 "PolyLLM: Set Multi-Provider API Key" 来配置各供应商的 API 密钥。
3. 打开 GitHub Copilot Chat 界面。
4. 点击模型选择器，选择 "Manage Models..."。
5. 选择 "PolyLLM" 供应商。
6. 选择你想添加到模型选择器中的模型。

<details>
<summary>点击展开详情</summary>

### 配置示例

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

## ✨ 模型身份与 Display Name

模型身份由供应商 ID 与模型 ID 共同组成。因此，不同供应商可以配置相同模型 ID；同一供应商内的重复模型 ID 会被拒绝。Display Name 必填且全局唯一。

<details>
<summary>点击展开详情</summary>

可选的 `configId` 字段仅作为描述性元数据保留，不参与模型身份，也不能用于在同一供应商内创建重复项。

### 配置示例

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

两个条目都使用上游模型 ID `gpt-5`，但请求会分别路由到各自供应商；VS Code 模型选择器中使用不同的 Display Name 展示。

</details>

## ✨ 自定义请求头

你可以指定自定义 HTTP 请求头，这些请求头会在每次请求特定模型的供应商时发送。适用于：

- API 版本控制请求头
- 自定义认证请求头（除标准 Authorization 请求头之外）
- 某些 API 要求的供应商特定请求头
- 请求追踪或调试请求头

<details>
<summary>点击展开详情</summary>

### 自定义请求头示例

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

**重要说明：**
- 自定义请求头与默认请求头（Authorization、Content-Type、User-Agent）合并
- 如果自定义请求头与默认请求头冲突，自定义请求头优先
- 请求头按模型粒度生效，可以为不同供应商设置不同的请求头
- 请求头的值必须是字符串

</details>

## ✨ 会话 ID 请求头

部分供应商会按会话做请求路由与提示词缓存，缺少会话标识时直接拒绝请求。OpenCode Zen/Go 就是其中之一：请求缺少 `x-opencode-session` 请求头时会返回 `400 MissingSessionID`。

VS Code 不会向语言模型供应商暴露会话标识，因此本扩展会从对话的首个用户轮次推导出一个稳定的 ID。同一对话的每次请求该 ID 保持不变，不同对话之间则互不相同。

<details>
<summary>点击查看详情</summary>

### 会话 ID 请求头示例

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

**重要说明：**
- 将 `session_id_header` 设为你的供应商所要求的请求头名称。不设置即为关闭该功能。
- 它属于供应商级配置，该供应商下的所有模型都会继承；单个模型条目仍可覆盖它。
- 你也可以在配置界面中设置，位于供应商表格的 **Session ID Header** 列。
- 该值是首个用户轮次的 SHA-256 哈希（UUID 形状），因此请求头中不会携带任何对话内容。
- 由于 VS Code 不提供会话 ID，两条首个用户消息完全相同的对话会共用同一个会话 ID。

</details>

## ✨ 供应商余额

PolyLLM 可以查询供应商还剩多少额度，并显示在状态栏中，这样在请求失败之前就能发现账号快用完了。

余额查询是可选的，按供应商逐个配置。在你为某个供应商开启之前，不会发出任何请求；默认刷新方式是手动的。

<details>
<summary>点击查看详情</summary>

### 如何开启

1. 运行 **PolyLLM: Open Configuration UI**。
2. 在供应商表格的 **Balance** 列点击 ⚙ 按钮。
3. 勾选 **Enable balance query**，选择一个预设，或者自己填写一个自定义接口。选择预设会自动帮你勾上开关。
4. 点击 **Test** 先试跑一次看结果，然后点 **Save** 保存。

开启后，使用该供应商时状态栏会显示余额；**PolyLLM: Show Provider Balances** 命令会列出所有已配置的供应商。

**Balance** 列区分三种状态：`Not set`（尚未配置）、`Disabled`（已保存查询但开关未打开）、以及查询成功后的余额本身。已查到的结果会保留在面板里，重新打开配置界面不会丢失。

### 内置预设

| 预设 | 接口 | 说明 |
| --- | --- | --- |
| DeepSeek | `GET {{baseUrl}}/user/balance` | 按币种分别报告余额 |
| SiliconFlow（国内站） | `GET {{baseUrl}}/user/info` | 总余额，单位为人民币 |
| SiliconFlow（国际站） | `GET {{baseUrl}}/user/info` | 同一接口，国际站返回美元 |
| OpenRouter | `GET {{baseUrl}}/credits` | 用总额度减去已用量得到剩余 |
| StepFun 阶跃 | `GET {{origin}}/v1/accounts` | 余额单位为人民币 |
| Novita AI | `GET {{origin}}/v3/user/balance` | 接口以 0.0001 美元为单位，预设已换算 |
| New API | `GET {{origin}}/api/user/self` | 适用于基于 New API 搭建的中转站；额度用 `/ 500000` 换算 |
| Kimi For Coding | `GET {{baseUrl}}/v1/usages` | 读取总窗口的剩余百分比 |
| 智谱 GLM | `GET {{origin}}/api/monitor/usage/quota/limit` | 读取 5 小时窗口的剩余百分比。密钥直接放在 `Authorization` 里，不带 `Bearer` 前缀 |
| MiniMax | `GET {{origin}}/v1/api/openplatform/coding_plan/remains` | 读取 5 小时窗口的剩余百分比 |
| OpenCode Go | `GET https://opencode.ai/zen/go/v1/usage` | 读取 5 小时滚动窗口的剩余百分比 |

其他供应商可以手动配置：接口地址、请求方法、鉴权方式、额外请求头，以及响应字段。

#### 编程套餐返回的是百分比，不是钱

订阅制套餐没有「余额」可查 —— Kimi、智谱 GLM、MiniMax、OpenCode Go 返回的是滚动窗口还剩多少。这些预设把窗口表达成以 100 为总量的百分比，这样套餐和余额可以显示在同一列，并共用同一套余额偏低配色。每个预设读取的是最短的那个窗口，因为它才是当下真正卡住你的限制；如果你想盯周窗口或月窗口，把 Remaining 表达式改指过去即可。

OpenCode Zen（按量付费）完全没有公开的余额或用量接口，因此无法查询。OpenCode Go 是另一条独立线路，有自己的订阅。

### 如何描述响应

响应字段是 JSON 路径，可以带简单的四则运算。这里不会执行任何代码，因此配置本身无法在你机器上运行任何东西。

| 字段 | 含义 | 示例 |
| --- | --- | --- |
| Remaining | 必填。作为余额展示的数值。 | `balance_infos[0].total_balance` |
| Unit | 币种或单位标签 | `balance_infos[0].currency` 或 `"CNY"` |
| Total | 初始/赠送额度，用于判定余额偏低的提醒 | `(data.quota + data.used_quota) / 500000` |
| Used | 已用额度 | `data.used_quota / 500000` |
| Plan name | 套餐或订阅名称 | `data.group` |
| Extra | 在提示框中额外显示的一句话 | `data.expires_at` |

支持的写法：`a.b`、`a[0].b`、`["odd key"]`、`+ - * /`、括号，以及 `"USD"` 这样的带引号字面量。不带引号的单词会被当作字面量，所以直接写 `CNY` 也可以。

用量窗口返回在数组里，而供应商并不保证数组顺序，所以可以按字段而不是按位置取值：`limits[type == 'TOKENS_LIMIT'][unit == 3].percentage` 会取第一个同时满足所有条件的元素。

### 配置示例

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

### 行为与限制

- **默认手动。** 除非你主动设置，`intervalMinutes` 为 `0`；只有设置了正数的供应商才会后台自动刷新。
- **查询失败不会把显示清空。** 超时、网络错误或 5xx 会保留最近一次成功的数值十分钟，并标记为过期；鉴权和 404 类错误会立即显示，因为重试没有意义。
- **同一供应商同时只发一个请求。** 并发刷新会被合并，响应体上限为 1 MB。
- **API 密钥从安全存储读取**，不会离开扩展进程，因此配置页面看不到它。
- **状态栏跟随你正在对话的供应商**，显示的是真正在被消耗的那个余额。
- 只接受 `http` 和 `https` 地址。

</details>

## ✨ 自定义请求体参数

`extra` 字段允许你向 API 请求体添加任意参数。适用于标准参数未覆盖的供应商特定功能。

### 工作原理
- `extra` 中的参数会直接合并到请求体中
- 适用于所有 API 模式（`openai`、`openai-responses`、`ollama`、`anthropic`、`gemini`）
- 值可以是任意合法的 JSON 类型（字符串、数字、布尔值、对象、数组）

<details>
<summary>点击展开详情</summary>

### 常见用例
- **OpenAI 特定参数**：`seed`、`logprobs`、`top_logprobs`、`suffix`、`presence_penalty`（如果不使用标准参数）
- **供应商特定功能**：自定义采样方法、调试标志
- **实验性参数**：API 供应商的 Beta 功能

### 配置示例

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

### 在 Copilot 中显示思维链
以下是让 Copilot 显示 **Thinking** 模块的供应商特定参数（需要供应商/模型支持）。

#### OpenAI Responses
使用 `apiMode: "openai-responses"` 并设置推理摘要模式：

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
使用 `apiMode: "gemini"` 并启用思维摘要：

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

### 重要说明
- `extra` 中的参数在标准参数之后添加
- `extra.model` 会被忽略；请求始终使用配置中的原始上游模型 ID
- 其他冲突的 `extra` 参数通常优先，除非对应 API 适配器将其声明为保留字段
- 仅用于供应商特定功能
- 标准参数（temperature、top_p 等）应尽可能使用其专用字段
- API 供应商必须支持你指定的参数

</details>

## 模型参数
所有参数支持为不同模型单独配置，提供高度灵活的模型调优能力。

- `id`（必填）：模型标识符
- `owned_by`（必填）：模型供应商
- `displayName`（必填）：在 Copilot 界面中显示的全局唯一名称；比较时执行 NFKC 规范化、去除首尾空格并忽略大小写。
- `configId`：可选的描述性标签，不参与模型身份，也不能用于在同一供应商内创建重复模型 ID。
- `family`：模型家族（如 'gpt-4'、'claude-3'、'gemini'）。启用模型特定的优化和行为。不指定时默认为 'oai-compatible'。
- `baseUrl`：可选的模型专属 Base URL 覆盖。未提供时使用 Provider Management 中配置的供应商 Base URL；不存在全局 Base URL 回退。
- `context_length`：模型支持的上下文长度。默认为 128000
- `max_tokens`：最大生成 token 数（范围：[1, context_length]）。默认为 4096
- `max_completion_tokens`：最大生成 token 数（OpenAI 新标准参数）
- `vision`：模型是否支持视觉能力。默认为 false
- `temperature`：采样温度（范围：[0, 2]）。控制模型输出的随机性：
  - **较低值（0.0-0.3）**：更集中、一致、确定。适合精确的代码生成、调试和需要准确性的任务。
  - **中等值（0.4-0.7）**：平衡创造性和结构性。适合架构设计和头脑风暴。
  - **较高值（0.7-2.0）**：更具创造性和多样性。适合开放式问题和解释。
  - **最佳实践**：设为 `0` 以与 GitHub Copilot 的默认确定性行为保持一致，获得一致的代码建议。启用思维链的模型建议设为 `1.0` 以确保思维机制的最佳性能。
- `top_p`：Top-p 采样值（范围：(0, 1]）。可选参数
- `top_k`：Top-k 采样值（范围：[1, ∞)）。可选参数
- `min_p`：最小概率阈值（范围：[0, 1]）。可选参数
- `frequency_penalty`：频率惩罚（范围：[-2, 2]）。可选参数
- `presence_penalty`：存在惩罚（范围：[-2, 2]）。可选参数
- `repetition_penalty`：重复惩罚（范围：(0, 2]）。可选参数
- `enable_thinking`：启用模型思维链和推理内容显示（非 OpenRouter 供应商）
- `thinking_budget`：思维链输出的最大 token 数。可选参数
- `reasoning`：OpenRouter 推理配置，包含以下选项：
  - `enabled`：启用推理功能（如不指定，将从 effort 或 max_tokens 推断）
  - `effort`：推理力度级别（high、medium、low、minimal、auto）
  - `exclude`：从最终响应中排除推理 token
  - `max_tokens`：推理的特定 token 限制（Anthropic 风格，作为 effort 的替代方案）
- `thinking`：Zai 供应商的思维链配置
  - `type`：设为 'enabled' 开启思维链，'disabled' 关闭思维链
- `reasoning_effort`：推理力度级别（OpenAI 推理配置）
- `headers`：发送到此模型供应商的自定义 HTTP 请求头（如 `{"X-API-Version": "v1", "X-Custom-Header": "value"}`）。将与默认请求头（Authorization、Content-Type、User-Agent）合并
- `session_id_header`：用于发送稳定的每会话 ID 的 HTTP 请求头名称（如 `"x-opencode-session"`）。供应商级配置；按会话路由请求的供应商（如 OpenCode Zen/Go）需要此项。不设置即为关闭
- `extra`：额外请求体参数。
- `include_reasoning_in_request`：是否在发送给 API 的 assistant 消息中包含 reasoning_content。支持 deepseek-v3.2 及类似模型。
- `apiMode`：API 模式：'openai'（默认）对应 API（/chat/completions），'openai-responses' 对应 API（/responses），'ollama' 对应 API（/api/chat），'anthropic' 对应 API（/v1/messages），'gemini' 对应 API（/v1beta/models/{model}:streamGenerateContent?alt=sse）。
- `delay`：连续请求之间的模型专属延迟（毫秒）。未指定时回退到全局 `oaicopilot.delay` 配置。
- `useForCommitGeneration`：是否用于 Git 提交信息生成。不支持 gemini apiMode。

## 致谢

感谢所有贡献者。

- [贡献者](https://github.com/Creeperw/polyllm/graphs/contributors)
- [Hugging Face Chat 扩展](https://github.com/huggingface/huggingface-vscode-chat)
- [VS Code Chat Provider API](https://code.visualstudio.com/api/extension-guides/ai/language-model-chat-provider)

## 支持 & 许可证
- 提交 Issue：https://github.com/Creeperw/polyllm/issues
- 许可证：MIT License Copyright (c) 2025 Johnny Zhao
- 本 fork 由 Creeperw 维护。按 MIT 许可证要求，上方原始版权声明予以保留。