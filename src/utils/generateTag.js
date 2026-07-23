import User from "../models/users.js";

export const generateUserTag = async (name) => {
  const prefix = name.substring(0, 3).toUpperCase();

  // Find the last used tag for the prefix
  const lastUser = await User.findOne({
    tag: new RegExp(`^${prefix}\\d+$`),
  }).sort({ tag: -1 });

  let number = 1;
  if (lastUser && lastUser.tag) {
    number = parseInt(lastUser.tag.slice(3)) + 1;
  }

  return `${prefix}${String(number).padStart(2, "0")}`;
};
