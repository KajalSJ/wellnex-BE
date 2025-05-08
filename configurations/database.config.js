import mongoose from "mongoose";
import config from "./app.config.js";
mongoose.connect(String(config.DB_URI));

export default mongoose.connection;
