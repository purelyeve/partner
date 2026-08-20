import { createAdminClient } from '@/lib/supabase/admin'

/** Service-role Supabase client for admin pages. Call only after requireAdmin(). */
export function getAdminDb() {
  return createAdminClient()
}
export async function maybePromoteAdmin(userId: string, email: string) {
  const bootstrap = process.env.ADMIN_BOOTSTRAP_EMAIL?.toLowerCase()
  if (!bootstrap || email.toLowerCase() !== bootstrap) return

  const admin = createAdminClient()
  await admin.from('profiles').update({ role: 'admin' }).eq('id', userId)
}

export async function logAudit(params: {
  actorId: string | null
  action: string
  entityType: string
  entityId?: string
  detail?: Record<string, unknown>
}) {
  const admin = createAdminClient()
  await admin.from('audit_log').insert({
    actor_id: params.actorId,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId ?? null,
    detail: params.detail ?? {},
  })
}
