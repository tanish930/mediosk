import { getServerSession } from 'next-auth/next'
import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { findNearbyHospitals } from '../../../lib/maps'
import { prisma } from '../../../lib/prisma'
import { authOptions } from '../auth/[...nextauth]'

const BodySchema = z.object({
  lat: z.number().optional(),
  lng: z.number().optional(),
  q: z.string().optional(),
  radius: z.number().optional()
})

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getServerSession(req, res, authOptions)

  if (!session) {
    return res.status(401).json({ error: 'unauthenticated' })
  }

  const role = (session as any).user?.role

  if (role !== 'PATIENT') {
    return res.status(403).json({ error: 'forbidden' })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method' })
  }

  const parsed = BodySchema.safeParse(req.body)

  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid' })
  }

  const { lat, lng, q, radius } = parsed.data

  try {
    // If the patient has no location and no search query,
    // return registered hospitals from our own database.
    if (lat === undefined && lng === undefined && !q) {
      const hospitals = await prisma.hospital.findMany({
        include: {
          user: true
        },
        take: 10
      })

      return res.json({
        hospitals: hospitals.map((hospital) => ({
          id: hospital.id,
          name: hospital.user?.name || 'Registered Hospital',
          address: hospital.address || 'Address not provided'
        }))
      })
    }

    // Otherwise use the existing map provider for
    // location-based or manual hospital searches.
    const results = await findNearbyHospitals(
      lat,
      lng,
      q,
      radius || 5000,
      10
    )

    return res.json({
      hospitals: results
    })
  } catch (e: any) {
    console.error('nearby-hospitals error', e)

    return res.status(500).json({
      error: 'provider_error',
      message: e?.message
    })
  }
}
