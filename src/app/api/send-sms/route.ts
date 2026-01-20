import { NextRequest, NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/dist/nextjs';
import prisma from '@/lib/prisma';
import { sendSMS } from '@/lib/twilio';

const MAX_RETRIES = 3;

async function handler(request: NextRequest) {
  try {
    const body = await request.json();
    const { reminderId } = body;

    if (!reminderId) {
      console.error('Missing reminderId in request');
      return NextResponse.json({ error: 'Missing reminderId' }, { status: 400 });
    }

    const reminder = await prisma.reminder.findUnique({
      where: { id: reminderId },
    });

    if (!reminder) {
      console.error(`Reminder not found: ${reminderId}`);
      return NextResponse.json({ error: 'Reminder not found' }, { status: 404 });
    }

    if (reminder.status === 'SENT') {
      console.log(`Reminder already sent: ${reminderId}`);
      return NextResponse.json({ message: 'Already sent' });
    }

    if (reminder.status === 'CANCELLED') {
      console.log(`Reminder was cancelled: ${reminderId}`);
      return NextResponse.json({ message: 'Reminder cancelled' });
    }

    const result = await sendSMS(reminder.phone, reminder.message);

    if (result.success) {
      await prisma.reminder.update({
        where: { id: reminderId },
        data: {
          status: 'SENT',
          twilioMessageId: result.messageId,
          sentAt: new Date(),
        },
      });

      console.log(`SMS sent successfully for reminder: ${reminderId}`);
      return NextResponse.json({ success: true, messageId: result.messageId });
    }

    const newRetryCount = reminder.retryCount + 1;

    if (result.retryable && newRetryCount < MAX_RETRIES) {
      await prisma.reminder.update({
        where: { id: reminderId },
        data: {
          retryCount: newRetryCount,
          lastError: result.error,
        },
      });

      return NextResponse.json(
        { error: result.error, retry: true },
        { status: 500 }
      );
    }

    await prisma.reminder.update({
      where: { id: reminderId },
      data: {
        status: 'FAILED',
        retryCount: newRetryCount,
        lastError: result.error,
      },
    });

    console.error(`SMS failed permanently for reminder: ${reminderId}`, result.error);
    return NextResponse.json({ error: result.error, retry: false }, { status: 500 });
  } catch (error: unknown) {
    console.error('Send SMS handler error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function isQStashConfigured(): boolean {
  return !!(
    process.env.QSTASH_CURRENT_SIGNING_KEY &&
    process.env.QSTASH_NEXT_SIGNING_KEY
  );
}

export const POST = isQStashConfigured()
  ? verifySignatureAppRouter(handler)
  : handler;

export const runtime = 'nodejs';
