import http from 'node:http';

import handler from '../api/index';

async function main(): Promise<void> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, resolve));

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
    const body = await response.text();
    console.log(`BOOT_STATUS=${response.status}`);
    console.log(`BOOT_BODY=${body.slice(0, 80)}`);
  } finally {
    server.close();
  }
}

void main();
