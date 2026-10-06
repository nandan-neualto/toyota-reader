import { isIP } from 'node:net';

// Public Render traffic passes its Cloudflare edge; direct/local requests do not.
export function clientAddress(req, render = process.env.RENDER === 'true') {
  const header = req.headers['cf-connecting-ip'];
  const address = typeof header === 'string' ? header.trim() : '';
  return render && isIP(address) ? address : req.socket.remoteAddress;
}
