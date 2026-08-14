import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { env } from '$env/dynamic/private';

export const load: PageServerLoad = async ({ locals, cookies }) => {
  if (!locals.user || locals.user.role !== 'ADMIN') {
    throw redirect(303, '/');
  }

  const API = env.INTERNAL_API_URL ?? 'http://localhost:4000/api';
  const accessToken = cookies.get('access_token');
  const res = await fetch(`${API}/users`, {
    headers: { Cookie: `access_token=${accessToken}` },
  });

  const users = res.ok ? await res.json() : [];
  return { users };
};
