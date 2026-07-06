import { createHash, randomInt } from 'node:crypto'

export const generateVerificationCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0')

export const hashVerificationCode = (code: string) => createHash('sha256').update(code).digest('hex')
