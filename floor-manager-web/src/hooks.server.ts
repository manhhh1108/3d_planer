import { redirect, type Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const PUBLIC_PATHS = ['/login'];

export const handle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;

	// Allow public routes through
	if (PUBLIC_PATHS.some((p) => path.startsWith(p))) {
		return resolve(event);
	}

	const API = env.INTERNAL_API_URL ?? 'http://localhost:4000/api';
	const accessToken = event.cookies.get('access_token');

	// Try to verify via /api/auth/me
	if (accessToken) {
		try {
			const me = await fetch(`${API}/auth/me`, {
				headers: { Cookie: `access_token=${accessToken}` },
			});
			if (me.ok) {
				event.locals.user = await me.json();
				return resolve(event);
			}
		} catch {
			// Network error — fall through to redirect
		}
	}

	// Try refresh
	const refreshToken = event.cookies.get('refresh_token');
	if (refreshToken) {
		try {
			const refreshRes = await fetch(`${API}/auth/refresh`, {
				method: 'POST',
				headers: { Cookie: `refresh_token=${refreshToken}` },
			});
			if (refreshRes.ok) {
				const { accessToken: newToken, user } = await refreshRes.json();
				// Set new access_token cookie for browser
				event.cookies.set('access_token', newToken, {
					httpOnly: true,
					sameSite: 'strict',
					secure: false,
					path: '/',
					maxAge: 15 * 60,
				});
				event.locals.user = user;
				return resolve(event);
			}
		} catch {
			// Network error — fall through to redirect
		}
	}

	const redirectTo = encodeURIComponent(path);
	throw redirect(303, `/login?redirect=${redirectTo}`);
};
