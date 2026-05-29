export default defineEventHandler((event) => {
  const cfg = useRuntimeConfig();
  const user = cfg.uiUsername as string;
  const pass = cfg.uiPassword as string;
  if (!user && !pass) return; // auth disabled

  // never gate health checks
  if (event.path === "/healthz") return;

  // webhook endpoints authenticate via their own per-flow secret, not UI auth
  if (event.path?.startsWith("/api/hooks/")) return;

  const auth = getRequestHeader(event, "authorization");
  if (auth?.startsWith("Basic ")) {
    const decoded = Buffer.from(auth.slice(6), "base64").toString();
    if (decoded === `${user}:${pass}`) return;
  }

  setResponseHeader(event, "WWW-Authenticate", 'Basic realm="failover"');
  throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
});
