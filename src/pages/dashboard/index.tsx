import { GetServerSideProps } from 'next'
import { getSession } from 'next-auth/react'
import { roleHomePath } from '../../lib/roleHome'

export default function DashboardRedirect() {
  return null
}

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const session = await getSession(ctx)
  if (!session) return { redirect: { destination: '/login', permanent: false } }
  const home = roleHomePath((session as any).user?.role)
  if (!home) return { redirect: { destination: '/login', permanent: false } }
  return { redirect: { destination: home, permanent: false } }
}