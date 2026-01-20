import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import prisma from '@/lib/prisma';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import {
  scheduleRequestSchema,
  formatPhoneE164,
  sanitizeMessage,
} from '@/lib/validation';
import { scheduleReminderJob } from '@/lib/qstash';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const clientIP = getClientIP(request);
    const rateCheck = await checkRateLimit(clientIP, 'schedule');

    if (!rateCheck.success) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded. You can schedule up to 10 reminders per hour.',
          retryAfter: Math.ceil((rateCheck.reset - Date.now()) / 1000),
        },
        { status: 429 }
      );
    }

    const body = await request.json();

    const validation = scheduleRequestSchema.safeParse(body);

    if (!validation.success) {
      const errors = validation.error.errors.map((e) => e.message);
      return NextResponse.json(
        { error: errors.join('. ') },
        { status: 400 }
      );
    }

    const { phone, message, runAt, timezone } = validation.data;

    const formattedPhone = formatPhoneE164(phone);
    if (!formattedPhone) {
      return NextResponse.json(
        { error: 'Invalid phone number format' },
        { status: 400 }
      );
    }

    const sanitizedMessage = sanitizeMessage(message);
    const runAtDate = new Date(runAt);

    if (runAtDate <= new Date()) {
      return NextResponse.json(
        { error: 'Scheduled time must be in the future' },
        { status: 400 }
      );
    }

    const maxFutureDate = new Date();
    maxFutureDate.setFullYear(maxFutureDate.getFullYear() + 1);

    if (runAtDate > maxFutureDate) {
      return NextResponse.json(
        { error: 'Cannot schedule reminders more than 1 year in advance' },
        { status: 400 }
      );
    }

    const idempotencyKey = randomUUID();

    const reminder = await prisma.reminder.create({
      data: {
        phone: formattedPhone,
        message: sanitizedMessage,
        runAt: runAtDate,
        timezone,
        idempotencyKey,
        status: 'SCHEDULED',
      },
    });

    const scheduleResult = await scheduleReminderJob(reminder.id, runAtDate);

    if (!scheduleResult.success) {
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: {
          status: 'FAILED',
          lastError: scheduleResult.error,
        },
      });

      return NextResponse.json(
        { error: 'Failed to schedule reminder. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      reminderId: reminder.id,
      scheduledFor: runAtDate.toISOString(),
      message: 'Reminder scheduled successfully!',
    });
  } catch (error: unknown) {
    console.error('Schedule Error:', error);

    return NextResponse.json(
      { error: 'Failed to schedule reminder. Please try again.' },
      { status: 500 }
    );
  }
}
