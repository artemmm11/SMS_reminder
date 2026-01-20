import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { checkRateLimit, getClientIP } from '../../../lib/rate-limit';
import { MAX_AUDIO_SIZE_BYTES } from '../../../lib/validation';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const clientIP = getClientIP(request);
    const rateCheck = await checkRateLimit(clientIP, 'stt');

    if (!rateCheck.success) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded. Please try again later.',
          retryAfter: Math.ceil((rateCheck.reset - Date.now()) / 1000),
        },
        { status: 429 }
      );
    }

    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;

    if (!audioFile) {
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 }
      );
    }

    if (audioFile.size > MAX_AUDIO_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'Audio file too large. Maximum size is 10MB.' },
        { status: 400 }
      );
    }

    const validTypes = [
      'audio/wav',
      'audio/wave',
      'audio/x-wav',
      'audio/mp3',
      'audio/mpeg',
      'audio/webm',
      'audio/ogg',
      'audio/mp4',
      'audio/m4a',
      'audio/x-m4a',
    ];

    const isValidType = validTypes.some(
      (type) =>
        audioFile.type === type ||
        audioFile.type.startsWith('audio/') ||
        audioFile.name.match(/\.(wav|mp3|webm|ogg|m4a|mp4)$/i)
    );

    if (!isValidType && audioFile.type) {
      console.log(`Received audio type: ${audioFile.type}, name: ${audioFile.name}`);
    }

    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const file = new File([buffer], audioFile.name || 'audio.wav', {
      type: audioFile.type || 'audio/wav',
    });

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'ru',
    });

    return NextResponse.json({
      transcript: transcription.text,
      confidence: 1.0,
    });
  } catch (error: unknown) {
    console.error('STT Error:', error);

    const err = error as { status?: number; message?: string };

    if (err.status === 401) {
      return NextResponse.json(
        { error: 'Speech recognition service not configured' },
        { status: 503 }
      );
    }

    if (err.status === 429) {
      return NextResponse.json(
        { error: 'Speech recognition service is busy. Please try again.' },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to transcribe audio. Please try again or type manually.' },
      { status: 500 }
    );
  }
}
