import { z } from 'zod';
import { parsePhoneNumberFromString, isValidPhoneNumber } from 'libphonenumber-js';

export const MAX_MESSAGE_LENGTH = 500;
export const MAX_AUDIO_DURATION_SECONDS = 30;
export const MAX_AUDIO_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export const phoneSchema = z.string().refine(
  (val) => {
    try {
      return isValidPhoneNumber(val);
    } catch {
      return false;
    }
  },
  { message: 'Invalid phone number. Please use international format (e.g., +1234567890)' }
);

export const scheduleRequestSchema = z.object({
  phone: phoneSchema,
  message: z
    .string()
    .min(1, 'Message cannot be empty')
    .max(MAX_MESSAGE_LENGTH, `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters`),
  runAt: z.string().refine(
    (val) => {
      const date = new Date(val);
      return !isNaN(date.getTime()) && date > new Date();
    },
    { message: 'Scheduled time must be a valid future date' }
  ),
  timezone: z.string().min(1, 'Timezone is required'),
  consent: z.literal(true, {
    errorMap: () => ({ message: 'You must agree to receive SMS reminders' }),
  }),
});

export type ScheduleRequest = z.infer<typeof scheduleRequestSchema>;

export function formatPhoneE164(phone: string): string | null {
  try {
    const parsed = parsePhoneNumberFromString(phone);
    if (parsed && parsed.isValid()) {
      return parsed.format('E.164');
    }
    return null;
  } catch {
    return null;
  }
}

export function sanitizeMessage(message: string): string {
  return message
    .trim()
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .slice(0, MAX_MESSAGE_LENGTH);
}
