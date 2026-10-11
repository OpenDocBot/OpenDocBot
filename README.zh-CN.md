[English](README.md) | 简体中文

> [!NOTE]
> 本中文译本仅供参考，如有歧义，请以[英文版](README.md)为准。

> [!NOTE]
> **OpenDocBot 处于抢先体验阶段**：给仓库点个 **Star** ⭐ 并 **Watch** 👀，以跟进更新。

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="src/assets/logo.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://github.com/user-attachments/assets/1c44d17e-cf3b-47df-be29-1658fce0fb6c">
    <img src="https://github.com/user-attachments/assets/1c44d17e-cf3b-47df-be29-1658fce0fb6c" alt="OpenDocBot" width="320" />
  </picture>
</p>

<p align="center"><strong>真正值得信赖的 Office AI 智能体<br/>客户端运行、不绑定特定提供商、完全可审计。无供应商锁定，无隐藏遥测。</strong></p>

<br />

适用于 **Microsoft 365**（Word、Excel、PowerPoint），支持桌面版与网页版。

---
## 功能

- **统一的 Office 套件集成**：一个加载项，覆盖 Word、Excel 和 PowerPoint。直接在工作流中读取、写入、分析内容，生成公式，自动格式化表格，并制作幻灯片。
- **提供商自由，零锁定**：可连接 OpenAI、Anthropic、Gemini、DeepSeek、Ollama、OpenRouter、OpenCode 或任何兼容 OpenAI 的 API。可在模型与提供商之间即时切换。
- **100% 客户端运行，本地优先**：零遥测。你的文档数据直接从浏览器发送到你选择的提供商；搭配 **Ollama** 时可完全离线运行。
- **人工确认（Human-in-the-Loop）安全机制**：在修改文档中的任何文本、公式或幻灯片布局之前，先审阅并批准模型的每一步操作。
- **建议模式**：只读审阅。智能体不改动你的内容，而是添加原生的 Word/Excel 批注来提出修改建议。
- **自带密钥（BYOK）且可自托管**：面向个人和小团队（最多 30 名用户）完全免费。使用你自己的 API 密钥，避免席位加价，或部署到你自己的基础设施上。
- **自建服务器，团队可用**：自托管后，可要求使用你所在组织的身份提供商（OIDC，例如 Microsoft Entra ID）登录，并为所有人统一设置 AI 提供商。SSO 与托管配置都包含在免费的自托管产品中。参见 [SSO](https://opendocbot.com/docs/enterprise/sso) 和[托管配置](https://opendocbot.com/docs/enterprise/managed-configuration)。

## 兼容性

### 支持的 Office 应用

| 平台 | 支持情况 |
|---|---|
| **Microsoft 365**（桌面版） | ✅ 完全支持 |
| **Microsoft 365**（网页版） | ✅ 完全支持 |
| Office 2016/2019/2021（永久版） | ❌ 不支持 |
| LibreOffice / Google Docs | ❌ 不支持 |

### 支持的 AI 提供商与功能

| 提供商 | 推理 | 推理强度 | 流式输出 | 提示词缓存 | 模型列表 |
|---|:---:|:---:|:---:|:---:|:---:|
| **OpenAI** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Anthropic** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Gemini** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **DeepSeek** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Microsoft Foundry** | ✅\* | ⚠️\*\* | ✅ | ✅ | ⚠️ |
| **Ollama（本地）** | ✅\* | ❌\*\* | ✅ | ❌ | ❌ |
| **OpenRouter** | ✅\* | ⚠️\*\* | ✅ | ✅ | ✅ |
| **OpenCode** | ✅ | ⚠️\*\* | ✅ | ✅ | ⚠️\*\*\* |

\* *推理能力取决于底层模型。*  
\*\* *推理强度取决于端点支持情况。*  
\*\*\* *没有一键预设：请通过 **Custom** 预设配置 OpenCode。参见[此处](https://opendocbot.com/docs/providers/opencode)。*  
*Microsoft Foundry 使用兼容 OpenAI 的 v1 API；模型字段填写你的 **部署名称**。参见[此处](https://opendocbot.com/docs/providers/foundry)。*

## 快速开始

> [!IMPORTANT]
> **OpenDocBot 目前处于抢先体验阶段。** 它已经可以使用，但 Microsoft Store 分发尚未开放，因此目前需要通过 Office 旁加载安装。
>
> 我们正在寻找希望提前试用 OpenDocBot 并帮助塑造产品的 **Microsoft 365 高级用户**。请做好会有一些不完善之处的心理准备。我们尤其欢迎反馈、缺陷报告和功能建议。

上手最快的方式是使用 [opendocbot.com/app](https://opendocbot.com/app) 上的 **托管实例**。我们只在任务窗格首次加载时提供一次应用；此后应用完全在本地运行。任何文档数据都不会到达我们的服务器。

在 Microsoft Store 分发开放之前，仍需通过旁加载安装。我们提供了自动配置旁加载的脚本，具体到你所用操作系统和 Office 版本的说明见[旁加载指南](https://opendocbot.com/docs/quickstart#_1-sideload-the-add-in-in-office)。

📖 完整快速开始指南：
[opendocbot.com/docs/quickstart](https://opendocbot.com/docs/quickstart)

## 文档
完整技术文档见 [opendocbot.com/docs](https://opendocbot.com/docs)。

## 自托管

直接从你自己的基础设施提供 OpenDocBot。自托管还能解锁团队功能：

- **SSO**：在加载项加载之前，要求使用你所在组织的身份提供商（OIDC，例如 Microsoft Entra ID）登录。
- **托管配置**：为实例上的所有人统一设置提供商、API 密钥和模型，其余设置仍可编辑。

两者都随免费的自托管产品提供。设置方法见[自托管指南](https://opendocbot.com/docs/selfhosting)。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| **前端** | React 18、TypeScript、Tailwind CSS、ShadCN UI |
| **构建与状态** | Vite、Zustand（持久化） |
| **Office API** | Word.js、Excel.js、PowerPoint.js |
| **测试** | Vitest、React Testing Library |

## 许可证

OpenDocBot 采用 **fair-code（公平代码）** 许可：源码与开发在 GitHub 上公开、可审计，且面向个人和最多 **30 名用户** 的团队免费。
超过该规模的企业需要商业许可。简而言之：
[你可以做什么、不可以做什么](https://opendocbot.com/docs/license)。

参见 [LICENSE](LICENSE)。贡献须遵守
[贡献者许可协议](CONTRIBUTOR_LICENSE_AGREEMENT)。
