import express, { json, urlencoded, static as expressStatic } from "express";
import logger from "morgan";
import connection from "./configurations/database.config.js";
import cookieParser from "cookie-parser";
import { existsSync } from "fs";
import __dirname from "./configurations/dir.config.js";
import ConstHelper from "./helpers/message.helper.js";
import config from "./configurations/app.config.js";
import { createServer } from "http";
import cors from "cors";
import session from "express-session";
import bodyParser from "body-parser";
import adminRouter from "./routes/admin.route.js";
import businessRouter from "./routes/business.route.js";
import openaiRouter from "./routes/openai.route.js";
import subscriptionRouter from "./routes/subscription.routes.js";
import webhookRouter from "./routes/webhook.routes.js";
import contactUsRouter from "./routes/contactUs.js";
import careerRouter from "./routes/career.routes.js";
import path from "path";
import currencyRouter from "./routes/currency.route.js";

const app = express();

// Health check endpoint for load balancer
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy' });
});

// Create a separate express app for webhooks to avoid body parsing middleware
const webhookApp = express();
// Use raw body parsing for Stripe webhooks
webhookApp.use(express.raw({ type: 'application/json' }));
webhookApp.use('/stripe', webhookRouter);
app.use('/webhook', webhookApp);

// Now add all other middleware
app.use(logger("dev"));
app.use(json());
app.use(urlencoded({ extended: false }));
app.use(cookieParser());
app.use(cors('*'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: ConstHelper.APP_NAME,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: true },
}));

// Register all other routes
app.use(ConstHelper.ROUTES.ROUTE_ADMIN, adminRouter);
app.use(ConstHelper.ROUTES.ROUTE_BUSINESSS, businessRouter);
app.use('/chatbot', openaiRouter);
app.use('/subscription', subscriptionRouter);
app.use('/currency', currencyRouter);
app.use('/contact', contactUsRouter);
app.use('/careers', careerRouter);

const attachCoreMiddlewares = async () => {
  checkEnv();
  app.use("views", expressStatic(ConstHelper.PATHS.PATH_VIEW));
  app.use("/chatbot.js", express.static(path.join(__dirname, "static/chatbot.js")));
  app.set("view engine", "jade");
};

const attachExternalMiddlewares = async () => {
  // No external middlewares to attach
};

const attachRouters = async () => {
  // No routers to attach
};

const connectToDatabase = async () => {
  connection.on(
    "error",
    console.error.bind(console, ConstHelper.MESSAGES.CONNECTION_ERR)
  );
  connection.once("open", async () => {
    console.log(ConstHelper.MESSAGES.CONNECTION_SUCCESS);
    await listenToServer();
  });
};

const checkEnv = () => {
  if (!existsSync(".env")) {
    console.log(ConstHelper.MESSAGES.ENV_NOT_FOUND_ERR);
    process.exit(1);
  }
};

const listenToServer = async () => {
  const server = await new Promise((resolve, reject) => {
    resolve(
      createServer(app, (req, res) => {
        res.setHeader("Content-Type", "application/json");
      })
    );
  });
  server.listen(parseInt(config.PORT));
  server.once("listening", () =>
    console.log(
      ConstHelper.MESSAGES.SERVER_STARTED.replace("PORT", config.PORT)
    )
  );
  server.on("error", (error) => {
    throw error;
  });
};

const applicationStack = {
  app,
  attachCoreMiddlewares,
  attachRouters,
  attachExternalMiddlewares,
  connectToDatabase,
};

export default applicationStack;
