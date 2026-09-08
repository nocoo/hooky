<p align="center">
  <img src="assets/brand/icon-rounded.png" width="128" height="128" alt="Hooky logo" />
</p>
<h1 align="center">Hooky</h1>
<p align="center">从 Chrome 工具栏或右键菜单，将当前页面信息发送到指定 Webhook。</p>
<p align="center">
  <a href="https://chromewebstore.google.com/detail/hooky/almccnkbhfhckimediabjimflnbfbeeo">Chrome Web Store</a> ·
  <a href="docs/README.en.md">English</a>
</p>

## 这是什么

Hooky 是一个 Chrome 扩展，用于保存 Webhook 模板，并在浏览网页时发送页面 URL、标题、选中文本或元数据。你可以在弹窗中选择模板，使用页面右键菜单，或设置点击工具栏图标时应用的快捷发送规则。

模板、规则和外观设置保存在浏览器本地。请求由扩展发送到你配置的地址，页面数据是否进入请求取决于参数模板。扩展无需账号，接收请求的 Webhook 服务需要自行准备。

## 功能

- **多个模板**：分别保存名称、目标 URL、HTTP 方法和键值参数。
- **页面变量**：在参数值中引用当前页面信息，发送时替换变量。
- **快捷发送规则**：点击工具栏图标时，按顺序匹配页面 URL 或标题；首条启用且匹配的规则关联有效模板时直接发送，否则打开弹窗。
- **右键发送**：在页面、选区、链接或图片的右键菜单中选择模板。
- **结果反馈**：弹窗显示请求结果，快捷发送和右键操作通过图标标记反馈成功或失败。
- **界面设置**：系统、浅色、深色主题；界面语言跟随 Chrome，包含中英文等多种语言。

规则支持包含、相等、开头、结尾和正则匹配，匹配忽略大小写。页面变量包括：

| 变量 | 内容 |
| --- | --- |
| `{{page.url}}` | 页面 URL |
| `{{page.title}}` | 页面标题 |
| `{{page.selection}}` | 当前选中文本 |
| `{{page.meta.description}}` | description 元数据 |
| `{{page.meta.og:title}}` | Open Graph 标题 |
| `{{page.meta.og:description}}` | Open Graph 描述 |
| `{{page.meta.og:image}}` | Open Graph 图片地址 |

GET、DELETE 把参数放入查询字符串；POST、PUT、PATCH 发送 JSON 对象，参数值为字符串。当前不支持自定义 HTTP 请求头。Chrome 内部页等无法注入脚本的页面会退回可用的标签页信息，选中文本和元数据可能为空。

## 使用

从顶部的 Chrome Web Store 链接安装，或按开发章节从源码加载。

1. 打开扩展的选项页，创建 Webhook 模板，填写自己的目标地址与 HTTP 方法。
2. 添加参数，例如 `url = {{page.url}}`、`title = {{page.title}}`，然后保存。
3. 打开目标网页，在弹窗或右键菜单中选择模板发送。
4. 如需一次点击发送，在规则中选择 URL 或标题、匹配条件和模板，并启用该规则。

例如使用 POST 并配置上面的两个参数，接收端得到：

```json
{
  "url": "https://example.com/article",
  "title": "Example article"
}
```

权限包括页面上下文读取、脚本注入、本地存储、右键菜单，以及向自定义地址发送请求所需的 `<all_urls>` 主机权限。页面上下文在用户触发操作时读取；详见[隐私说明](PRIVACY.md)。

## 开发

开发检查需要 Bun、Node.js 24 和 Chrome。扩展运行代码是 JavaScript、HTML 和 CSS，没有前端框架或编译步骤。

```bash
git clone https://github.com/nocoo/hooky.git
cd hooky
bun install --frozen-lockfile
```

在 `chrome://extensions/` 打开开发者模式，点击 **加载已解压的扩展程序**，选择仓库根目录。修改代码后，在扩展管理页重新加载。

```bash
bun run lint
bun run build
```

构建命令将 `manifest.json`、`_locales/` 和 `src/` 打包为 `dist/hooky-<version>.zip`，版本读取自 manifest。它只生成 ZIP，不提交商店发布。

| 路径 | 内容 |
| --- | --- |
| [src/options](src/options) | 模板、规则与设置编辑 |
| [src/popup](src/popup) | 选择模板与发送面板 |
| [src/background.js](src/background.js) | 事件分发和请求执行协调 |
| [src/pagecontext.js](src/pagecontext.js) | 按需读取当前页面信息 |
| [src/store.js](src/store.js) | 本地模板与规则存储 |

## 测试

```bash
bun run test
bun run test:e2e
```

单元测试覆盖模板、参数、规则、存储、界面和请求逻辑。端到端测试由 Puppeteer 启动独立浏览器，创建临时本地 Webhook 接收端，检查配置保存、发送与规则编辑；需要可启动有界面浏览器的桌面环境和 Puppeteer 对应的浏览器文件。

如安装后缺少测试浏览器，可先运行：

```bash
bunx puppeteer browsers install chrome
```

## 技术栈

| 技术 | 用途 |
| --- | --- |
| JavaScript / HTML / CSS | 扩展逻辑与界面 |
| Chrome Extensions Manifest V3 | Service worker、工具栏、页面脚本和右键菜单 |
| chrome.storage.local | 模板、规则和外观设置 |
| Fetch API | 发送 Webhook 请求 |
| Vitest / jsdom | 单元测试和 DOM 测试 |
| Puppeteer | 浏览器端到端测试 |

## 文档

- [隐私说明](PRIVACY.md)
- [版本记录](CHANGELOG.md)
- [请求参数处理](src/params.js)
- [规则匹配](src/rules.js)

## 许可证

[MIT](LICENSE)
