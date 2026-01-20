import twilio from 'twilio';

let twilioClient: twilio.Twilio | null = null;

function getTwilioClient(): twilio.Twilio {
  if (twilioClient) return twilioClient;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error('Twilio credentials not configured');
  }

  twilioClient = twilio(accountSid, authToken);
  return twilioClient;
}

export interface SendSMSResult {
  success: boolean;
  messageId?: string;
  error?: string;
  retryable: boolean;
}

export async function sendSMS(to: string, body: string): Promise<SendSMSResult> {
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!fromNumber) {
    return {
      success: false,
      error: 'Twilio phone number not configured',
      retryable: false,
    };
  }

  if (process.env.NODE_ENV === 'development') {
    console.log(`[DEV MODE] Would send SMS to ${to}: ${body}`);
    return {
      success: true,
      messageId: `dev-${Date.now()}`,
      retryable: false,
    };
  }

  try {
    const client = getTwilioClient();
    const message = await client.messages.create({
      to,
      from: fromNumber,
      body,
    });

    return {
      success: true,
      messageId: message.sid,
      retryable: false,
    };
  } catch (error: unknown) {
    const twilioError = error as { code?: number; message?: string };
    const errorCode = twilioError.code;
    const errorMessage = twilioError.message || 'Unknown Twilio error';

    const retryableCodes = [20003, 20429, 30002, 30003, 30004, 30006, 30008];
    const isRetryable = typeof errorCode === 'number' && retryableCodes.includes(errorCode);

    console.error(`Twilio error: ${errorCode} - ${errorMessage}`);

    return {
      success: false,
      error: errorMessage,
      retryable: isRetryable,
    };
  }
}
