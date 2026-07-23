import moment from "moment-timezone";

export const generateRequestId = () => {
  // Get current time in Africa/Lagos timezone and format as YYYYMMDDHHmm (12 numeric characters)
  const datePart = moment().tz("Africa/Lagos").format("YYYYMMDDHHmm");
  // Generate a random alphanumeric string (8 characters here; adjust as needed)
  const randomPart = Math.random().toString(36).substring(2, 10);
  // Concatenate the date part with the random part
  return datePart + randomPart;
};
