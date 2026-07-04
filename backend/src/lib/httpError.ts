export class HttpError extends Error {
  status: number
  code: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.status = status
    this.code = code ?? defaultCode(status)
  }
}

const defaultCode = (status: number) => {
  if (status === 401) return 'UNAUTHORIZED'
  if (status === 403) return 'FORBIDDEN'
  if (status === 404) return 'NOT_FOUND'
  if (status === 422 || status === 400) return 'VALIDATION_ERROR'
  return 'INTERNAL_ERROR'
}
