import { Client } from '@upstash/qstash';

let qstashClient: Client | null = null;

function getQStashClient(): Client {
  if (qstashClient) return qstashClient;

  const token = process.env.QSTASH_TOKEN;

  if (!token) {
    throw new Error('QStash token not configured');
  }

  qstashClient = new Client({ token });
  return qstashClient;
}

export interface ScheduleJobResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function scheduleReminderJob(
  reminderId: string,
  runAt: Date
): Promise<ScheduleJobResult> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!appUrl) {
    return {
      success: false,
      error: 'App URL not configured for QStash callbacks',
    };
  }

  try {
    const client = getQStashClient();

    const delaySeconds = Math.max(0, Math.floor((runAt.getTime() - Date.now()) / 1000));

    const response = await client.publishJSON({
      url: `${appUrl}/api/send-sms`,
      body: { reminderId },
      delay: delaySeconds,
      retries: 3,
    });

    return {
      success: true,
      messageId: response.messageId,
    };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('QStash scheduling error:', err.message);

    return {
      success: false,
      error: err.message || 'Failed to schedule reminder',
    };
  }
}
