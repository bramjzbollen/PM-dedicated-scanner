import { NextResponse } from 'next/server';
import { ImapFlow } from 'imapflow';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface EmailItem {
  id: string;
  from: string;
  subject: string;
  date: string;
  unread: boolean;
  starred: boolean;
  account: string;       // which mailbox this came from
  accountColor: string;  // for UI badge coloring
  gmailUrl?: string;
  webmailUrl?: string;
}

interface MailAccount {
  label: string;
  color: string;
  host: string;
  port: number;
  user: string;
  pass: string;
  isGmail: boolean;
}

function getAccounts(): MailAccount[] {
  const accounts: MailAccount[] = [];

  // Gmail
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (gmailUser && gmailPass) {
    accounts.push({
      label: 'Gmail',
      color: 'blue',
      host: 'imap.gmail.com',
      port: 993,
      user: gmailUser,
      pass: gmailPass,
      isGmail: true,
    });
  }

  // Work email - bram@studioplanb.be
  const workHost = process.env.WORK_IMAP_HOST;
  const workPort = parseInt(process.env.WORK_IMAP_PORT || '993');
  const bramUser = process.env.WORK_EMAIL_BRAM;
  const bramPass = process.env.WORK_EMAIL_BRAM_PASSWORD;
  if (workHost && bramUser && bramPass) {
    accounts.push({
      label: 'Plan B',
      color: 'emerald',
      host: workHost,
      port: workPort,
      user: bramUser,
      pass: bramPass,
      isGmail: false,
    });
  }

  // Work email - info@studioplanb.be
  const infoUser = process.env.WORK_EMAIL_INFO;
  const infoPass = process.env.WORK_EMAIL_INFO_PASSWORD;
  if (workHost && infoUser && infoPass) {
    accounts.push({
      label: 'Info',
      color: 'violet',
      host: workHost,
      port: workPort,
      user: infoUser,
      pass: infoPass,
      isGmail: false,
    });
  }

  return accounts;
}

async function fetchFromAccount(account: MailAccount): Promise<EmailItem[]> {
  const emails: EmailItem[] = [];

  const client = new ImapFlow({
    host: account.host,
    port: account.port,
    secure: true,
    auth: { user: account.user, pass: account.pass },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock('INBOX');

  try {
    const mb = client.mailbox;
    const totalMessages = (mb && typeof mb === 'object' && 'exists' in mb)
      ? (mb as { exists: number }).exists
      : 0;

    if (totalMessages === 0) return emails;

    const startSeq = Math.max(1, totalMessages - 14); // last 15
    const range = `${startSeq}:*`;

    for await (const message of client.fetch(range, {
      envelope: true,
      flags: true,
      uid: true,
      source: false,
    })) {
      const env = message.envelope;
      if (!env) continue;

      const fromAddr = env.from?.[0];
      const fromName = fromAddr?.name || fromAddr?.address || 'Unknown';
      const subject = env.subject || '(no subject)';
      const date = env.date ? new Date(env.date).toISOString() : new Date().toISOString();
      const flags = message.flags || new Set();
      const unread = !flags.has('\\Seen');
      const starred = flags.has('\\Flagged');

      const item: EmailItem = {
        id: `${account.label}-${message.uid || message.seq}`,
        from: fromName,
        subject,
        date,
        unread,
        starred,
        account: account.label,
        accountColor: account.color,
      };

      if (account.isGmail) {
        item.gmailUrl = `https://mail.google.com/mail/u/0/#inbox/${message.uid?.toString(16)}`;
      }

      emails.push(item);
    }
  } finally {
    lock.release();
  }

  await client.logout();
  return emails;
}

export async function GET() {
  const accounts = getAccounts();

  if (accounts.length === 0) {
    return NextResponse.json({
      items: [],
      accounts: [],
      error: 'No email accounts configured. Set GMAIL_APP_PASSWORD and/or WORK_EMAIL_*_PASSWORD in .env.local',
    });
  }

  const allEmails: EmailItem[] = [];
  const accountStatuses: { label: string; color: string; unread: number; error?: string }[] = [];

  // Fetch from all accounts in parallel
  const results = await Promise.allSettled(
    accounts.map(async (account) => {
      try {
        const emails = await fetchFromAccount(account);
        const unread = emails.filter(e => e.unread).length;
        accountStatuses.push({ label: account.label, color: account.color, unread });
        allEmails.push(...emails);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[emails] ${account.label} error:`, message);
        accountStatuses.push({
          label: account.label,
          color: account.color,
          unread: 0,
          error: message,
        });
      }
    })
  );

  // Sort: starred first, then unread, then by date (newest first)
  allEmails.sort((a, b) => {
    if (a.starred !== b.starred) return a.starred ? -1 : 1;
    if (a.unread !== b.unread) return a.unread ? -1 : 1;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  return NextResponse.json({
    items: allEmails.slice(0, 5),
    accounts: accountStatuses,
    totalUnread: allEmails.filter(e => e.unread).length,
  });
}
