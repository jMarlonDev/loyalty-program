import { createServer, type Server } from 'node:http';
import { Readable } from 'node:stream';
import type { ConnectionInfo } from '../../src/presentation/http/native-routes.js';

export type ServerType = Server;

/** Real sockets for API contract tests; production HTTP belongs to Start/Nitro. */
export function serve(
  options: {
    fetch: (request: Request, connection?: ConnectionInfo) => Promise<Response>;
    port: number;
    hostname: string;
  },
  listening: (address: { port: number }) => void,
): Server {
  const server = createServer(async (incoming, outgoing) => {
    try {
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (value !== undefined)
          headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      }
      const hasBody = incoming.method !== 'GET' && incoming.method !== 'HEAD';
      const init: RequestInit & { duplex?: 'half' } = {
        method: incoming.method ?? 'GET',
        headers,
        ...(hasBody
          ? {
              body: Readable.toWeb(incoming) as ReadableStream<Uint8Array>,
              duplex: 'half' as const,
            }
          : {}),
      };
      const response = await options.fetch(
        new Request(`http://127.0.0.1${incoming.url}`, init),
        {
          ...(incoming.socket.remoteAddress
            ? { remoteAddress: incoming.socket.remoteAddress }
            : {}),
        },
      );
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      outgoing.writeHead(500);
      outgoing.end();
    }
  });
  server.listen(options.port, options.hostname, () => {
    const address = server.address();
    if (address && typeof address !== 'string')
      listening({ port: address.port });
  });
  return server;
}
