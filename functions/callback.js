/**
 * Cloudflare Pages Function for Decap CMS GitHub OAuth Callback
 * Handles OAuth callback from GitHub and sends token to parent window
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  
  // Handle error from GitHub
  if (error) {
    const errorHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>OAuth Error</title>
</head>
<body>
  <script>
    console.error('OAuth error:', '${error}');
    if (window.opener) {
      window.opener.postMessage({
        type: 'authorization',
        error: '${error}'
      }, '*');
      window.close();
    } else {
      document.body.innerHTML = '<h1>OAuth Error</h1><p>${error}</p>';
    }
  </script>
</body>
</html>`;
    return new Response(errorHtml, {
      status: 400,
      headers: { 'Content-Type': 'text/html' }
    });
  }
  
  // Check for authorization code
  if (!code) {
    const errorHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Missing Code</title>
</head>
<body>
  <script>
    console.error('Missing authorization code');
    if (window.opener) {
      window.opener.postMessage({
        type: 'authorization',
        error: 'Missing authorization code'
      }, '*');
      window.close();
    } else {
      document.body.innerHTML = '<h1>Error</h1><p>Missing authorization code</p>';
    }
  </script>
</body>
</html>`;
    return new Response(errorHtml, {
      status: 400,
      headers: { 'Content-Type': 'text/html' }
    });
  }
  
  const clientId = env.GITHUB_CLIENT_ID;
  const clientSecret = env.GITHUB_CLIENT_SECRET;
  
  // Check environment variables
  if (!clientId || !clientSecret) {
    const errorHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Configuration Error</title>
</head>
<body>
  <script>
    console.error('GitHub OAuth not configured');
    if (window.opener) {
      window.opener.postMessage({
        type: 'authorization',
        error: 'GitHub OAuth not configured'
      }, '*');
      window.close();
    } else {
      document.body.innerHTML = '<h1>Configuration Error</h1><p>GitHub OAuth not configured</p>';
    }
  </script>
</body>
</html>`;
    return new Response(errorHtml, {
      status: 500,
      headers: { 'Content-Type': 'text/html' }
    });
  }
  
  try {
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
    
    // Handle token exchange error
    if (tokenData.error) {
      const errorHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Token Error</title>
</head>
<body>
  <script>
    console.error('Token error:', '${tokenData.error}', '${tokenData.error_description || ''}');
    if (window.opener) {
      window.opener.postMessage({
        type: 'authorization',
        error: '${tokenData.error_description || tokenData.error}'
      }, '*');
      window.close();
    } else {
      document.body.innerHTML = '<h1>Token Error</h1><p>${tokenData.error_description || tokenData.error}</p>';
    }
  </script>
</body>
</html>`;
      return new Response(errorHtml, {
        status: 400,
        headers: { 'Content-Type': 'text/html' }
      });
    }
    
    const accessToken = tokenData.access_token;
    
    if (!accessToken) {
      const errorHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>No Token</title>
</head>
<body>
  <script>
    console.error('No access token received');
    if (window.opener) {
      window.opener.postMessage({
        type: 'authorization',
        error: 'No access token received'
      }, '*');
      window.close();
    } else {
      document.body.innerHTML = '<h1>Error</h1><p>No access token received</p>';
    }
  </script>
</body>
</html>`;
      return new Response(errorHtml, {
        status: 400,
        headers: { 'Content-Type': 'text/html' }
      });
    }
    
    // Success: Send token to parent window
    const target = 'https://dreamev-site.pages.dev';
    // Escape token for use in HTML/JS
    const escapedToken = accessToken.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
    const tokenJson = '{"token":"' + escapedToken + '","provider":"github"}';
    const successHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Authorization Successful</title>
</head>
<body>
  <script>
    console.log('Authorization successful, sending token to parent window');
    const target = '${target}';
    if (window.opener) {
      window.opener.postMessage('authorizing:github', target);
      window.opener.postMessage('authorization:github:success:${tokenJson}', target);
      window.close();
    } else {
      // Fallback: redirect to admin with token in hash
      window.location.href = 'https://dreamev-site.pages.dev/admin/#access_token=${accessToken}&token_type=bearer&state=${state || ''}';
    }
  </script>
</body>
</html>`;
    
    return new Response(successHtml, {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    });
    
  } catch (err) {
    // Handle fetch errors
    const errorHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Network Error</title>
</head>
<body>
  <script>
    console.error('Network error:', '${err.message}');
    if (window.opener) {
      window.opener.postMessage({
        type: 'authorization',
        error: 'Network error: ${err.message}'
      }, '*');
      window.close();
    } else {
      document.body.innerHTML = '<h1>Network Error</h1><p>${err.message}</p>';
    }
  </script>
</body>
</html>`;
    return new Response(errorHtml, {
      status: 500,
      headers: { 'Content-Type': 'text/html' }
    });
  }
}
