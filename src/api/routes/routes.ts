import { Router } from 'express';
import { loginUser, registerUser, verifyAndReturnUser } from '../controllers/userController';

const router = Router();

// Auth Routes
router.get('/auth/me', verifyAndReturnUser);
router.post("/register", registerUser);
router.post("/login", loginUser);

export default router;