import { sendMail } from "../version2/emailService/emailService.js";

export const sendTransactionNotification = async (
  recipientEmail: string,
  transactionType: string,
  amount: number | string,
  transactionId: string,
  timestamp: string,
  name: string,
) => {
  const displayAmount =
    typeof amount === "number"
      ? `₦${amount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : amount;

  const subject = `Transaction confirmed - ${transactionType} - Depay`;
  const text = `Hi ${name}, your ${transactionType} of ${displayAmount} was successful. Transaction ID: ${transactionId}. Date: ${timestamp}.`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <title>Transaction confirmed</title>
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
    a { text-decoration: none; }
    @media screen and (max-width: 600px) {
      .container { width: 100% !important; max-width: 100% !important; }
      .mobile-padding { padding-left: 24px !important; padding-right: 24px !important; }
      .amount { font-size: 30px !important; }
    }
    @media (prefers-color-scheme: dark) {
      body { background-color: #10170F !important; }
      .dark-bg { background-color: #10170F !important; }
      .dark-card { background-color: #172115 !important; }
      .dark-border { border-color: #26331F !important; }
      .dark-text-primary { color: #F3F6F0 !important; }
      .dark-text-secondary { color: #9CA593 !important; }
      .dark-row-border { border-color: #26331F !important; }
      .dark-amount-bg { background-color: #1E2B1A !important; }
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

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 20px;">
                <tr>
                  <td style="background-color: #EAF3E9; border-radius: 20px; padding: 5px 14px;" class="dark-amount-bg">
                    <span style="font-family: 'Inter', Arial, sans-serif; font-size: 12px; font-weight: 600; color: #1B3710; letter-spacing: 0.2px;">Transaction successful</span>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 4px; font-family: 'Inter', Arial, sans-serif; font-size: 15px; line-height: 22px; color: #6B7268;" class="dark-text-secondary">
                Hi ${name}, your ${transactionType} went through.
              </p>

              <div style="margin: 20px 0 28px; font-family: 'Inter', Arial, sans-serif; font-weight: 800; font-size: 36px; line-height: 42px; color: #141613; letter-spacing: -0.5px;" class="amount dark-text-primary">
                ${displayAmount}
              </div>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-top: 1px solid #E5E8E3;" class="dark-row-border">
                <tr>
                  <td style="padding: 14px 0; border-bottom: 1px solid #E5E8E3;" class="dark-row-border">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="font-family: 'Inter', Arial, sans-serif; font-size: 13px; color: #9CA5A0;">Type</td>
                        <td style="font-family: 'Inter', Arial, sans-serif; font-size: 13px; color: #141613; text-align: right; text-transform: capitalize;" class="dark-text-primary">${transactionType}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 14px 0; border-bottom: 1px solid #E5E8E3;" class="dark-row-border">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="font-family: 'Inter', Arial, sans-serif; font-size: 13px; color: #9CA5A0;">Transaction ID</td>
                        <td style="font-family: 'Inter', Arial, sans-serif; font-size: 13px; color: #141613; text-align: right;" class="dark-text-primary">${transactionId}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 14px 0;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="font-family: 'Inter', Arial, sans-serif; font-size: 13px; color: #9CA5A0;">Date</td>
                        <td style="font-family: 'Inter', Arial, sans-serif; font-size: 13px; color: #141613; text-align: right;" class="dark-text-primary">${timestamp}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin: 28px 0 0; font-family: 'Inter', Arial, sans-serif; font-size: 13px; line-height: 20px; color: #9CA5A0;" class="dark-text-secondary">
                This email is your receipt for this transaction. Didn't recognise it? Contact us immediately at <a href="mailto:support@depay.com.ng" style="color: #1B3710; font-weight: 600;">support@depay.com.ng</a>.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="padding: 0 24px 40px; text-align: center;">
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
