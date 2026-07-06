import nodemailer from 'nodemailer'

const provider = process.env.MAIL_PROVIDER ?? 'mock'

const transporter =
  provider === 'smtp'
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      })
    : null

const appName = process.env.MAIL_APP_NAME ?? '묘캣몬고'
const mailFrom = process.env.MAIL_FROM ?? `"${appName}" <no-reply@myocatmongo.local>`

export const sendVerificationEmail = async (email: string, code: string) => {
  if (!transporter) {
    console.log(`[mailer:mock] verification code for ${email}: ${code}`)
    return
  }

  await transporter.sendMail({
    from: mailFrom,
    to: email,
    subject: `[${appName}] 이메일 인증 코드`,
    text: `인증 코드: ${code}\n10분 이내에 입력해주세요.`,
    html: `<p>인증 코드: <b>${code}</b></p><p>10분 이내에 입력해주세요.</p>`,
  })
}
