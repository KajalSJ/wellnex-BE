import applicationStack from "./app.js";
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
  };
bootstrap();

// module need to install
// npm i express cors moment morgan cookie-parser express-session mongoose dotenv bcrypt 
// jsonwebtoken express-validator mongoose-paginate-v2
