import React from 'react'

jest.mock('next-auth/react', () => ({
  signIn: jest.fn(),
  getSession: jest.fn(),
}))

import LoginPage, { getServerSideProps } from '../src/pages/login'

const renderToStaticMarkup: (el: React.ReactElement) => string = require('react-dom/server').renderToStaticMarkup

const { getSession } = jest.requireMock('next-auth/react')

function mockContext(): any {
  return {
    req: { headers: {} },
    res: {},
    query: {},
    resolvedUrl: '/login',
  }
}

describe('Login page renders', () => {
  test('renders MediKiosk branding, fields, and sign-in control', () => {
    const html = renderToStaticMarkup(React.createElement(LoginPage))

    expect(html).toContain('MediKiosk')
    expect(html).toContain('Welcome back')
    expect(html).toContain('Email')
    expect(html).toContain('Password')
    expect(html).toContain('Sign In')

    // semantic form + labels
    expect(html).toMatch(/<form[^>]*>\s*/)
    expect(html).toContain('<label')
    expect(html).toContain('for="email"')
    expect(html).toContain('for="password"')

    // autocomplete + live region + accessibilty affordances
    expect(html).toContain('autoComplete="email"')
    expect(html).toContain('autoComplete="current-password"')
    expect(html).toContain('aria-live')
    expect(html).toContain('Show password')
  })

  test('demo accounts are shown for prototype testing', () => {
    const html = renderToStaticMarkup(React.createElement(LoginPage))
    expect(html).toContain('patient@mediosk.demo')
    expect(html).toContain('doctor@mediosk.demo')
    expect(html).toContain('hospital@mediosk.demo')
  })

  test('offers a path to create a new account', () => {
    const html = renderToStaticMarkup(React.createElement(LoginPage))
    expect(html).toContain('have an account')
    expect(html).toContain('Create one')
    expect(html).toContain('href="/register"')
  })
})

describe('Authenticated-user redirect (getServerSideProps)', () => {
  test('unauthenticated visitor sees the login form', async () => {
    getSession.mockResolvedValue(null)
    const result = await getServerSideProps(mockContext())
    expect(result).toEqual({ props: {} })
  })

  test('authenticated patient is redirected to /dashboard/patient', async () => {
    getSession.mockResolvedValue({ user: { role: 'PATIENT' } })
    const result = await getServerSideProps(mockContext())
    expect(result).toEqual({ redirect: { destination: '/dashboard/patient', permanent: false } })
  })

  test('authenticated doctor is redirected to /dashboard/doctor', async () => {
    getSession.mockResolvedValue({ user: { role: 'DOCTOR' } })
    const result = await getServerSideProps(mockContext())
    expect(result).toEqual({ redirect: { destination: '/dashboard/doctor', permanent: false } })
  })

  test('authenticated hospital is redirected to /dashboard/hospital', async () => {
    getSession.mockResolvedValue({ user: { role: 'HOSPITAL' } })
    const result = await getServerSideProps(mockContext())
    expect(result).toEqual({ redirect: { destination: '/dashboard/hospital', permanent: false } })
  })
})