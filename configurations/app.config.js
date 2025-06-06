import dotenv from "dotenv";
import __dirname from "./dir.config.js";
import { join } from "path";
import ConstHelper from "../helpers/message.helper.js";
dotenv.config({ path: join(__dirname, "../.env") });

const {
  URLS: { DEV_APP_URL, PROD_APP_URL },
} = ConstHelper;

const config = {
  ENV: process.env.ENV,
  PORT: process.env.PORT ? process.env.PORT : "3000",
  APP_URL: process.env.ENV === "development" ? DEV_APP_URL : PROD_APP_URL,
  DB_URI: process.env.DB_URI,

  JWT_ISS: process.env.JWT_ISS ? process.env.JWT_ISS : "wellnexusers",
  JWT_SECRET: process.env.JWT_SECRET ? process.env.JWT_SECRET : "wellnex",
  JWT_EXPIRY: process.env.JWT_EXPIRY,


  STRIPE_KEY: process.env.STRIPE_SECRET_KEY,
  USER_PRODUCT_STRIPE_KEY: process.env.USER_PRODUCT_STRIPE_KEY,

  // PROTON_PASSWORD: process.env.PROTON_PASSWORD,
  // PROTON_EMAIL: process.env.PROTON_EMAIL,
  EMAIL_USER: process.env.EMAIL_USER,
  EMAIL_PASS: process.env.EMAIL_PASS,
  EMAIL_HOST: process.env.EMAIL_HOST,
};

export default config;
