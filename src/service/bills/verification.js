import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const { VTPASS_EMAIL, VTPASS_PASSWORD, VTPASS_BASE_URL } = process.env;

export const verifySmartcard = async (payload) => {
  try {
    // Create Basic Auth credentials (username:password)
    const credentials = `${VTPASS_EMAIL}:${VTPASS_PASSWORD}`;
    const encodedCredentials = Buffer.from(credentials).toString("base64");

    // Set headers with Basic Authentication
    const headers = {
      Authorization: `Basic ${encodedCredentials}`,
      "Content-Type": "application/json",
    };

    // Construct the endpoint URL for verifying the smartcard number
    const url = `${VTPASS_BASE_URL}/merchant-verify`;

    // Send the POST request with payload (which should include serviceID and billerCode)
    const response = await axios.post(url, payload, { headers });
    return response.data;
  } catch (error) {
    console.error(
      "Error in verifySmartcard:",
      error.response ? error.response.data : error.message
    );
    throw new Error(error.response ? error.response.data : error.message);
  }
};
