import { redirect, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies }) => {
  if (!locals.user || locals.user.role !== 'ADMIN') {
    throw redirect(303, '/');
  }
  const API = env.INTERNAL_API_URL ?? 'http://localhost:4000/api';
  const accessToken = cookies.get('access_token');
  const headers = { Cookie: `access_token=${accessToken ?? ''}` };

  const [stagesRes, policyRes, marginRes] = await Promise.all([
    fetch(`${API}/stages?all=1`, { headers }),
    fetch(`${API}/settings/outsideZonePolicy`, { headers }),
    fetch(`${API}/settings/defaultMarginCm`, { headers }),
  ]);
  if (!stagesRes.ok) throw error(502, 'Không tải được danh sách công đoạn');

  return {
    stages: await stagesRes.json(),
    outsideZonePolicy: policyRes.ok ? (await policyRes.json()).value : 'warn',
    defaultMarginCm: marginRes.ok ? (await marginRes.json()).value : 50,
  };
};
