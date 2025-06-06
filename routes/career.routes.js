import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import careerController from "../controllers/career.controller.js";
import jwtMiddleware from "../middlewares/jwt.middleware.js";

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../uploads/resumes"));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = [".pdf", ".doc", ".docx"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF and Word documents are allowed"));
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

// Public routes
router.post("/", upload.single("resume"), careerController.submitApplication);

// Protected routes (admin only)
router.use(jwtMiddleware.verifyAdminToken);
router.get("/", careerController.getAllApplications);
router.get("/:id", careerController.getApplicationById);
router.patch("/:id/status", careerController.updateApplicationStatus);

export default router; 