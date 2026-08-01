import dotenv from "dotenv";
import { Resend } from "resend";

dotenv.config();

class ResendEmailService {
  constructor() {
    this.initialized = false;
    this.client = null;
    this.fromEmail = null;
    this.fromName = null;
  }

  initialize() {
    if (this.initialized) return;

    const { RESEND_API_KEY, MAIL_FROM_EMAIL, MAIL_FROM_NAME } = process.env;

    if (!RESEND_API_KEY) {
      throw new Error("Missing RESEND_API_KEY");
    }

    if (!MAIL_FROM_EMAIL) {
      throw new Error("Missing MAIL_FROM_EMAIL");
    }

    this.client = new Resend(RESEND_API_KEY);
    this.fromEmail = MAIL_FROM_EMAIL;
    this.fromName = MAIL_FROM_NAME || "Depay";

    this.initialized = true;

    console.log("✅ Resend Email Service initialized");
    console.log("📧 From:", this.fromEmail);
  }

  async sendMail({ to, subject, text, html, maxRetries = 3 }) {
    if (!this.initialized) {
      this.initialize();
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(
          `📤 Sending email to ${to} via Resend (Attempt ${attempt}/${maxRetries})`
        );

        const response = await this.client.emails.send({
          from: `${this.fromName} <${this.fromEmail}>`,
          to,
          subject,
          html: html || `<p>${text || ""}</p>`,
          text: text || "",
        });

        console.log("✅ Email sent successfully via Resend");

        return {
          success: true,
          response,
        };
      } catch (error) {
        console.error(
          `❌ Attempt ${attempt}/${maxRetries} failed:`,
          error.message
        );

        if (attempt === maxRetries) {
          throw new Error("Email delivery failed");
        }

        await new Promise((resolve) =>
          setTimeout(resolve, 1500 * attempt)
        );
      }
    }
  }
}

const emailService = new ResendEmailService();

export const sendMail = (options) => emailService.sendMail(options);

export const initializeEmailService = () =>
  emailService.initialize();

export default sendMail;