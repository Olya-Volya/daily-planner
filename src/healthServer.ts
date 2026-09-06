import http from "node:http";
import { logger } from "./utils/logger.js";

/**
 * Бот работает через long polling и сам по себе ничего по HTTP не принимает.
 * Некоторые PaaS (в т.ч. Amvera) ожидают, что контейнер слушает указанный
 * порт, и используют это как health-check. Этот сервер существует только
 * для того, чтобы отвечать "OK" на любой запрос и не мешать работе бота.
 */
export function startHealthServer(port: number): http.Server {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK");
  });

  server.listen(port, () => {
    logger.info({ port }, "Health-check server listening");
  });

  return server;
}
