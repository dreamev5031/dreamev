/**
 * Cloudflare Pages Function for Decap CMS GitHub OAuth
 * Handles authentication redirect to GitHub
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  // GitHub OAuth parameters
  const clientId = env.GITHUB_CLIENT_ID;
  const redirectUri = `https://dreamev-site.pages.dev/callback`;
  
  if (!clientId) {
    return new Response('GitHub Client ID not configured', { status: 500 });
  }
  
  // Build GitHub OAuth URL
  const githubAuthUrl = new URL('https://github.com/login/oauth/authorize');
  githubAuthUrl.searchParams.set('client_id', clientId);
  githubAuthUrl.searchParams.set('redirect_uri', redirectUri);
  githubAuthUrl.searchParams.set('scope', 'repo');
  githubAuthUrl.searchParams.set('state', url.searchParams.get('state') || '');
  
  // Redirect to GitHub
  return Response.redirect(githubAuthUrl.toString(), 302);
}
