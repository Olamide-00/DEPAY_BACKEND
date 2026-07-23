import { sendMail } from "../version2/emailService/emailService.js";

export const sendTransactionNotification = async (
  recipientEmail,
  transactionType,
  amount,
  transactionId,
  timestamp,
  name,
) => {
  const subject = `Transaction Alert - ${transactionType} Confirmation`;
  const text = `You have successfully ${transactionType} ${amount}. Transaction ID: ${transactionId}. Date: ${timestamp}.`;

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Transaction Confirmation</title>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
            
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                margin: 0;
                padding: 20px;
                min-height: 100vh;
            }
            
            .email-container {
                max-width: 600px;
                margin: 0 auto;
                background: #ffffff;
                border-radius: 20px;
                overflow: hidden;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            }
            
            .header {
                background: linear-gradient(135deg, #00b09b 0%, #96c93d 100%);
                padding: 50px 30px;
                text-align: center;
                color: white;
                position: relative;
                overflow: hidden;
            }
            
            .header::before {
                content: '';
                position: absolute;
                top: -50%;
                left: -50%;
                width: 200%;
                height: 200%;
                background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 70%);
            }
            
            .header-icon {
                width: 80px;
                height: 80px;
                background: rgba(255, 255, 255, 0.2);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 20px;
                font-size: 36px;
                position: relative;
                z-index: 2;
            }
            
            .header h1 {
                font-size: 32px;
                font-weight: 700;
                margin-bottom: 8px;
                letter-spacing: -0.5px;
                position: relative;
                z-index: 2;
            }
            
            .header p {
                font-size: 16px;
                font-weight: 400;
                opacity: 0.9;
                position: relative;
                z-index: 2;
            }
            
            .content {
                padding: 50px 40px;
            }
            
            .greeting {
                font-size: 18px;
                color: #2d3748;
                margin-bottom: 32px;
                line-height: 1.6;
            }
            
            .transaction-card {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-radius: 20px;
                padding: 40px 30px;
                margin: 30px 0;
                color: white;
                position: relative;
                overflow: hidden;
                text-align: center;
            }
            
            .transaction-card::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(45deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 50%);
            }
            
            .transaction-type {
                font-size: 24px;
                font-weight: 700;
                margin-bottom: 20px;
                position: relative;
                z-index: 2;
                text-transform: capitalize;
            }
            
            .transaction-amount {
                font-size: 48px;
                font-weight: 800;
                margin: 20px 0;
                text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.2);
                position: relative;
                z-index: 2;
            }
            
            .transaction-details {
                background: rgba(255, 255, 255, 0.1);
                border-radius: 12px;
                padding: 24px;
                margin: 24px 0;
                backdrop-filter: blur(10px);
            }
            
            .detail-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 0;
                border-bottom: 1px solid rgba(255, 255, 255, 0.2);
            }
            
            .detail-row:last-child {
                border-bottom: none;
            }
            
            .detail-label {
                font-weight: 600;
                font-size: 14px;
                opacity: 0.9;
            }
            
            .detail-value {
                font-weight: 500;
                font-size: 14px;
                text-align: right;
            }
            
            .status-badge {
                background: rgba(255, 255, 255, 0.2);
                padding: 8px 16px;
                border-radius: 20px;
                font-size: 14px;
                font-weight: 600;
                display: inline-block;
                margin-top: 16px;
                position: relative;
                z-index: 2;
            }
            
            .security-alert {
                background: #fff5f5;
                border: 1px solid #fed7d7;
                border-radius: 12px;
                padding: 24px;
                margin: 30px 0;
                text-align: center;
            }
            
            .security-alert h3 {
                color: #c53030;
                font-size: 16px;
                font-weight: 600;
                margin-bottom: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
            }
            
            .security-alert p {
                color: #744210;
                font-size: 14px;
                line-height: 1.5;
            }
            
            .next-steps {
                background: #f0fff4;
                border: 1px solid #9ae6b4;
                border-radius: 12px;
                padding: 24px;
                margin: 24px 0;
            }
            
            .next-steps h3 {
                color: #22543d;
                font-size: 16px;
                font-weight: 600;
                margin-bottom: 12px;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .next-steps p {
                color: #2d3748;
                font-size: 14px;
                line-height: 1.5;
            }
            
            .receipt-info {
                background: #f7fafc;
                border-radius: 12px;
                padding: 20px;
                margin: 24px 0;
                text-align: center;
            }
            
            .receipt-info p {
                color: #4a5568;
                font-size: 14px;
                line-height: 1.5;
            }
            
            .footer {
                background: #1a202c;
                padding: 40px 30px;
                text-align: center;
                color: white;
            }
            
            .brand {
                font-size: 24px;
                font-weight: 700;
                color: #00b09b;
                margin-bottom: 16px;
            }
            
            .tagline {
                font-size: 16px;
                color: #a0aec0;
                margin-bottom: 24px;
                line-height: 1.5;
            }
            
            .support-info {
                font-size: 14px;
                color: #718096;
                line-height: 1.5;
                margin-bottom: 20px;
            }
            
            .copyright {
                font-size: 12px;
                color: #4a5568;
                margin-top: 20px;
                padding-top: 20px;
                border-top: 1px solid #2d3748;
            }
            
            @media (max-width: 600px) {
                body {
                    padding: 10px;
                }
                
                .email-container {
                    border-radius: 12px;
                }
                
                .header {
                    padding: 40px 20px;
                }
                
                .header h1 {
                    font-size: 28px;
                }
                
                .content {
                    padding: 40px 20px;
                }
                
                .transaction-amount {
                    font-size: 36px;
                }
                
                .transaction-card {
                    padding: 30px 20px;
                }
                
                .detail-row {
                    flex-direction: column;
                    align-items: flex-start;
                    gap: 4px;
                }
                
                .detail-value {
                    text-align: left;
                }
            }
        </style>
    </head>
    <body>
        <div class="email-container">
            <!-- Header Section -->
            <div class="header">
                <div class="header-icon">💰</div>
                <h1>Transaction Confirmed</h1>
                <p>Your ${transactionType} was successful</p>
            </div>
            
            <!-- Content Section -->
            <div class="content">
                <div class="greeting">
                    <p>Hello ${name},</p>
                    <p>We're confirming that your recent transaction has been completed successfully. Here are the details:</p>
                </div>
                
                <!-- Transaction Card -->
                <div class="transaction-card">
                    <div class="transaction-type">${transactionType}</div>
                    <div class="transaction-amount">${amount}</div>
                    <div class="transaction-details">
                        <div class="detail-row">
                            <span class="detail-label">📋 Transaction ID:</span>
                            <span class="detail-value">${transactionId}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">📅 Date & Time:</span>
                            <span class="detail-value">${timestamp}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">🆔 Reference:</span>
                            <span class="detail-value">${transactionId.slice(0, 8)}...</span>
                        </div>
                    </div>
                    <div class="status-badge">✅ Completed Successfully</div>
                </div>
                
                <!-- Receipt Information -->
                <div class="receipt-info">
                    <p>📄 <strong>Digital Receipt:</strong> This email serves as your official transaction receipt. Please keep it for your records.</p>
                </div>
                
                <!-- Security Alert -->
                <div class="security-alert">
                    <h3>🔒 Security Notice</h3>
                    <p>If you did not authorize this transaction, please contact our support team immediately at <strong>support@jaaApp.com</strong> or call <strong>+1 (555) 123-JAAPPE</strong>.</p>
                </div>
                
                <!-- Next Steps -->
                <div class="next-steps">
                    <h3>📱 What's Next?</h3>
                    <p>Your transaction has been processed and the funds should reflect in your account shortly. You can view this transaction in your jaaApp app under "Transaction History".</p>
                </div>
            </div>
            
            <!-- Footer -->
            <div class="footer">
                <div class="brand">jaaApp</div>
                <div class="tagline">Secure, Fast, and Reliable Digital Banking</div>
                <div class="support-info">
                    Need help with this transaction?<br>
                    Our support team is available 24/7 to assist you
                </div>
                <div class="copyright">
                    © ${new Date().getFullYear()} jaaApp Financial Services. All rights reserved.<br>
                    This is an automated transaction notification - please do not reply to this email.
                </div>
            </div>
        </div>
    </body>
    </html>
  `;

  return sendMail({
    to: recipientEmail,
    subject,
    text,
    html,
  });
};
