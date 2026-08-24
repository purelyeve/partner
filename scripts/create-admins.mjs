/**
 * Create admin accounts without going through /register.
 *
 * Usage (from repo root):
 *   node scripts/create-admins.mjs
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const ADMINS = [
  {
    email: 'contact@purelyeve.com',
    password: 'partner111!!!',
    fullName: 'Purely Eve Admin',
  },
  {
    email: 'mavenglobaladvisors@gmail.com',
    password: 'partner111!!!',
    fullName: 'Johnnie Reece',
  },
]

function loadEnvLocal() {
  const path = resolve(process.cwd(), '.env.local')
  const text = readFileSync(path, 'utf8')
  const env = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

async function findUserByEmail(admin, email) {
  const target = email.toLowerCase()
  let page = 1
  const perPage = 200

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    const users = data?.users ?? []
    const found = users.find((u) => (u.email ?? '').toLowerCase() === target)
    if (found) return found
    if (users.length < perPage) return null
    page += 1
  }
}

async function ensureAdmin(admin, { email, password, fullName }) {
  console.log(`\n→ ${email}`)

  let user = await findUserByEmail(admin, email)

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })
    if (error) throw error
    user = data.user
    console.log('  created auth user')
  } else {
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })
    if (error) throw error
    console.log('  auth user already existed — password updated')
  }

  // Trigger usually creates the profile; upsert to be safe.
  const { error: profileError } = await admin.from('profiles').upsert(
    {
      id: user.id,
      email,
      full_name: fullName,
      role: 'admin',
    },
    { onConflict: 'id' },
  )
  if (profileError) throw profileError
  console.log('  profile role set to admin')
}

async function main() {
  const env = loadEnvLocal()
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  for (const account of ADMINS) {
    await ensureAdmin(admin, account)
  }

  console.log('\nDone. Sign in at /login with either email and password: partner111!!!')
}

main().catch((err) => {
  console.error('\nFailed:', err.message ?? err)
  process.exit(1)
})
