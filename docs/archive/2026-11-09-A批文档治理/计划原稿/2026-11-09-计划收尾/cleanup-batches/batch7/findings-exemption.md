# Batch 7 核查卡：exemption

- 当前生产面板引用 `redesign/exemption-dialog-v2.tsx`；旧弹窗未发现生产引用。
- `submitExemptionRequest` 的 dashboard/admin 两个入口中，admin 版本按既有拍板保留。
- `豁免.ts`、`豁免流程.ts` 仍有测试和生产 import，不能合并函数体。

## 结论

- D-EXE-1：只做文件命名映射和 import 更新，函数体不合并。
- D-EXE-2：旧弹窗登记后续死码批次，本批不删除、不切换。
- D-EXE-3/4：核查后无新增施工面，admin 提交入口保留。
