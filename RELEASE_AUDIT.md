# 像序发布审计

审计日期：2026-07-27

## 保留并提交

- `index.html`、`css/`、`js/`、`workers/`：网页应用源码。
- `assets/logo.png`、`assets/xiangxu.ico`：品牌资源。
- `assets/models/*.txt`、`assets/models/README.md`：模型来源与许可证，不含权重。
- `vendor/onnxruntime-web/`：网页 AI 功能所需的本地 ONNX Runtime Web 运行时与许可证。
- `tests/`：自动化回归测试和人工构造的 SVG 夹具。
- `packaging/`：Windows/macOS 本地包装脚本，不含构建缓存和成品。
- `README.md`、`CHANGELOG.md`、`RELEASE_NOTES_v1.0.0.md`、`THIRD_PARTY_NOTICES.md`、`VERSION`。
- `docs/`、`models/`：隐私、模型、截图和发布说明。
- `start.bat`、`server.ps1`：Windows 本地静态服务启动器。
- `.gitignore`、`.gitattributes`。

## 保留在本地但 Git 忽略

- `backup_legacy/`：旧版本、旧模型和历史构建。
- `dist/`：EXE、ZIP、macOS 离线包及解压产物。
- `assets/models/ppmattingv2-stdc1-human-512.onnx`：35,940,680 字节本地模型权重。
- `packaging/__pycache__/`：可再生 Python 字节码缓存。
- `CODEX_TASK.md`、`CODEX_GITHUB_RELEASE_TASK.md`、`PROGRESS.md`：本地开发与任务记录。
- 编辑器、系统缓存、环境文件和本地导出目录。

## 移出项目目录

- 无。未删除任何不确定文件。

## 需要用户确认

- GitHub 仓库地址及仓库名称。
- Public 或 Private。
- 像序项目代码采用的许可证；当前没有 `LICENSE` 文件。
- 是否创建 `v1.0.0` Release，以及 Release 是否附带桌面包。
- Vercel 项目名称和部署后的正式 URL。
- 用户提供的品牌 Logo 是否拥有公开分发授权。
- PP-MattingV2 转换权重是否作为独立 Release 附件重新分发。

## 安全扫描结论

- 未发现 `.env`、GitHub/Vercel Token、API Key、密码、Cookie、私钥、个人邮箱或手机号。
- `token` 命中均为应用内部临时保存标识或预览渲染序号，不是凭证。
- 本机绝对路径只存在于本地任务文档；这些文档已加入忽略规则。
- 源码运行不依赖在线 CDN。

## 大文件结论

- 本地 PP-MattingV2 ONNX 权重和全部 `dist/` 成品均被忽略。
- `vendor/onnxruntime-web/ort-wasm-simd-threaded.wasm` 为 13,479,978 字节，是网页 AI 功能的必要运行时，保留提交。
- `assets/logo.png` 约 1.25 MB，保留作为产品 Logo；后续可在不损失视觉质量的前提下继续压缩。

## Vercel 结论

- 工程为纯静态站点，根目录包含 `index.html`，没有 npm 安装或构建步骤。
- 没有前端子路由，不创建无用的 `vercel.json` rewrite。
- HTML、Worker、WASM 和模块引用均使用大小写一致的正斜杠相对路径。
- 在不包含 ONNX 权重的模拟部署目录中完成真实加载和批量导出测试。

## 测试结论

- 全部 JavaScript 语法检查及 6 个自动化测试文件通过。
- PNG、JPG、WebP 与 50 张 SVG 批量导入成功，共 53 张。
- 53 张图片执行裁切、缩放、圆形蒙版、固定画布、定位、文字水印、JPEG 目标体积和命名模板后，成功 53、失败 0，生成 882,086 字节 ZIP。
- 用户预设刷新后仍存在并可应用；单图自定义恢复统一通过。
- 无模型降级、模型下载错误处理和取消入口通过。
- Codex 内置 Chromium 与 Google Chrome 控制台均无 error/warn。
- 当前环境没有可控 Edge，Edge 真实测试待补。
- 图片水印的浏览器自动文件选择器未能被测试驱动触发；功能代码与既有预览/导出链路保留，需在最终人工验收中复测。
