# 中国房贷计算器

一个面向手机端的纯前端房贷计算器，支持商业贷款、公积金贷款，以及等额本息、等额本金两种还款方式。

## 本地运行

```bash
npm install
npm run dev
```

浏览器打开终端显示的地址即可预览。

## 检查

```bash
npm test
npm run build
```

核心计算逻辑位于 `src/mortgage.js`，不依赖页面，便于后续扩展。
