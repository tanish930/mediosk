// Prisma bridge that regenerates the rule-based doshic decision support and
// the demo formulation suggestions for a saved (doctor-verified) AyushAssessment.
//
// Idempotency rules:
//   - AyushDoshaAssessment is upserted per AyushAssessment (one per assessment).
//   - Suggestions are upserted per (consultationId, formularyId). A suggestion
//     that was already APPROVED / REJECTED by a doctor is preserved untouched;
//     only its `active` flag may be pinned back to true if it still matches.
//   - Previously SUGGESTED rows that no longer match the current assessment are
//     deactivated (they remain stored for the audit trail) instead of deleted.

import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import {
  assessDoshic,
  buildInputFromAssessment,
  type DoshicAssessmentInput,
} from './doshicAssessment'
import { matchDemoFormulations } from './demoFormulary'

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}

interface AyushAssessmentLike {
  id: string
  consultationId?: string | null
  patientId: string
  doctorId: string
  [key: string]: unknown
}

export interface RegenerateResult {
  doshaAssessment: unknown
  suggestions: unknown[]
}

export async function regenerateAyushDecisionSupport(
  ayush: AyushAssessmentLike
): Promise<RegenerateResult> {
  const input: DoshicAssessmentInput = buildInputFromAssessment(ayush)
  const result = assessDoshic(input)

  // The assessment is always linked to a consultation through the doctor API.
  if (!ayush.consultationId) {
    return { doshaAssessment: null, suggestions: [] }
  }

  const consultationId = ayush.consultationId

  const doshaAssessment = await prisma.ayushDoshaAssessment.upsert({
    where: { ayushAssessmentId: ayush.id },
    create: {
      ayushAssessmentId: ayush.id,
      consultationId,
      patientId: ayush.patientId,
      doctorId: ayush.doctorId,
      result: json(result),
      inputSnapshot: json(input),
    },
    update: {
      result: json(result),
      inputSnapshot: json(input),
      doctorId: ayush.doctorId,
      computedAt: new Date(),
    },
  })

  const matches = matchDemoFormulations(result.doshas)
  const matchedIds = new Set(matches.map((m) => m.formulary.id))

  // Deactivate unreviewed suggestions that no longer match. Reviewed
  // (APPROVED/REJECTED) suggestions are always left intact.
  await prisma.ayushFormulationSuggestion.updateMany({
    where: {
      consultationId,
      status: 'SUGGESTED',
      active: true,
      formularyId: { notIn: Array.from(matchedIds) },
    },
    data: { active: false },
  })

  const existing = await prisma.ayushFormulationSuggestion.findMany({
    where: { consultationId },
  })
  const existingById = new Map(existing.map((s) => [s.formularyId, s]))

  for (const match of matches) {
    const prior = existingById.get(match.formulary.id)
    if (prior && (prior.status === 'APPROVED' || prior.status === 'REJECTED')) {
      // Preserve the doctor's review decision; only re-activate if needed.
      if (!prior.active) {
        await prisma.ayushFormulationSuggestion.update({
          where: { id: prior.id },
          data: { active: true },
        })
      }
      continue
    }

    await prisma.ayushFormulationSuggestion.upsert({
      where: {
        consultationId_formularyId: { consultationId, formularyId: match.formulary.id },
      },
      create: {
        patientId: ayush.patientId,
        consultationId,
        formularyId: match.formulary.id,
        formulationName: match.formulary.name,
        category: match.formulary.category,
        rationale: match.rationale,
        matchedDoshas: json(match.matchedDoshas),
        status: 'SUGGESTED',
        active: true,
      },
      update: {
        formulationName: match.formulary.name,
        category: match.formulary.category,
        rationale: match.rationale,
        matchedDoshas: json(match.matchedDoshas),
        status: 'SUGGESTED',
        active: true,
      },
    })
  }

  const suggestions = await prisma.ayushFormulationSuggestion.findMany({
    where: { consultationId },
    orderBy: { createdAt: 'asc' },
  })

  return { doshaAssessment, suggestions }
}

export async function findAyushDecisionSupport(
  ayushAssessmentId: string,
  consultationId: string
): Promise<{ doshaAssessment: unknown; suggestions: unknown[] }> {
  const doshaAssessment = ayushAssessmentId
    ? await prisma.ayushDoshaAssessment.findUnique({
        where: { ayushAssessmentId },
      })
    : null

  const suggestions = await prisma.ayushFormulationSuggestion.findMany({
    where: { consultationId },
    orderBy: { createdAt: 'asc' },
  })

  return { doshaAssessment, suggestions }
}