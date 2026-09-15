import { getSession } from 'next-auth/react'
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'

const RECENT_LIMIT = 50

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getSession({ req })
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  const userId = (session as any).user?.id
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).end('Method Not Allowed')
  }

  const records = await prisma.accessAudit.findMany({
    where: { actorId: userId },
    orderBy: { createdAt: 'desc' },
    take: RECENT_LIMIT,
    select: { action: true, note: true, createdAt: true },
  })

  return res.json({ activities: records })
}