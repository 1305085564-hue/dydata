/**
 * 骨架屏 - 遵循 Claude 设计规范
 * 底色 bg-[#F5F3EE]，呼吸 2.5s，数据返回后 120ms 淡入
 */
export function DashboardRedesignSkeleton() {
  return (
    <div className="min-h-screen bg-[#FBF9F5] antialiased">
      <div className="mx-auto max-w-5xl px-4 py-5 lg:px-8">
        {/* 头部骨架 */}
        <div className="mb-10 space-y-4">
          <div className="h-3 w-16 animate-pulse rounded-full bg-[#E5E0D6]"
               style={{ animationDuration: '2.5s' }}
          />
          <div className="h-8 w-64 animate-pulse rounded-xl bg-[#E5E0D6]"
               style={{ animationDuration: '2.5s' }}
          />
        </div>

        {/* 账号选择器骨架 */}
        <div className="mb-6 flex gap-2">
          <div className="h-10 w-24 animate-pulse rounded-lg bg-[#F5F3EE]"
               style={{ animationDuration: '2.5s' }}
          />
          <div className="h-10 w-24 animate-pulse rounded-lg bg-[#F5F3EE]"
               style={{ animationDuration: '2.5s' }}
          />
        </div>

        {/* 概览卡骨架 */}
        <div className="mb-6 h-32 animate-pulse rounded-2xl bg-[#F5F3EE]"
             style={{ animationDuration: '2.5s' }}
        />

        {/* 表单骨架 */}
        <div className="space-y-4">
          <div className="h-20 animate-pulse rounded-lg bg-[#F5F3EE]"
               style={{ animationDuration: '2.5s' }}
          />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-lg bg-[#F5F3EE]"
                style={{ animationDuration: '2.5s' }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
