const fs = require('fs')
const path = require('path')

const envPath = path.resolve(__dirname, '..', '.env.local')
console.log('envPath', envPath)

function loadEnv(file) {
  const out = {}
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    const k = line.slice(0, i).trim()
    let v = line.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[k] = v
  }
  return out
}

async function main() {
  const env = loadEnv(envPath)
  const key = env.STRIPE_SECRET_KEY || ''
  console.log(
    JSON.stringify({
      prefix: key.slice(0, 8),
      live: key.startsWith('sk_live'),
      test: key.startsWith('sk_test'),
    }),
  )
  if (!key) {
    console.error('No STRIPE_SECRET_KEY')
    process.exit(1)
  }

  const auth = Buffer.from(key + ':').toString('base64')
  const headers = {
    Authorization: 'Basic ' + auth,
    'Content-Type': 'application/x-www-form-urlencoded',
  }

  const regsRes = await fetch('https://api.stripe.com/v1/tax/registrations?limit=20', {
    headers: { Authorization: 'Basic ' + auth },
  })
  const regsBody = await regsRes.text()
  console.log('registrations_status', regsRes.status)
  console.log('registrations', regsBody.slice(0, 5000))

  const params = new URLSearchParams()
  params.set('currency', 'usd')
  params.set('customer_details[address][line1]', '100 Nicolls Rd')
  params.set('customer_details[address][city]', 'Stony Brook')
  params.set('customer_details[address][state]', 'NY')
  params.set('customer_details[address][postal_code]', '11790')
  params.set('customer_details[address][country]', 'US')
  params.set('customer_details[address_source]', 'shipping')
  params.set('line_items[0][amount]', '8400')
  params.set('line_items[0][reference]', 'products')
  params.set('line_items[0][tax_code]', 'txcd_99999999')

  const calcRes = await fetch('https://api.stripe.com/v1/tax/calculations', {
    method: 'POST',
    headers,
    body: params.toString(),
  })
  const calcBody = await calcRes.text()
  console.log('calculation_status', calcRes.status)
  console.log('calculation', calcBody.slice(0, 5000))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
