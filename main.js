import applicationStack from "./app.js";
import startSpecialOfferCron from "./cron/checkSpecialOffers.js";

const {
  attachCoreMiddlewares,
  attachRouters,
  connectToDatabase,
  attachExternalMiddlewares,
} = applicationStack,
  bootstrap = async () => {
    await attachCoreMiddlewares();
    await attachExternalMiddlewares();
    await attachRouters();
    await connectToDatabase();

    // Initialize cron jobs
    startSpecialOfferCron();
  };

bootstrap();

// module need to install
// npm i express cors moment morgan cookie-parser express-session mongoose dotenv bcrypt
// jsonwebtoken express-validator mongoose-paginate-v2
