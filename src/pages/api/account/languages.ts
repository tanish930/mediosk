import { getSession } from 'next-auth/react'
import type { NextApiRequest, NextApiResponse } from 'next'
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from '../../../lib/languages'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getSession({ req })
  if (!session) return res.status(401).json({ error: 'Unauthorized' })

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).end('Method Not Allowed')
  }

  return res.json({ languages: SUPPORTED_LANGUAGES, default: DEFAULT_LANGUAGE })
}