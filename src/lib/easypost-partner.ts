import { decryptSecret, encryptSecret, secretLast4 } from '@/lib/crypto'

const EASYPOST_API = 'https://api.easypost.com/v2'

function authHeaders(apiKey: string) {
  return {
    Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
    'Content-Type': 'application/json',
  }
}

/**
 * Resolve which EasyPost API key to use for Partner customer shipping.
 * Prefer Partner child/own key; fall back to company key when flagged or missing.
 */
export function resolvePartnerEasyPostKey(distributor: {
  easypost_api_key_ciphertext?: string | null
  easypost_use_company?: boolean | null
}): { apiKey: string; source: 'partner' | 'company' } | { error: string } {
  if (distributor.easypost_api_key_ciphertext && !distributor.easypost_use_company) {
    try {
      return {
        apiKey: decryptSecret(distributor.easypost_api_key_ciphertext),
        source: 'partner',
      }
    } catch {
      return { error: 'Could not read EasyPost key. Re-enable shipping under Payments.' }
    }
  }

  const company = process.env.EASYPOST_API_KEY
  if (company) {
    return { apiKey: company, source: 'company' }
  }

  return {
    error:
      'Shipping is not configured. Click Enable EasyPost shipping under Payments, or set EASYPOST_API_KEY for the company.',
  }
}

/** Create EasyPost child user under company parent and return API keys (prod parent key required). */
export async function createEasyPostChildUser(params: {
  name: string
}): Promise<
  | {
      ok: true
      userId: string
      testKey: string | null
      productionKey: string | null
    }
  | { ok: false; error: string; testModeBlocked?: boolean }
> {
  const parentKey = process.env.EASYPOST_API_KEY
  if (!parentKey) {
    return { ok: false, error: 'Company EasyPost API key is not configured.' }
  }

  // Child users require parent Production key per EasyPost docs.
  if (parentKey.startsWith('EZTK')) {
    return {
      ok: false,
      testModeBlocked: true,
      error:
        'EasyPost child accounts require the company Production API key. For staging, enable company shipping fallback instead.',
    }
  }

  const res = await fetch(`${EASYPOST_API}/users`, {
    method: 'POST',
    headers: authHeaders(parentKey),
    body: JSON.stringify({ user: { name: params.name } }),
  })

  if (!res.ok) {
    const detail = await res.text()
    console.error('[easypost] create child', detail)
    return {
      ok: false,
      error: 'Could not create EasyPost shipping account. Check the company EasyPost production key.',
    }
  }

  const body = (await res.json()) as {
    id: string
    api_keys?: Array<{ key: string; mode: string; active?: boolean }>
  }

  const keys = body.api_keys ?? []
  const testKey = keys.find((k) => k.mode === 'test' && k.active !== false)?.key ?? null
  const productionKey =
    keys.find((k) => k.mode === 'production' && k.active !== false)?.key ?? null

  return {
    ok: true,
    userId: body.id,
    testKey,
    productionKey,
  }
}

export function pickEasyPostKeyForEnv(keys: {
  testKey: string | null
  productionKey: string | null
}): string | null {
  const preferTest = process.env.EASYPOST_API_KEY?.startsWith('EZTK')
  if (preferTest) return keys.testKey || keys.productionKey
  return keys.productionKey || keys.testKey
}

export { encryptSecret, secretLast4 }
