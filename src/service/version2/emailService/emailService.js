import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

class ZeptoMailEmailService {
  constructor() {
    this.initialized = false;
    this.apiKey = null;
    this.mailAgentAlias = null;
    this.fromEmail = null;
    this.fromName = null;
  }

  initialize() {
    if (this.initialized) return;

    const {
      ZEPTOMAIL_API_KEY,
      ZEPTOMAIL_MAIL_AGENT_ALIAS,
      MAIL_FROM_EMAIL,
      MAIL_FROM_NAME,
    } = process.env;

    if (!ZEPTOMAIL_API_KEY) {
      throw new Error("Missing ZEPTOMAIL_API_KEY");
    }

    if (!ZEPTOMAIL_MAIL_AGENT_ALIAS) {
      throw new Error("Missing ZEPTOMAIL_MAIL_AGENT_ALIAS");
    }

    if (!MAIL_FROM_EMAIL) {
      throw new Error("Missing MAIL_FROM_EMAIL");
    }

    // Ensure the API key has the correct format
    this.apiKey = ZEPTOMAIL_API_KEY.startsWith("Zoho-enczapikey ")
      ? ZEPTOMAIL_API_KEY
      : `Zoho-enczapikey ${ZEPTOMAIL_API_KEY}`;

    this.mailAgentAlias = ZEPTOMAIL_MAIL_AGENT_ALIAS;
    this.fromEmail = MAIL_FROM_EMAIL;
    this.fromName = MAIL_FROM_NAME || "Depay App";

    this.initialized = true;
    console.log("✅ ZeptoMail Email Service initialized");
    console.log("📧 From:", this.fromEmail);
    console.log("🔑 API Key present:", !!this.apiKey);
    console.log("📋 Mail Agent Alias:", this.mailAgentAlias);
  }

  async sendMail({ to, subject, text, html, maxRetries = 3 }) {
    if (!this.initialized) {
      this.initialize();
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(
          `📤 Sending email to ${to} via ZeptoMail (attempt ${attempt}/${maxRetries})`
        );

        const response = await axios({
          method: "post",
          url: `https://api.zeptomail.com/v1.1/email`,
          headers: {
            accept: "application/json",
            Authorization: this.apiKey,
            "Content-Type": "application/json",
          },
          data: {
            from: {
              address: this.fromEmail,
              name: this.fromName,
            },
            to: [
              {
                email_address: {
                  address: to,
                  name: to.split("@")[0],
                },
              },
            ],
            subject: subject,
            htmlbody: html || `<p>${text || ""}</p>`,
            textbody: text || "",
          },
          timeout: 10000,
        });

        console.log("✅ Email sent successfully via ZeptoMail");
        return {
          success: true,
          response: response.data,
        };
      } catch (error) {
        console.error(
          `❌ Attempt ${attempt}/${maxRetries} failed:`,
          error.response?.data || error.message
        );

        if (attempt === maxRetries) {
          throw new Error("Email delivery failed");
        }

        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
  }
}

// Singleton instance
const emailService = new ZeptoMailEmailService();

// Public exports (same usage as before)
export const sendMail = (options) => emailService.sendMail(options);
export const initializeEmailService = () => emailService.initialize();

export default sendMail;
