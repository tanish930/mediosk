import { getSession } from 'next-auth/react'
import type { NextApiRequest, NextApiResponse } from 'next'
import formidable from 'formidable'
import fs from 'fs'
import { randomUUID } from 'crypto'

import { prisma } from '../../../../lib/prisma'
import { uploadFile, deleteFile } from '../../../../lib/storage'
import { canAccessSession } from '../../../../lib/documentAccess'
import {
  validateDocumentFile,
} from '../../../../lib/fileValidation'

export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  try {
    const session = await getSession({ req })

    if (!session) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const userId = (session as any).user?.id

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const patient = await prisma.patient.findUnique({
      where: { userId },
    })

    if (!patient) {
      res.status(404).json({ error: 'Patient not found' })
      return
    }

    /*
     * GET
     * List the patient's medical documents.
     */
    if (req.method === 'GET') {
      const q = req.query.sessionId
      const sessionId = Array.isArray(q) ? q[0] : q || null

      if (sessionId) {
        const preSession =
          await prisma.preConsultationSession.findUnique({
            where: {
              id: sessionId,
            },
          })

        if (
          !canAccessSession({
            session: preSession,
            patientId: patient.id,
          })
        ) {
          res.status(404).json({
            error: 'Session not found',
          })
          return
        }
      }

      const docs = await prisma.medicalDocument.findMany({
        where: {
          patientId: patient.id,
          ...(sessionId
            ? {
                preConsultationSessionId: sessionId,
              }
            : {}),
        },
        orderBy: {
          uploadedAt: 'desc',
        },
        include: {
          processing: {
            orderBy: {
              createdAt: 'desc',
            },
            take: 1,
          },
        },
      })

      const documents = docs.map((d: any) => ({
        ...d,
        processing: d.processing?.[0] || null,
      }))

      res.status(200).json({
        documents,
      })
      return
    }

    /*
     * POST
     * Upload a new medical document.
     */
    if (req.method === 'POST') {
      const maxUploadMb = parseInt(
        process.env.MAX_UPLOAD_MB || '10',
        10
      )

      const maxSize = maxUploadMb * 1024 * 1024

      const form = new formidable.IncomingForm({
        maxFileSize: maxSize,
      })

      form.parse(
        req,
        async (
          err: any,
          fields: formidable.Fields,
          files: formidable.Files
        ) => {
          if (err) {
            res.status(500).json({
              error: 'Upload error',
            })
            return
          }

          try {
            const file = (files as any).file as formidable.File

            if (!file) {
              res.status(400).json({
                error: 'No file',
              })
              return
            }

            /*
             * File-size validation (also enforced on the
             * form itself via maxFileSize as defense in depth).
             */
            if (file.size && file.size > maxSize) {
              res.status(400).json({
                error: 'File too large',
              })
              return
            }

            const f = fields as any

            const sessionId = Array.isArray(f.sessionId)
              ? f.sessionId[0]
              : f.sessionId || null

            /*
             * If this document belongs to a pre-consultation
             * session, make sure the patient owns that session.
             */
            if (sessionId) {
              const preSession =
                await prisma.preConsultationSession.findUnique({
                  where: {
                    id: sessionId,
                  },
                })

              if (
                !canAccessSession({
                  session: preSession,
                  patientId: patient.id,
                })
              ) {
                res.status(404).json({
                  error: 'Session not found',
                })
                return
              }
            }

            const buffer = fs.readFileSync(file.filepath)

            /*
             * Validate the actual file bytes against the
             * declared MIME type. The declared type and the
             * original filename extension are not trusted.
             */
            const validation = validateDocumentFile(
              buffer,
              file.mimetype
            )

            if (!validation.ok) {
              res.status(400).json({
                error: 'Invalid file content',
              })
              return
            }

            const validatedFile = validation.file

            const ext = validatedFile.extension

            const key = `${patient.id}/${randomUUID()}.${ext}`

            const contentType = validatedFile.mimeType

            const url = await uploadFile(
              buffer,
              key,
              contentType
            )

            /*
             * From here on the storage object exists. If any part of the
             * database step fails we must remove it again (compensation).
             */
            let uploadedKey: string | null = key

            const title = Array.isArray(f.title)
              ? f.title[0]
              : f.title ||
                file.originalFilename ||
                'Document'

            const category = Array.isArray(f.category)
              ? f.category[0]
              : f.category || null

            const documentDate = f.documentDate
              ? new Date(
                  Array.isArray(f.documentDate)
                    ? f.documentDate[0]
                    : f.documentDate
                )
              : null

            /*
             * Document record, upload audit, and initial processing job are a
             * single logical database operation: either all of them commit or
             * none of them do.
             */
            try {
              const created =
                await prisma.$transaction(
                  async (tx) => {
                    const record =
                      await tx.medicalDocument.create({
                        data: {
                          patientId: patient.id,
                          title,
                          url,
                          category,
                          documentDate,
                          mimeType: contentType,
                          size: file.size || null,
                          preConsultationSessionId: sessionId,
                        },
                      })

                    await tx.accessAudit.create({
                      data: {
                        actorId: userId,
                        actorRole: 'PATIENT',
                        patientId: patient.id,
                        action: 'DOCUMENT_UPLOAD',
                        note: `Uploaded ${record.id}`,
                      },
                    })

                    /*
                     * Create the initial processing job.
                     */
                    await tx.documentProcessing.create({
                      data: {
                        documentId: record.id,
                        status: 'PENDING',
                      },
                    })

                    return record
                  }
                )

              res.status(200).json({
                document: created,
              })
              return
            } catch (dbErr) {
              /*
               * The database step failed after the storage object was uploaded.
               * Attempt to remove the orphaned object. If cleanup itself fails,
               * log a safe operational message - storage internals/credentials
               * are never exposed to the patient, and the response stays the
               * standard safe 500 below.
               */
              if (uploadedKey) {
                try {
                  await deleteFile(uploadedKey)
                } catch (cleanupErr) {
                  console.error(
                    'document upload cleanup failed'
                  )
                }
              }

              throw dbErr
            }
          } catch (err) {
            console.error(
              'document upload error',
              err
            )

            res.status(500).json({
              error: 'Upload failed',
            })
            return
          }
        }
      )

      return
    }

    res.setHeader(
      'Allow',
      'GET,POST'
    )

    res.status(405).end('Method Not Allowed')
    return
  } catch (err) {
    console.error(
      'documents index error',
      err
    )

    res.status(500).json({
      error: 'Internal server error',
    })
    return
  }
}