const PRODUCTION_PROJECT_ID = "gcrhhxaopomtposmahsw";

function shanghaiDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function assertProdWriteAllowed(connectionStringOrUrl, action, env = process.env, now = new Date()) {
  if (!String(connectionStringOrUrl).includes(PRODUCTION_PROJECT_ID)) return;

  const today = shanghaiDate(now);
  if (env.DYDATA_PROD_WRITE_CONFIRM === today) return;

  throw new Error(`这个脚本要写正式数据库（动作：${action}）。确认要写，请在同一条命令前加 DYDATA_PROD_WRITE_CONFIRM=${today}。`);
}

