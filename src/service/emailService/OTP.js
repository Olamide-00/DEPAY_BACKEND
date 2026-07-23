// otpService.js
import { sendMail } from "../version2/emailService/emailService.js";

export const sendOTPEmail = async (recipientEmail, otp) => {
  const subject = "Verify Your Email - Depay";
  const text = `Your OTP code is ${otp}. It will expire in 3 hours.`;

  const html = `<!DOCTYPE html>
<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />
  <meta name="x-apple-disable-message-reformatting" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <title>Verify Your Email</title>
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
      max-width: 100% !important;
      display: block !important;
      height: auto !important;
      outline: none;
      line-height: 100%;
      text-decoration: none;
      -ms-interpolation-mode: bicubic;
    }
    a { text-decoration: none; }
    .full-width-cta { display: inline-block; padding: 12px 20px; border-radius: 6px; text-decoration: none; }
    @media screen and (max-width: 600px) {
      .full-width-cta { display: block !important; width: 100% !important; box-sizing: border-box !important; text-align: center !important; }
      .container { width: 100% !important; max-width: 100% !important; }
      .responsive-table { width: 100% !important; }
      .mobile-padding { padding-left: 20px !important; padding-right: 20px !important; }
      .mobile-stack { display: block !important; width: 100% !important; }
      .center-mobile { text-align: center !important; }
      .logo-image { width: 40% !important; max-width: 150px !important; height: auto !important; }
      .verification-code { font-size: 28px !important; }
      .glass-card { margin: 0 10px !important; }
      .button { width: 100% !important; max-width: 300px !important; margin-left: auto !important; margin-right: auto !important; }
    }
    @media (prefers-color-scheme: dark) {
      body { background-color: #121212 !important; }
      .dark-mode-bg-gradient { background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%) !important; }
      .dark-mode-bg-primary { background-color: rgba(40, 40, 40, 0.8) !important; }
      .dark-mode-bg-secondary { background-color: rgba(30, 30, 30, 0.9) !important; }
      .dark-mode-text-primary { color: #f0f0f0 !important; }
      .dark-mode-text-secondary { color: #b0b0b0 !important; }
      .dark-mode-button { background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%) !important; }
      .dark-mode-border { border-color: rgba(80, 80, 80, 0.5) !important; }
      .dark-mode-footer { background-color: rgba(20, 20, 20, 0.95) !important; }
      .dark-mode-footer-text { color: #a0a0a0 !important; }
      .dark-mode-code-bg { background-color: rgba(60, 60, 60, 0.6) !important; }
    }
  </style>
</head>

<body style="margin: 0; padding: 0; background: linear-gradient(135deg, #f5f7fa 0%, #e4e8f0 100%);" class="dark-mode-bg-gradient">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="100%" style="max-width: 600px; margin: 0 auto;" class="container">
    <tr>
      <td style="padding: 30px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="glass-card" style="border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08); margin: 0 auto;">

          <!-- Logo -->
          <tr>
            <td style="background-color: rgba(255, 255, 255, 0.85); padding: 30px 0; text-align: center; border-bottom: 1px solid rgba(0, 0, 0, 0.05);" class="dark-mode-bg-secondary">
              <img src="https://res.cloudinary.com/dj6hhcp5h/image/upload/v1767252774/JAAN_jlylfj.webp" width="140" height="auto" alt="Jaan Logo" style="width: 140px; height: auto; display: block; margin: 0 auto;" class="logo-image" />
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="background-color: rgba(255, 255, 255, 0.75); padding: 40px 30px;" class="mobile-padding dark-mode-bg-primary">
              <h1 style="margin: 0 0 20px 0; font-family: 'Inter', Arial, sans-serif; font-weight: 700; font-size: 28px; line-height: 32px; color: #333333; letter-spacing: -0.5px;" class="dark-mode-text-primary">
                Confirm your account
              </h1>
              <p style="margin: 0 0 25px 0; font-family: 'Inter', Arial, sans-serif; font-size: 16px; line-height: 24px; color: #555555;" class="dark-mode-text-secondary">
                You've chosen this email address for your Jaan Account. To verify this email address belongs to you, enter the code below on the email verification page:
              </p>

              <!-- OTP Code Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 30px;">
                <tr>
                  <td style="background-color: rgba(240, 240, 240, 0.7); border-radius: 12px; padding: 20px; text-align: center; border: 1px solid rgba(0, 0, 0, 0.05);" class="dark-mode-code-bg dark-mode-border">
                    <p style="margin: 0; font-family: 'Inter', Arial, sans-serif; font-weight: 600; font-size: 32px; line-height: 40px; color: #333333; letter-spacing: 4px;" class="verification-code dark-mode-text-primary">
                      ${otp}
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 30px 0; font-family: 'Inter', Arial, sans-serif; font-size: 14px; line-height: 20px; color: #777777;" class="dark-mode-text-secondary">
                This code will expire three hours after this email was sent.
              </p>

              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 0 auto;">
                <tr>
                  <td style="background: linear-gradient(135deg, #6b34ff 0%, #8b5cf6 100%); border-radius: 8px; text-align: center; box-shadow: 0 4px 12px rgba(107, 52, 255, 0.2);" class="dark-mode-button">
                    <a href="https://jaan.ng/" target="_blank" style="display: inline-block; padding: 16px 36px; font-family: 'Inter', Arial, sans-serif; font-size: 16px; font-weight: 600; line-height: 20px; color: #ffffff; text-decoration: none; border-radius: 8px;" class="full-width-cta">
                      Confirm Account
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
      <td style="padding: 0 20px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: rgba(255, 255, 255, 0.7); border: 1px solid rgba(255, 255, 255, 0.8); border-radius: 16px; box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="padding: 35px 30px; color: #333333; font-size: 16px; line-height: 1.6;">
              <p style="margin: 0;">If you have any questions or need assistance, our customer support team is always available to help. You can reach us via email at <a href="mailto:contact@jaan.ng" style="color: #8F61FF; text-decoration: none; font-weight: 600;">contact@jaan.ng</a>, WhatsApp or any of our social media pages.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- App Download -->
    <tr>
      <td style="padding: 0 20px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: rgba(255, 255, 255, 0.7); border: 1px solid rgba(255, 255, 255, 0.8); border-radius: 16px; box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="padding: 30px; text-align: center;">
              <p style="margin: 0 0 20px; font-size: 18px; font-weight: 600; color: #333333;">Download our mobile app</p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
                <tr>
                  <td class="mobile-stack" style="padding: 0 8px;">
                    <a href="http://jaan.ng/download" target="_blank" style="display: inline-block; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);">
                      <img src="https://cloudfilesdm.com/postcards/button-app-store-dark.png" width="150" alt="App Store" style="display: block; max-width: 150px; height: auto;">
                    </a>
                  </td>
                  <td class="mobile-stack" style="padding: 0 8px;">
                    <a href="http://jaan.ng/download" target="_blank" style="display: inline-block; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);">
                      <img src="https://cloudfilesdm.com/postcards/button-google-play-dark.png" width="150" alt="Google Play" style="display: block; max-width: 150px; height: auto;">
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Services Banner -->
    <tr>
      <td style="padding: 0 20px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: rgba(255, 255, 255, 0.7); border: 1px solid rgba(255, 255, 255, 0.8); border-radius: 16px; box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="padding: 20px; text-align: center;">
              <p style="margin: 0; font-size: 14px; color: #8F61FF; font-weight: 600; letter-spacing: 0.5px;">eSim | Internet | Gift Cards | TV | Electricity | Airtime | Ticketing</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="padding: 0 20px 30px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: rgba(255, 255, 255, 0.95); border: 1px solid rgba(220, 220, 220, 0.6); border-radius: 16px; box-shadow: 0 4px 30px rgba(0, 0, 0, 0.06);">
          <tr>
            <td style="padding: 30px; text-align: center;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin-bottom: 20px;">
                <tr>
                  <td style="padding: 0 8px;">
                    <a href="https://www.linkedin.com/company/jaan-ng/" target="_blank" style="display: inline-block; padding: 8px; background-color: rgba(0,0,0,0.05); border-radius: 50%;">
                      <img src="https://img.icons8.com/?size=100&id=xuvGCOXi8Wyg&format=png&color=000000" width="20" height="20" alt="LinkedIn" style="display: block;">
                    </a>
                  </td>
                  <td style="padding: 0 8px;">
                    <a href="https://www.tiktok.com/@jaan.ng" target="_blank" style="display: inline-block; padding: 8px; background-color: rgba(0,0,0,0.05); border-radius: 50%;">
                      <img src="https://img.icons8.com/?size=100&id=118640&format=png&color=000000" width="20" height="20" alt="TikTok" style="display: block;">
                    </a>
                  </td>
                  <td style="padding: 0 8px;">
                    <a href="https://facebook.com/jaanservicesfb" target="_blank" style="display: inline-block; padding: 8px; background-color: rgba(0,0,0,0.05); border-radius: 50%;">
                      <img src="https://img.icons8.com/?size=100&id=uLWV5A9vXIPu&format=png&color=000000" width="20" height="20" alt="Facebook" style="display: block;">
                    </a>
                  </td>
                  <td style="padding: 0 8px;">
                    <a href="https://x.com/Jaanservices" target="_blank" style="display: inline-block; padding: 8px; background-color: rgba(0,0,0,0.05); border-radius: 50%;">
                      <img src="https://img.icons8.com/?size=100&id=phOKFKYpe00C&format=png&color=000000" width="20" height="20" alt="Twitter" style="display: block;">
                    </a>
                  </td>
                  <td style="padding: 0 8px;">
                    <a href="https://www.instagram.com/jaan.services" target="_blank" style="display: inline-block; padding: 8px; background-color: rgba(0,0,0,0.05); border-radius: 50%;">
                      <img src="https://img.icons8.com/?size=100&id=Xy10Jcu1L2Su&format=png&color=000000" width="20" height="20" alt="Instagram" style="display: block;">
                    </a>
                  </td>
                  <td style="padding: 0 8px;">
                    <a href="https://whatsapp.com/channel/0029Vb5kojLKLaHmC3fquf1A" target="_blank" style="display: inline-block; padding: 8px; background-color: rgba(0,0,0,0.05); border-radius: 50%;">
                      <img src="https://img.icons8.com/?size=100&id=16713&format=png&color=000000" width="20" height="20" alt="WhatsApp" style="display: block;">
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0; color: rgba(0, 0, 0, 0.7); font-size: 12px; line-height: 1.5;">
                &copy; ${new Date().getFullYear()} Jaan Digital Services LTD | RC8015243
              </p>
              <p style="margin: 10px 0 0; color: rgba(0, 0, 0, 0.7); font-size: 12px;">
                <a href="https://www.jaan.ng" target="_blank" style="color: rgba(0, 0, 0, 0.7); text-decoration: underline;">www.jaan.ng</a>
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
