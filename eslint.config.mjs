import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// 分层：src/app（页面与接口）可以引用 src/lib、src/components，反过来不行。
// 测试文件不受限：集成测试需要直接驱动页面和接口。
const layerTestFiles = ["**/*.test.ts", "**/*.test.tsx"];
const supabaseAdapterFiles = ["src/lib/supabase/**", "src/lib/cloudbase/data-client.ts"];
const libLayerMessage =
  "src/lib 不能引用 src/app：把被共享的类型、常量、纯函数挪到 src/lib 对应领域目录，页面和接口再从 lib 引入。";
const componentsLayerMessage =
  "src/components 不能引用 src/app（Server Action 的 actions 文件除外）：纯逻辑挪到 src/lib 对应领域目录，可复用界面挪到 src/components；只服务单个页面的拼装件放回该页面目录。";
const supabaseAdapterMessage =
  "禁止直接引入 @supabase/supabase-js 的实际代码：只允许转接层（src/lib/supabase/、src/lib/cloudbase/data-client.ts）引入；业务代码请改用 @/lib/supabase/server、@/lib/supabase/admin 或 @/lib/supabase/client，仅需类型时请写 import type。";
// 同时覆盖别名（@/app/...）和相对路径（../../app/...）两种写法。
const appImport = String.raw`^(?:@/|(?:\.\./)+)app(?:/|$)`;
const appImportExceptActions = String.raw`^(?:@/|(?:\.\./)+)app(?:/|$)(?!(?:.*/)?actions$)`;
const supabaseJsImport = String.raw`^@supabase/supabase-js(?:/|$)`;
const dynamicImportRule = (pattern, message) => ({
  selector: `ImportExpression > Literal[value=/${pattern.replaceAll("/", "\\/")}/]`,
  message,
});
const dynamicSupabaseImport = dynamicImportRule(supabaseJsImport, supabaseAdapterMessage);

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // 除转接层外，禁止直接引入 @supabase/supabase-js 的运行时代码（允许 import type）
  {
    files: ["src/**/*.{ts,tsx,js,mjs}"],
    ignores: supabaseAdapterFiles,
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: supabaseJsImport,
              message: supabaseAdapterMessage,
              allowTypeImports: true,
            },
          ],
        },
      ],
      "no-restricted-syntax": ["error", dynamicSupabaseImport],
    },
  },
  {
    files: ["src/lib/**/*.{ts,tsx,js,mjs}"],
    ignores: layerTestFiles,
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ regex: appImport, message: libLayerMessage }] }],
      "no-restricted-syntax": [
        "error",
        dynamicImportRule(appImport, libLayerMessage),
        dynamicSupabaseImport,
      ],
    },
  },
  {
    files: ["src/components/**/*.{ts,tsx,js,mjs}"],
    ignores: layerTestFiles,
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ regex: appImportExceptActions, message: componentsLayerMessage }] }],
      "no-restricted-syntax": [
        "error",
        dynamicImportRule(appImportExceptActions, componentsLayerMessage),
        dynamicSupabaseImport,
      ],
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
    // 本机验收脚本和截图的临时目录（已被 git 忽略）：不是产品代码，不能让它们的警告撑破 --max-warnings 上限，否则推送前检查在个人电脑和干净检出里结果不一致
    ".acceptance/**",
    "output/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
