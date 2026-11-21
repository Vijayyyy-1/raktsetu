import { Logger } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { App, cert, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

const log = new Logger('Push');
let app: App | null | undefined;

// Lazily load the service account; without it pushes are skipped so local dev and tests still work.
function firebase(): App | null {
  if (app !== undefined) return app;
  const path = resolve(process.env.FIREBASE_SERVICE_ACCOUNT || 'firebase-service-account.json');
  if (!existsSync(path)) {
    log.warn(`No Firebase service account at ${path}; push notifications are disabled`);
    return (app = null);
  }
  return (app = initializeApp({ credential: cert(JSON.parse(readFileSync(path, 'utf8'))) }));
}

/** Sends one notification to many devices. Returns tokens Firebase says are dead, so callers can forget them. */
export async function sendPush(tokens: string[], title: string, body: string, data: Record<string, string>): Promise<string[]> {
  const fb = firebase();
  if (!fb || !tokens.length) return [];
  const res = await getMessaging(fb).sendEachForMulticast({
    tokens,
    notification: { title, body },
    data,
    android: { priority: 'high', notification: { channelId: 'blood_requests', color: '#D93A3A' } },
  });
  log.log(`Sent ${res.successCount}/${tokens.length} pushes`);
  return res.responses.flatMap((r, i) =>
    r.error && ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(r.error.code) ? [tokens[i]] : [],
  );
}
