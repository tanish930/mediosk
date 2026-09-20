import fs from 'fs'
import path from 'path'

type StorageModule = typeof import('../src/lib/storage')

const uploadsDir = path.join(process.cwd(), 'uploads')

describe('resolveUploadsPath - traversal containment', () => {
  function loadLocal(): StorageModule {
    jest.resetModules()
    process.env.STORAGE_PROVIDER = 'local'
    return require('../src/lib/storage')
  }

  afterEach(() => {
    delete process.env.STORAGE_PROVIDER
  })

  test('resolves a legitimate nested key inside the uploads root', () => {
    const storage = loadLocal()

    const resolved = storage.resolveUploadsPath(
      'patient-abc/report.pdf'
    )

    expect(resolved).toBe(
      path.join(uploadsDir, 'patient-abc', 'report.pdf')
    )
  })

  test('rejects ../ traversal', () => {
    const storage = loadLocal()

    expect(() =>
      storage.resolveUploadsPath('../patient-abc/report.pdf')
    ).toThrow('Invalid upload path')
  })

  test('rejects nested traversal', () => {
    const storage = loadLocal()

    expect(() =>
      storage.resolveUploadsPath(
        '../../../../outside/report.pdf'
      )
    ).toThrow('Invalid upload path')
  })

  test('rejects normalized traversal hidden inside a longer key', () => {
    const storage = loadLocal()

    expect(() =>
      storage.resolveUploadsPath(
        'patient-abc/../../outside/report.pdf'
      )
    ).toThrow('Invalid upload path')
  })

  test('rejects URL-encoded traversal', () => {
    const storage = loadLocal()

    expect(() =>
      storage.resolveUploadsPath(
        '%2e%2e/patient-abc/report.pdf'
      )
    ).toThrow('Invalid upload path')
  })

  test('rejects an absolute filesystem path', () => {
    const storage = loadLocal()

    expect(() =>
      storage.resolveUploadsPath(
        process.platform === 'win32'
          ? 'C:\\Windows\\win.ini'
          : '/etc/passwd'
      )
    ).toThrow('Invalid upload path')
  })

  test('rejects an empty key', () => {
    const storage = loadLocal()

    expect(() => storage.resolveUploadsPath('')).toThrow(
      'Invalid upload path'
    )
  })

  test('rejects a key that does not decode as valid UTF-8 percent-encoding', () => {
    const storage = loadLocal()

    expect(() =>
      storage.resolveUploadsPath('%zz/report.pdf')
    ).toThrow('Invalid upload path')
  })
})

describe('local storage provider', () => {
  function loadLocalStorage(): StorageModule {
    jest.resetModules()
    process.env.STORAGE_PROVIDER = 'local'
    return require('../src/lib/storage')
  }

  afterEach(() => {
    delete process.env.STORAGE_PROVIDER
    const patientDir = path.join(uploadsDir, 'patient-abc')
    if (fs.existsSync(patientDir)) {
      fs.rmSync(patientDir, { recursive: true, force: true })
    }
  })

  test('uploadFile with a nested key creates parent directories and round-trips via readFile', async () => {
    const storage = loadLocalStorage()
    const key = 'patient-abc/test.pdf'
    const data = Buffer.from('%PDF-1.4 nested storage test')

    const url = await storage.uploadFile(data, key, 'application/pdf')

    expect(url).toBe('/uploads/patient-abc/test.pdf')
    expect(fs.existsSync(path.join(uploadsDir, 'patient-abc'))).toBe(true)
    expect(fs.existsSync(path.join(uploadsDir, 'patient-abc', 'test.pdf'))).toBe(true)

    const readBack = await storage.readFile(key)
    expect(readBack.equals(data)).toBe(true)

    await storage.deleteFile(key)
    expect(fs.existsSync(path.join(uploadsDir, 'patient-abc', 'test.pdf'))).toBe(false)
  })

  test('readFile rejects a missing nested file and deleteFile is idempotent for it', async () => {
    const storage = loadLocalStorage()

    await expect(storage.readFile('patient-abc/missing.pdf')).rejects.toThrow('File not found')
    await storage.deleteFile('patient-abc/missing.pdf')
    expect(fs.existsSync(path.join(uploadsDir, 'patient-abc'))).toBe(false)
  })
})