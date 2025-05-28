import express from 'express';
import { getAllSubmissions, createContactSubmission } from "../services/contactUsService.js"
import jwtMiddleware from '../middlewares/jwt.middleware.js';

const { verifyAdminToken: jwtAuthGuard } = jwtMiddleware;

const contactUsRouter = express.Router();
// Submit contact form
contactUsRouter.post('/submit', async (req, res) => {
    try {
        const { name, email, phoneNumber, message, acceptTerms } = req.body;

        // Basic validation
        if (!name || !email || !phoneNumber || !message) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        if (!acceptTerms) {
            return res.status(400).json({
                success: false,
                message: 'Terms and conditions must be accepted'
            });
        }

        const submission = await createContactSubmission({
            name,
            email,
            phoneNumber,
            message,
            acceptTerms
        });

        res.status(201).json({
            success: true,
            message: 'Contact form submitted successfully',
            data: submission
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error submitting contact form',
            error: error.message
        });
    }
});

// Get all contact form submissions (admin only)
contactUsRouter.get('/submissions', jwtAuthGuard, async (req, res) => {
    try {
        const submissions = await getAllSubmissions();
        res.status(200).json({
            success: true,
            data: submissions
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching contact form submissions',
            error: error.message
        });
    }
});

export default contactUsRouter; 