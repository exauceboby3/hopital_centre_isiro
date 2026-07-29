const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const response = await fetch(`${API_URL}/health/branding`, { cache: 'no-store' });
    if (response.ok) {
      const branding = (await response.json()) as { logoDataUrl?: string | null };
      const match = branding.logoDataUrl?.match(
        /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/,
      );
      if (match?.[1] && match[2]) {
        return new Response(Buffer.from(match[2], 'base64'), {
          headers: {
            'Content-Type': `image/${match[1]}`,
            'Cache-Control': 'no-store',
          },
        });
      }
    }
  } catch {
    // Une icône SVG sûre est renvoyée si l'API ou la base ne répond pas encore.
  }

  const fallback = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="28" fill="#087b68"/><rect x="29" y="24" width="70" height="82" rx="10" fill="none" stroke="white" stroke-width="8"/><path d="M49 24v-8h30v8M64 48v34M47 65h34" fill="none" stroke="white" stroke-width="8" stroke-linecap="round"/></svg>`;
  return new Response(fallback, {
    headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' },
  });
}
