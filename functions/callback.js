/**
 * Cloudflare Pages Function for Decap CMS GitHub OAuth Callback
 * Handles OAuth callback from GitHub
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  
  if (error) {
    return new Response(`OAuth error: ${error}`, { status: 400 });
  }
  
  if (!code) {
    return new Response('Missing authorization code', { status: 400 });
  }
  
  const clientId = env.GITHUB_CLIENT_ID;
  const clientSecret = env.GITHUB_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    return new Response('GitHub OAuth not configured', { status: 500 });
  }
  
  // Exchange code for access token
  const tokenUrl = 'https://github.com/login/oauth/access_token';
  const redirectUri = 'https://dreamev-site.pages.dev/callback';
  const tokenResponse = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code: code,
      redirect_uri: redirectUri,
    }),
  });
  
  const tokenData = await tokenResponse.json();
  
  if (tokenData.error) {
    return new Response(`Token error: ${tokenData.error_description}`, { status: 400 });
  }
  
  const accessToken = tokenData.access_token;
  
  // Redirect back to admin with token
  const adminUrl = new URL('/admin/', 'https://dreamev-site.pages.dev');
  adminUrl.hash = `#access_token=${accessToken}&token_type=bearer&state=${state || ''}`;
  
  return Response.redirect(adminUrl.toString(), 302);
}
