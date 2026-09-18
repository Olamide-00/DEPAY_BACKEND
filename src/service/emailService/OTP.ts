// otpService.ts
import { sendMail } from "../version2/emailService/emailService.js";

export const sendOTPEmail = async (recipientEmail: string, otp: string) => {
  const subject = "Verify your email - Depay";
  const text = `Your Depay verification code is ${otp}. It expires in 5 minutes.`;

  const html = `<!DOCTYPE html>
<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />
  <meta name="x-apple-disable-message-reformatting" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <title>Verify your email</title>
  <style>
    body, html {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      font-family: 'Inter', Arial, sans-serif;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    table, td {
      mso-table-lspace: 0pt !important;
      mso-table-rspace: 0pt !important;
      border-collapse: collapse !important;
    }
    img {
      border: 0;
      max-width: 100% !important;
      display: block !important;
      height: auto !important;
      outline: none;
      line-height: 100%;
      -ms-interpolation-mode: bicubic;
    }
    a { text-decoration: none; }
    @media screen and (max-width: 600px) {
      .container { width: 100% !important; max-width: 100% !important; }
      .mobile-padding { padding-left: 24px !important; padding-right: 24px !important; }
      .verification-code { font-size: 30px !important; letter-spacing: 6px !important; }
    }
    @media (prefers-color-scheme: dark) {
      body { background-color: #10170F !important; }
      .dark-bg { background-color: #10170F !important; }
      .dark-card { background-color: #172115 !important; }
      .dark-border { border-color: #26331F !important; }
      .dark-text-primary { color: #F3F6F0 !important; }
      .dark-text-secondary { color: #9CA593 !important; }
      .dark-code-bg { background-color: #1E2B1A !important; }
      .dark-code-text { color: #B9F2A0 !important; }
    }
  </style>
</head>

<body style="margin: 0; padding: 0; background-color: #F6F4EC;" class="dark-bg">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="100%" style="max-width: 480px; margin: 0 auto;" class="container">

    <tr>
      <td style="padding: 40px 24px 24px; text-align: center;">
        <span style="font-family: 'Inter', Arial, sans-serif; font-size: 22px; font-weight: 800; letter-spacing: -0.3px; color: #1B3710;">Depay</span>
      </td>
    </tr>

    <tr>
      <td style="padding: 0 24px 40px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #FFFFFF; border: 1px solid #E5E8E3; border-radius: 20px;" class="dark-card dark-border">
          <tr>
            <td style="padding: 40px 32px;" class="mobile-padding">
              <h1 style="margin: 0 0 12px; font-family: 'Inter', Arial, sans-serif; font-weight: 700; font-size: 22px; line-height: 28px; color: #141613; letter-spacing: -0.3px;" class="dark-text-primary">
                Verify your email
              </h1>
              <p style="margin: 0 0 28px; font-family: 'Inter', Arial, sans-serif; font-size: 15px; line-height: 23px; color: #6B7268;" class="dark-text-secondary">
                Enter this code to confirm your email address and continue setting up your Depay account.
              </p>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 28px;">
                <tr>
                  <td style="background-color: #EAF3E9; border-radius: 14px; padding: 22px; text-align: center;" class="dark-code-bg">
                    <span style="font-family: 'Inter', Arial, sans-serif; font-weight: 700; font-size: 34px; line-height: 40px; color: #1B3710; letter-spacing: 8px;" class="verification-code dark-code-text">${otp}</span>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-family: 'Inter', Arial, sans-serif; font-size: 13px; line-height: 20px; color: #9CA5A0;" class="dark-text-secondary">
                This code expires in 5 minutes. If you didn't request this, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="padding: 0 24px 40px; text-align: center;">
        <p style="margin: 0 0 6px; font-family: 'Inter', Arial, sans-serif; font-size: 13px; line-height: 20px; color: #9CA5A0;">
          Need help? Email us at <a href="mailto:support@depay.com.ng" style="color: #1B3710; font-weight: 600;">support@depay.com.ng</a>
        </p>
        <p style="margin: 0; font-family: 'Inter', Arial, sans-serif; font-size: 12px; color: #B8BFB4;">
          &copy; ${new Date().getFullYear()} Depay. All rights reserved.
        </p>
      </td>
    </tr>

  </table>
</body>
</html>`;

  return sendMail({
    to: recipientEmail,
    subject,
    text,
    html,
  });
};
