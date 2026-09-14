import fs from 'fs'
import path from 'path'
import { performRegistration, createRegistrationFetch } from '../src/lib/registerFlows'

// Regression for the browser bug where the registration form appeared to
// "submit natively" and never sent POST /api/register. Root cause: the page
// passed the bare WebIDL global `fetch` (e.g. `fetchFn: fetch`). Native
// `window.fetch` must be called as a method (this === Window). performRegistration
// invokes deps.fetchFn as a plain function (this === undefined), so the browser
// threw TypeError: "Failed to execute 'fetch' on 'Window': Illegal invocation",
// which was swallowed into the generic error message and no request was made.

function fetchRequiringThis(this: unknown, _url: unknown, _init?: unknown): Promise<unknown> {
  if (this == null) {
    throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation")
  }
  return Promise.resolve({ ok: true, status: 201, json: async () => ({ ok: true }) })
}

describe('registration fetch dependency is receiver-safe', () => {
  test('does not throw Illegal invocation when called as a plain function (this === undefined)', async () => {
    // Simulates the browser where the global fetch method requires `this`.
    const host = { fetch: fetchRequiringThis }
    const fetchFn = createRegistrationFetch(host as unknown as { fetch: typeof globalThis.fetch })

    // performRegistration calls deps.fetchFn(url, init) as a bare function call.
    const result = await fetchFn.call(undefined, '/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })

    expect(result.status).toBe(201)
  })

  test('dispatches through host property access so `this` is never undefined', async () => {
    const calls: { thisArg: unknown; args: unknown[] }[] = []
    const fakeHost = {
      fetch(this: unknown, ...args: unknown[]) {
        calls.push({ thisArg: this, args })
        return Promise.resolve({ ok: true, status: 201, json: async () => ({ ok: true }) })
      },
    }

    await createRegistrationFetch(fakeHost as unknown as { fetch: typeof globalThis.fetch }).call(
      undefined,
      '/api/register',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
    )

    expect(calls.length).toBe(1)
    expect(calls[0].thisArg).toBe(fakeHost)
    expect(calls[0].args[0]).toBe('/api/register')
  })

  test('the page fetch dependency drives performRegistration through the full happy path', async () => {
    const calls: { thisArg: unknown; args: unknown[] }[] = []
    const fakeHost = {
      fetch(this: unknown, ...args: unknown[]) {
        calls.push({ thisArg: this, args })
        return Promise.resolve({ ok: true, status: 201, json: async () => ({ ok: true }) })
      },
    }

    const signInFn = jest.fn(async () => ({ ok: true }))
    const result = await performRegistration(
      { name: 'Test User', email: 'test@example.com', password: 'Patient@123', confirmPassword: 'Patient@123' },
      {
        fetchFn: createRegistrationFetch(fakeHost as unknown as { fetch: typeof globalThis.fetch }),
        signInFn,
      }
    )

    expect(result).toEqual({ kind: 'redirect', to: '/dashboard/patient' })
    expect(calls.length).toBe(1)
    expect(calls[0].args[0]).toBe('/api/register')
    expect((calls[0].args[1] as { method: string }).method).toBe('POST')
    expect(signInFn).toHaveBeenCalledWith('credentials', { redirect: false, email: 'test@example.com', password: 'Patient@123' })
  })
})

describe('registration page fetch wiring', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/pages/register.tsx'), 'utf8')

  test('passes a receiver-safe fetch dependency instead of the bare global fetch', () => {
    expect(source).toContain('fetchFn: createRegistrationFetch()')
    expect(source).not.toMatch(/fetchFn:\s*fetch\s/)
    expect(source).not.toContain('fetch as any')
  })
})