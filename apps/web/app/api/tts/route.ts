export async function POST(request: Request) {
  try {
    const { text, speed = 1.0 } = await request.json();

    if (!text) {
      return new Response('Text is required', { status: 400 });
    }

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        voice: 'alloy',
        input: text,
        speed: Math.max(0.25, Math.min(4.0, speed)),
      }),
    });

    if (!response.ok) {
      throw new Error('TTS API request failed');
    }

    return new Response(response.body, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('TTS API error:', error);
    return new Response('TTS generation failed', { status: 500 });
  }
}