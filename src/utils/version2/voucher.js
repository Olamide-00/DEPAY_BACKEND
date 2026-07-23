import Voucher from "../../models/voucher.js";

const generateCode = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const segment = (len) =>
    Array.from({ length: len }, () =>
      chars.charAt(Math.floor(Math.random() * chars.length))
    ).join("");
  return `Depay-${segment(4)}-${segment(4)}`;
};

export const generateUniqueVoucherCode = async () => {
  let code;
  let exists = true;
  while (exists) {
    code = generateCode();
    exists = await Voucher.exists({ code });
  }
  return code;
};
