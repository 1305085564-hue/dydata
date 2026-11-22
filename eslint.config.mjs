import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// 分层：src/app（页面与接口）可以引用 src/lib、src/components，反过来不行。
// 测试文件不受限：集成测试需要直接驱动页面和接口。
const layerTestFiles = ["**/*.test.ts", "**/*.test.tsx"];
const libLayerMessage =
  "src/lib 不能引用 src/app：把被共享的类型、常量、纯函数挪到 src/lib 对应领域目录，页面和接口再从 lib 引入。";
const componentsLayerMessage =
  "src/components 不能引用 src/app（Server Action 的 actions 文件除外）：纯逻辑挪到 src/lib 对应领域目录，可复用界面挪到 src/components；只服务单个页面的拼装件放回该页面目录。";
// 同时覆盖别名（@/app/...）和相对路径（../../app/...）两种写法。
const appImport = String.raw`^(?:@/|(?:\.\./)+)app(?:/|$)`;
const appImportExceptActions = String.raw`^(?:@/|(?:\.\./)+)app(?:/|$)(?!(?:.*/)?actions$)`;
const dynamicAppImport = (pattern, message) => ({
  selector: `ImportExpression > Literal[value=/${pattern.replaceAll("/", "\\/")}/]`,
  message,
});

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/lib/**/*.{ts,tsx,js,mjs}"],
    ignores: layerTestFiles,
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ regex: appImport, message: libLayerMessage }] }],
      "no-restricted-syntax": ["error", dynamicAppImport(appImport, libLayerMessage)],
    },
  },
  {
    files: ["src/components/**/*.{ts,tsx,js,mjs}"],
    ignores: layerTestFiles,
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ regex: appImportExceptActions, message: componentsLayerMessage }] }],
      "no-restricted-syntax": ["error", dynamicAppImport(appImportExceptActions, componentsLayerMessage)],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next.old*/**",
    ".claude/**",
    ".agents/**",
    ".worktrees/**",
    "output/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
