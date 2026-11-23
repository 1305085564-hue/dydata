// 隔离客户端验收的 Next.js 运行时边界；业务组件和请求处理逻辑仍使用真实实现。
export const NextResponse = Response;
export const NextRequest = Request;
