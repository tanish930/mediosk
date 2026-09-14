import React from 'react'

jest.mock('next-auth/react', () => ({
  signIn: jest.fn(),
  getSession: jest.fn(),
}))

import RegisterPage, { getServerSideProps } from '../src/pages/register'

const renderToStaticMarkup: (el: React.ReactElement) => string = require('react-dom/server').renderToStaticMarkup

const { getSession } = jest.requireMock('next-auth/react')

function mockContext(): any {
  return {
    req: { headers: {} },
    res: {},
    query: {},
    resolvedUrl: '/register',
  }
}

describe('Registration page renders', () => {
  test('renders branding, fields, and create-account control', () => {
    const html = renderToStaticMarkup(React.createElement(RegisterPage))

    expect(html).toContain('MediKiosk')
    expect(html).toContain('Create your account')
    expect(html).toContain('Full name')
    expect(html).toContain('Email')
    expect(html).toContain('Password')
    expect(html).toContain('Confirm password')
    expect(html).toContain('Create Account')

    // semantic form + labels + autocomplete + live region + a11y
    expect(html).toContain('<form')
    expect(html).toContain('for="name"')
    expect(html).toContain('for="email"')
    expect(html).toContain('autoComplete="name"')
    expect(html).toContain('autoComplete="email"')
    expect(html).toContain('autoComplete="new-password"')
    expect(html).toContain('aria-live')
    expect(html).toContain('Show password')
  })

  test('links back to the login page', () => {
    const html = renderToStaticMarkup(React.createElement(RegisterPage))
    expect(html).toContain('href="/login"')
    expect(html).toContain('Sign in')
  })

  test('public registration can only create patient accounts (no role selector)', () => {
    const html = renderToStaticMarkup(React.createElement(RegisterPage))

    expect(html).not.toContain('<select')
    expect(html).not.toContain('Register as')
    expect(html).not.toContain('I am a doctor')
    expect(html).not.toContain('I am a hospital')
    expect(html).toContain('Patient account')
    expect(html).toContain('Doctor and hospital access')
  })
})

describe('Authenticated-user redirect away from registration', () => {
  test('unauthenticated visitor sees the registration form', async () => {
    getSession.mockResolvedValue(null)
    const result = await getServerSideProps(mockContext())
    expect(result).toEqual({ props: {} })
  })

  test('authenticated patient is redirected to the patient dashboard', async () => {
    getSession.mockResolvedValue({ user: { role: 'PATIENT' } })
    const result = await getServerSideProps(mockContext())
    expect(result).toEqual({ redirect: { destination: '/dashboard/patient', permanent: false } })
  })

  test('authenticated doctor is redirected to the doctor dashboard', async () => {
    getSession.mockResolvedValue({ user: { role: 'DOCTOR' } })
    const result = await getServerSideProps(mockContext())
    expect(result).toEqual({ redirect: { destination: '/dashboard/doctor', permanent: false } })
  })

  test('authenticated hospital is redirected to the hospital dashboard', async () => {
    getSession.mockResolvedValue({ user: { role: 'HOSPITAL' } })
    const result = await getServerSideProps(mockContext())
    expect(result).toEqual({ redirect: { destination: '/dashboard/hospital', permanent: false } })
  })
})