import { sendMail } from "../version2/emailService/emailService.js";

export const sendLoginNotification = async (
  recipientEmail: string,
  ipAddress: string,
  device: string,
) => {
  const subject = "New login to your Depay account";
  const text = `A new login to your Depay account was detected from IP: ${ipAddress} on ${device}. If this wasn't you, please secure your account immediately.`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login Alert</title>
    <style>
        body, html {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            font-family: 'Inter', Arial, sans-serif;
            -webkit-text-size-adjust: 100%;
            -ms-text-size-adjust: 100%;
        }
        * {
            -ms-text-size-adjust: 100%;
            -webkit-text-size-adjust: 100%;
        }
        table, td {
            mso-table-lspace: 0pt !important;
            mso-table-rspace: 0pt !important;
            border-collapse: collapse !important;
        }
        img {
            border: 0;
            max-width: 100% !important;-
            display: block !important;
            height: auto !important;
            outline: none;
            line-height: 100%;
            text-decoration: none;
            -ms-interpolation-mode: bicubic;
        }
        a { text-decoration: none; }
        .full-width-cta { display: inline-block; padding: 14px 20px; border-radius: 10px; text-decoration: none; }
        @media screen and (max-width: 600px) {
            .full-width-cta { display: block !important; width: 100% !important; box-sizing: border-box !important; text-align: center !important; }
            .container { width: 100% !important; max-width: 100% !important; }
            .mobile-padding { padding-left: 20px !important; padding-right: 20px !important; }
            .mobile-stack { display: block !important; width: 100% !important; text-align: center !important; }
            .button { width: 100% !important; max-width: 300px !important; margin-left: auto !important; margin-right: auto !important; }
            .app-buttons td { display: block; width: 100%; padding: 5px 0 !important; }
        }
        @media (prefers-color-scheme: dark) {
            body { background-color: #0a1512 !important; }
            .dark-mode-bg-page { background-color: #0a1512 !important; }
            .dark-mode-bg-primary { background-color: #142b25 !important; }
            .dark-mode-bg-secondary { background-color: #0d1f1b !important; }
            .dark-mode-text-primary { color: #eafaf5 !important; }
            .dark-mode-text-secondary { color: #a8c4bc !important; }
            .dark-mode-border { border-color: rgba(234, 250, 245, 0.1) !important; }
            .dark-mode-footer { background-color: #0d1f1b !important; }
            .dark-mode-footer-text { color: #7d9b92 !important; }
            .dark-mode-code-bg { background-color: rgba(54, 186, 157, 0.08) !important; }
        }
    </style>
</head>

<body style="margin: 0; padding: 0; background-color: #f5f7f6;" class="dark-mode-bg-page">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="100%" style="max-width: 600px; margin: 0 auto;" class="container">
        <tr>
            <td style="padding: 30px 20px;" class="mobile-padding">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-radius: 20px; overflow: hidden; box-shadow: 0 8px 40px rgba(13, 31, 27, 0.12);">

                    <!-- Header / brand mark -->
                    <tr>
                        <td style="background-color: #0d1f1b; padding: 36px 30px; text-align: center;" class="dark-mode-bg-secondary">
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
                                <tr>
                                    <td style="width: 40px; height: 40px; border-radius: 12px; background-color: #36ba9d; text-align: center; vertical-align: middle;">
                                        <span style="font-family: 'Poppins', Arial, sans-serif; font-weight: 700; font-size: 20px; color: #0d1f1b; line-height: 40px;">D</span>
                                    </td>
                                    <td style="padding-left: 10px; vertical-align: middle;">
                                        <span style="font-family: 'Poppins', Arial, sans-serif; font-weight: 600; font-size: 20px; color: #ffffff;">Depay</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Main Content -->
                    <tr>
                        <td style="background-color: #ffffff; padding: 40px 32px;" class="mobile-padding dark-mode-bg-primary">
                            <h1 style="margin: 0 0 14px 0; font-family: 'Poppins', Arial, sans-serif; font-weight: 600; font-size: 24px; line-height: 30px; color: #0d1f1b; letter-spacing: -0.3px;" class="dark-mode-text-primary">
                                New login detected
                            </h1>

                            <p style="margin: 0 0 26px 0; font-family: 'Inter', Arial, sans-serif; font-size: 15px; line-height: 24px; color: #6b7280;" class="dark-mode-text-secondary">
                                We noticed a new sign-in to your Depay account. Here's what we saw:
                            </p>

                            <!-- Login Details -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 26px; background-color: #f5f7f6; border-radius: 14px; border: 1px solid #e7ebe9;" class="dark-mode-code-bg dark-mode-border">
                                <tr>
                                    <td style="padding: 16px 20px; border-bottom: 1px solid #e7ebe9;" class="dark-mode-border">
                                        <span style="font-family: 'Inter', Arial, sans-serif; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.4px;" class="dark-mode-text-secondary">Date &amp; time</span><br>
                                        <span style="font-family: 'Inter', Arial, sans-serif; font-size: 15px; color: #0d1f1b; font-weight: 500;" class="dark-mode-text-primary">${new Date().toLocaleString("en-NG", { timeZone: "Africa/Lagos" })} (WAT)</span>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 16px 20px; border-bottom: 1px solid #e7ebe9;" class="dark-mode-border">
                                        <span style="font-family: 'Inter', Arial, sans-serif; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.4px;" class="dark-mode-text-secondary">IP address</span><br>
                                        <span style="font-family: 'Inter', Arial, sans-serif; font-size: 15px; color: #0d1f1b; font-weight: 500;" class="dark-mode-text-primary">${ipAddress}</span>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 16px 20px;">
                                        <span style="font-family: 'Inter', Arial, sans-serif; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.4px;" class="dark-mode-text-secondary">Device</span><br>
                                        <span style="font-family: 'Inter', Arial, sans-serif; font-size: 15px; color: #0d1f1b; font-weight: 500;" class="dark-mode-text-primary">${device}</span>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin: 0 0 26px 0; font-family: 'Inter', Arial, sans-serif; font-size: 15px; line-height: 24px; color: #6b7280;" class="dark-mode-text-secondary">
                                If this was you, there's nothing else to do. If you don't recognise this activity, please contact support immediately and change your transaction PIN from the app.
                            </p>

                            <!-- CTA Button -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 0 auto;">
                                <tr>
                                    <td style="background-color: #36ba9d; border-radius: 10px; text-align: center; box-shadow: 0 6px 18px rgba(54, 186, 157, 0.3);">
                                        <a href="https://depay.com.ng" target="_blank" style="display: inline-block; padding: 14px 36px; font-family: 'Inter', Arial, sans-serif; font-size: 15px; font-weight: 600; line-height: 20px; color: #ffffff;" class="button full-width-cta">
                                            Not you? Secure your account
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>

        <!-- Support Section -->
        <tr>
            <td style="padding: 0 20px 20px;" class="mobile-padding">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #ffffff; border: 1px solid #e7ebe9; border-radius: 16px;">
                    <tr>
                        <td style="padding: 26px 28px; color: #6b7280; font-size: 14px; line-height: 1.6;" class="mobile-padding">
                            <!-- TODO: confirm the real support inbox before sending -->
                            Need help? Reach our support team at <a href="mailto:support@depay.com.ng" style="color: #2a9a82; text-decoration: none; font-weight: 600;">support@depay.com.ng</a>.
                        </td>
                    </tr>
                </table>
            </td>
        </tr>

        <!-- Services banner -->
        <tr>
            <td style="padding: 0 20px 20px;" class="mobile-padding">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #ffffff; border: 1px solid #e7ebe9; border-radius: 16px;">
                    <tr>
                        <td style="padding: 20px; text-align: center;">
                            <p style="margin: 0; font-size: 13px; color: #2a9a82; font-weight: 600; letter-spacing: 0.4px;">Airtime &nbsp;|&nbsp; Data &nbsp;|&nbsp; TV &nbsp;|&nbsp; Electricity &nbsp;|&nbsp; Education</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>

        <!-- Footer -->
        <tr>
            <td style="padding: 0 20px 30px;" class="mobile-padding">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #ffffff; border: 1px solid #e7ebe9; border-radius: 16px;" class="dark-mode-footer">
                    <tr>
                        <td style="padding: 26px; text-align: center;" class="mobile-padding">
                            <p style="margin: 0; color: #9ca3af; font-size: 12px; line-height: 1.5;" class="dark-mode-footer-text">
                                &copy; ${new Date().getFullYear()} Depay
                            </p>
                            <p style="margin: 8px 0 0; color: #9ca3af; font-size: 12px;" class="dark-mode-footer-text">
                                <a href="https://depay.com.ng" target="_blank" style="color: #9ca3af; text-decoration: underline;">depay.com.ng</a>
                            </p>
                        </td>
                    </tr>
                </table>
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
